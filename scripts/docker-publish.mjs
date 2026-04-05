import {
  createPublishOutput,
  printStructuredOutput,
  resolvePublishMetadata,
} from "./lib/publish.mjs";
import { dockerBin, runCommandStreaming } from "./lib/upstreams.mjs";

function parseArgs(argv) {
  const args = {
    imageName: "sub-store",
    format: "text",
    includeLatest: true,
    push: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--image") {
      const imageName = argv[index + 1];
      if (!imageName) {
        throw new Error("--image 后面缺少镜像名前缀");
      }
      args.imageName = imageName;
      index += 1;
      continue;
    }

    if (current === "--format") {
      args.format = argv[index + 1] ?? args.format;
      index += 1;
      continue;
    }

    if (current === "--build-tag") {
      args.buildTag = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (current === "--build-number") {
      args.buildNumber = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (current === "--created-at") {
      args.createdAt = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (current === "--release-url") {
      args.releaseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (current === "--release-base-url") {
      args.releaseBaseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (current === "--push") {
      args.push = true;
      continue;
    }

    if (current === "--no-latest") {
      args.includeLatest = false;
    }
  }

  return args;
}

function parseDigest(output) {
  const match = output.match(/digest:\s*(sha256:[0-9a-f]+)/i);
  return match ? match[1] : "";
}

function log(message) {
  console.error(`[publish] ${message}`);
}

function buildDockerArgs(metadata) {
  const commandArgs = ["build", "--file", "Dockerfile"];

  for (const imageTag of metadata.imageTags) {
    commandArgs.push("--tag", imageTag);
  }

  for (const [key, value] of Object.entries(metadata.labels)) {
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
  return commandArgs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadata = await resolvePublishMetadata(args);

  log(`镜像前缀: ${metadata.imageName}`);
  log(`构建标签: ${metadata.buildTag}`);
  log(`组合版本: ${metadata.comboTag}`);
  log(`版本矩阵: ${metadata.versionMatrix}`);
  log(`SHA 矩阵: ${metadata.shaMatrix}`);
  log(`完整 tags: ${metadata.imageTags.join(", ")}`);

  await runCommandStreaming(dockerBin, buildDockerArgs(metadata), {
    stdoutTarget: process.stderr,
    stderrTarget: process.stderr,
  });

  let digest = "";

  if (args.push) {
    for (const imageTag of metadata.imageTags) {
      log(`推送 ${imageTag}`);
      const result = await runCommandStreaming(dockerBin, ["push", imageTag], {
        stdoutTarget: process.stderr,
        stderrTarget: process.stderr,
      });

      if (!digest) {
        digest = parseDigest(`${result.stdout}\n${result.stderr}`);
      }
    }
  }

  const output = createPublishOutput(metadata, {
    digest,
    pushed: args.push ? "true" : "false",
  });

  if (args.format === "text") {
    const summary = [
      `构建完成: ${metadata.imageTagMap.build ?? metadata.imageTags[0]}`,
      `推送状态: ${args.push ? "已推送" : "仅本地构建"}`,
      `Digest: ${digest || "n/a"}`,
    ];

    for (const line of summary) {
      console.log(line);
    }
    return;
  }

  printStructuredOutput(output, args.format);
}

main().catch((error) => {
  console.error(`[publish] 失败: ${error.message}`);
  process.exitCode = 1;
});
