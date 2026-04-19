# Sub-Store 镜像与 docker compose 部署模版

这个仓库维护了一份 Sub-Store 镜像，并提供了一个相对安全的生产环境部署模版。

具体来说，它会负责锁定 Sub-Store 后端和前端的具体版本，自动检测上游有没有新版本，拉取源码、构建 Docker 镜像并做基础测试，测试没问题后发布到 GHCR，并且给出一套开箱即用的，更安全的，适合生产环境的 `sub-store` docker compose 部署配置模板。

> 这不是 [Sub-Store](https://github.com/sub-store-org/sub-store) 的官方源码仓库。也不存储上游源码

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/YewFence/sub-store-image.git
cd sub-store-image
```

> 仓库中包含 Nginx 配置自动生成脚本，并且保留了绑定挂载卷的文件夹以避免权限问题，所以需要克隆整个仓库以部署服务，仅有一个 `compose.yaml` 文件无法直接部署服务。

### 2. 配置环境变量

```bash
cp .env.example .env
```

参考 [`.env.example`](./.env.example) 里的注释，填好必要的环境变量。

### 3.a 生产部署

> 使用 [`compose.yaml`](./compose.yaml)。

启动：

```bash
# proxy 服务用官方 nginx 镜像，通过挂载脚本在启动时注入配置
docker compose up -d
```

默认仅在本地/私有网络可用

如果想用 Cloudflare Tunnel 让订阅可以在公网访问，先确保 `.env` 里`公网订阅入口配置`那部分填写完成，然后启用 `public` profile：

```bash
# proxy 服务用官方 nginx 镜像，通过挂载脚本在启动时注入配置
docker compose --profile public up -d
```

如果不清除如何配置的，可以查看[`docs/public-feed-setup.md`](./docs/public-feed-setup.md)。

### 3.b 本地开发

> 使用 [`compose.dev.yaml`](./compose.dev.yaml)。

启动：

```bash
# 下载上游源码
just sync
# 下载上游许可证
just licenses
docker compose -f compose.dev.yaml up -d --build
```

打开：

```text
http://127.0.0.1:3000
```

## Compose 文件说明

### `compose.yaml`

生产环境服务。

特点：

- 主服务用预构建好的 Sub-Store 镜像
- 数据持久化到宿主机的 `./data` 目录
- 管理页面只映射在本地/私有网络端口，也支持配反向代理、内网域名和自定义 TLS 证书
- 订阅入口可选通过 Cloudflare Tunnel 暴露在公网，需要带 token 查询参数验证
- 只有显式启用 `public` profile 时才会暴露在公网

### `compose.dev.yaml`

开发服务。

特点：

- 在本地使用源代码 build 镜像
- 数据持久化到宿主机的 `./data` 目录
- 直接暴露端口，不安全，请勿暴露到公网。

## 从上游源码构建镜像与发布

### 克隆仓库

```bash
git clone https://github.com/YewFence/sub-store-image.git
```

### 同步上游源码

```bash
just sync
```

### 本地构建镜像

```bash
just build
```

可自定义镜像名：

```bash
just build ghcr.io/your-name/sub-store:test
```

### 运行基础测试

```bash
just smoke
```

可指定镜像和端口：

```bash
just smoke sub-store:smoke 38080
```

### 查看上游版本信息

```bash
just metadata
```

### 预览发布流程生成的信息

```bash
just publish-metadata ghcr.io/your-name/sub-store
```

### 本地构建发布用的镜像

```bash
just publish ghcr.io/your-name/sub-store
```

会生成这些 tag：

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

## 仓库结构

- [`sources.lock.json`](./sources.lock.json)
  上游版本号锁文件。
- [`renovate.json`](./renovate.json)
  Renovate 配置，负责自动更新上游版本。
- [`scripts/`](./scripts)
  本地和 CI 共用的脚本，包括同步、构建、测试、发布。
- [`justfile`](./justfile)
  命令快捷执行入口。
- [`compose.yaml`](./compose.yaml)
  生产环境用的 compose 配置。
- [`compose.dev.yaml`](./compose.dev.yaml)
  开发/测试用的 compose 配置。
- [`docs/github-actions-setup.md`](./docs/github-actions-setup.md)
  GitHub Actions / Renovate / GHCR 的配置说明。

## 镜像构建原理

### 上游仓库与版本锁定

使用以下上游仓库：

- [Sub-Store](https://github.com/sub-store-org/Sub-Store)
- [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End)

锁文件里的 `depName` 会被统一展开成 `https://github.com/<depName>.git`。同步脚本会优先按 `currentValue` 找同名 tag，如果没有，再尝试 `v<currentValue>`。

### 自动化流程

有三条工作流：

- [`Upstream Smoke`](./.github/workflows/upstream-smoke.yml)
  监听 `renovate/**` 分支。Renovate 更新锁文件后，这条工作流会拉上游源码、构建镜像、跑前后端测试。作为测试，通过配置 Renovate 的自动合并以自动更新 `main` 分支
- [`Publish Image`](./.github/workflows/publish.yml)
  监听 `main` 分支。`main` 有更新时发布 GHCR 镜像并创建 GitHub Release。
- [`Trigger Renovate Dashboard`](./.github/workflows/renovate-dashboard-trigger.yml)
  每 4 小时把 Renovate Dependency Dashboard(issue #2) 里的 `manual job` checkbox 勾上一次，用来主动触发新一轮 Renovate 运行。

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
