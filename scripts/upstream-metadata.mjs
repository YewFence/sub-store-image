import { resolveUpstreamMetadata } from "./lib/upstreams.mjs";

function parseArgs(argv) {
  const args = { format: "json" };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--format") {
      args.format = argv[index + 1] ?? args.format;
      index += 1;
    }
  }

  return args;
}

function toOutput(metadata) {
  return {
    repo_source_url: metadata.repoSourceUrl,
    repo_revision: metadata.repoRevision,
    backend_repo: metadata.backend.depName,
    backend_project_url: metadata.backend.projectUrl,
    backend_version: metadata.backend.currentValue,
    backend_tag: metadata.backend.resolvedTag,
    backend_release_url: metadata.backend.releaseUrl,
    backend_sha: metadata.backend.sha,
    backend_sha_short: metadata.backend.shaShort,
    frontend_repo: metadata.frontend.depName,
    frontend_project_url: metadata.frontend.projectUrl,
    frontend_version: metadata.frontend.currentValue,
    frontend_tag: metadata.frontend.resolvedTag,
    frontend_release_url: metadata.frontend.releaseUrl,
    frontend_sha: metadata.frontend.sha,
    frontend_sha_short: metadata.frontend.shaShort,
    combo_tag: metadata.comboTag,
    version_matrix: metadata.versionMatrix,
    sha_matrix: metadata.shaMatrix,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadata = await resolveUpstreamMetadata();
  const output = toOutput(metadata);

  switch (args.format) {
    case "env":
    case "github-output":
      for (const [key, value] of Object.entries(output)) {
        console.log(`${key}=${value}`);
      }
      break;
    case "json":
      console.log(JSON.stringify(output, null, 2));
      break;
    default:
      throw new Error(`不支持的 format: ${args.format}`);
  }
}

main().catch((error) => {
  console.error(`[metadata] 失败: ${error.message}`);
  process.exitCode = 1;
});
