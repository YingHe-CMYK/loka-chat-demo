CREATE TABLE IF NOT EXISTS loka_source_connections (
 owner TEXT NOT NULL REFERENCES accounts(subject), provider TEXT NOT NULL,
 account_id TEXT NOT NULL, account_label TEXT NOT NULL,
 credential TEXT, status TEXT NOT NULL DEFAULT 'connected',
 revision TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(owner,provider)
);
CREATE TABLE IF NOT EXISTS loka_oauth_states (
 hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES accounts(subject),
 provider TEXT NOT NULL, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'oauth', status TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS loka_oauth_owner ON loka_oauth_states(owner,provider);
