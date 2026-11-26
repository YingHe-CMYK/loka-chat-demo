CREATE TABLE IF NOT EXISTS twin_calibration_examples (
  owner TEXT NOT NULL,
  twin_id TEXT NOT NULL,
  id TEXT NOT NULL,
  example TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner, twin_id, id)
);
