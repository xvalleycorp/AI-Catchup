-- Announced model shutdown dates, one row per provider and model.
CREATE TABLE lifecycle (
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  retires_at  INTEGER NOT NULL, -- epoch ms
  replacement TEXT,
  url         TEXT NOT NULL,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  PRIMARY KEY (provider, model)
);
CREATE INDEX idx_lifecycle_retires ON lifecycle (retires_at);
