-- Flatline leaderboard. Every submitted run is kept; the board shows each name's best run.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,        -- as typed (trimmed)
  name_key TEXT NOT NULL,    -- lower-cased, identifies a player on the board
  score INTEGER NOT NULL,    -- zombies eliminated
  secs INTEGER NOT NULL,     -- seconds survived
  created INTEGER NOT NULL,  -- unix ms
  ip_hash TEXT NOT NULL      -- salted SHA-256 of the submitter's IP, only for rate limiting
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, secs ASC, created ASC);
CREATE INDEX IF NOT EXISTS scores_name ON scores (name_key);
CREATE INDEX IF NOT EXISTS scores_ip ON scores (ip_hash, created);
