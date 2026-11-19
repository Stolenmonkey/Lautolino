-- Klassenübersicht: Band (Prozentpunkte um den Klassenmedian) für die Einstufung über-/durchschnittlich/unterdurchschnittlich, je Klasse einstellbar.
ALTER TABLE classes ADD COLUMN avg_band INTEGER NOT NULL DEFAULT 25;
