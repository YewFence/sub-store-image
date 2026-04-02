import { dockerBin, resolveUpstreamMetadata, runCommand } from "./lib/upstreams.mjs";

function parseArgs(argv) {
  const tags = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--tag") {
      const tag = argv[index + 1];
      if (!tag) {
        throw new Error("--tag 后面缺少镜像名");
      }
      tags.push(tag);
      index += 1;
    }
  }

  if (tags.length === 0) {
    tags.push("sub-store:dev");
  }

  return { tags };
}

function buildLabels(metadata) {
  const buildTag = process.env.BUILD_TAG || metadata.comboTag;
  const releaseUrl = process.env.BUILD_RELEASE_URL || metadata.repoSourceUrl;

  return {
    "org.opencontainers.image.title": "Sub-Store",
    "org.opencontainers.image.description":
      `Sub-Store bundled image ${buildTag} built from backend ${metadata.backend.currentValue} and frontend ${metadata.frontend.currentValue}`,
    "org.opencontainers.image.version": buildTag,
    "org.opencontainers.image.revision": metadata.repoRevision,
    "org.opencontainers.image.source": metadata.repoSourceUrl,
    "org.opencontainers.image.url": releaseUrl,
    "org.opencontainers.image.created": new Date().toISOString(),
    "io.github.sub-store.build.tag": buildTag,
    "io.github.sub-store.build.release-url": releaseUrl,
    "io.github.sub-store.backend.repo": metadata.backend.depName,
    "io.github.sub-store.backend.version": metadata.backend.currentValue,
    "io.github.sub-store.backend.tag": metadata.backend.resolvedTag,
    "io.github.sub-store.backend.release-url": metadata.backend.releaseUrl,
    "io.github.sub-store.backend.sha": metadata.backend.sha,
    "io.github.sub-store.frontend.repo": metadata.frontend.depName,
    "io.github.sub-store.frontend.version": metadata.frontend.currentValue,
    "io.github.sub-store.frontend.tag": metadata.frontend.resolvedTag,
    "io.github.sub-store.frontend.release-url": metadata.frontend.releaseUrl,
    "io.github.sub-store.frontend.sha": metadata.frontend.sha,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadata = await resolveUpstreamMetadata();
  const labels = buildLabels(metadata);
  const commandArgs = ["build", "--file", "Dockerfile"];

  for (const tag of args.tags) {
    commandArgs.push("--tag", tag);
  }

  for (const [key, value] of Object.entries(labels)) {
    commandArgs.push("--label", `${key}=${value}`);
  }

  if (process.env.FRONTEND_API_BASE) {
    commandArgs.push("--build-arg", `FRONTEND_API_BASE=${process.env.FRONTEND_API_BASE}`);
  }

  if (process.env.FRONTEND_PUBLIC_PATH) {
    commandArgs.push("--build-arg", `FRONTEND_PUBLIC_PATH=${process.env.FRONTEND_PUBLIC_PATH}`);
  }

  commandArgs.push(".");

  console.log(`[build] 组合: ${metadata.comboTag}`);
  console.log(`[build] 版本: ${metadata.versionMatrix}`);
  console.log(`[build] SHA: ${metadata.shaMatrix}`);
  console.log(`[build] 标签: ${args.tags.join(", ")}`);

  await runCommand(dockerBin, commandArgs);
}

main().catch((error) => {
  console.error(`[build] 失败: ${error.message}`);
  process.exitCode = 1;
});
