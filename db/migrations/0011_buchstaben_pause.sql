-- Buchstaben pausieren / fortsetzen und (vor der ersten gespielten Runde) wieder löschen.
-- paused_at: gesetzt = Buchstabe pausiert (nicht in Runden, Stufen, Quote); Zeiten, Auszeichnungen und fester Silbenumfang bleiben.
-- start_group: 1 = Teil der Startgruppe (teilt sich mit den anderen Startbuchstaben den Umfang der Gruppe).
ALTER TABLE class_letter_releases ADD COLUMN paused_at TEXT;
ALTER TABLE class_letter_releases ADD COLUMN start_group INTEGER NOT NULL DEFAULT 0;
-- Bestand: Die Startgruppe wurde in einem Schritt freigegeben (gleicher Zeitpunkt wie die erste Freigabe der Klasse).
UPDATE class_letter_releases SET start_group=1 WHERE released_at=(SELECT MIN(r2.released_at) FROM class_letter_releases r2 WHERE r2.class_id=class_letter_releases.class_id);

-- Der Silbenumfang darf nur noch gelöscht werden, solange seit der Freigabe des Buchstabens keine Runde in der Klasse gespielt wurde (Tippfehler zurücknehmen).
-- Ändern bleibt immer verboten.
DROP TRIGGER scope_immutable_delete;
CREATE TRIGGER scope_delete_guard BEFORE DELETE ON letter_syllable_scope
WHEN EXISTS (
  SELECT 1 FROM rounds r JOIN student_class_history h ON h.student_id=r.student_id AND h.to_date IS NULL
  WHERE h.class_id=OLD.class_id AND r.played_at >= COALESCE((SELECT released_at FROM class_letter_releases WHERE class_id=OLD.class_id AND letter=OLD.letter), '')
)
BEGIN SELECT RAISE(ABORT, 'letter_syllable_scope ist nach gespielten Runden unveränderlich'); END;
