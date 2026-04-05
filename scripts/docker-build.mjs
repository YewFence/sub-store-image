import { buildImageLabels } from "./lib/publish.mjs";
import {
  dockerBin,
  parseNamedAssignment,
  resolveUpstreamMetadata,
  runCommand,
} from "./lib/upstreams.mjs";

function normalizeTagValue(rawTag) {
  const assignment = parseNamedAssignment(rawTag);
  if (!assignment) {
    return rawTag;
  }

  if (assignment.name === "image" || assignment.name === "tag") {
    return assignment.value;
  }

  return null;
}

function parseArgs(argv) {
  const tags = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--tag") {
      const rawTag = argv[index + 1];
      if (rawTag == null) {
        throw new Error("--tag 后面缺少镜像名");
      }

      const tag = normalizeTagValue(rawTag);
      if (tag == null) {
        throw new Error(`--tag 参数不合法: ${rawTag}`);
      }
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadata = await resolveUpstreamMetadata();
  const labels = buildImageLabels(metadata, {
    buildTag: process.env.BUILD_TAG || metadata.comboTag,
    releaseUrl: process.env.BUILD_RELEASE_URL || metadata.repoSourceUrl,
  });
  const commandArgs = ["build", "--file", "Dockerfile"];

  for (const tag of args.tags) {
    commandArgs.push("--tag", tag);
  }

  for (const [key, value] of Object.entries(labels)) {
    commandArgs.push("--label", `${key}=${value}`);
  }

  if (process.env.FRONTEND_API_BASE) {
    commandArgs.push(
      "--build-arg",
      `FRONTEND_API_BASE=${process.env.FRONTEND_API_BASE}`,
    );
  }

  if (process.env.FRONTEND_PUBLIC_PATH) {
    commandArgs.push(
      "--build-arg",
      `FRONTEND_PUBLIC_PATH=${process.env.FRONTEND_PUBLIC_PATH}`,
    );
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
