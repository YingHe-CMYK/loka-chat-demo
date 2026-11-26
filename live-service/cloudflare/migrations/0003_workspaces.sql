CREATE TABLE IF NOT EXISTS workspaces (
 owner TEXT PRIMARY KEY REFERENCES accounts(subject),
 revision INTEGER NOT NULL DEFAULT 0,
 document TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
