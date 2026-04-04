import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { resolve, join } from "path";
import { pathExists, repoRoot, resolveCloneDir, readLockfile } from "./lib/upstreams.mjs";

const licensesDir = resolve(repoRoot, "licenses");

function detectLicenseId(licenseText) {
  const spdxMatch = licenseText.match(/SPDX-License-Identifier:\s*([^\s]+)/i);
  if (spdxMatch) {
    return spdxMatch[1];
  }

  const normalized = licenseText.toUpperCase();
  const header = normalized.slice(0, 4096);

  if (header.includes("GNU AFFERO GENERAL PUBLIC LICENSE")) {
    return "AGPL-3.0";
  }
  if (header.includes("GNU GENERAL PUBLIC LICENSE")) {
    return "GPL-3.0";
  }
  if (header.includes("APACHE LICENSE") && header.includes("VERSION 2.0")) {
    return "Apache-2.0";
  }
  if (header.includes("MIT LICENSE")) {
    return "MIT";
  }
  if (header.includes("MOZILLA PUBLIC LICENSE") && header.includes("2.0")) {
    return "MPL-2.0";
  }
  if (header.includes("BSD 3-CLAUSE")) {
    return "BSD-3-Clause";
  }
  if (header.includes("BSD 2-CLAUSE")) {
    return "BSD-2-Clause";
  }

  return "UNKNOWN";
}

async function collectLicense(source) {
  const cloneDir = resolveCloneDir(source);

  // 常见的许可证文件名
  const possibleNames = [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "COPYING",
    "COPYING.md",
    "COPYING.txt",
  ];

  let foundLicense = null;
  for (const name of possibleNames) {
    const licensePath = join(cloneDir, name);
    if (await pathExists(licensePath)) {
      foundLicense = licensePath;
      break;
    }
  }

  if (!foundLicense) {
    throw new Error(`${source.depName} 未找到 LICENSE/COPYING 文件`);
  }

  // 创建目标文件名，避免冲突
  const safeName = source.name.replace(/[^a-zA-Z0-9-]/g, "_");
  const ext = foundLicense.endsWith(".md") ? ".md" : foundLicense.endsWith(".txt") ? ".txt" : "";
  const targetName = `${safeName}-LICENSE${ext}`;
  const targetPath = join(licensesDir, targetName);
  const licenseText = await readFile(foundLicense, "utf8");
  const licenseId = detectLicenseId(licenseText);

  await copyFile(foundLicense, targetPath);
  console.log(`[licenses] 已收集 ${source.depName} 的许可证 -> ${targetName} (${licenseId})`);

  return {
    fileName: targetName,
    licenseId,
  };
}

async function generateNotice(sources, collected) {
  const lines = [
    "================================================================================",
    "                          THIRD-PARTY LICENSE NOTICE",
    "================================================================================",
    "",
    "This software contains code from the following open source projects:",
    "",
  ];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const collectedLicense = collected[i];

    lines.push(`  ${i + 1}. ${source.name}`);
    lines.push(`     Repository: https://github.com/${source.depName}`);
    lines.push(`     Version: ${source.currentValue}`);
    lines.push(`     License: ${collectedLicense?.licenseId ?? "UNKNOWN"}`);
    if (collectedLicense?.fileName) {
      lines.push(`     License File: /usr/share/licenses/sub-store/${collectedLicense.fileName}`);
    }
    lines.push("");
  }

  lines.push("--------------------------------------------------------------------------------");
  lines.push("");
  lines.push("The complete source code of these projects can be obtained from their");
  lines.push("respective repositories listed above.");
  lines.push("");
  lines.push("Refer to the included license files for the authoritative upstream license terms.");
  lines.push("");
  lines.push("================================================================================");

  const noticePath = join(licensesDir, "NOTICE.txt");
  await writeFile(noticePath, lines.join("\n"), "utf-8");
  console.log(`[licenses] 已生成 NOTICE.txt`);
}

async function main() {
  // 确保 licenses 目录存在
  await mkdir(licensesDir, { recursive: true });

  const sources = await readLockfile();
  const collected = [];

  for (const source of sources) {
    const licenseFile = await collectLicense(source);
    collected.push(licenseFile);
  }

  // 生成 NOTICE 文件
  await generateNotice(sources, collected);

  console.log(`[licenses] 许可证收集完成，共 ${sources.length} 个项目`);
}

main().catch((error) => {
  console.error(`[licenses] 失败: ${error.message}`);
  process.exitCode = 1;
});
