CREATE TABLE IF NOT EXISTS qb_accounts(owner TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS qb_entries(id TEXT PRIMARY KEY,owner TEXT NOT NULL,amount_minor INTEGER NOT NULL,kind TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
INSERT OR IGNORE INTO qb_accounts SELECT subject,'qb_'||lower(hex(randomblob(16))),created_at FROM accounts;
CREATE INDEX IF NOT EXISTS qb_entries_owner ON qb_entries(owner,created_at);
