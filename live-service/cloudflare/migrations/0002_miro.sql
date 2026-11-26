CREATE TABLE IF NOT EXISTS companions (
 owner TEXT PRIMARY KEY REFERENCES accounts(subject),
 ai_id TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 appearance TEXT NOT NULL DEFAULT 'miro-v2',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
