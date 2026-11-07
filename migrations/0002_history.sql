-- Items are now kept forever: they are the raw material of the timeline.
ALTER TABLE items ADD COLUMN orgs TEXT NOT NULL DEFAULT '[]';

-- Daily value of stars / points / trending score. Cannot be reconstructed later.
CREATE TABLE signal_history (
  item_id TEXT NOT NULL,
  day     TEXT NOT NULL, -- YYYY-MM-DD, Vietnam time
  signal  REAL NOT NULL,
  PRIMARY KEY (item_id, day)
);
CREATE INDEX idx_signal_history_day ON signal_history (day);
