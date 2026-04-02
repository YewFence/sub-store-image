import { dockerBin, runCommand } from "./lib/upstreams.mjs";

function parseArgs(argv) {
  const args = {
    image: "sub-store:dev",
    port: "38080",
    timeoutMs: 90000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--image") {
      args.image = argv[index + 1] ?? args.image;
      index += 1;
      continue;
    }
    if (current === "--port") {
      args.port = argv[index + 1] ?? args.port;
      index += 1;
      continue;
    }
    if (current === "--timeout-ms") {
      const timeoutMs = Number(argv[index + 1]);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("--timeout-ms 必须是正整数");
      }
      args.timeoutMs = timeoutMs;
      index += 1;
    }
  }

  return args;
}

async function waitFor(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // ignore and retry
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }

  throw new Error(`等待服务就绪超时: ${url}`);
}

async function assertFrontend(baseUrl) {
  const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
  if (response.status !== 200) {
    throw new Error(`首页状态码不对: ${response.status}`);
  }

  const html = await response.text();
  if (!html.includes("<title>Sub Store</title>")) {
    throw new Error("首页缺少预期标题 <title>Sub Store</title>");
  }
}

async function assertBackend(baseUrl) {
  const response = await fetch(`${baseUrl}/backend/api/utils/env`);
  if (response.status !== 200) {
    throw new Error(`/backend/api/utils/env 状态码不对: ${response.status}`);
  }

  const text = await response.text();
  if (!text.includes('"status": "success"')) {
    throw new Error("/backend/api/utils/env 响应里缺少 status=success");
  }

  const payload = JSON.parse(text);
  if (payload.status !== "success") {
    throw new Error("/backend/api/utils/env 返回的 status 不是 success");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const containerName = `sub-store-smoke-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${args.port}`;
  let containerStarted = false;

  try {
    console.log(`[smoke] 启动容器 ${containerName}`);
    await runCommand(dockerBin, [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--publish",
      `${args.port}:3000`,
      args.image,
    ]);
    containerStarted = true;

    console.log(`[smoke] 等待服务启动: ${baseUrl}/backend/api/utils/env`);
    await waitFor(`${baseUrl}/backend/api/utils/env`, args.timeoutMs);

    console.log("[smoke] 检查前端首页");
    await assertFrontend(baseUrl);

    console.log("[smoke] 检查后端接口");
    await assertBackend(baseUrl);

    console.log("[smoke] 冒烟通过");
  } catch (error) {
    if (containerStarted) {
      try {
        const logs = await runCommand(dockerBin, ["logs", containerName], {
          capture: true,
        });
        if (logs.stdout || logs.stderr) {
          console.error("[smoke] 容器日志:");
          if (logs.stdout) {
            console.error(logs.stdout.trim());
          }
          if (logs.stderr) {
            console.error(logs.stderr.trim());
          }
        }
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    if (containerStarted) {
      try {
        await runCommand(dockerBin, ["rm", "--force", containerName], {
          capture: true,
        });
      } catch {
        // ignore
      }
    }
  }
}

main().catch((error) => {
  console.error(`[smoke] 失败: ${error.message}`);
  process.exitCode = 1;
});
