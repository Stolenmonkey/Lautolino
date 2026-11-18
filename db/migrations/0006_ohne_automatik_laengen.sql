-- Längen und Längen-Automatik entfallen (Testdaten, keine Datenübernahme nötig).
DROP TABLE IF EXISTS student_auto_state;
ALTER TABLE rounds DROP COLUMN lengths;
