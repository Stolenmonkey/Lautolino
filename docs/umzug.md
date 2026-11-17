# Umzug auf einen deutschen Server (PostgreSQL)

Stand: Phase 7, Teil 1. Der Server greift nur über `apps/server/src/db.ts` auf die Datenbank zu (vom Test `tests/phase7.test.ts` überwacht). Für den Umzug sind drei Dinge zu tun.

## 1. Neue Datenzugriffsschicht
In `db.ts` eine dritte Variante neben `d1Db` und `nodeSqliteDb` ergänzen (z. B. mit dem Paket `pg`). Sie muss dieselbe Schnittstelle liefern (`first`, `all`, `run`, `batch`).
- Platzhalter: SQLite nutzt `?`, PostgreSQL `$1, $2, …`. Die Schicht wandelt das beim Ausführen um.
- `batch` muss alles oder nichts sein: eine Transaktion.
- Zahlen: `REAL` und `INTEGER` bleiben; `COUNT(*)` liefert in PostgreSQL Text (bigint) und muss in eine Zahl gewandelt werden.

## 2. Schema (db/migrations)
Diese SQLite-Eigenheiten müssen für PostgreSQL umgeschrieben werden (alle anderen Anweisungen sind Standard-SQL):
| Stelle | SQLite | PostgreSQL |
|---|---|---|
| `0001_init.sql`, Tabelle `config_versions` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| `0001_init.sql`, Sperren gegen Ändern (`scope_immutable_*`, `awards_immutable_update`) | `CREATE TRIGGER … RAISE(ABORT, …)` | Funktion mit `RAISE EXCEPTION` plus `CREATE TRIGGER … EXECUTE FUNCTION` |
| `routes/school.ts` | `GROUP_CONCAT(x)` | `string_agg(x, ',')` |

Teilindizes (`WHERE revoked_at IS NULL`), `ON CONFLICT … DO UPDATE` und `INSERT … SELECT … WHERE NOT EXISTS` laufen in PostgreSQL unverändert. Zeiten liegen als ISO-Text vor und können so bleiben.
Taucht neue SQLite-Eigenheit im Code auf, schlägt der Wächtertest an; dann hier und in der Liste `KNOWN` im Test bewusst ergänzen.

## 3. Betrieb
- Der Worker (`worker.ts`) ist Cloudflare-spezifisch. Auf einem eigenen Server läuft dieselbe App (`createApp`) mit `@hono/node-server`, siehe `apps/server/scripts/dev-local.ts` als Vorlage.
- Das Geheimnis `PEPPER` muss beim Umzug **unverändert** mitgenommen werden, sonst gelten alle Schülercodes und Elterncodes nicht mehr.
- Daten übertragen: Tabellen in der Reihenfolge der Fremdschlüssel kopieren (schools, school_years, classes, staff_users, students, …, rounds, awards). Auszeichnungen und `letter_syllable_scope` dürfen dabei nicht verändert werden.
- Danach: Anzahl je Tabelle vergleichen und einen Testlauf der Kinder-App gegen den neuen Server machen.

## Ergänzung Phase 8
Neue Tabellen (Migration 0004): `staff_tokens`, `rate_events`, `parent_codes`, `parent_sessions`. `PEPPER` wird auch für Elterncodes und Zähler verwendet und muss unverändert bleiben. Für den E-Mail-Versand werden `RESEND_API_KEY`, `MAIL_FROM` und `APP_URL` am neuen Ort ebenfalls gebraucht.
