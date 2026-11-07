CREATE TABLE items (
  id           TEXT PRIMARY KEY,        -- hash(source + canonical url)
  source       TEXT NOT NULL,
  url_key      TEXT NOT NULL,           -- hash(canonical url): groups one story across sources
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  summary      TEXT,
  published_at INTEGER NOT NULL,        -- epoch ms
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  signal       REAL NOT NULL DEFAULT 0, -- stars / points / upvotes
  metric       TEXT,                    -- display label for signal
  discuss_url  TEXT,
  topics       TEXT NOT NULL DEFAULT '[]',
  base_score   REAL NOT NULL DEFAULT 0,
  reasons      TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_items_last_seen ON items (last_seen);
CREATE INDEX idx_items_published ON items (published_at);

CREATE TABLE source_status (
  id         TEXT PRIMARY KEY,
  last_run   INTEGER NOT NULL DEFAULT 0,
  last_ok    INTEGER NOT NULL DEFAULT 0,
  last_err   TEXT,
  last_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
