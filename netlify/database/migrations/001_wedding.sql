CREATE TABLE IF NOT EXISTS wedding_settings (id INTEGER PRIMARY KEY CHECK (id=1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rsvp (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', attendance_status TEXT NOT NULL CHECK (attendance_status IN ('attending','declined')), guest_count INTEGER NOT NULL CHECK (guest_count BETWEEN 0 AND 10), message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, ip_hash TEXT NOT NULL, CHECK ((attendance_status='declined' AND guest_count=0) OR (attendance_status='attending' AND guest_count>=1)));
CREATE TABLE IF NOT EXISTS guestbook_messages (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','approved','hidden')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS rsvp_created_idx ON rsvp(created_at);
CREATE INDEX IF NOT EXISTS messages_status_idx ON guestbook_messages(status,created_at);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS limits_expiry_idx ON rate_limits(expires_at);
