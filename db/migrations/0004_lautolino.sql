-- Lautolino 0004: Einladungs-/Zurücksetz-Links, Elterncode statt Geräte-Kopplung. Rückwärtskompatibel: keine vorhandene Tabelle wird verändert oder gelöscht.

-- Einmal-Links für Lehrkräfte und Schulleitung (Einladung zur ersten Passwortvergabe, Passwort vergessen). Gespeichert wird nur der Hash des Links.
CREATE TABLE staff_tokens (
  id TEXT PRIMARY KEY, staff_user_id TEXT NOT NULL REFERENCES staff_users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX staff_tokens_user ON staff_tokens(staff_user_id, purpose);

-- Zähler zum Begrenzen von Anfragen (Passwort vergessen, Link-Versuche). key_hash ist ein HMAC, nie die Adresse selbst.
CREATE TABLE rate_events (id TEXT PRIMARY KEY, scope TEXT NOT NULL, key_hash TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX rate_events_lookup ON rate_events(scope, key_hash, at);

-- Elterncode: je Kind ein gültiger Code (der alte wird beim Neuerzeugen widerrufen). Kein Klartext, nur Suchwert (HMAC) und langsamer Hash.
CREATE TABLE parent_codes (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), code_hash TEXT NOT NULL, code_lookup TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE UNIQUE INDEX one_valid_parent_code_per_student ON parent_codes(student_id) WHERE revoked_at IS NULL;

-- Anmeldungen der Eltern (ersetzen die Geräte-Kopplung).
CREATE TABLE parent_sessions (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX parent_sessions_student ON parent_sessions(student_id);

-- Übergang: bereits gekoppelte, nicht widerrufene Elterngeräte behalten bis 14.02.2027 Zugriff, danach melden sich die Eltern mit dem Elterncode an.
-- Die alten Tabellen parent_devices und parent_activation_codes bleiben unverändert erhalten (werden nicht mehr benutzt).
INSERT INTO parent_sessions(id, student_id, token_hash, expires_at, created_at)
  SELECT id, student_id, device_token_hash, '2027-02-14T00:00:00.000Z', linked_at FROM parent_devices WHERE revoked_at IS NULL;
