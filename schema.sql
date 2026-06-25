-- VPS inventory + customers schema for vps-admin
-- Run with:  wrangler d1 execute vps-admin-db --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS vps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  label           TEXT,                       -- friendly name, e.g. "HK-01"
  ip              TEXT,
  region          TEXT,                       -- e.g. "Hong Kong", "US-LA"
  provider        TEXT,                       -- e.g. "BandwagonHost", "Vultr"
  panel_type      TEXT DEFAULT '3x-ui',       -- panel software
  panel_username  TEXT,
  panel_password  TEXT,
  panel_port      TEXT,
  web_base_path   TEXT,
  access_url      TEXT,
  ssh_port        TEXT,
  ssh_user        TEXT,
  ssh_password    TEXT,
  raw_info        TEXT,                        -- full pasted install block (kept verbatim)
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  contact       TEXT,                          -- Telegram / email / WeChat
  vps_id        INTEGER,                       -- which VPS they are on
  service_type  TEXT,                          -- VLESS / VMess / Trojan / Shadowsocks ...
  region        TEXT,                          -- node region they bought
  start_date    TEXT,
  expiry_date   TEXT,                          -- YYYY-MM-DD
  price         REAL,
  currency      TEXT DEFAULT 'CNY',
  status        TEXT DEFAULT 'active',         -- active / paused / cancelled
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_vps    ON customers(vps_id);
CREATE INDEX IF NOT EXISTS idx_customers_expiry ON customers(expiry_date);

-- Admin memo / cheatsheet — quick-launch commands and easily-forgotten things
CREATE TABLE IF NOT EXISTS memos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  category    TEXT,                              -- e.g. Terminal / SSH / Panel / Misc
  body        TEXT,                              -- the command or note (monospace, copyable)
  pinned      INTEGER DEFAULT 0,                 -- 1 = show first
  created_at  TEXT DEFAULT (datetime('now'))
);
