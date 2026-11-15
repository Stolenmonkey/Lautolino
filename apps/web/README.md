# Silbenflug-Verwaltung (Phase 3, Auswertung und Silben-Zug ab Phase 6)

Schlichte Oberfläche für Administration, Schulleitung und Lehrkräfte. Reines HTML und JavaScript ohne Build-Schritt.

## Lokal ausprobieren
1. Server starten: `npm run dev -w @silbenflug/server` (http://localhost:8787)
2. Oberfläche ausliefern: `npx serve apps/web` (oder `python3 -m http.server -d apps/web 8080`) und im Browser öffnen
3. Adresse des Servers steht in `config.js`

## Bereiche
- Administration: Schulen und Lizenzen, globale Konfiguration (neue Version speichern), Protokoll
- Schulleitung: Klassen und Schuljahre, Lehrerzugänge, Schüler, Lernplan
- Lehrkraft: Schüler (Merkschlüssel einmalig sichtbar, druckbar), Lernplan (Buchstabenfreigabe, Silbenlängen, Ausnahmen)

## Auf Cloudflare Pages
Ordner `apps/web` veröffentlichen, in `config.js` die Adresse des Workers eintragen und dieselbe Adresse der Oberfläche beim Worker unter `ALLOWED_ORIGINS` angeben.

## Auswertung und Silben-Zug (Phase 6)
- Reiter „Auswertung“ (Schulleitung und Lehrkraft): Kind wählen, dann Buchstabenstand (Stufe, sicher beherrscht), Zeitverlauf der Runden mit Markierung „neu: X“ beim ersten Üben eines neuen Buchstabens, Zielzeit-Linie, Punkte für neue Auszeichnungen, Rundenliste.
- „Silben-Zug drucken (PDF)“ für ein Kind, „Silben-Züge für alle Kinder (PDF)“ für die Klasse: DIN A4 quer, 20 Silben, ein Zug mit 4 Zeilen zu je 5 Waggons. Die Auswahl macht der Server (`GET /students/:id/syllable-train`, optional `?seed=` für Wiederholbarkeit), das PDF entsteht im Browser.
- Das PDF-Modul braucht einen kleinen Build: `npm run build:web` erzeugt `js/zug.bundle.js` (mit den Buchstabenformen aus core). Die Datei liegt fertig im Ordner; `npm test` baut sie vorher neu.
- Auswahl der Silben: wie in der Übung (Buchstaben des Kindes, Schwierigkeit aus Automatik-Stand und Silbenzeiten). Noch nicht sicher beherrschte Silben (auch noch nicht bewertete) kommen doppelt so oft vor wie sicher beherrschte; der Faktor steht in der Konfiguration als `train.unmastered_weight` (2, erlaubt 1 bis 10; 1 = keine Bevorzugung).
