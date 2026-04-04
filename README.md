# Sub-Store Image Builder

这个仓库不是上游 `Sub-Store` 的源码仓库，而是一个专门负责以下工作的构建仓库：

- 锁定 `Sub-Store` 后端和 `Sub-Store-Front-End` 前端的上游 release/tag
- 自动检测上游新版本
- 自动同步源码、构建 Docker 镜像并做冒烟测试
- 测试通过后把组合镜像发布到 GHCR
- 为每次成功发布生成一个带溯源信息的 GitHub Release

仓库本身不跟踪上游源码目录，真正的版本锁定在 [`sources.lock.json`](./sources.lock.json)。

## 它现在在干什么

这套自动化当前分成两条工作流：

- [`Upstream Smoke`](./.github/workflows/upstream-smoke.yml)
  监听 `renovate/**` 分支。Renovate 更新锁文件后，这条工作流会拉上游源码、构建镜像、跑前后端冒烟。
- [`Publish Image`](./.github/workflows/publish.yml)
  监听 `main`。只有更新真正落到 `main` 后，才会发布 GHCR 镜像并创建这个仓库自己的 GitHub Release。

## 仓库结构

- [`sources.lock.json`](./sources.lock.json)
  上游版本锁文件。这里只记录上游 release/tag，不提交上游源码。
- [`renovate.json`](./renovate.json)
  Renovate 配置，负责自动 bump 锁文件。
- [`scripts/`](./scripts)
  本地和 CI 共用的同步、元数据、构建、冒烟脚本。
- [`justfile`](./justfile)
  本地命令入口。
- [`compose.yaml`](./compose.yaml)
  运行用 compose 栈，方便本地部署这个组合镜像和周边代理。
- [`docs/github-actions-setup.md`](./docs/github-actions-setup.md)
  GitHub Actions / Renovate / GHCR 的配置说明。

## 上游仓库与版本锁定规则

当前使用这两个上游仓库：

- `sub-store-org/Sub-Store`
- `sub-store-org/Sub-Store-Front-End`

锁文件里的 `depName` 会被统一展开成 `https://github.com/<depName>.git`。同步脚本会优先按 `currentValue` 找同名 tag，如果没有，再尝试 `v<currentValue>`。

## 镜像 tag 规则

镜像发布时会同时打几层 tag：

- `latest`
- `YYYY.MM.DD.<run_number>`
- `b<backendVersion>-f<frontendVersion>`
- `backend-<backendVersion>-frontend-<frontendVersion>`
- `sha-<backendSha7>-<frontendSha7>`

用途：

- 日期 tag 便于人工查阅，也适合在文档中引用
- `b...-f...` 用于快速确认上游版本组合
- `sha-...` 用于精确溯源

除了 tag，镜像 labels 和 GitHub Release 里还会补齐：

- backend / frontend 的上游 release 链接
- backend / frontend 的精确 commit SHA
- 这个构建仓库自己的 commit
- 对应的 workflow run 链接

## 本地用法

### 1. 同步上游源码

```bash
just sync
```

### 2. 本地构建镜像

```bash
just build
```

或者自定义镜像名：

```bash
just build ghcr.io/your-name/sub-store:test
```

### 3. 运行冒烟测试

```bash
just smoke
```

或者指定镜像和端口：

```bash
just smoke sub-store:smoke 38080
```

### 4. 看解析后的元数据

```bash
just metadata
```

### 5. 看发布出来会长什么样

```bash
just publish-metadata image=docker.io/your-name/sub-store
```

### 6. 本地构建发布用镜像 tag

```bash
just publish image=docker.io/your-name/sub-store
```

默认会生成这些 tag：

- `latest`
- `YYYY.MM.DD.local`
- `b<backendVersion>-f<frontendVersion>`
- `backend-<backendVersion>-frontend-<frontendVersion>`
- `sha-<backendSha7>-<frontendSha7>`

### 7. 推到任意 registry

先自己登录目标 registry：

```bash
docker login docker.io
```

再执行：

```bash
just publish-push image=docker.io/your-name/sub-store
```

如果你想更接近 CI 的日期 tag，也可以手动指定构建编号：

```bash
just publish-push image=docker.io/your-name/sub-store build_number=123
```

## 运行态说明

如果需要将这套镜像运行起来（而不只是用于 CI）：

1. 复制 [`.env.example`](./.env.example) 到 `.env`
2. 根据你的环境改端口、域名、token
3. 用 `docker compose` 启动

例如：

```bash
docker compose -f compose.yaml up -d --build
```

## 配置说明

关于 GitHub 侧的配置，参见：

- [`docs/github-actions-setup.md`](./docs/github-actions-setup.md)
