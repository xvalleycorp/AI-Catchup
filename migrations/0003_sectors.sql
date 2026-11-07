-- Industries an AI story is about, e.g. ["banking"].
ALTER TABLE items ADD COLUMN sectors TEXT NOT NULL DEFAULT '[]';
