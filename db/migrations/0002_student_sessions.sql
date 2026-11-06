-- Silbenflug 0002: Sitzungen für Kinder (Anmeldung per Schülercode). Eltern-Geräte folgen in Phase 5.
CREATE TABLE student_sessions (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
