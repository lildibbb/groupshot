import { Database } from 'bun:sqlite'

const MIGRATIONS = [
  `CREATE TABLE counters (
     bucket TEXT NOT NULL,      -- 'd:2026-10-20' or 'h:2026-10-20T14'
     metric TEXT NOT NULL,
     dim TEXT NOT NULL DEFAULT '',
     n INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (bucket, metric, dim)
   )`,
  `CREATE TABLE orders (
     id TEXT PRIMARY KEY,
     access TEXT NOT NULL,      -- sha256 of the buyer's order token
     plan TEXT NOT NULL,
     provider TEXT NOT NULL,
     amount_sen INTEGER NOT NULL,
     currency TEXT NOT NULL,
     email TEXT NOT NULL,
     name TEXT NOT NULL,
     label TEXT NOT NULL DEFAULT '',
     code TEXT NOT NULL UNIQUE, -- short reference the buyer types into a transfer or tip message
     status TEXT NOT NULL,      -- pending | review | paid | failed | expired | rejected
     provider_ref TEXT,
     claim_ref TEXT,
     license_key TEXT,
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     paid_at INTEGER
   )`,
  'CREATE INDEX orders_status ON orders (status, created_at)',
  'CREATE INDEX orders_provider_ref ON orders (provider, provider_ref)',
  `CREATE TABLE licenses (
     key TEXT PRIMARY KEY,
     plan TEXT NOT NULL,
     order_id TEXT,
     email TEXT NOT NULL,
     label TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     revoked INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE webhooks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     provider TEXT NOT NULL,
     received_at INTEGER NOT NULL,
     external_id TEXT,
     ok INTEGER NOT NULL,
     outcome TEXT NOT NULL,
     order_id TEXT,
     body TEXT NOT NULL
   )`,
  'CREATE UNIQUE INDEX webhooks_external ON webhooks (provider, external_id) WHERE external_id IS NOT NULL AND ok = 1',
  `CREATE TABLE gallery (
     license_key TEXT NOT NULL,
     keep_id TEXT NOT NULL,
     type TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (license_key, keep_id)
   )`,
  `CREATE TABLE kiosks (
     id TEXT PRIMARY KEY,
     license_key TEXT,
     name TEXT NOT NULL,
     version TEXT NOT NULL DEFAULT '',
     last_seen INTEGER NOT NULL,
     sessions INTEGER NOT NULL DEFAULT 0
   )`,
  'CREATE TABLE flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
]

export function openDb(path = ':memory:') {
  const db = new Database(path, { create: true, strict: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 2000')
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)')
  const row = db.query<{ v: number }, []>('SELECT v FROM schema_version').get()
  const from = row?.v ?? 0
  if (from < MIGRATIONS.length) {
    db.transaction(() => {
      for (const sql of MIGRATIONS.slice(from)) db.exec(sql)
      db.exec('DELETE FROM schema_version')
      db.query('INSERT INTO schema_version (v) VALUES (?)').run(MIGRATIONS.length)
    })()
  }
  return db
}

export type Db = Database
