-- Gesperrte Silben je Klasse: Lehrkräfte können einzelne Silben für alle Kinder der Klasse abschalten.
-- Gesperrte Silben bleiben im festen Silbenumfang (letter_syllable_scope bleibt unverändert), zählen aber nicht mehr als freigegeben.
CREATE TABLE class_blocked_syllables (
  class_id TEXT NOT NULL REFERENCES classes(id), syllable TEXT NOT NULL, blocked_at TEXT NOT NULL, blocked_by TEXT,
  PRIMARY KEY (class_id, syllable)
);
