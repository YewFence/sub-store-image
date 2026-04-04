import {
  createPublishOutput,
  printStructuredOutput,
  resolvePublishMetadata,
} from "./lib/publish.mjs";

function parseArgs(argv) {
  const args = {
    imageName: "sub-store",
    format: "json",
    includeLatest: true,
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

    if (current === "--no-latest") {
      args.includeLatest = false;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadata = await resolvePublishMetadata(args);
  const output = createPublishOutput(metadata);
  printStructuredOutput(output, args.format);
}

main().catch((error) => {
  console.error(`[publish-metadata] 失败: ${error.message}`);
  process.exitCode = 1;
});
