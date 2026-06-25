# CLAUDE.md

Guidance for working in this repo.

## What this is

A Cloudflare Worker with two jobs behind one token-protected admin console:

1. **Subscription generator** — turns proxy node links (VMess / VLESS / Trojan)
   into subscription links. The user pastes node links + a list of preferred
   Cloudflare IPs/domains; the Worker expands each node across every endpoint,
   stores the result in KV, and serves it back as a subscription URL in
   raw / Clash / Surge formats. Has a public generator page (`index.html`).
2. **VPS inventory + customers** — manage VPS servers (panel logins, region,
   provider, raw install block) and the customers on each (service type,
   expiry, price). Stored in D1. Admin-only.

- Worker name: `cfcdnsub2`
- Production domain: `admin.crossthebluejail.top`
- GitHub repo: `https://github.com/oleyyu/cfcdnsub` (branch `main`)
- **Cloudflare account: `oleyyuissmart@gmail.com`** (id `af1cacbd0db6cf5527b03a1d0db4d943`).
  The Worker, its KV, and its D1 all live in this account. (A now-orphaned
  standalone `vps-admin` Worker + a separate D1 exist in a *different* account,
  `oleyyuhello@gmail.com` — unrelated to this repo.)

## Layout

```
src/worker.js     Entry point — fetch handler, routing, all API endpoints, auth, KV + D1 access
src/core.js       Pure library — parse/expand/render nodes (no Worker/KV deps). Unit-testable.
public/index.html Public generator UI
public/app.js     Frontend JS for the generator
public/admin.html Admin console — subscriptions + VPS/customers (self-contained: HTML+CSS+JS)
public/styles.css Styles for the public generator page
schema.sql        D1 schema for the vps + customers tables (apply with wrangler d1 execute)
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

# D1 (needs CLOUDFLARE_ACCOUNT_ID set to this account — see gotcha below)
wrangler d1 execute vps-admin-db --remote --file=./schema.sql   # (re)apply schema
wrangler d1 execute vps-admin-db --remote --command "SELECT * FROM vps;"
```

There is no bundler/transpile step — plain ES modules, `"type": "module"`.

## Deploy — IMPORTANT

The Worker is **connected to GitHub (Cloudflare Workers Builds)**. Do **not**
run `wrangler deploy` to ship. Deploying = pushing to `main`:

```bash
git add -A && git commit -m "..." && git push origin main
```

Cloudflare detects the push, builds, and deploys automatically. Verify in
Cloudflare Dashboard → Workers & Pages → `cfcdnsub2` → Deployments/Builds, or:

```bash
CLOUDFLARE_ACCOUNT_ID=af1cacbd0db6cf5527b03a1d0db4d943 wrangler deployments list --name cfcdnsub2
```

Only commit/push when the user asks.

**Cross-account gotcha:** every binding in `wrangler.toml` (KV, D1) must live in
**this** account (`oleyyuissmart`). A D1 `database_id` from another account makes
the build fail with `D1 binding 'DB' references database '…' which was not found
[code: 10181]`. The local CLI may default to a different account — pass
`CLOUDFLARE_ACCOUNT_ID=af1cacbd0db6cf5527b03a1d0db4d943` (or `wrangler login` to
the right account) when running `wrangler d1 …` against these resources.

## Bindings & secrets

`wrangler.toml`:
- `SUB_STORE` — KV namespace (subscription data) — id `accd8ed107f74dcc925eda758ad66498`
- `DB` — D1 database `vps-admin-db` (VPS inventory + customers) — id `539310c4-e664-403b-beea-88994f617dc0`
- `ASSETS` — static assets from `./public`, SPA fallback, `run_worker_first = true`

Secrets (set in CF Dashboard or `wrangler secret put`, **never in git**):
- `ADMIN_TOKEN` — admin console auth (sent as `X-Admin-Token` header)
- `SITE_PASSWORD` — gate for the public site (cookie `se_site_auth`, 12h)
- `SUB_ACCESS_TOKEN` — optional second-layer `?token=` on subscription URLs

Local dev secrets go in `.dev.vars` (gitignored).

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

## D1 data model (binding `DB`) — see `schema.sql`

- `vps` — `id`, `label`, `ip`, `region`, `provider`, `panel_type`,
  `panel_username`, `panel_password`, `panel_port`, `web_base_path`,
  `access_url`, `ssh_user`, `ssh_password`, `ssh_port`, `raw_info`
  (verbatim install block), `notes`, `created_at`.
- `customers` — `id`, `name`, `contact`, `vps_id` (FK → vps, `ON DELETE SET NULL`),
  `service_type`, `region`, `start_date`, `expiry_date`, `price`, `currency`,
  `status` (active/paused/cancelled), `notes`, `created_at`.

Upserts write the full column set (the client always sends every field), so a
partial POST will null unspecified columns — send all fields on update.

## Routes (in `worker.js` `fetch`)

Public: `POST /api/generate` (site-gated), `GET /sub/:id` (token-gated),
`POST /api/site-login`, `GET /api/ping`.

Admin — subscriptions (all require `X-Admin-Token` via `checkAdmin`):
- `GET  /api/admin/sub/list?enabledOnly=` — list subscriptions
- `GET  /api/admin/sub/info?id=` — full detail (nodes, logs, subscription links)
- `POST /api/admin/sub/enable` · `/disable` — toggle `downloadEnabled`
- `POST /api/admin/sub/delete` — remove a sub + its logs + dedup mappings
- `POST /api/admin/sub/global-allow` · `GET /global-status`

Admin — VPS inventory (D1, also `checkAdmin`-gated):
- `GET  /api/admin/vps/data` — all VPS + customers in one snapshot
- `POST /api/admin/vps/upsert` — create (no `id`) or update (`id`) a VPS
- `POST /api/admin/vps/delete` — delete a VPS, unlinks its customers (`vps_id = NULL`)
- `POST /api/admin/customer/upsert` · `/api/admin/customer/delete`

## Admin console (`admin.html`)

One self-contained file. A sidebar (`showArea()`) toggles two content areas:
the **Subscriptions** UI (`#subsArea`) and the **VPS/Customers** console
(`#vpsArea`). VPS JS helpers are prefixed `v*` and reuse `adminToken` +
`#apiBase` like the rest. The VPS area's component CSS is scoped under
`#vpsArea` (`.v-*` classes) so it stays self-contained.

## Theme — orange "Claude" glass (whole project)

Both `admin.html` and the public `styles.css` use a light, warm
glassmorphism theme: orange accent `#E8623A` (deep `#C54E2A`), ink text
`#1d1d1f`, frosted-white translucent surfaces with `backdrop-filter` blur,
dark-on-light borders (`rgba(0,0,0,0.06–0.12)`), pill buttons with an orange
gradient, and a warm radial gradient page backdrop. Keep new UI consistent
with these tokens. `admin.html` is variable-light (CSS custom props in
`:root`); `styles.css` is fully variable-driven (`--accent`, `--card`,
`--fg`, …) — recolor via the tokens, not hardcoded hexes.

## Conventions

- All API responses go through the `json()` helper and use the shape
  `{ ok: true, ... }` or `{ ok: false, error }` with an appropriate status.
- Admin handlers must call `checkAdmin(request, env)` first and return 403 otherwise.
- In `admin.html`, escape any server data interpolated into HTML with `esc()`,
  and use `jsAttr()` for values placed inside inline `onclick="..."` handlers.
- The admin page is one self-contained file — keep its CSS/JS inline; element
  IDs are referenced directly by the script, so don't rename them casually.
- KV writes use `expirationTtl`; preserve the existing TTLs when updating records.
- D1 has no TTL — VPS/customer records persist until explicitly deleted.
