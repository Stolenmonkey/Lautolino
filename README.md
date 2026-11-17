# Lautolino / Silbenflug

Lernapp Silbenlesen (Schulmodus von Silbenzauber). Monorepo (npm workspaces), TypeScript, Cloudflare Worker (Hono) + D1/SQLite, Frontends ohne Framework. Sprache im Code/UI: Deutsch.

## Befehle
`npm install` · `npm test` (vitest; `pretest` = build) · `npm run typecheck` · `npm run build` (= `build:kids` + `build:web`) · Server lokal: `npm run dev -w @silbenflug/server`

## Dateibaum
```
index.html                      Entwicklungs-Startseite
package.json tsconfig.json vitest.config.ts   (Alias @silbenflug/{shared,core,engine})
packages/
  shared/src/{index,config}.ts
  core/src/{index,rules,syllables,syllabify,round,stagedRound,stages,arcs,glyphs}.ts
  engine/src/{index,sylTime,automatik,mastery,scope,stages,params}.ts
apps/
  server/   wrangler.toml package.json README.md
    scripts/{dev-local,make-admin-sql}.ts
    src/{worker,app,context,db,middleware,permissions,crypto,codes,license,mail,migrate,staff,staffTokens,train,util}.ts
    src/routes/{admin,auth,school,plan,progress,evaluation,student,parent}.ts
  kids/     Kinder-PWA: index.html style.css config.js sw.js manifest.webmanifest icons build.mjs
    src/{main,ui,logic,api}.ts   dist/app.js (Build-Artefakt, eingecheckt)
  web/      Verwaltung Admin/Schulleitung/Lehrer: index.html style.css config.js build.mjs
    js/{main,api,dom,chart}.js  js/views/{login,passwort,admin,school,auswertung,uebersicht,silben,stufen,eltern}.js
    src/{zug,pdf}.ts   js/zug.bundle.js (Build-Artefakt)
  eltern/   Elternansicht: index.html style.css config.js app.js
db/migrations/  0001_init 0002_student_sessions 0003_parent_codes 0004_lautolino (.sql)
docs/           lautolino-aenderungen.md (Phase 8: Änderungen/Schnittstellen/Mail-Setup/offene Punkte)  umzug.md
tests/          *.test.ts + helpers.ts + fixtures/silbenzauber-logic.js (alte App, unverändert)
```

## Datei-Steckbriefe

### packages/shared
- `config.ts`: Typ `SilbenflugConfig`, `DEFAULT_CONFIG`, `validateConfig()`, `withDefaults()`. Blöcke: syl_time, auto, round, mastery, award, unlock, retention, security, train, stages.
- `index.ts`: re-export config; Typen `Rng`, `AwardLevel` (bronze|silber|gold).

### packages/core (rein, ohne DB/UI)
- `rules.ts`: `RULES` (Vokale, Diphthonge, Hiatus, noOnset/noCoda); `isValid(silbe)`.
- `syllables.ts`: `parseLetters`, `buildSyllables(letters,len)`, `countSyllables`.
- `syllabify.ts`: `splitSyllables(wort)`, `partPattern` (V/K), `clusterPlace`.
- `round.ts`: `makeRound`, `sylProbs`, `lenWeights`, `randomCase`, `RoundParams`, `SILBENZAUBER_ROUND_PARAMS`.
- `stagedRound.ts`: `stagedTasks(…)` Rundenaufbau nach Lernstufen (Fokus/Wiederholung); Typ `Training`.
- `stages.ts`: `STAGES` (7 Stufen, Unterkategorien 1.1–7.2), `classifySyllable`, `contrastSet`, `stagePlan`, `subName`.
- `arcs.ts`: `displayParts`, `renderWordWithArcs` (Silbenbögen, SVG).
- `glyphs.ts`: `GLYPHS` (Buchstabenpfade), `renderWord`.

### packages/engine
- `sylTime.ts`: `sylStat` (Ø nach Streichen längster), `recordSyl`; Typen `SylTimeParams`, `SylStat`.
- `automatik.ts`: `autoAdjust`, `avgLast`, `sdFromLen`, `comboKey`, `startVal`; Typen `AutoParams`, `AutoState`.
- `mastery.ts`: `isMastered`, `letterProgress`, `levelsReached`, `newAwards`, `highestLevel`; Typ `SylStatus`.
- `scope.ts`: `syllableScope(releasedBefore,newLetter,lens)` – Silbenumfang je Buchstabe.
- `stages.ts`: `letterStages`, `trainingWindow`, `stageMembers` – Stufenfortschritt je Buchstabe aus Silbenzeiten.
- `params.ts`: Config → `sylTimeParams`/`autoParams`/`roundParams`.

### apps/server
- `worker.ts`: Cloudflare-Einstieg (D1, Env: PEPPER, ALLOWED_ORIGINS, APP_URL, MAIL_FROM, Resend-Key).
- `app.ts`: `createApp(deps)`; Mounting der Routen, CORS/Schutz-Header, `GET /health`, `GET /config`.
- `context.ts`: `Deps`, `Principal` (staff|student|parent), `Env`.
- `db.ts`: `Db`-Interface; Adapter `d1Db`, `nodeSqliteDb`.
- `middleware.ts`: `authenticate` (Bearer-Session), `requireStaff(...rollen)`.
- `permissions.ts`: `isAdmin`, `canAccessSchool/Class/Student`, `isSchoolManager`.
- `crypto.ts`: PBKDF2 `hashPassword/verifyPassword`, `sha256Hex`, `hmacHex`, Token/Passwort/Code-Generatoren (`generateStudentCode`, `generateParentCode`, Normalisierung).
- `codes.ts`: `issueStudentCode`, `issueParentCode`.
- `license.ts`: Lizenzstatus-Automat (`effectiveStatus`, `isWritable`, `applyLicenseAction`).
- `mail.ts`: `Mailer`, `resendMailer`.
- `staff.ts`: `createStaff`. `staffTokens.ts`: Einladungs-/Reset-Tokens, `tokenLink`, Rate-Limit (`rateKey/rateCount/rateAdd`).
- `train.ts`: `pickWeighted` (Silben-Zug). `migrate.ts`: `migrateLocal` (lokale SQLite).
- `util.ts`: `fail`, `body`, `str`, `email`, `audit`, `activeConfig`, `parseConfig`, `assertSchoolWritable`, `newId`, `nowIso`.
- `routes/auth.ts`: Staff `/login /logout /forgot-password /set-password /me /change-password`.
- `routes/admin.ts`: Schulen, Lizenz(-Ereignisse), Staff anlegen, Config-Versionen (`/config`), `/audit`.
- `routes/school.ts`: Schuljahre, Klassen, Personal(+Klassenzuordnung), Schüler anlegen/ändern/verschieben, Schülercode neu.
- `routes/plan.ts`: Klassenplan, Silbenlängen (`/settings`), Buchstaben-Freigaben (`/releases`), Scope, Ausschlüsse je Schüler.
- `routes/progress.ts`: `POST /student/rounds`, Awards (+ack), auto-state, sync-data; `studentTraining`, `progressOf`; Staff: progress, rounds, `syllable-train`.
- `routes/evaluation.ts`: `/students/:id/evaluation`, `/students/:id/stages/:n`, `/classes/:cid/overview`, `/classes/:cid/syllables`; `possibleSyllables`.
- `routes/student.ts`: Kinder-`/login` (Code), `/me`, `/plan`.
- `routes/parent.ts`: Elterncode erzeugen/neu/sammelweise; `/parent/login`, `/parent/me|letters|rounds`.
- `scripts/`: `dev-local.ts` (lokaler Node-Server), `make-admin-sql.ts` (Admin-Seed-SQL). `wrangler.toml`: Worker `lautolino-api`, D1 `lautolino_db`, Vars.

### apps/kids
- `src/ui.ts`: `mountKids(root,deps)` – gesamte UI (Login, Übung, Medaillen, Silbenvorschau).
- `src/logic.ts`: `prepareRound`, `finishRound`, `canPractice`, `mergeAuto`, `adoptServer`; `LocalState`, `Plan`.
- `src/api.ts`: `createKidsApi`, Offline-Queue `flushQueue`, `newRoundId`, `ApiError`.
- `src/main.ts`: Bootstrap (`window.SILBENFLUG_API`). `sw.js`: Offline-Cache (`silbenzauber-kind-v1`). `build.mjs`: esbuild → `dist/app.js`.

### apps/web
- `js/main.js`: Routing/Login-State. `api.js`: `createApi`. `dom.js`: `h`, `table`, `notice`, `act`, `passwordField`, Formatierer. `chart.js`: `zeitverlaufSvg`.
- `views/admin.js`: Tabs Schulen/Konfiguration/Protokoll. `views/school.js`: Tabs Schüler/Auswertung/Lernplan/Klassen/Zugänge.
- `views/auswertung.js`: Kind-/Klassenauswertung, PDF-Export. `uebersicht.js`: Klassenübersicht. `silben.js` + `stufen.js`: Silben-/Stufentabellen, Filter. `eltern.js`: Elterncode-Panel. `login.js`/`passwort.js`: Login, Passwort vergessen/setzen.
- `src/zug.ts`: Silben-Zug-PDF (`buildZugPdf`, `sheetPage`, `drawWord`, `downloadPdf`). `src/pdf.ts`: minimaler PDF-Writer (`Page`, `buildPdf`). `build.mjs`: esbuild → `js/zug.bundle.js`.

### apps/eltern
- `app.js`: `mount(root,deps)`, `rundenDiagramm(rounds)`; Elternlogin per Code, Rundenverlauf (kein innerHTML aus Daten).

### db/migrations
- `0001_init`: schools, license_events, school_years, classes, staff_users, teacher_classes, sessions, students, student_class_history, student_codes, login_attempts, parent_activation_codes, parent_devices, class_letter_releases, student_letter_exclusions, letter_syllable_scope, class_learning_settings, config_versions, rounds, syllable_times, student_auto_state, student_blocked_syllables, letter_mastery_cache, awards, award_popups, letter_markers, audit_log, retention_rules.
- `0002`: student_sessions. `0003`: `code_lookup` in parent_activation_codes. `0004`: staff_tokens, rate_events, parent_codes, parent_sessions.

### tests
- `parity.test.ts` (alte vs. neue Logik, Fixture `silbenzauber-logic.js`), `engine`, `lautolino-logic`, `lautolino-server`, `server`, `kids`, `web`, `eltern`, `license`, `phase6`, `phase7` (Header, Größenlimit, Umzug-Wächter); `helpers.ts`.

## Konventionen
- Direkt auf `main`, keine Branches. Build-Artefakte `apps/kids/dist/app.js`, `apps/web/js/zug.bundle.js` sind eingecheckt → nach Änderung an `kids/src`, `web/src` oder `core/engine` `npm run build` ausführen.
- Kern-/Bewertungslogik (`isMastered`, Zeitmessung, Automatik, Awards) nur erweitern, nicht ändern (Paritätstests).
- Konfiguration nur über `SilbenflugConfig` (versioniert in `config_versions`); `retention` bleibt bewusst leer.
- Weitere Doku: `docs/lautolino-aenderungen.md`, `docs/umzug.md`, `apps/*/README.md`.
