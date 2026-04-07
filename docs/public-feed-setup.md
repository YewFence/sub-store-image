# 通过 Cloudflare Tunnel 暴露公网订阅

这篇文档专门说明：在这套 `docker compose` 部署里，怎么把 Sub-Store 的订阅安全地暴露到公网。

# TL;DR

1. 新建一个 Cloudflare Tunnel 把 token 填入 `.env`
2. 在 sub-store 新建一个分享
3. 根据示例在 `.env` 配置好 `SUB_STORE_FEED_ROUTES`
3. 启动 `cloudflared`
4. 给 tunnel 配一个 route 指向 ``http://feed-proxy:8080``

## 快速开始

### 1. 创建一个分享

公网入口最终访问的还是 Sub-Store 的 `/share/...` 地址，所以你还是得先在 Sub-Store 里创建分享。

你至少要知道下面这些信息：

- 分享类型：`file`、`sub` 或 `col`
- 资源名称：这里填的是 `name`，不是显示名称
- 分享 token：最终访问时要拼在 `?token=...` 里
- 如果是 `sub` 或 `col`，可选目标平台：比如 `ClashMeta`、`Surge`

如果资源名或目标平台里有空格、中文或特殊字符，先做 URL 编码。

### 2. 获取 Cloudflare Tunnel token

在 Cloudflare 里建好 tunnel，然后把 token 填进 `.env`，具体教程请查看[官方文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide)。我这里就不写详细教程了，因为 CF Dashboard 天天变 ~~绝对不是因为我懒~~

### 3. 确定你的订阅的公网域名

比如你想把订阅入口放在：

```text
sub-feed.example.com
```

那么就在 `.env` 里填入：

```env
SUB_STORE_FEED_SERVER_NAME=sub-feed.example.com
```

### 4. 配置 Cloudflare Tunnel 的 route

在 Cloudflare Zero Trust 里给 tunnel 配置 `Published application`，`Service_URL` 填写 `http://feed-proxy:8080`

### 5. 填写反向代理配置

这是最关键的配置，用来定义公网访问的路径和这个路径最终要转发到的订阅路径

格式是：

```text
/公网路径|file/sub/col|资源名|目标平台(可选，仅 sub/col 支持)
```

多条规则用分号 `;` 分隔。

比如：

```env
SUB_STORE_FEED_ROUTES=/phone|file|my-file;/ipad|sub|my-airport|ClashMeta;/mac|col|my-collection|Surge
```

这三条规则实际会变成：

| 公网地址 | 内部转发地址 |
| --- | --- |
| `/phone` | `/share/file/my-file` |
| `/ipad` | `/share/sub/my-airport/ClashMeta` |
| `/mac` | `/share/col/my-collection/Surge` |

需要注意，此处会透传 `?token=...` 这个 query 参数，并在 `sub-store` 后端进行校验，其他额外的 query 参数会被丢弃。最后的订阅链接应该类似于：

```text
https://sub-feed.example.com/phone?token=<share-token>
https://sub-feed.example.com/ipad?token=<share-token>
https://sub-feed.example.com/mac?token=<share-token>
```

done

---

## 为什么不是 route 到 `sub-store:3000`

因为这个仓库的设计目标就是把公网暴露面压到最小。

如果你直接把 tunnel 指到 `sub-store:3000`，那等于把整个后端入口都挂到了 tunnel 后面，这就绕过了仓库里专门做的 `feed-proxy` 限制层。

而现在这套做法的好处是：

- 只会在公网暴露少数几个订阅文件路径，而不是完整的管理后台
- 其他 query 参数不会被继续透传，只能获取你配置好的订阅内容

## 这套设计里每个服务是干嘛的

### `sub-store`

真正的后端服务，内部监听 `3000` 端口。

它负责响应这些真实分享地址：

- `/share/file/:name`
- `/share/sub/:name`
- `/share/sub/:name/:target`
- `/share/col/:name`
- `/share/col/:name/:target`

但它本身不会直接暴露到公网。

### `feed-proxy`

这是公网订阅专用的 Nginx 代理，内部监听 `8080` 端口。

它负责两件事：

1. 接收来自 Cloudflare Tunnel 的请求
2. 按照 `SUB_STORE_FEED_ROUTES` 把公网路径转发到 `sub-store:3000/share/...`

比如：

```text
/phone -> /share/file/my-file
/ipad  -> /share/sub/my-airport/ClashMeta
```

### `cloudflared`

这个容器只负责把 Cloudflare Tunnel 打通，然后把外部请求送到 Docker 内网里的 `feed-proxy`。

路径映射是在 `feed-proxy` 里做的，不是在 Cloudflare Dashboard 里做的。

## 常见坑

### 1. `SUB_STORE_FEED_SERVER_NAME` 和 Cloudflare hostname 没对上

虽然 `feed-proxy` 默认也不是靠这个值做严格鉴权，但这里最好保持一致，不然排查时很容易自己把自己绕进去。

### 2. `SUB_STORE_FEED_ROUTES` 里的资源名写成显示名称

这里要填的是 `name`，不是前端里给你看的显示名称。

### 3. 想在 Cloudflare 里直接配路径级 route

这套实现不需要这么做。

Cloudflare 只负责：

- 域名
- tunnel
- 把流量送到 `feed-proxy:8080`

路径规则全部在 `SUB_STORE_FEED_ROUTES`。

### 4. 访问时没带 `token`

`feed-proxy` 会直接返回 `401`。

所以最终给客户端的地址一定要长这样：

```text
https://sub-feed.example.com/phone?token=<share-token>
```

### 5. 想把额外 query 参数也透传给后端

对于类似这种 URL

```text
https://sub-feed.example.com/phone?token=abc&foo=bar
```

最终 `foo=bar` 会被丢弃。

## 排错建议

### 看容器有没有起来

```bash
docker compose --profile public ps
```

你至少应该能看到这些服务：

- `sub-store`
- `feed-proxy`
- `cloudflared`

### 看 `cloudflared` 日志

```bash
docker compose logs cloudflared --tail=100
```

### 看 `feed-proxy` 日志

```bash
docker compose logs feed-proxy --tail=100
```

如果 `SUB_STORE_FEED_ROUTES` 格式不对，比如：

- 路径没以 `/` 开头
- `file` 带了 `target`
- 资源名里有未编码的特殊字符
- 同一个公网路径重复了

这个容器启动时就会直接失败。

### 健康检查端点

`feed-proxy` 内部有一个健康检查路径，可以尝试外部访问 `https://sub-feed.example.com/healthz`，看看能不能访问到来确认从本地经过 Cloudflare Tunnel 到达 `feed-proxy` 之间的连接有没有问题。
