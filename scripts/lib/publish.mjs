import { resolveUpstreamMetadata } from "./upstreams.mjs";

function pad(value) {
  return String(value).padStart(2, "0");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function validateImageName(imageName) {
  if (typeof imageName !== "string" || imageName.trim() === "") {
    throw new Error("--image 不能为空");
  }

  if (imageName.includes("@")) {
    throw new Error("--image 不支持带 digest");
  }

  const normalized = imageName.trim();
  const lastSlash = normalized.lastIndexOf("/");
  const lastColon = normalized.lastIndexOf(":");

  if (lastColon > lastSlash) {
    throw new Error("--image 需要传不带 tag 的镜像名前缀");
  }

  return normalized;
}

export function formatReleaseDate(date = new Date()) {
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

export function resolveBuildTag({ buildTag, buildNumber, now = new Date() } = {}) {
  const releaseDate = formatReleaseDate(now);

  if (typeof buildTag === "string" && buildTag.trim() !== "") {
    return {
      releaseDate,
      buildTag: buildTag.trim(),
    };
  }

  const suffix =
    typeof buildNumber === "string" && buildNumber.trim() !== ""
      ? buildNumber.trim()
      : "local";

  return {
    releaseDate,
    buildTag: `${releaseDate}.${suffix}`,
  };
}

export function resolveReleaseUrl({ releaseUrl, releaseBaseUrl, repoSourceUrl, buildTag }) {
  if (typeof releaseUrl === "string" && releaseUrl.trim() !== "") {
    return releaseUrl.trim();
  }

  let baseUrl = "";

  if (typeof releaseBaseUrl === "string" && releaseBaseUrl.trim() !== "") {
    baseUrl = releaseBaseUrl.trim();
  } else if (typeof repoSourceUrl === "string" && repoSourceUrl !== "unknown" && repoSourceUrl) {
    baseUrl = `${trimTrailingSlash(repoSourceUrl)}/releases/tag`;
  }

  if (!baseUrl) {
    return "";
  }

  return `${trimTrailingSlash(baseUrl)}/${encodeURIComponent(buildTag)}`;
}

export function buildImageLabels(
  metadata,
  {
    buildTag = metadata.comboTag,
    createdAt = new Date().toISOString(),
    releaseUrl = metadata.repoSourceUrl,
  } = {},
) {
  const resolvedReleaseUrl =
    typeof releaseUrl === "string" && releaseUrl.trim() !== ""
      ? releaseUrl.trim()
      : metadata.repoSourceUrl;

  return {
    "org.opencontainers.image.title": "Sub-Store",
    "org.opencontainers.image.description":
      `Sub-Store bundled image ${buildTag} built from backend ${metadata.backend.currentValue} and frontend ${metadata.frontend.currentValue}`,
    "org.opencontainers.image.version": buildTag,
    "org.opencontainers.image.revision": metadata.repoRevision,
    "org.opencontainers.image.source": metadata.repoSourceUrl,
    "org.opencontainers.image.url": resolvedReleaseUrl,
    "org.opencontainers.image.created": createdAt,
    "io.github.sub-store.build.tag": buildTag,
    "io.github.sub-store.build.release-url": resolvedReleaseUrl,
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

export function buildImageTagMap(imageName, metadata, { buildTag, includeLatest = true } = {}) {
  const tagMap = {
    latest: includeLatest ? "latest" : "",
    build: buildTag,
    combo: metadata.comboTag,
    versionMatrix: metadata.versionMatrix,
    shaMatrix: metadata.shaMatrix,
  };

  return Object.fromEntries(
    Object.entries(tagMap)
      .filter(([, value]) => typeof value === "string" && value !== "")
      .map(([key, value]) => [key, `${imageName}:${value}`]),
  );
}

export async function resolvePublishMetadata({
  imageName = "sub-store",
  buildTag,
  buildNumber,
  createdAt,
  releaseUrl,
  releaseBaseUrl,
  includeLatest = true,
} = {}) {
  const metadata = await resolveUpstreamMetadata();
  const normalizedImageName = validateImageName(imageName);
  const { releaseDate, buildTag: resolvedBuildTag } = resolveBuildTag({
    buildTag,
    buildNumber,
  });
  const resolvedCreatedAt =
    typeof createdAt === "string" && createdAt.trim() !== ""
      ? createdAt.trim()
      : new Date().toISOString();
  const resolvedReleaseUrl = resolveReleaseUrl({
    releaseUrl,
    releaseBaseUrl,
    repoSourceUrl: metadata.repoSourceUrl,
    buildTag: resolvedBuildTag,
  });
  const imageTagMap = buildImageTagMap(normalizedImageName, metadata, {
    buildTag: resolvedBuildTag,
    includeLatest,
  });

  return {
    ...metadata,
    imageName: normalizedImageName,
    createdAt: resolvedCreatedAt,
    releaseDate,
    buildTag: resolvedBuildTag,
    releaseUrl: resolvedReleaseUrl,
    imageTagMap,
    imageTags: Object.values(imageTagMap),
    labels: buildImageLabels(metadata, {
      buildTag: resolvedBuildTag,
      createdAt: resolvedCreatedAt,
      releaseUrl: resolvedReleaseUrl,
    }),
  };
}

export function createPublishOutput(metadata, extra = {}) {
  const output = {
    image_name: metadata.imageName,
    created_at: metadata.createdAt,
    release_date: metadata.releaseDate,
    build_tag: metadata.buildTag,
    release_url: metadata.releaseUrl,
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
    tag_latest: metadata.imageTagMap.latest ? "latest" : "",
    tag_build: metadata.buildTag,
    tag_combo: metadata.comboTag,
    tag_version_matrix: metadata.versionMatrix,
    tag_sha_matrix: metadata.shaMatrix,
    image_tag_latest: metadata.imageTagMap.latest ?? "",
    image_tag_build: metadata.imageTagMap.build ?? "",
    image_tag_combo: metadata.imageTagMap.combo ?? "",
    image_tag_version_matrix: metadata.imageTagMap.versionMatrix ?? "",
    image_tag_sha_matrix: metadata.imageTagMap.shaMatrix ?? "",
    image_tags_csv: metadata.imageTags.join(","),
    image_tags_json: JSON.stringify(metadata.imageTags),
  };

  return Object.fromEntries(
    Object.entries({
      ...output,
      ...extra,
    }).map(([key, value]) => [key, value ?? ""]),
  );
}

export function printStructuredOutput(output, format = "json") {
  switch (format) {
    case "env":
    case "github-output":
      for (const [key, value] of Object.entries(output)) {
        console.log(`${key}=${value}`);
      }
      return;
    case "json":
      console.log(JSON.stringify(output, null, 2));
      return;
    default:
      throw new Error(`不支持的 format: ${format}`);
  }
}
