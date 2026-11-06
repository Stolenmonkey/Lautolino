# Silbenflug-Server (Phase 2)

Hono-API für Cloudflare Workers + D1. Läuft lokal mit SQLite-Datei (`node:sqlite`), später mit PostgreSQL (nur `src/db.ts` tauschen).

## Lokal starten
```
npm install
npm run dev -w @silbenflug/server          # http://localhost:8787, Datei silbenflug-dev.sqlite
npm test                                   # alle Tests
```
Ersten Admin lokal anlegen: SQL erzeugen (`npm run admin-sql -w @silbenflug/server` mit ADMIN_EMAIL und ADMIN_PASSWORD) und in die SQLite-Datei einspielen.

## Auf Cloudflare (später, wenn der Account steht)
1. `wrangler.toml`: `database_id` eintragen.
2. `npx wrangler d1 migrations apply silbenflug-db --remote`
3. `wrangler.toml`: `ALLOWED_ORIGINS` auf die Adresse(n) der Oberfläche setzen (mehrere mit Komma). Ohne Eintrag startet der Worker nicht.
3b. `npx wrangler secret put PEPPER` (mindestens 32 zufällige Zeichen, nie ändern, sonst gelten alle Schülercodes nicht mehr)
4. Ersten Admin: SQL aus `admin-sql` mit `npx wrangler d1 execute silbenflug-db --remote --command "<SQL>"`
5. `npx wrangler deploy`

## Endpunkte (Auszug)
- `POST /auth/login`, `/auth/logout`, `GET /auth/me`, `POST /auth/change-password`
- `POST /student/login` (Merkschlüssel), `GET /student/me`
- `GET /config` (aktive Konfiguration, Kinder ohne Sicherheitswerte)
- Admin: `/admin/schools`, `/admin/schools/:id/license`, `/admin/staff`, `/admin/config`, `/admin/config/versions`, `/admin/audit`
- Schule: `/schools/:sid/years|classes|staff`, `/classes/:cid/students`, `/students/:id/code/regenerate|move`
- Lernplan: `/classes/:cid/plan|settings|releases`, `/students/:id/exclusions|plan`, Kind: `/student/plan`
- Messwerte (Kind): `POST /student/rounds` (idempotent über `clientRoundId`), `GET /student/awards`, `POST /student/awards/ack`, `GET /student/auto-state`
- Auswertung (Lehrkraft): `GET /students/:id/progress`, `GET /students/:id/rounds`

## Bewertung (Phase 4)
Je Silbe zählen die letzten Zeiten laut Konfiguration (mastery.window, drop_longest, min_measurements; Streichung nur bis syl_time.min_keep). Ab min_measurements Messungen gilt die Silbe als sicher beherrscht, wenn der Durchschnitt die Zeitvorgabe ihrer Länge erfüllt. Der Anteil sicher beherrschter Silben des festen Silbenumfangs ergibt Bronze, Silber, Gold. Auszeichnungen werden nur eingefügt, nie geändert. Die erste Freigabe einer Klasse ist eine Startgruppe aus mindestens 2 Buchstaben.

## Sicherheitsregeln (alle getestet)
Rechte serverseitig je Schule/Klasse/Kind (fremde Daten = 404), Passwörter PBKDF2, Schülercodes nur als Hash und HMAC-Suchwert, Fehlversuch-Sperren (E-Mail: Konto-Sperre, Code: pro Netz und Stunde), Lizenz sperrt nur Schreiben, Konfiguration nur im Admin-Bereich und nur als neue Version.

## Elternzugang (Migration 0003)
`POST /students/:id/parent-codes`, `GET /students/:id/parent-devices`, `POST /students/:id/parent-devices/:did/revoke` (Schule), `POST /parent/activate`, `GET /parent/me`, `/parent/letters`, `/parent/rounds` (Elterngerät, nur lesen). Konfiguration: `security.parent_code_days` (30). Bei einer schon laufenden Datenbank zuerst Migration 0003 einspielen; ältere gespeicherte Konfigurationen ohne `parent_code_days` fallen auf 30 zurück.
