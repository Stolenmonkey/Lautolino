-- Silbenflug 0001: Grundschema (SQLite/D1, später PostgreSQL). Zeiten als ISO-Text, IDs als zufällige Texte.
CREATE TABLE schools (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, billing_data TEXT,
  license_status TEXT NOT NULL DEFAULT 'angelegt' CHECK (license_status IN ('angelegt','zahlung_ausstehend','aktiv','verlaengerung_faellig','abgelaufen')),
  license_start TEXT, license_end TEXT, fee REAL, payment_confirmed_at TEXT,
  active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (active = 0 OR payment_confirmed_at IS NOT NULL)  -- aktiv erst nach bestätigtem Zahlungseingang
);
CREATE TABLE license_events (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
  event TEXT NOT NULL CHECK (event IN ('angelegt','zahlung_ausstehend','zahlung_bestaetigt','verlaengerung_faellig','verlaengert','abgelaufen','deaktiviert')),
  by_user TEXT, at TEXT NOT NULL, note TEXT
);
CREATE TABLE school_years (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), label TEXT NOT NULL, start_date TEXT, end_date TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE classes (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), school_year_id TEXT NOT NULL REFERENCES school_years(id),
  name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE staff_users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','schulleitung','lehrer')),
  school_id TEXT REFERENCES schools(id), active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK ((role = 'admin' AND school_id IS NULL) OR (role <> 'admin' AND school_id IS NOT NULL))
);
CREATE TABLE teacher_classes (
  staff_user_id TEXT NOT NULL REFERENCES staff_users(id), class_id TEXT NOT NULL REFERENCES classes(id), PRIMARY KEY (staff_user_id, class_id)
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, staff_user_id TEXT NOT NULL REFERENCES staff_users(id), token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE students (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), display_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE student_class_history (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), class_id TEXT NOT NULL REFERENCES classes(id), from_date TEXT NOT NULL, to_date TEXT
);
CREATE TABLE student_codes (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), code_hash TEXT NOT NULL, code_lookup TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE UNIQUE INDEX one_valid_code_per_student ON student_codes(student_id) WHERE revoked_at IS NULL;
CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK (scope IN ('code','email')), key_hash TEXT NOT NULL, ip_hash TEXT, at TEXT NOT NULL, success INTEGER NOT NULL
);
CREATE INDEX login_attempts_lookup ON login_attempts(scope, key_hash, at);
CREATE TABLE parent_activation_codes (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), code_hash TEXT NOT NULL, created_by TEXT, used_at TEXT, expires_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE parent_devices (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), device_token_hash TEXT NOT NULL UNIQUE, linked_at TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT
);
CREATE TABLE class_letter_releases (
  class_id TEXT NOT NULL REFERENCES classes(id), letter TEXT NOT NULL, release_order INTEGER NOT NULL, released_at TEXT NOT NULL, released_by TEXT,
  PRIMARY KEY (class_id, letter)
);
CREATE TABLE student_letter_exclusions (
  student_id TEXT NOT NULL REFERENCES students(id), letter TEXT NOT NULL, PRIMARY KEY (student_id, letter)
);
CREATE TABLE letter_syllable_scope (   -- wird bei der Freigabe einmal geschrieben und nie geändert
  class_id TEXT NOT NULL REFERENCES classes(id), letter TEXT NOT NULL, syllable TEXT NOT NULL, syl_length INTEGER NOT NULL,
  fixed_at TEXT NOT NULL, config_version INTEGER NOT NULL, PRIMARY KEY (class_id, letter, syllable)
);
CREATE TRIGGER scope_immutable_update BEFORE UPDATE ON letter_syllable_scope BEGIN SELECT RAISE(ABORT, 'letter_syllable_scope ist unveränderlich'); END;
CREATE TRIGGER scope_immutable_delete BEFORE DELETE ON letter_syllable_scope BEGIN SELECT RAISE(ABORT, 'letter_syllable_scope ist unveränderlich'); END;
CREATE TABLE class_learning_settings (
  class_id TEXT PRIMARY KEY REFERENCES classes(id), allowed_lengths TEXT NOT NULL DEFAULT '2,3', difficulty_mode TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE config_versions (
  version INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, valid_from TEXT NOT NULL, changed_by TEXT, change_note TEXT, is_active INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_active_config ON config_versions(is_active) WHERE is_active = 1;
CREATE TABLE rounds (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), client_round_id TEXT NOT NULL, played_at TEXT NOT NULL, seconds REAL NOT NULL,
  letters TEXT NOT NULL, lengths TEXT NOT NULL, config_version INTEGER NOT NULL REFERENCES config_versions(version), task_count INTEGER NOT NULL,
  UNIQUE (student_id, client_round_id)  -- verhindert Doppelübertragung
);
CREATE TABLE syllable_times (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), syllable TEXT NOT NULL, seq INTEGER NOT NULL, seconds REAL NOT NULL,
  config_version INTEGER NOT NULL, UNIQUE (student_id, syllable, seq)
);
CREATE TABLE student_auto_state (
  student_id TEXT NOT NULL REFERENCES students(id), combo_key TEXT NOT NULL, len_balance REAL, syl_difficulty REAL, updated_at TEXT NOT NULL,
  PRIMARY KEY (student_id, combo_key)
);
CREATE TABLE student_blocked_syllables (
  student_id TEXT NOT NULL REFERENCES students(id), syllable TEXT NOT NULL, PRIMARY KEY (student_id, syllable)
);
CREATE TABLE letter_mastery_cache (   -- nur Zwischenspeicher, jederzeit neu berechenbar
  student_id TEXT NOT NULL REFERENCES students(id), letter TEXT NOT NULL, mastered_count INTEGER, total_count INTEGER, percent REAL, computed_at TEXT NOT NULL,
  PRIMARY KEY (student_id, letter)
);
CREATE TABLE awards (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), letter TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('bronze','silber','gold')), achieved_at TEXT NOT NULL, config_version INTEGER NOT NULL, round_id TEXT REFERENCES rounds(id),
  UNIQUE (student_id, letter, level)
);
CREATE TRIGGER awards_immutable_update BEFORE UPDATE ON awards BEGIN SELECT RAISE(ABORT, 'awards sind unveränderlich'); END;
CREATE TABLE award_popups (award_id TEXT PRIMARY KEY REFERENCES awards(id), shown_at TEXT);
CREATE TABLE letter_markers (
  student_id TEXT NOT NULL REFERENCES students(id), letter TEXT NOT NULL, round_id TEXT NOT NULL REFERENCES rounds(id), PRIMARY KEY (student_id, letter)
);
CREATE TABLE audit_log (id TEXT PRIMARY KEY, actor TEXT, action TEXT NOT NULL, target TEXT, at TEXT NOT NULL, details TEXT);
CREATE TABLE retention_rules (
  data_type TEXT NOT NULL, keep_days INTEGER, trigger TEXT NOT NULL CHECK (trigger IN ('nach_nutzungsende','nach_schulaustritt')), PRIMARY KEY (data_type, trigger)
);
