<h1 align="center">
  <img src="./public/icons/auto.svg" alt="CloudflareSub Logo" height="40" align="absmiddle" /> CloudflareSub
</h1>

<p align="center"><em>一个轻量化的优选IP订阅器</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-2ea44f" alt="License MIT" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Windows" />
  <img src="https://img.shields.io/badge/platform-macOS-111111" alt="macOS" />
  <img src="https://img.shields.io/badge/platform-Linux-FCC624?logo=linux&logoColor=black" alt="Linux" />
  <img src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/status-active-00C853" alt="Status Active" />
</p>

## 功能特性

- 支持 `vmess`、`vless`、`trojan` 节点解析
- 支持 Base64 订阅文本自动展开
- 支持 `host[:port][#remark]` 格式的优选地址
- 结果写入 Workers KV，生成 `/sub/:id` 短链
- 相同输入自动去重（7 天 TTL）
- 支持 `SUB_ACCESS_TOKEN` 访问令牌保护
- 支持导出：Raw（Base64）/ Clash（YAML）/ Surge（文本）

## 项目结构

```text
cloudflaresub/
├─ src/
│  ├─ worker.js      # Worker 入口（API + 订阅输出）
│  └─ core.js        # 解析/渲染核心函数（测试使用）
├─ public/           # 前端静态资源
├─ tests/smoke.mjs   # Smoke test
├─ wrangler.toml
└─ package.json
```

## 快速开始（Wrangler / wrangler.toml）

本项目建议直接用 `wrangler.toml` 部署，不依赖 Cloudflare Git 连接。

### 1) 创建 KV Namespace

- 进入 `Storage & Databases` -> `KV`
- 点击 `Create namespace`
- 名称建议：`SUB_STORE`
- 把生成的 namespace id 填到 `wrangler.toml` 的 `[[kv_namespaces]].id`

### 2) 确认 wrangler.toml

当前配置会部署 Worker `cfcdnsub2`，并绑定到：

```text
admin.crossthebluejail.top
```

如果你的 KV id 或域名不同，先改 `wrangler.toml`。

### 3) 配置 Secrets

```bash
npx wrangler secret put SITE_PASSWORD
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put SUB_ACCESS_TOKEN
```

说明：
- `SITE_PASSWORD`: 进入网页的密码
- `ADMIN_TOKEN`: admin panel 密码
- `SUB_ACCESS_TOKEN`: 订阅链接 `?token=` 保护

### 4) 部署

```bash
npx wrangler deploy
```

### 5) 验证线上服务

- 打开 `https://admin.crossthebluejail.top`
- 先输入 `SITE_PASSWORD`
- 在页面输入节点和优选地址，点击生成
- 拿到 `/sub/:id` 后测试：
  - `?target=raw&token=...`
  - `?target=clash&token=...`
  - `?target=surge&token=...`

## API 说明

### `POST /api/generate`

输入原始节点与优选地址，返回短链订阅。

请求体示例：

```json
{
  "nodeLinks": "vmess://...\nvless://...",
  "preferredIps": "104.16.1.2#HK\n104.17.2.3:2053#US",
  "namePrefix": "CF",
  "keepOriginalHost": true
}
```

字段说明：
- `nodeLinks`: 多行节点链接
- `preferredIps`: 多行优选地址，格式 `host[:port][#remark]`
- `namePrefix`: 节点名附加前缀
- `keepOriginalHost`: 是否保留原始 Host/SNI（默认 `true`）

返回示例（节选）：

```json
{
  "ok": true,
  "shortId": "AbC123xYz9",
  "urls": {
    "auto": "https://<worker>/sub/AbC123xYz9?token=...",
    "raw": "https://<worker>/sub/AbC123xYz9?target=raw&token=...",
    "clash": "https://<worker>/sub/AbC123xYz9?target=clash&token=...",
    "surge": "https://<worker>/sub/AbC123xYz9?target=surge&token=..."
  }
}
```

### `GET /sub/:id`

按 `target` 返回订阅内容：
- `target=raw`（默认）
- `target=clash`
- `target=surge`

示例：

```bash
curl "https://<worker>/sub/<id>?target=clash&token=<SUB_ACCESS_TOKEN>"
```

## 前端页面

根路径 `/` 提供网页表单（来自 `public/`）：
- 粘贴节点链接
- 粘贴优选 IP / 域名
- 生成并展示各客户端订阅链接
- 一键复制 / 生成二维码


## 注意事项

- `src/worker.js` 当前是 KV 短链方案，不依赖 `SUB_LINK_SECRET`
- 每条订阅记录默认保存 7 天（TTL）
- Surge 导出当前仅包含 `vmess` / `trojan`

## License

MIT
