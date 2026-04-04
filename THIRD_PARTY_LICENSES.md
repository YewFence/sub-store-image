# Third-Party Licenses

本仓库分发的 Docker 镜像会打包上游 Sub-Store 组件。你在使用、再分发或对外提供服务时，需要同时遵守这些上游项目各自的许可证。

| 组件 | 上游仓库 | 许可证 | 许可证全文 |
|------|----------|--------|------------|
| Sub-Store 后端 | https://github.com/sub-store-org/Sub-Store | AGPL-3.0 | https://www.gnu.org/licenses/agpl-3.0.html |
| Sub-Store 前端 | https://github.com/sub-store-org/Sub-Store-Front-End | GPL-3.0 | https://www.gnu.org/licenses/gpl-3.0.html |

镜像构建时会把检测到的上游许可证文件和 `NOTICE.txt` 一起放进 `/usr/share/licenses/sub-store/`。
