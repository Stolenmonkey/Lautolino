# Silbenflug (Phase 1)

Neuaufbau der Silbenzauber-Lernlogik als modulares Projekt. Entwurf: siehe Dokument „Silbenflug – Entwurf“.

## Struktur
- `packages/shared` Konfiguration (Standardwerte, Prüfung), gemeinsame Typen
- `packages/core` Silbenregeln, Aufgabenverteilung, Glyphen (ohne Datenbank/Oberfläche)
- `packages/engine` Silbenzeit, Automatik, Bewertung, Auszeichnungen, fester Silbenumfang
- `db/migrations` Datenbankschema (SQLite/D1, später PostgreSQL)
- `tests` Parität mit der alten App, Engine- und Schema-Tests
- `apps/server` Server (Phase 2), `apps/web` Verwaltungsoberfläche (Phase 3); Kinder-App, Eltern und Statistik folgen

## Befehle
`npm install`, `npm test`, `npm run typecheck`

## Hinweise
- `tests/fixtures/silbenzauber-logic.js` ist die unveränderte Logik der alten App. Die Paritätstests beweisen, dass die neue Logik mit alten Zahlen (12 Zeiten, 2 streichen, mind. 3, max. 30 s) dieselben Ergebnisse liefert.
- Die Startkonfiguration (`DEFAULT_CONFIG`) nutzt deine Werte aus dem Entwurf (u. a. min_keep 10, max_seconds 60, Zeitvorgabe je Silbenlänge 2/3/4).

## Kinder-App (Phase 5)
Siehe `apps/kids/README.md`. Bauen mit `npm run build:kids`. Tests: `tests/kids.test.ts`.

## Phase 6 (Teil 1)
Lehrer-Auswertung und Silben-Zug siehe `apps/web/README.md`. `npm run build` baut Kinder-App und PDF-Modul; `npm test` ruft es vorher auf.

## Phase 7 (Teil 1)
Schutz-Kopfzeilen, Größenbegrenzung und Umzug-Wächter: `tests/phase7.test.ts`. Anleitung zum Umzug: `docs/umzug.md`. Löschfristen sind bewusst nicht vorgesehen (`retention` bleibt leer). Der Worker startet nur mit gesetztem `ALLOWED_ORIGINS`.

## Elternzugang (Phase 6, Teil 2)
Siehe `apps/eltern/README.md`.
