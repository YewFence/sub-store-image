import { copyFile, mkdir, access, writeFile } from "fs/promises";
import { resolve, join } from "path";
import { repoRoot, resolveCloneDir, readLockfile } from "./lib/upstreams.mjs";

const licensesDir = resolve(repoRoot, "licenses");

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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
    console.warn(`[licenses] 警告: ${source.depName} 未找到 LICENSE 文件`);
    return null;
  }

  // 创建目标文件名，避免冲突
  const safeName = source.name.replace(/[^a-zA-Z0-9-]/g, "_");
  const ext = foundLicense.endsWith(".md") ? ".md" : foundLicense.endsWith(".txt") ? ".txt" : "";
  const targetName = `${safeName}-LICENSE${ext}`;
  const targetPath = join(licensesDir, targetName);

  await copyFile(foundLicense, targetPath);
  console.log(`[licenses] 已收集 ${source.depName} 的许可证 -> ${targetName}`);

  return targetName;
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
    const licenseFile = collected[i];

    lines.push(`  ${i + 1}. ${source.name}`);
    lines.push(`     Repository: https://github.com/${source.depName}`);
    lines.push(`     Version: ${source.currentValue}`);
    lines.push(`     License: GNU Affero General Public License v3.0 (AGPL-3.0)`);
    if (licenseFile) {
      lines.push(`     License File: /usr/share/licenses/sub-store/${licenseFile}`);
    }
    lines.push("");
  }

  lines.push("--------------------------------------------------------------------------------");
  lines.push("");
  lines.push("The complete source code of these projects can be obtained from their");
  lines.push("respective repositories listed above.");
  lines.push("");
  lines.push("For the full text of the GNU Affero General Public License v3.0, see:");
  lines.push("https://www.gnu.org/licenses/agpl-3.0.html");
  lines.push("or check the license files included in this directory.");
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