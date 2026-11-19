-- Klassenübersicht: Mittelfeld-Anteil (Prozent der Kinder um den mittleren Rang) statt Prozentpunkte-Band um den Median. Ersetzt avg_band (bleibt ungenutzt).
ALTER TABLE classes ADD COLUMN mid_share INTEGER NOT NULL DEFAULT 50;
