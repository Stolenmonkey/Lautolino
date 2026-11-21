// Testschule mit 20 simulierten Kindern (gemischte Profile) für Entwicklung und Tests.
//   npx tsx apps/server/scripts/testkinder.ts [--config konfig.json] [--version 3] [--out db/testdaten]
// 1. Lokale In-Memory-Datenbank, Klasse mit Freigaben, 20 Kinder.
// 2. Jedes Kind spielt über die ECHTE API (POST /student/rounds) simulierte Runden: Auswahl wie in der Kinder-App (prepareRound),
//    Zeiten nach Profil. Auszeichnungen, Stufen und Freischaltung entstehen dadurch mit der echten Logik.
// 3. Ergebnis wird als kompaktes SQL für D1 geschrieben (testschule-seed.sql) plus testschule-reset.sql. Es werden KEINE Codes erzeugt
//    (hängen am geheimen Pfeffer): in der Verwaltung „Codes erzeugen“ bzw. „Neues Passwort“ nutzen.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createApp } from "../src/app";
import { nodeSqliteDb } from "../src/db";
import { migrateLocal } from "../src/migrate";
import { sha256Hex } from "../src/crypto";
import { classifySyllable } from "@silbenflug/core";
import { groupScope, scopeParams, syllableScope } from "@silbenflug/engine";
import { DEFAULT_CONFIG, withDefaults } from "@silbenflug/shared";
import { emptyState, finishRound, prepareRound } from "../../kids/src/logic";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const arg = (k: string, d: string) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const root = new URL("../../../", import.meta.url).pathname;
const VERSION = Number(arg("version", "1")), OUT = arg("out", root + "db/testdaten");
const cfgFile = arg("config", "");
const cfg = withDefaults(cfgFile ? JSON.parse(readFileSync(cfgFile, "utf8")) : DEFAULT_CONFIG);

const SCHOOL = "testschule", YEAR = "testjahr", CLASS = "testklasse";
const START = ["l", "e"], LATER = ["o", "a", "m", "p"], ALL = [...START, ...LATER];   // Reihenfolge wie im Lernplan (L E O A M P)
const NOW = Date.now(), DAYS = 14;

// Profil: Runden, Anteil schneller Silben (share, optional Verlauf von→bis), Zeitfaktoren relativ zur Zeitvorgabe, Streuung, Ausnahmen (Buchstaben)
interface Profile { name: string; rounds: number; share: number; to?: number; fast?: number; slow?: number; noise?: number; exclude?: string[]; popupOpen?: boolean }
const PROFILES: Profile[] = [
  { name: "Neuling (keine Runde)", rounds: 0, share: 0 },
  { name: "Anfänger", rounds: 3, share: 0.8 },
  { name: "Anfänger langsam", rounds: 4, share: 0.2 },
  { name: "Nachzügler (nur L E)", rounds: 15, share: 0.85, exclude: ["o", "a", "m", "p"] },
  { name: "Mittelfeld A", rounds: 40, share: 0.8 },
  { name: "Mittelfeld B", rounds: 40, share: 0.7 },
  { name: "Mittelfeld C", rounds: 60, share: 0.85 },
  { name: "Überflieger", rounds: 130, share: 1, fast: 0.45 },
  { name: "Überflieger 2", rounds: 110, share: 0.97 },
  { name: "Schwach", rounds: 60, share: 0.15 },
  { name: "Schwach 2", rounds: 30, share: 0.3 },
  { name: "Knapp unter 90", rounds: 100, share: 0.86 },
  { name: "Knapp über 90", rounds: 100, share: 0.94 },
  { name: "Fleißig langsam", rounds: 120, share: 0.5 },
  { name: "Wenige Runden gut", rounds: 12, share: 1, fast: 0.4 },
  { name: "Schwankend", rounds: 80, share: 0.75, noise: 0.5 },
  { name: "Aufsteiger", rounds: 100, share: 0.3, to: 0.97 },
  { name: "Absteiger", rounds: 100, share: 0.97, to: 0.4 },
  { name: "Frischer Stern (Popup offen)", rounds: 50, share: 0.95, popupOpen: true },
  { name: "Mittel langsam", rounds: 70, share: 0.6 },
];

const mulberry32 = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash01 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const iso = (ms: number) => new Date(ms).toISOString();
const r1 = (x: number) => Math.round(x * 10) / 10;

async function main() {
  const raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON");
  migrateLocal(raw, root + "db/migrations");
  const at = iso(NOW - DAYS * 86400000 - 3600000);
  raw.prepare("DELETE FROM config_versions").run();
  raw.prepare("INSERT INTO config_versions(version,json,valid_from,changed_by,change_note,is_active) VALUES(?,?,?,?,?,1)").run(VERSION, JSON.stringify(cfg), at, "testkinder", "Testdaten");
  raw.prepare("INSERT INTO schools(id,name,license_status,license_start,license_end,payment_confirmed_at,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)").run(SCHOOL, "Testschule (Entwicklung)", "aktiv", at, "2099-01-01T00:00:00.000Z", at, at, at);
  raw.prepare("INSERT INTO school_years(id,school_id,label,created_at,updated_at) VALUES(?,?,?,?,?)").run(YEAR, SCHOOL, "Testjahr", at, at);
  raw.prepare("INSERT INTO classes(id,school_id,school_year_id,name,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)").run(CLASS, SCHOOL, YEAR, "Testklasse", at, at);

  // Freigaben mit festem Silbenumfang wie in POST /classes/:cid/releases
  const sp = scopeParams(cfg), scopes: Record<string, string[]> = {}, known: string[] = [];
  const groupSyl = groupScope(START, sp);
  ALL.forEach((l, i) => {
    scopes[l] = i < START.length ? groupSyl : syllableScope(known, l, sp);
    known.push(l);
    raw.prepare("INSERT INTO class_letter_releases(class_id,letter,release_order,released_at) VALUES(?,?,?,?)").run(CLASS, l, i + 1, at);
    scopes[l].forEach((s) => raw.prepare("INSERT INTO letter_syllable_scope(class_id,letter,syllable,syl_length,fixed_at,config_version) VALUES(?,?,?,?,?,?)").run(CLASS, l, s, s.length, at, VERSION));
  });

  const app = createApp({ db: nodeSqliteDb(raw), pepper: "x".repeat(40), iterations: 1000, now: () => new Date(NOW) });
  const call = async (method: string, path: string, token: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await res.text(); return { status: res.status, json: t ? JSON.parse(t) : null };
  };
  const id = (i: number) => "tk" + String(i + 1).padStart(2, "0");

  for (let i = 0; i < PROFILES.length; i++) {
    const p = PROFILES[i], sid = id(i);
    raw.prepare("INSERT INTO students(id,school_id,display_name,active,created_at,updated_at) VALUES(?,?,?,1,?,?)").run(sid, SCHOOL, `T${String(i + 1).padStart(2, "0")} ${p.name}`, at, at);
    raw.prepare("INSERT INTO student_class_history(id,student_id,class_id,from_date) VALUES(?,?,?,?)").run("tkh" + sid, sid, CLASS, at);
    (p.exclude || []).forEach((l) => raw.prepare("INSERT INTO student_letter_exclusions(student_id,letter) VALUES(?,?)").run(sid, l));
    const token = Buffer.from("sim-" + sid).toString("hex").padEnd(32, "0");
    raw.prepare("INSERT INTO student_sessions(id,student_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)").run("ss" + sid, sid, await sha256Hex(token), "2099-01-01T00:00:00.000Z", at);
    if (!p.rounds) continue;
    const planRes = await call("GET", "/student/plan", token); if (planRes.status !== 200) throw new Error("plan " + planRes.status + JSON.stringify(planRes.json)); const plan = planRes.json, rng = mulberry32(1000 + i);
    let st = emptyState();
    const step = (DAYS * 86400000) / p.rounds;
    for (let n = 0; n < p.rounds; n++) {
      const share = p.to === undefined ? p.share : p.share + (p.to - p.share) * (n / Math.max(1, p.rounds - 1));
      const setup = prepareRound(plan, cfg, st, rng);
      const syl = setup.tasks.map((s) => {
        const lim = cfg.mastery.time_limit_seconds[String(Math.max(1, classifySyllable(s).stage)) as "1"] ?? cfg.mastery.time_limit_seconds["1"] ?? 3.5;
        const fast = hash01(sid + s) < share;
        const base = lim * (fast ? (p.fast ?? 0.55) : (p.slow ?? 1.8)), sec = Math.min(cfg.syl_time.max_seconds, Math.max(0.6, base * (1 + (p.noise ?? 0.2) * gauss(rng))));
        return { s, sec: r1(sec) };
      });
      const total = r1(syl.reduce((a, x) => a + x.sec, 0) + 4);
      st = finishRound(st, { seconds: total, syllables: syl }, cfg);
      const res = await call("POST", "/student/rounds", token, { clientRoundId: "sim-" + n, seconds: total, syllables: syl, letters: plan.letters, playedAt: iso(NOW - (p.rounds - 1 - n) * step) });
      if (res.status !== 201) throw new Error(`${sid} Runde ${n}: ${res.status} ${JSON.stringify(res.json)}`);
    }
  }

  // ---------- Export als kompaktes SQL (JSON + json_each, damit wenig Text nötig ist) ----------
  const L = (sql: string) => sql.replace(/\s+/g, " ").trim() + ";";
  const sql: string[] = [];
  const reset = [
    "DELETE FROM award_popups WHERE award_id IN (SELECT id FROM awards WHERE student_id IN (SELECT id FROM students WHERE school_id='testschule'))",
    ...["awards", "letter_markers", "letter_mastery_cache", "syllable_times", "rounds", "student_blocked_syllables", "parent_activation_codes", "parent_devices", "student_sessions", "student_codes", "parent_codes", "parent_sessions", "student_letter_exclusions", "student_class_history"]
      .map((t) => `DELETE FROM ${t} WHERE student_id IN (SELECT id FROM students WHERE school_id='testschule')`),
    "DELETE FROM students WHERE school_id='testschule'",
    "DROP TRIGGER IF EXISTS scope_immutable_delete",
    "DELETE FROM letter_syllable_scope WHERE class_id='testklasse'",
    "CREATE TRIGGER scope_immutable_delete BEFORE DELETE ON letter_syllable_scope BEGIN SELECT RAISE(ABORT, 'letter_syllable_scope ist unveränderlich'); END",
    "DELETE FROM class_letter_releases WHERE class_id='testklasse'",
    "DELETE FROM teacher_classes WHERE class_id='testklasse'",
    "DELETE FROM classes WHERE id='testklasse'", "DELETE FROM school_years WHERE id='testjahr'", "DELETE FROM schools WHERE id='testschule'",
  ].map((s) => s + ";");
  const CREATED = `strftime('%Y-%m-%dT%H:%M:%SZ','now','-${DAYS + 1} days')`, NOWX = `strftime('%Y-%m-%dT%H:%M:%SZ','now')`;
  sql.push(L(`INSERT INTO schools(id,name,license_status,license_start,license_end,payment_confirmed_at,active,created_at,updated_at) VALUES('testschule','Testschule (Entwicklung)','aktiv',${CREATED},'2099-01-01T00:00:00.000Z',${CREATED},1,${CREATED},${CREATED})`));
  sql.push(L(`INSERT INTO school_years(id,school_id,label,created_at,updated_at) VALUES('testjahr','testschule','Testjahr',${CREATED},${CREATED})`));
  sql.push(L(`INSERT INTO classes(id,school_id,school_year_id,name,active,created_at,updated_at) VALUES('testklasse','testschule','testjahr','Testklasse',1,${CREATED},${CREATED})`));
  sql.push(L(`INSERT INTO class_letter_releases(class_id,letter,release_order,released_at) SELECT 'testklasse', value, key+1, ${CREATED} FROM json_each(${q(JSON.stringify(ALL))})`));
  sql.push(L(`INSERT INTO letter_syllable_scope(class_id,letter,syllable,syl_length,fixed_at,config_version) SELECT 'testklasse', s.key, v.value, length(v.value), ${CREATED}, ${VERSION} FROM json_each(${q(JSON.stringify(scopes))}) s, json_each(s.value) v`));
  sql.push(L(`INSERT INTO students(id,school_id,display_name,active,created_at,updated_at) SELECT json_extract(value,'$[0]'), 'testschule', json_extract(value,'$[1]'), 1, ${CREATED}, ${CREATED} FROM json_each(${q(JSON.stringify(PROFILES.map((p, i) => [id(i), `T${String(i + 1).padStart(2, "0")} ${p.name}`])))})`));
  sql.push(L(`INSERT INTO student_class_history(id,student_id,class_id,from_date) SELECT 'tkh'||value,value,'testklasse',${CREATED} FROM json_each(${q(JSON.stringify(PROFILES.map((_, i) => id(i))))})`));
  const ex = PROFILES.flatMap((p, i) => (p.exclude || []).map((l) => [id(i), l]));
  if (ex.length) sql.push(L(`INSERT INTO student_letter_exclusions(student_id,letter) SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]') FROM json_each(${q(JSON.stringify(ex))})`));

  let stats: string[] = [];
  for (let i = 0; i < PROFILES.length; i++) {
    const p = PROFILES[i], sid = id(i);
    if (!p.rounds) continue;
    const rounds = raw.prepare("SELECT id, played_at, seconds, letters FROM rounds WHERE student_id=? ORDER BY played_at, id").all(sid) as any[];
    const idx = new Map(rounds.map((r, k) => [r.id, k]));
    const times: Record<string, number[]> = {};
    (raw.prepare("SELECT syllable, seconds FROM syllable_times WHERE student_id=? ORDER BY syllable, seq").all(sid) as any[]).forEach((r) => (times[r.syllable] ||= []).push(r1(r.seconds)));
    const marks: Record<string, number> = {};
    (raw.prepare("SELECT letter, round_id FROM letter_markers WHERE student_id=?").all(sid) as any[]).forEach((r) => { marks[r.letter] = idx.get(r.round_id)!; });
    const awards = (raw.prepare("SELECT a.letter, a.level, a.round_id FROM awards a WHERE a.student_id=? ORDER BY a.achieved_at, a.letter").all(sid) as any[]).map((r) => [r.letter, r.level, idx.get(r.round_id)!]);
    const rid = `'r-${sid}-'||`;
    const stepMin = Math.round((DAYS * 1440) / rounds.length), N = rounds.length;
    sql.push(L(`INSERT INTO rounds(id,student_id,client_round_id,played_at,seconds,letters,config_version,task_count) SELECT ${rid}key, '${sid}', 'sim-'||key, strftime('%Y-%m-%dT%H:%M:%SZ','now',printf('-%d minutes',(${N}-1-key)*${stepMin}+5)), value, ${q(rounds[0].letters)}, ${VERSION}, ${cfg.round.task_count} FROM json_each(${q(JSON.stringify(rounds.map((r) => r1(r.seconds))))})`));
    sql.push(L(`INSERT INTO syllable_times(id,student_id,syllable,seq,seconds,config_version) SELECT 'st-${sid}-'||s.key||'-'||v.key, '${sid}', s.key, v.key+1, v.value, ${VERSION} FROM json_each(${q(JSON.stringify(times))}) s, json_each(s.value) v`));
    if (Object.keys(marks).length) sql.push(L(`INSERT INTO letter_markers(student_id,letter,round_id) SELECT '${sid}', key, ${rid}value FROM json_each(${q(JSON.stringify(marks))})`));
    if (awards.length) {
      sql.push(L(`INSERT INTO awards(id,student_id,letter,level,achieved_at,config_version,round_id) SELECT 'aw-${sid}-'||json_extract(value,'$[0]')||'-'||json_extract(value,'$[1]'), '${sid}', json_extract(value,'$[0]'), json_extract(value,'$[1]'), ${NOWX}, ${VERSION}, ${rid}json_extract(value,'$[2]') FROM json_each(${q(JSON.stringify(awards))})`));
      sql.push(L(`INSERT INTO award_popups(award_id,shown_at) SELECT id, ${p.popupOpen ? "NULL" : NOWX} FROM awards WHERE student_id='${sid}'`));
    }
    const levels = awards.map((a) => a[0] + a[1][0]).join(" ");
    stats.push(`${sid} ${p.name.padEnd(30)} Runden ${String(N).padStart(3)}  Silben ${String(Object.keys(times).length).padStart(3)}  ${levels || "–"}`);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(OUT + "/testschule-seed.sql", "-- Testschule mit 20 Testkindern (erzeugt von apps/server/scripts/testkinder.ts). Vorher testschule-reset.sql ausführen, wenn schon vorhanden.\n" + sql.join("\n") + "\n");
  writeFileSync(OUT + "/testschule-reset.sql", "-- Löscht die Testschule samt aller Testkinder (nur Schule 'testschule').\n" + reset.join("\n") + "\n");
  console.log(stats.join("\n"));
  console.log(`\nSeed: ${sql.join("\n").length} Zeichen, ${sql.length} Anweisungen → ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
