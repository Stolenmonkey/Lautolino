# Lautolino – Weiterentwicklung (Phase 8)

Grundlage: Entwicklungsauftrag Lautolino und PDF-Lernplan (L E O A M P). Die vorhandene Anwendung wurde erweitert, nichts wurde neu gebaut oder entfernt (außer der Eltern-Geräte-Kopplung, wie verlangt). Kern- und Bewertungslogik (`isMastered`, Zeitmessung, Automatik, Bronze/Silber/Gold, Freigabe) sind unverändert; es kamen nur neue Dateien und Zusätze dazu.

## 1. Was neu ist

### Kinder-App
- **Silbenvorschau**: Hauptsilbe etwas links, rechts daneben die nächsten zwei Silben, klein und hellgrau. Sie stammen aus der tatsächlichen Aufgabenfolge (am Rundenende weniger). Auf kleinen Telefonen wird die Schrift automatisch verkleinert, damit alles passt.
- **Silbenbögen** unter jeder Sprechsilbe (WAR ein Bogen, MAMA zwei, PAL-ME zwei). Die Trennung kommt aus der Silbenstruktur (`packages/core/src/syllabify.ts`), nicht aus einer Liste.
- **Leistungsstatus**: je freigegebenem Buchstaben Medaille der höchsten Stufe, dazu drei Punkte (Bronze, Silber, Gold; erreichte farbig, offene grau) und eine Legende. Es werden nur die tatsächlich erreichten Stufen gezeigt; Schwellen unverändert.

### Lernstufen (Kern und Server)
- `packages/core/src/stages.ts`: die sieben Stufen mit Unterkategorien aus dem PDF (1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 7.2). Jede Silbe wird nach ihrem Aufbau (V, KV, VK, KVK, V-KV, KV-KV, KVK-KV, …) genau einer Stufe zugeordnet. Beispiel: MAMA = KV-KV = 4.2, PLAM = Häufung am Anfang = 7.1. Es gibt keinen festen Katalog; neue Buchstaben ergeben sofort neue Zuordnungen. `ch`, `ck`, `qu` zählen als ein Konsonant.
- Stufe 2 (Anlautwechsel) enthält dieselben KV-Silben wie 1.2, sofern es zu der Silbe eine mit gleichem Vokal und anderem Anlaut gibt (PDF: MA PA LA / ME PE LE / MO PO LO).
- `packages/engine/src/stages.ts`: Fortschritt **je Buchstabe**, berechnet aus den vorhandenen Silbenzeiten (nichts Neues gespeichert). Schwerpunkt = niedrigste noch nicht sichere Stufe und die nächste (anfangs 1 und 2; ist Stufe 1 sicher, 3 und 4; usw.). Höhere Stufen sind gesperrt. Ein neuer Buchstabe beginnt bei Stufe 1, ohne dass ältere Buchstaben zurückfallen.
- Frühere Stufen kommen mit `stages.review_percent` Prozent der Aufgaben wieder (Vorschlag 15 %, siehe offene Punkte). Rundenaufbau: `packages/core/src/stagedRound.ts`; die bisherige Verteilung (`makeRound`, Automatik) wird dafür unverändert benutzt. Dasselbe Fenster gilt für den Silben-Zug (PDF).
- Schalter `stages.enabled` (1/0) in der Konfiguration: 0 = Auswahl wie bisher.

### Lehrkräfte und Schulleitung
- **Reiter Lernplan**: "Mögliche Silben und Lernstufen" – alle möglichen Silben der freigegebenen Buchstaben je Stufe/Unterkategorie, mit Buchstaben der Silbe, neuestem Buchstaben und Freigabe fürs Training. Ungültige und doppelte Silben kommen nicht vor.
- **Auswertung je Kind**: Lernstufen (abgeschlossen / wird geübt / gesperrt / keine Silben), Stand je Buchstabe in allen Stufen, Silbenstatistik: Ø Lesezeit, Abfragen, Messungen innerhalb der Zeitvorgabe, Status, Stufe. Filter: sicher / nicht sicher / nicht bewertet / Schwierigkeiten. Alle Silben einer Stufe (auch ungeübte) auf Knopfdruck.
- **Klassenübersicht**: je Buchstabe Prozent der Kinder mit "erreicht", Bronze, Silber, Gold.
- Passwortfelder mit Augensymbol; "Passwort vergessen"; Einladung per E-Mail.
- Elterncode: pro Kind, neu erzeugbar, gesammelt für vorhandene Kinder.

### Codes
- Schülercode: `SonneWald7` (zwei Wörter ohne Umlaute, kein Bindestrich, Zahl 1–99). Alte Codes wie `Tiger-Sonne-47` gelten weiter; bei der Anmeldung ist die Schreibweise egal.
- Elterncode: `K7QM-4TXD-9HRP`, je Kind genau einer, ohne Ablaufdatum. Ein neuer Code beendet den alten und alle Anmeldungen der Eltern. Keine Geräte-Kopplung mehr.

## 2. Datenbank (`db/migrations/0004_lautolino.sql`, rückwärtskompatibel)
Keine bestehende Tabelle wird verändert oder gelöscht.
| Tabelle | Zweck |
|---|---|
| `staff_tokens` | Einmal-Links (Einladung, Zurücksetzen); nur der Hash, gültig zeitlich begrenzt |
| `rate_events` | Zähler gegen Missbrauch (HMAC-Werte, keine Adressen) |
| `parent_codes` | ein gültiger Elterncode je Kind (Hash + Suchwert) |
| `parent_sessions` | Anmeldungen der Eltern |

Übergang: Alle bisher gekoppelten, nicht widerrufenen Elterngeräte werden in `parent_sessions` übernommen und behalten bis 14.02.2027 Zugriff. `parent_devices` und `parent_activation_codes` bleiben unverändert (ungenutzt). Vorhandene Kinder haben noch keinen Elterncode: im Reiter "Schüler" auf "Elterncodes für Kinder ohne Code erzeugen".
Konfiguration: neue Werte `stages.enabled`, `stages.review_percent`, `security.invite_hours` (72), `security.reset_minutes` (60), `security.reset_max_per_email_hour` (3), `security.reset_max_per_ip_hour` (10), `security.parent_session_days` (90). Ältere gespeicherte Konfigurationen werden beim Lesen mit diesen Standardwerten ergänzt.

## 3. Schnittstellen (neu oder geändert)
- `GET /student/plan` – zusätzlich `training: { focus, review }`
- `GET /students/:id/evaluation`, `GET /students/:id/stages/:n` – Lernstufen und Silbenstatistik (Lehrkraft der Klasse, Schulleitung, Admin)
- `GET /classes/:cid/overview` – Klassenübersicht je Buchstabe
- `GET /classes/:cid/syllables[?stage=n]` – mögliche Silben mit Stufe
- `POST /auth/forgot-password {email}` – immer gleiche Antwort; nur Lehrkräfte und Schulleitung
- `POST /auth/set-password {token, newPassword}` – Einladung und Zurücksetzen
- `POST /admin/staff`, `POST /schools/:sid/staff` – Antwort jetzt `emailSent`; `initialPassword` nur, wenn kein E-Mail-Versand möglich war
- `POST /students/:id/parent-code/regenerate`, `GET /students/:id/parent-access`, `POST /classes/:cid/parent-codes/missing`, `POST /parent/login` (`/parent/activate` bleibt als alter Name)
- `POST /classes/:cid/students` – Antwort enthält zusätzlich `parentCode`
- Entfallen: `/students/:id/parent-codes`, `/students/:id/parent-devices…`

## 4. Einrichtung des E-Mail-Versands
Der Server sendet über den Anbieter **Resend** (https://resend.com, HTTPS-Schnittstelle, passt zu Cloudflare Workers). Ohne diese Einstellungen funktioniert alles wie bisher: das Startpasswort wird einmal angezeigt, "Passwort vergessen" sendet dann aber keine E-Mail.
1. Bei Resend ein Konto anlegen, eine Absenderadresse bzw. Domain bestätigen, einen API-Schlüssel erzeugen.
2. In Cloudflare beim Worker: Geheimnis `RESEND_API_KEY` (Wert = Schlüssel; nie in den Chat oder ins Repository schreiben); Variablen `MAIL_FROM` (z. B. `Lautolino <noreply@deine-domain.de>`) und `APP_URL` (`https://stolenmonkey.github.io/Lautolino/web/`).
3. Migration 0004 auf die Datenbank anwenden (siehe `docs/umzug.md` bzw. die bisherige Vorgehensweise; per Cloudflare-Oberfläche: D1, Datenbank, Console, den Inhalt von `0004_lautolino.sql` einfügen und ausführen).
Hinweis: `wrangler.toml` im Repository enthält nur Platzhalter (`APP_URL`, `MAIL_FROM`); die eigene Datei nicht überschreiben, nur die zwei Zeilen ergänzen.

## 5. Sicherheit
Einmal-Tokens (32 Byte zufällig, nur als Hash gespeichert), Einladung 72 h, Zurücksetzen 60 min, nur der neueste Link gilt, Link im Adress-Fragment (`#…`, wird nicht an Webserver gesendet), danach Beenden aller Anmeldungen der Person. Keine Offenlegung, ob eine Adresse existiert (gleiche Antwort, auch bei Versandfehler). Begrenzung: 3 E-Mails je Adresse und Stunde (still), 10 Anfragen je Netz und Stunde (429), 30 falsche Link-Versuche je Netz und Stunde. Die Administration ist vom Zurücksetzen per E-Mail ausgenommen. Kein Klartext-Passwort wird gespeichert oder per E-Mail versendet.

## 6. Tests (alle bestanden: `npm test`)
Neu: `tests/lautolino-logic.test.ts` (15) und `tests/lautolino-server.test.ts` (32); `tests/eltern.test.ts` auf den Elterncode umgestellt (15). Angepasst, weil sich das Verhalten bewusst geändert hat: Codeformat in `server.test.ts`, Anzahl Codes in `web.test.ts`, zwei Silben-Zug-Tests schalten die Lernstufen ab (sie arbeiten mit nur zwei Buchstaben).
Abdeckung gegen die Liste im Auftrag: 1 normales Training (kids.test.ts, Training folgt Stufen), 2 Vorschau = nächste zwei Silben (alle 20 Aufgaben), 3 Bögen = Sprechsilben (alle Silben der Gruppe LEOAMP), 4 Bronze/Silber/Gold, 5 neue Buchstaben, 6 Zuordnung (PDF-Beispiele), 7 Stufenfreigabe, 8 sicher beherrscht (10 Messungen, Vorgabe), 9 Ø Lesezeit = gespeicherte Messwerte, 10 Klassenprozente, 11 Zurücksetzen, 12 E-Mail (mit Test-Versender und Resend-Anfrage), 13 Codeformat, 14 Elterncode ohne Kopplung, 15 bestehende Anmeldung/Verwaltung (Gesamtsuite, Übergang alter Elterngeräte und alter Schülercodes).
Nicht getestet: echter Versand über Resend (kein Konto/Schlüssel hier) und die Darstellung auf echten Geräten (kein Browser in der Testumgebung; die Oberflächentests laufen in jsdom). Bitte Vorschau und Bögen einmal auf dem Handy ansehen.

## 7. Offene Punkte (bitte entscheiden)
1. **Silbenlängen**: Silbenzauber kennt nur Silben mit 2 bis 4 Buchstaben mit Zeitvorgaben für diese Längen. Der PDF-Lernplan hat auch einzelne Vokale (A E O) und 5–6 Buchstaben (PAL-ME, MA-LA-PA, PLAM-PE). Dafür wären Zeitvorgaben nötig (Bewertung darf ich nicht ohne Auftrag ändern). Folge: Stufe 1.1 nur mit Doppelvokalen (AU, EI), 5.1, 5.3 und Stufe 6 sind leer und werden automatisch übersprungen; die Zuordnung dieser Wörter ist vorbereitet (Tests mit PALME, AMALA usw.).
2. **Wiederholungsanteil** `stages.review_percent`: 15 % ist ein Vorschlag.
3. **Fenster bei zu wenigen Silben**: Hat der Schwerpunkt weniger als 3 Silben (z. B. nur Buchstaben O und L), kommen die nächsten Stufen dazu, weil sonst keine Runde möglich ist.
4. **Stufenstand** wird aus den Messwerten berechnet. Wird eine Silbe wieder zu langsam, ist sie nicht mehr "sicher" und wird wieder geübt; Auszeichnungen bleiben.
5. **Klassenübersicht**: "erreicht" = in einer Runde geübt; "sicher beherrscht" = Gold (95 %), weil es für Buchstaben keine andere Definition gibt.
6. **Elterncode**: Format (12 Zeichen) und "kein Ablauf" sind mein Vorschlag; Anmeldung der Eltern 90 Tage.
7. **E-Mail-Anbieter** Resend ist ein Vorschlag; Passwortwechsel im eingeloggten Zustand hat weiterhin keine Oberfläche.
8. Silben-Zug (PDF) benutzt dasselbe Stufenfenster.

## Silbenbasierte Auswahl (ersetzt das Buchstaben-Fenster, Stand: Modus 1 entfernt)
- Entfallen: `stagedTasks`, `trainingWindow`, `letterStages`, `stages.mode`, `stages.review_percent`, `train.unmastered_weight`, `training` in `GET /student/plan`, `apps/server/src/train.ts`. Die Kinder-App berechnet die Auswahl selbst aus den Silbenzeiten.
- Konfiguration `stages`: `enabled`, `gate_percent` (80), `mix_new_percent` / `mix_weak_percent` / `mix_review_percent` (45/30/25, Summe 100). Alle im Verwaltungsbereich unter „Konfiguration → Lernstufen“ einstellbar.
- Freischaltung je Silbe (`engine/syllablePlan.ts`): In jeder Vorstufe müssen mindestens `gate_percent` der Silben aus den Buchstaben dieser Silbe sicher sein (Stufe 2 = Anlautwechsel). Silben mit Messungen bleiben offen.
- Gruppen: neu, angefangen, schwach, sicher. Rundenaufbau `core/stagedRound.ts: groupedTasks`. Die Automatik-Werte bal (Längenverteilung) und sd (Silbenschwierigkeit) wirken nicht mehr auf die Auswahl. Berechnung in der Kinder-App aus den lokalen Silbenzeiten (`apps/kids/src/logic.ts`).
- Lehrer-Stufenansicht (`routes/evaluation.ts`, `web/js/views/stufen.js`, `auswertung.js`) und Silben-Zug (`routes/progress.ts`, `studentSylPlan`) folgen derselben Freischaltung: Stufenstatus nach freigeschalteten Silben, gesperrte Silben als „noch nicht freigeschaltet“, Hinweistext mit Gate und Mix. 

## Strukturbasierte Übungswörter, keine Silbenlängen mehr (Migration 0005)
- Die Längenauswahl je Klasse (2/3/4 Buchstaben, `PUT /classes/:cid/settings`, Tabelle `class_learning_settings`) entfällt.
- `packages/core/src/words.ts` erzeugt Übungswörter aus Sprechsilben (V, KV, VK, KVK, Häufungen) zu 1–3 Sprechsilben; damit sind alle 7 Stufen erreichbar (PAL-ME, MA-LA-MA).
  Keine Doppelungen (LL), keine Vokal-Vokal-Grenze; Wort muss genau in die gewählten Sprechsilben zerfallen. Je Unterkategorie und neuem Buchstaben höchstens 30 mehrsilbige Wörter (deterministisch gewählt), einsilbige vollständig.
- Der feste Silbenumfang bleibt unveränderlich: bestehende Klassen behalten ihre 2–4-Buchstaben-Umfänge, neue Freigaben nutzen die neue Erzeugung.
- `GET /student/plan` liefert `syllables` (Union der festen Umfänge) statt `lengths`; die Kinder-App nutzt diese Liste. Klassenübersicht/Silben-Ansicht zeigen dieselbe Union.
- Zeitvorgabe (`mastery.time_limit_seconds`) gilt für 2–4 Buchstaben unverändert, kürzere/längere Wörter nehmen die Vorgabe der nächstliegenden Länge (`timeLimitFor`).
- Rückfall ohne Lernstufen (`stages.enabled = 0`) oder bei zu wenigen offenen Silben: `secureTasks` (engine) wählt nur sicher beherrschte Silben der höchsten Stufe mit sicheren Silben (bei zu wenigen zusätzlich tiefere Stufen; ohne sichere Silben die niedrigsten Stufen des Umfangs). Keine Zufallssilben nach Länge mehr.
- Länge und Längen-Automatik sind aus der App entfernt (Migration 0006): `rounds.lengths`, Tabelle `student_auto_state`, `GET /student/auto-state`, `autoState`/`lengths` in `POST /student/rounds`, `comboTimes` in `sync-data`. Kinder-App merkt nur noch Silbenzeiten. Engine-Funktionen (`comboKey`, `autoAdjust`, …) bleiben wegen der Paritätstests, werden aber nicht mehr aufgerufen.
