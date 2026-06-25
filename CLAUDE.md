# CLAUDE.md

Guidance for working in this repo.

## What this is

A Cloudflare Worker that turns proxy node links (VMess / VLESS / Trojan) into
subscription links. The user pastes node links + a list of preferred Cloudflare
IPs/domains; the Worker expands each node across every endpoint, stores the
result in KV, and serves it back as a subscription URL in raw / Clash / Surge
formats. There is a public generator page and a token-protected admin console.

- Worker name: `cfcdnsub2`
- Production domain: `admin.crossthebluejail.top`
- GitHub repo: `https://github.com/oleyyu/cfcdnsub` (branch `main`)

## Layout

```
src/worker.js     Entry point — fetch handler, routing, all API endpoints, auth, KV access
src/core.js       Pure library — parse/expand/render nodes (no Worker/KV deps). Unit-testable.
public/index.html Public generator UI
public/app.js     Frontend JS for the generator
public/admin.html Admin console (self-contained: HTML + CSS + JS in one file)
public/styles.css Shared styles for the generator page
tests/smoke.mjs   Node smoke test against src/core.js
wrangler.toml     Worker config + bindings
```

`worker.js` imports rendering/parsing from `core.js`. Keep node logic in
`core.js` (so it stays testable without a Worker runtime) and keep
routing/storage/auth in `worker.js`.

## Commands

```bash
npm run dev      # wrangler dev — local Worker + assets
npm run check    # node tests/smoke.mjs — core.js smoke test
node --check src/worker.js   # quick syntax check after editing
```

There is no bundler/transpile step — plain ES modules, `"type": "module"`.

## Deploy — IMPORTANT

The Worker is **connected to GitHub (Cloudflare Workers Builds)**. Do **not**
run `wrangler deploy` to ship. Deploying = pushing to `main`:

```bash
git add -A && git commit -m "..." && git push origin main
```

Cloudflare detects the push, builds, and deploys automatically. Verify in
Cloudflare Dashboard → Workers & Pages → `cfcdnsub2` → Deployments/Builds.

Only commit/push when the user asks.

## Bindings & secrets

`wrangler.toml`:
- `SUB_STORE` — KV namespace (subscription data lives here)
- `DB` — D1 database `vps-admin-db` (VPS inventory + customers; shared with the standalone `vps-admin` Worker)
- `ASSETS` — static assets from `./public`, SPA fallback, `run_worker_first = true`

Secrets (set in CF Dashboard or `wrangler secret put`, **never in git**):
- `ADMIN_TOKEN` — admin console auth (sent as `X-Admin-Token` header)
- `SITE_PASSWORD` — gate for the public site (cookie `se_site_auth`, 12h)
- `SUB_ACCESS_TOKEN` — optional second-layer `?token=` on subscription URLs

## KV data model (binding `SUB_STORE`)

| Key | Value | TTL |
|-----|-------|-----|
| `sub:{shortId}` | JSON record `{version, createdAt, updatedAt, options, nodes[], downloadEnabled}` | 7d |
| `dedup:{sha256}` | `{shortId}` — maps identical input back to one record | 7d |
| `download:{id}:{ts}:{uuid}` | JSON download-log entry | 30d |
| `global:download:allow` | `"true"` — temporary allow-all flag | 5m |

A `node` carries: `type`, `name`, `server` (the endpoint after expansion),
`originalServer` (pre-expansion), `port`, `uuid`/`password`, `network`, `path`,
`hostHeader`, `sni`, `tls`, plus protocol-specific fields. Render a node back to
a URI with `renderNodeUri(node)` from `core.js`.

## Routes (in `worker.js` `fetch`)

Public: `POST /api/generate` (site-gated), `GET /sub/:id` (token-gated),
`POST /api/site-login`, `GET /api/ping`.

Admin (all require `X-Admin-Token` via `checkAdmin`):
- `GET  /api/admin/sub/list?enabledOnly=` — list subscriptions
- `GET  /api/admin/sub/info?id=` — full detail (nodes, logs, subscription links)
- `POST /api/admin/sub/enable` · `/disable` — toggle `downloadEnabled`
- `POST /api/admin/sub/delete` — remove a sub + its logs + dedup mappings
- `POST /api/admin/sub/global-allow` · `GET /global-status`

VPS inventory (D1 binding `DB`, also `checkAdmin`-gated):
- `GET  /api/admin/vps/data` — all VPS + customers in one snapshot
- `POST /api/admin/vps/upsert` — create (no `id`) or update (`id`) a VPS
- `POST /api/admin/vps/delete` — delete a VPS, unlinks its customers (`vps_id = NULL`)
- `POST /api/admin/customer/upsert` · `/api/admin/customer/delete`

The admin page has two areas toggled by the sidebar (`showArea()`): the original
Subscriptions UI (`#subsArea`, dark indigo) and a VPS/Customers console
(`#vpsArea`, orange "Claude" glass theme, all CSS scoped under `#vpsArea`).
VPS JS helpers are prefixed `v*` and use `adminToken` + `#apiBase` like the rest.
D1 schema lives at `../../../vps-admin/schema.sql`.

## Conventions

- All API responses go through the `json()` helper and use the shape
  `{ ok: true, ... }` or `{ ok: false, error }` with an appropriate status.
- Admin handlers must call `checkAdmin(request, env)` first and return 403 otherwise.
- In `admin.html`, escape any server data interpolated into HTML with `esc()`,
  and use `jsAttr()` for values placed inside inline `onclick="..."` handlers.
- The admin page is one self-contained file — keep its CSS/JS inline; element
  IDs are referenced directly by the script, so don't rename them casually.
- KV writes use `expirationTtl`; preserve the existing TTLs when updating records.
