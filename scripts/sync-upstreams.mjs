import {
  ensureCleanWorktree,
  ensureGitRepo,
  getRepoOrigin,
  getSourceRepoUrl,
  normalizeGitUrl,
  pathExists,
  readLockfile,
  repoRoot,
  resolveCloneDir,
  resolveTagRef,
  runCommand,
  gitBin,
} from "./lib/upstreams.mjs";

function log(message) {
  console.log(`[sync] ${message}`);
}

async function ensureClone(source) {
  const cloneDir = resolveCloneDir(source);
  const repoUrl = getSourceRepoUrl(source);

  if (!(await pathExists(cloneDir))) {
    log(`克隆 ${source.depName} -> ${source.cloneDir}`);
    await runCommand(
      gitBin,
      ["clone", "--filter=blob:none", repoUrl, source.cloneDir],
      {
        cwd: repoRoot,
      },
    );
    return cloneDir;
  }

  await ensureGitRepo(cloneDir);
  const origin = normalizeGitUrl(await getRepoOrigin(cloneDir));
  const expectedOrigin = normalizeGitUrl(repoUrl);

  if (origin !== expectedOrigin) {
    throw new Error(
      `${source.cloneDir} 的 origin 是 ${origin}，和 lockfile 里的 ${expectedOrigin} 不一致`,
    );
  }

  await ensureCleanWorktree(cloneDir);
  return cloneDir;
}

async function syncSource(source) {
  const cloneDir = await ensureClone(source);
  log(`获取 ${source.depName} 的最新 tags`);
  await runCommand(
    gitBin,
    ["fetch", "--force", "--tags", "--prune", "origin"],
    {
      cwd: cloneDir,
    },
  );

  const tag = await resolveTagRef(cloneDir, source.currentValue);
  log(`切到 ${source.depName}@${tag.ref} (${tag.sha.slice(0, 7)})`);
  await runCommand(gitBin, ["checkout", "--detach", `refs/tags/${tag.ref}`], {
    cwd: cloneDir,
  });
}

async function main() {
  const sources = await readLockfile();
  for (const source of sources) {
    await syncSource(source);
  }
  log("上游源码同步完成");
}

main().catch((error) => {
  console.error(`[sync] 失败: ${error.message}`);
  process.exitCode = 1;
});
