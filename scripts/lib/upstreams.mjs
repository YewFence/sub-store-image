import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

export const repoRoot = path.resolve(currentDir, "..", "..");
const lockfilePath = path.join(repoRoot, "sources.lock.json");
export const gitBin = process.env.GIT_BIN || "git";
export const dockerBin = process.env.DOCKER_BIN || "docker";

export async function readLockfile() {
  const raw = await readFile(lockfilePath, "utf8");
  const parsed = JSON.parse(raw);
  const { sources } = parsed;

  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("sources.lock.json 至少需要一个 source");
  }

  const names = new Set();

  for (const source of sources) {
    const requiredFields = [
      "name",
      "depName",
      "datasource",
      "versioning",
      "currentValue",
      "cloneDir",
    ];

    for (const field of requiredFields) {
      if (typeof source[field] !== "string" || source[field].trim() === "") {
        throw new Error(`sources.lock.json 字段 ${field} 缺失或为空`);
      }
    }

    if (names.has(source.name)) {
      throw new Error(`sources.lock.json 里存在重复 name: ${source.name}`);
    }
    names.add(source.name);
  }

  return sources;
}

export function resolveCloneDir(source) {
  return path.join(repoRoot, source.cloneDir);
}

export function getSourceRepoUrl(source) {
  return `https://github.com/${source.depName}.git`;
}

export function getSourceProjectUrl(source) {
  return `https://github.com/${source.depName}`;
}

export function getSourceReleaseUrl(source, tagRef) {
  return `${getSourceProjectUrl(source)}/releases/tag/${encodeURIComponent(tagRef)}`;
}

export function normalizeGitUrl(url) {
  if (!url) {
    return "";
  }

  if (url.startsWith("git@github.com:")) {
    return `https://github.com/${url.slice("git@github.com:".length).replace(/\.git$/, "")}`;
  }

  return url.replace(/\.git$/, "");
}

export function parseNamedAssignment(value) {
  if (typeof value !== "string") {
    return null;
  }

  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  return {
    name: value.slice(0, separatorIndex),
    value: value.slice(separatorIndex + 1),
  };
}

export async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(
        `${command} ${args.join(" ")} 退出码为 ${code}`,
      );
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export async function runCommandStreaming(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (options.stdoutTarget) {
        options.stdoutTarget.write(chunk);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (options.stderrTarget) {
        options.stderrTarget.write(chunk);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(
        `${command} ${args.join(" ")} 退出码为 ${code}`,
      );
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export async function captureCommand(command, args, options = {}) {
  const { stdout } = await runCommand(command, args, {
    ...options,
    capture: true,
  });
  return stdout.trim();
}

export async function captureGit(cwd, args) {
  return captureCommand(gitBin, args, { cwd });
}

export async function ensureGitRepo(cwd) {
  const inside = await captureGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") {
    throw new Error(`${path.relative(repoRoot, cwd)} 不是一个 git 仓库`);
  }
}

export async function ensureCleanWorktree(cwd) {
  const status = await captureGit(cwd, ["status", "--porcelain"]);
  if (status) {
    throw new Error(
      `${path.relative(repoRoot, cwd)} 有未提交改动，先清掉再同步上游版本`,
    );
  }
}

export async function getRepoOrigin(cwd) {
  return captureGit(cwd, ["remote", "get-url", "origin"]);
}

export async function resolveTagRef(cwd, version) {
  const candidates = [version, `v${version}`];

  for (const candidate of candidates) {
    try {
      const sha = await captureGit(cwd, [
        "rev-list",
        "-n",
        "1",
        `refs/tags/${candidate}`,
      ]);
      return { ref: candidate, sha };
    } catch (error) {
      if (error?.code !== 128) {
        throw error;
      }
      continue;
    }
  }

  throw new Error(
    `${path.relative(repoRoot, cwd)} 找不到 ${version} 对应的 tag（尝试过 ${candidates.join(", ")}）`,
  );
}

export async function getHeadSha(cwd) {
  return captureGit(cwd, ["rev-parse", "HEAD"]);
}

export async function getRootRepoMetadata() {
  let repoRevision = "unknown";
  let repoSourceUrl = "unknown";

  try {
    repoRevision = await captureGit(repoRoot, ["rev-parse", "HEAD"]);
  } catch {
    repoRevision = "unknown";
  }

  try {
    repoSourceUrl = normalizeGitUrl(await getRepoOrigin(repoRoot));
  } catch {
    repoSourceUrl = "unknown";
  }

  return { repoRevision, repoSourceUrl };
}

export async function resolveUpstreamMetadata() {
  const sources = await readLockfile();
  const namedSources = {};

  for (const source of sources) {
    const cwd = resolveCloneDir(source);
    if (!(await pathExists(cwd))) {
      throw new Error(`${source.cloneDir} 不存在，先执行同步脚本`);
    }

    const resolvedTag = await resolveTagRef(cwd, source.currentValue);
    const sha = await getHeadSha(cwd);
    namedSources[source.name] = {
      ...source,
      repoUrl: getSourceRepoUrl(source),
      projectUrl: getSourceProjectUrl(source),
      resolvedTag: resolvedTag.ref,
      releaseUrl: getSourceReleaseUrl(source, resolvedTag.ref),
      sha,
      shaShort: sha.slice(0, 7),
    };
  }

  if (!namedSources.backend || !namedSources.frontend) {
    throw new Error("sources.lock.json 必须包含 backend 和 frontend 两个 source");
  }

  const rootMetadata = await getRootRepoMetadata();

  return {
    ...rootMetadata,
    backend: namedSources.backend,
    frontend: namedSources.frontend,
    comboTag: `b${namedSources.backend.currentValue}-f${namedSources.frontend.currentValue}`,
    versionMatrix: `backend-${namedSources.backend.currentValue}-frontend-${namedSources.frontend.currentValue}`,
    shaMatrix: `sha-${namedSources.backend.shaShort}-${namedSources.frontend.shaShort}`,
  };
}
