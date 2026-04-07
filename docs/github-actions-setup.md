# GitHub Actions / Renovate 配置说明

本文说明如何配置这个仓库，使自动更新、冒烟测试、GHCR 发布和 GitHub Release 能正常运行。

## 最终效果

配置完成后，链路会是这样：

1. Renovate 发现上游 release/tag 更新
2. Renovate 更新 [`sources.lock.json`](../sources.lock.json)
3. `renovate/**` 分支触发 [`Upstream Smoke`](../.github/workflows/upstream-smoke.yml)
4. 冒烟通过后 Renovate 把更新直接写入 `main`(默认不会开 PR)
5. `main` 提交触发 [`Publish Image`](../.github/workflows/publish.yml)
6. 工作流把镜像推到 GHCR
7. 工作流创建或更新这个仓库自己的 GitHub Release

## TL;DR

完成前两步即可，后续步骤主要是原理说明。

## 1. 安装 Renovate App

默认使用官方 Renovate GitHub App，无需自托管。

操作步骤：

1. 安装 Mend Renovate App
2. 把这个仓库加入 Renovate 的安装范围
3. 确认仓库根目录保留 [`renovate.json`](../renovate.json)

官方文档：

- [Renovate 安装与 onboarding](https://docs.renovatebot.com/getting-started/installing-onboarding/)
- [Renovate automerge](https://docs.renovatebot.com/key-concepts/automerge/)

## 2. 打开 GitHub Actions

在仓库 `Settings -> Actions -> General` 里确认：

- GitHub Actions 已启用
- 工作流允许运行

官方文档：

- [GitHub Actions 仓库设置](https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

## 3. 让 `GITHUB_TOKEN` 有足够权限

这套 workflow 已经在文件里显式声明了权限，无需多余步骤，此处给出各个权限的说明：

- `contents: write` ：用来创建 GitHub Release
- `packages: write` ：用来发布 GHCR 镜像
- `issues: write` ：用来在自动化异常时开 issue

官方文档：

- [`GITHUB_TOKEN` 自动认证](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)

## 4. GHCR 发布

这套发布默认发布 GHCR 公开镜像，不需要额外 PAT，直接使用 `GITHUB_TOKEN`

## 5. 分支保护规则

需要注意，当前 [`renovate.json`](../renovate.json) 使用的是：

```json
{
  "automerge": true,
  "automergeType": "branch"
}
```

这意味着：

- Renovate 先建 `renovate/**` 分支
- 冒烟测试通过后，Renovate 会直接把 commit 写入 `main`，原分支不会保留，也没有 PR
- 如果测试失败，Renovate 才会保留分支/PR 给你看
- 如果打开了 `main` 分支保护，因为 Renovate 无法写入 `main` ,这个工作流会失败

### 从PR更新

如果你想要每次更新都必须过 PR 才合并，可以把自动合并改成 PR 模式：

1. 把 [`renovate.json`](../renovate.json) 里的 `automergeType` 改成 `pr`
2. 在 `main` 上启用 required status checks
3. 让 Github 自动 merge PR，而不是 branch automerge

## 6. 需要额外 secrets 吗

默认不需要。

当前这套实现里：

- 发布 GHCR 用 `GITHUB_TOKEN`
- 创建 GitHub Release 用 `GITHUB_TOKEN`
- 自动开 issue 用 `GITHUB_TOKEN`
- Renovate 用 GitHub App 自己的凭据

所以正常情况下，这个仓库不需要额外加 PAT。

## 7. 工作流失败后会发生什么

### 冒烟或构建失败

这类会被归到 `build-or-smoke-failure` ，会静默失败，直到上游下一次更新，这个场景一般是由于上游前端/后端出现了 BREAKING CHANGE，导致冒烟测试没通过，所以等上游修复后再更新就好了。

### 自动化本身出错

这类会被归到 `automation-error`，比如：

- 锁文件格式坏了
- 上游 tag 找不到
- GHCR 登录失败
- 创建 release 失败

这时 workflow 会自动创建或更新一个 issue，标题类似：

- `[automation] Sub-Store image pipeline failure`
- `[automation] Sub-Store image publish failure`

## 8. 首次上线检查清单

- 已安装 Renovate App
- 已启用 GitHub Actions
- 确认 `main` 的分支保护策略和 `automergeType=branch` 不冲突
- 手动触发一次 `Upstream Smoke`
- 手动触发一次 `Publish Image`
