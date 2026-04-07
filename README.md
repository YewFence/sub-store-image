# Sub-Store 第三方镜像与部署模板

> 这不是上游 [Sub-Store](https://github.com/sub-store-org/sub-store) 的官方源码仓库。

这个仓库主要做两件事：维护我自己的 Sub-Store 镜像，以及提供一个相对安全的生产环境部署方案。

具体来说，它会负责锁定 Sub-Store 后端和前端的具体版本，自动检测上游有没有新版本，拉取源码、构建 Docker 镜像并做基础测试，测试没问题后发布到 GHCR，并且给出一套开箱即用的，更安全的，适合生产环境的 `sub-store` docker compose 部署配置模板。

注意：这里不存储上游源码，只用 [`sources.lock.json`](./sources.lock.json) 记录版本信息。

> **注意**：自动化发布流程还在测试阶段，可能会出问题。

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/YewFence/sub-store-image.git
cd sub-store-image
```

> 仓库中包含 Nginx 配置自动生成脚本，并且保留了绑定挂载卷的文件夹以避免权限问题，所以需要克隆整个仓库以部署服务，仅有一个 `compose.yaml` 文件无法直接部署服务。

### 2. 准备环境变量

复制一份示例配置：

```bash
cp .env.example .env
```

参考 [`.env.example`](./.env.example) 里的注释，填好必要的环境变量。

### 3. 选择运行方式

#### 生产部署

生产环境默认用 [`compose.yaml`](./compose.yaml)。

这个配置的特点：

- sub-store 主服务直接拉已发布的镜像
- 管理后台通过 `admin-proxy` 暴露
- 公网订阅通过 `feed-proxy` 单独暴露
- 只有启用 `public` profile 时才会启动 `cloudflared`
- 主服务的 3000 端口不会直接暴露到公网

先拉镜像，再启动：

```bash
docker compose pull sub-store
# proxy 服务用官方 nginx 镜像，通过挂载脚本在启动时注入配置
docker compose up -d
```

如果想用 Cloudflare Tunnel 让订阅可以在公网访问，先确保 `.env` 里`公网订阅入口配置`那部分填写完成，然后启用 `public` profile：

```bash
# proxy 服务用官方 nginx 镜像，通过挂载脚本在启动时注入配置
docker compose --profile public up -d
```

如果不清除如何配置的，可以查看[`docs/public-feed-setup.md`](./docs/public-feed-setup.md)。

#### 本地开发

本地开发或测试用 [`compose.dev.yaml`](./compose.dev.yaml)。

这个配置的特点：

- 直接从当前仓库源码构建镜像
- 直接暴露 3000 端口
- 方便本地调试
- **不要直接用于生产环境**

启动方式：

```bash
just sync
just licenses
docker compose -f compose.dev.yaml up -d --build
```

默认访问地址：

```text
http://127.0.0.1:3000
```

## Compose 文件说明

### `compose.yaml`

这是给生产环境用的。

核心思路：

- 主服务用预构建好的 Sub-Store 镜像
- 数据持久化到宿主机的 `./data` 目录
- 管理页面只映射在本地/私有网络端口，也支持配反向代理、内网域名和自定义 TLS 证书
- 订阅入口可选通过 Cloudflare Tunnel 暴露在公网，需要带 token 参数验证

### `compose.dev.yaml`

这是开发用的。

```bash
# 启动开发环境
docker compose -f compose.dev.yaml up -d --build
```

会在当前仓库直接 build 镜像并暴露端口，不安全，请勿暴露到公网。

## 本地镜像构建与发布

如果你想自己构建或发布镜像，可以用这些命令。

### 同步上游源码

```bash
just sync
```

### 本地构建镜像

```bash
just build
```

或者自定义镜像名：

```bash
just build ghcr.io/your-name/sub-store:test
```

### 运行基础测试

```bash
just smoke
```

或者指定镜像和端口：

```bash
just smoke sub-store:smoke 38080
```

### 查看上游版本信息

```bash
just metadata
```

### 预览发布时会生成什么

```bash
just publish-metadata ghcr.io/your-name/sub-store
```

### 本地构建发布用的镜像 tag

```bash
just publish ghcr.io/your-name/sub-store
```

默认会生成这些 tag：

- `latest`
- `YYYY.MM.DD.local`
- `b<backendVersion>-f<frontendVersion>`
- `backend-<backendVersion>-frontend-<frontendVersion>`
- `sha-<backendSha7>-<frontendSha7>`

### 推到任意 registry

先登录目标 registry：

```bash
docker login ghcr.io
```

然后推送：

```bash
just publish-push ghcr.io/your-name/sub-store
```

如果想更接近 CI 的日期 tag，也可以手动指定构建编号：

```bash
just publish-push ghcr.io/your-name/sub-store 123
```

## 仓库结构

- [`sources.lock.json`](./sources.lock.json)
  记录上游版本号。这里只记版本，不提交上游源码。
- [`renovate.json`](./renovate.json)
  Renovate 配置，负责自动更新版本。
- [`scripts/`](./scripts)
  本地和 CI 共用的脚本，包括同步、构建、测试、发布。
- [`justfile`](./justfile)
  本地命令入口。
- [`compose.yaml`](./compose.yaml)
  生产环境用的 compose 配置。
- [`compose.dev.yaml`](./compose.dev.yaml)
  开发/测试用的 compose 配置。
- [`docs/github-actions-setup.md`](./docs/github-actions-setup.md)
  GitHub Actions / Renovate / GHCR 的配置说明。

## 镜像构建原理

### 上游仓库与版本锁定

目前用这两个上游仓库：

- `sub-store-org/Sub-Store`
- `sub-store-org/Sub-Store-Front-End`

锁文件里的 `depName` 会被统一展开成 `https://github.com/<depName>.git`。同步脚本会优先按 `currentValue` 找同名 tag，如果没有，再尝试 `v<currentValue>`。

### 自动化流程

这套自动化目前分成两条工作流：

- [`Upstream Smoke`](./.github/workflows/upstream-smoke.yml)
  监听 `renovate/**` 分支。Renovate 更新锁文件后，这条工作流会拉上游源码、构建镜像、跑前后端测试。
- [`Publish Image`](./.github/workflows/publish.yml)
  监听 `main` 分支。只有更新真正合并到 `main` 后，才会发布 GHCR 镜像并创建这个仓库自己的 GitHub Release。

### 镜像 tag 规则

发布时会同时打几层 tag：

- `latest`
- `YYYY.MM.DD.<run_number>`
- `b<backendVersion>-f<frontendVersion>`
- `backend-<backendVersion>-frontend-<frontendVersion>`
- `sha-<backendSha7>-<frontendSha7>`

这些 tag 的用途大概是：

- 日期 tag 方便人工查阅，也适合在文档中引用
- `b...-f...` 用于快速确认上游版本组合
- `sha-...` 用于精确溯源

除了 tag，镜像 labels 和 GitHub Release 里还会包含：

- backend / frontend 的上游 release 链接
- backend / frontend 的精确 commit SHA
- 构建仓库自己的 commit
- 对应的 workflow run 链接

## 配置说明

GitHub 的自动化配置，详见：

- [`docs/github-actions-setup.md`](./docs/github-actions-setup.md)

## LICENSE

本仓库的构建脚本、配置文件及相关文档以 **[MIT License](LICENSE)** 开源。

但请注意：**通过本仓库构建或分发的预构建 Docker 镜像包含受各自许可证约束的上游组件**。镜像构建时会把第三方许可证文件和 `NOTICE.txt` 一起打进 `/usr/share/licenses/sub-store/`，仓库里的说明见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。

## 上游归属与许可证

发布的镜像包含以下上游项目，它们分别受各自的 copyleft 许可证约束：

| 组件 | 上游仓库 | 许可证 |
|------|----------|--------|
| **Sub-Store 后端** | [sub-store-org/Sub-Store](https://github.com/sub-store-org/Sub-Store) | AGPL-3.0 |
| **Sub-Store 前端** | [sub-store-org/Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) | GPL-3.0 |

感谢这些项目的开发者和维护者

### 关于本仓库

- 这是 **非官方** 的第三方镜像维护仓库，与上游无直接关联
- 本仓库**不包含**上游源码，仅记录版本锁定信息（`sources.lock.json`）
- 镜像从上游源代码提供，不做修改，不对功能性、安全性或可用性做任何担保

### 用户权利与义务

根据这些许可证，使用本镜像时：

1. **你有权获得源代码**：可通过上方链接获取各组件的完整源码
2. **你有权修改和再分发**：但修改后的版本仍需遵守对应上游组件的许可证要求
3. **如果涉及网络服务或再分发**：还需要额外留意 AGPL / GPL 对源码提供与许可证保留的要求

如需了解完整条款，请参阅镜像内附带的许可证文件，或直接查看 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) 里的链接。
