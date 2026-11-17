// Messwerte, Bewertung sicher beherrschter Silben und Auszeichnungen.
// Einziger Messwert ist die Zeit bis „Weiter“. Die Bewertung ist zeitbasiert und kein Nachweis der Lesekorrektheit.
import { Hono } from "hono";
import { buildSyllables, makeRound, randomCase, countSyllables, sylProbs } from "@silbenflug/core";
import { trainingWindow } from "@silbenflug/engine";
import { pickWeighted } from "../train";
import { DEFAULT_CONFIG } from "@silbenflug/shared";
import { isMastered, letterProgress, newAwards, highestLevel, autoParams, comboKey, roundParams, sdFromLen, startVal, sylStat, sylTimeParams } from "@silbenflug/engine";
import type { AutoState } from "@silbenflug/engine";
import type { AwardLevel, SilbenflugConfig } from "@silbenflug/shared";
import type { Deps, Env } from "../context";
import { authenticate, requireStaff } from "../middleware";
import { canAccessStudent } from "../permissions";
import { assertSchoolWritable, activeConfig, body, fail, newId, nowDate, nowIso, str } from "../util";
import { studentLetters } from "./plan";

const LEVEL_ORDER: AwardLevel[] = ["bronze", "silber", "gold"];
const num = (v: unknown, lo: number, hi: number, name: string): number => {
  if (typeof v !== "number" || !isFinite(v) || v < lo || v > hi) throw fail(400, `${name}: Zahl ${lo} bis ${hi} erwartet`);
  return v;
};

// Fester Silbenumfang je Buchstabe der aktuellen Klasse und gespeicherte Zeiten je Silbe (älteste zuerst)
export async function loadScopes(d: Deps, classId: string, letters: string[]): Promise<Record<string, string[]>> {
  const rows = await d.db.all<{ letter: string; syllable: string }>("SELECT letter, syllable FROM letter_syllable_scope WHERE class_id=?", [classId]);
  const out: Record<string, string[]> = {};
  letters.forEach((l) => { out[l] = []; });
  rows.forEach((r) => { if (out[r.letter]) out[r.letter].push(r.syllable); });
  return out;
}
export async function loadTimes(d: Deps, studentId: string): Promise<{ times: Record<string, number[]>; maxSeq: Record<string, number> }> {
  const rows = await d.db.all<{ syllable: string; seconds: number; seq: number }>("SELECT syllable, seconds, seq FROM syllable_times WHERE student_id=? ORDER BY syllable, seq", [studentId]);
  const times: Record<string, number[]> = {}, maxSeq: Record<string, number> = {};
  rows.forEach((r) => { (times[r.syllable] ||= []).push(r.seconds); maxSeq[r.syllable] = r.seq; });
  return { times, maxSeq };
}
async function heldAwards(d: Deps, studentId: string): Promise<Record<string, AwardLevel[]>> {
  const rows = await d.db.all<{ letter: string; level: AwardLevel }>("SELECT letter, level FROM awards WHERE student_id=?", [studentId]);
  const out: Record<string, AwardLevel[]> = {};
  rows.forEach((r) => { (out[r.letter] ||= []).push(r.level); });
  return out;
}

// Lernstufen: Silben der aktuellen Stufen (focus) und Silben früherer Stufen zur Wiederholung (review) aus dem festen Silbenumfang der Buchstaben und den Silbenzeiten.
// Alles wird aus vorhandenen Daten berechnet, es wird nichts zusätzlich gespeichert.
export async function studentTraining(d: Deps, studentId: string, cfg: SilbenflugConfig) {
  const st = await studentLetters(d.db, studentId);
  if (!st.classId || !st.letters.length) return { st, scopes: {} as Record<string, string[]>, times: {} as Record<string, number[]>, maxSeq: {} as Record<string, number>, win: null };
  const scopes = await loadScopes(d, st.classId, st.letters), { times, maxSeq } = await loadTimes(d, studentId);
  const win = trainingWindow(scopes, times, cfg, cfg.round.min_pool);
  if (!cfg.stages.enabled) win.restricted = false;   // Schalter in der Konfiguration: ohne Lernstufen wie bisher
  return { st, scopes, times, maxSeq, win };
}

// Stand je Buchstabe (für Lehrkräfte; Kinder sehen nur die Stufe)
export async function progressOf(d: Deps, studentId: string, cfg: SilbenflugConfig) {
  const st = await studentLetters(d.db, studentId);
  if (!st.classId) return [];
  const scopes = await loadScopes(d, st.classId, st.letters), { times } = await loadTimes(d, studentId), held = await heldAwards(d, studentId);
  return st.letters.map((l, i) => ({ letter: l, order: i + 1, level: highestLevel(held[l] || []), ...letterProgress(scopes[l], times, cfg) }));
}

export function progressRoutes() {
  const r = new Hono<Env>();

  // ---------- Kind: Runde melden ----------
  // Idempotent über clientRoundId (Offline-Puffer darf eine Runde mehrfach senden). Alles wird in einem Schritt gespeichert.
  r.post("/student/rounds", authenticate, async (c) => {
    const d = c.get("deps"), p = c.get("p");
    if (p.kind !== "student") throw fail(403, "Keine Berechtigung");
    const b = await body(c), clientId = str(b.clientRoundId, "clientRoundId", 64);
    const dup = await d.db.first<{ id: string }>("SELECT id FROM rounds WHERE student_id=? AND client_round_id=?", [p.id, clientId]);
    if (dup) return c.json({ duplicate: true, roundId: dup.id, awards: [] });
    await assertSchoolWritable(d, p.schoolId);
    const { version, config: cfg } = await activeConfig(d);
    const seconds = num(b.seconds, 0, 3600, "seconds"), syl = Array.isArray(b.syllables) ? b.syllables : [];
    if (!syl.length || syl.length > 100) throw fail(400, "syllables: 1 bis 100 Einträge erwartet");
    const items = syl.map((x: any) => {
      const s = String(x?.s ?? "").toLowerCase();
      if (!/^[a-z]{2,4}$/.test(s)) throw fail(400, "syllables: ungültige Silbe");
      return { s, sec: Math.min(cfg.syl_time.max_seconds, num(x?.sec, 0, 3600, "syllables.sec")) };
    });
    const letters = Array.isArray(b.letters) ? [...new Set(b.letters.map((x: unknown) => String(x).toLowerCase()))].filter((l) => /^[a-z]$/.test(l as string)) as string[] : [];
    const lengths = Array.isArray(b.lengths) ? [...new Set(b.lengths.map(Number))].filter((x) => x >= 2 && x <= 4).sort() : [];
    const playedAt = b.playedAt && !isNaN(Date.parse(String(b.playedAt))) && Date.parse(String(b.playedAt)) <= nowDate(d).getTime() + 86400000 ? new Date(String(b.playedAt)).toISOString() : nowIso(d), at = nowIso(d);
    const roundId = newId(), stmts: Array<{ sql: string; params?: Array<string | number | null> }> = [];
    stmts.push({ sql: "INSERT INTO rounds(id,student_id,client_round_id,played_at,seconds,letters,lengths,config_version,task_count) VALUES(?,?,?,?,?,?,?,?,?)", params: [roundId, p.id, clientId, playedAt, seconds, letters.join(""), lengths.join(","), version, items.length] });

    // Zeiten je Silbe anhängen, nur die letzten `retention` bleiben
    const { times, maxSeq } = await loadTimes(d, p.id), after: Record<string, number[]> = {};
    Object.keys(times).forEach((k) => { after[k] = times[k].slice(); });
    items.forEach(({ s, sec }) => {
      const seq = (maxSeq[s] || 0) + 1; maxSeq[s] = seq;
      stmts.push({ sql: "INSERT INTO syllable_times(id,student_id,syllable,seq,seconds,config_version) VALUES(?,?,?,?,?,?)", params: [newId(), p.id, s, seq, sec, version] });
      stmts.push({ sql: "DELETE FROM syllable_times WHERE student_id=? AND syllable=? AND seq<=?", params: [p.id, s, seq - cfg.syl_time.retention] });
      after[s] = (after[s] || []).concat([sec]).slice(-cfg.syl_time.retention);
    });

    // Markierung: Buchstabe erscheint zum ersten Mal in einer Runde dieses Kindes
    const marked = new Set((await d.db.all<{ letter: string }>("SELECT letter FROM letter_markers WHERE student_id=?", [p.id])).map((x) => x.letter));
    letters.filter((l) => !marked.has(l)).forEach((l) => stmts.push({ sql: "INSERT INTO letter_markers(student_id,letter,round_id) VALUES(?,?,?)", params: [p.id, l, roundId] }));

    // Auszeichnungen neu berechnen (nur Buchstaben, deren fester Silbenumfang in dieser Runde vorkam)
    const st = await studentLetters(d.db, p.id), awards: Array<{ letter: string; levels: AwardLevel[]; highest: AwardLevel }> = [];
    if (st.classId) {
      const scopes = await loadScopes(d, st.classId, st.letters), held = await heldAwards(d, p.id), played = new Set(items.map((x) => x.s));
      for (const l of st.letters) {
        if (!scopes[l].some((s) => played.has(s))) continue;
        const prog = letterProgress(scopes[l], after, cfg), fresh = newAwards(held[l] || [], prog.percent, cfg);
        stmts.push({ sql: "INSERT INTO letter_mastery_cache(student_id,letter,mastered_count,total_count,percent,computed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,letter) DO UPDATE SET mastered_count=excluded.mastered_count,total_count=excluded.total_count,percent=excluded.percent,computed_at=excluded.computed_at", params: [p.id, l, prog.mastered, prog.total, prog.percent, at] });
        for (const lv of fresh) {
          const aid = newId();   // Auszeichnungen werden nur eingefügt, nie geändert oder entfernt
          stmts.push({ sql: "INSERT INTO awards(id,student_id,letter,level,achieved_at,config_version,round_id) VALUES(?,?,?,?,?,?,?)", params: [aid, p.id, l, lv, at, version, roundId] });
          stmts.push({ sql: "INSERT INTO award_popups(award_id,shown_at) VALUES(?,NULL)", params: [aid] });
        }
        if (fresh.length) awards.push({ letter: l, levels: fresh, highest: highestLevel(fresh)! });
      }
    }
    // Automatik-Stand (optional, vom Gerät berechnet wie in Silbenzauber)
    const a = b.autoState;
    if (a && typeof a === "object" && typeof a.key === "string" && a.key.length <= 60) {
      const bal = a.bal == null ? null : num(a.bal, 0, 100, "autoState.bal"), sd = a.sd == null ? null : num(a.sd, 0, 100, "autoState.sd");
      stmts.push({ sql: "INSERT INTO student_auto_state(student_id,combo_key,len_balance,syl_difficulty,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(student_id,combo_key) DO UPDATE SET len_balance=excluded.len_balance,syl_difficulty=excluded.syl_difficulty,updated_at=excluded.updated_at", params: [p.id, a.key, bal, sd, at] });
    }
    try { await d.db.batch(stmts); } catch (e) {
      const again = await d.db.first<{ id: string }>("SELECT id FROM rounds WHERE student_id=? AND client_round_id=?", [p.id, clientId]);
      if (again) return c.json({ duplicate: true, roundId: again.id, awards: [] }); // gleichzeitige Doppelübertragung
      throw e;
    }
    return c.json({ duplicate: false, roundId, awards }, 201);
  });

  // ---------- Kind: Buchstabenübersicht (nur Stufen, keine Prozentwerte) ----------
  r.get("/student/awards", authenticate, async (c) => {
    const d = c.get("deps"), p = c.get("p");
    if (p.kind !== "student") throw fail(403, "Keine Berechtigung");
    const st = await studentLetters(d.db, p.id), held = await heldAwards(d, p.id);
    const pending = await d.db.all<{ aid: string; letter: string; level: AwardLevel }>("SELECT a.id AS aid, a.letter, a.level FROM awards a JOIN award_popups o ON o.award_id=a.id WHERE a.student_id=? AND o.shown_at IS NULL", [p.id]);
    const byLetter: Record<string, AwardLevel[]> = {};
    pending.forEach((x) => { (byLetter[x.letter] ||= []).push(x.level); });
    return c.json({
      letters: "abcdefghijklmnopqrstuvwxyz".split("").map((l) => ({ letter: l, released: st.letters.includes(l), level: highestLevel(held[l] || []) })),
      pending: Object.keys(byLetter).map((l) => ({ letter: l, level: highestLevel(byLetter[l]) })), // Glückwunsch nur für die höchste neue Stufe
    });
  });
  r.post("/student/awards/ack", authenticate, async (c) => {
    const d = c.get("deps"), p = c.get("p");
    if (p.kind !== "student") throw fail(403, "Keine Berechtigung");
    await d.db.run("UPDATE award_popups SET shown_at=? WHERE shown_at IS NULL AND award_id IN (SELECT id FROM awards WHERE student_id=?)", [nowIso(d), p.id]);
    return c.json({ ok: true });
  });
  r.get("/student/auto-state", authenticate, async (c) => {
    const p = c.get("p");
    if (p.kind !== "student") throw fail(403, "Keine Berechtigung");
    return c.json(await c.get("deps").db.all("SELECT combo_key, len_balance, syl_difficulty FROM student_auto_state WHERE student_id=?", [p.id]));
  });

  // Stand für andere Geräte desselben Kindes: letzte Silbenzeiten und letzte Rundenzeiten je Buchstabenkombination (Server ist maßgeblich)
  r.get("/student/sync-data", authenticate, async (c) => {
    const d = c.get("deps"), p = c.get("p");
    if (p.kind !== "student") throw fail(403, "Keine Berechtigung");
    const cfg = (await activeConfig(d)).config, { times } = await loadTimes(d, p.id);
    const rows = await d.db.all<{ seconds: number; letters: string; lengths: string }>("SELECT seconds, letters, lengths FROM rounds WHERE student_id=? ORDER BY played_at DESC, id DESC LIMIT 500", [p.id]);
    const combo: Record<string, number[]> = {};
    rows.reverse().forEach((x) => { (combo[comboKey(x.letters.split(""), x.lengths.split(",").map(Number))] ||= []).push(x.seconds); });
    Object.keys(combo).forEach((k) => { combo[k] = combo[k].slice(-cfg.auto.stats_rounds); });
    return c.json({ sylTimes: times, comboTimes: combo });
  });

  // ---------- Lehrkräfte: Fortschritt und Rundenverlauf eines Kindes ----------
  const staff = requireStaff("admin", "schulleitung", "lehrer");
  r.get("/students/:id/progress", authenticate, staff, async (c) => {
    const d = c.get("deps"), a = await canAccessStudent(d.db, c.get("p"), c.req.param("id"));
    if (!a.ok) throw fail(404, "nicht gefunden");
    return c.json(await progressOf(d, c.req.param("id"), (await activeConfig(d)).config));
  });
  r.get("/students/:id/rounds", authenticate, staff, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const rounds = await d.db.all("SELECT id, played_at, seconds, letters, lengths, config_version FROM rounds WHERE student_id=? ORDER BY played_at, id", [id]);
    const markers = await d.db.all("SELECT letter, round_id FROM letter_markers WHERE student_id=?", [id]);
    const awards = await d.db.all("SELECT letter, level, achieved_at, round_id FROM awards WHERE student_id=? ORDER BY achieved_at", [id]);
    return c.json({ rounds, markers, awards });
  });

  // ---------- Silben-Zug: 20 Silben für ein Druckblatt ----------
  // Auswahl wie in der Übung: alle freigegebenen Buchstaben des Kindes, Schwierigkeit aus dem Automatik-Stand und den gemessenen Silbenzeiten.
  // (Die stärkere Gewichtung noch nicht sicher beherrschter Silben ist noch offen und fehlt hier bewusst.)
  const printers = requireStaff("schulleitung", "lehrer");
  r.get("/students/:id/syllable-train", authenticate, printers, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const cfg = (await activeConfig(d)).config, st = await studentLetters(d.db, id), lens = st.lengths.slice().sort((x, y) => x - y);
    if (!st.classId || countSyllables(st.letters, lens, cfg.round.min_pool) < cfg.round.min_pool) throw fail(409, "Mit den freigegebenen Buchstaben gibt es noch zu wenige Silben.");
    const seedRaw = c.req.query("seed"), seed = seedRaw !== undefined && /^\d{1,9}$/.test(seedRaw) ? Number(seedRaw) : null;
    let t = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    const rng = () => { t = (t + 0x6d2b79f5) >>> 0; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const rows = await d.db.all<{ combo_key: string; len_balance: number | null; syl_difficulty: number | null }>("SELECT combo_key, len_balance, syl_difficulty FROM student_auto_state WHERE student_id=?", [id]);
    const list: AutoState[] = rows.map((r2) => { const [le, ln] = r2.combo_key.split("|"); return { key: r2.combo_key, letters: le || "", lens: (ln || "").split(",").map(Number).filter((x) => x >= 2 && x <= 4), bal: r2.len_balance ?? undefined, sd: r2.syl_difficulty ?? undefined }; });
    const ap = autoParams(cfg), bal = startVal(list, st.letters, lens, "bal", cfg.auto.default_len_balance, ap.newComboDiscount);
    const sd = lens.length > 1 ? sdFromLen(bal, ap) : startVal(list, st.letters, lens, "sd", cfg.auto.default_syl_difficulty, ap.newComboDiscount);
    const { times } = await loadTimes(d, id), sylAvg: Record<string, number | null> = {};
    Object.keys(times).forEach((k) => { sylAvg[k] = sylStat(times[k], sylTimeParams(cfg)).avg; });
    // Noch nicht sicher beherrschte Silben (auch noch nicht bewertete) kommen train.unmastered_weight-mal so oft vor wie sicher beherrschte.
    const weight = cfg.train?.unmastered_weight ?? DEFAULT_CONFIG.train.unmastered_weight, rp = roundParams(cfg);
    // Lernstufen: nur Silben der aktuellen Stufen, dazu anteilig Wiederholungen früherer Stufen (stages.review_percent)
    const tr = await studentTraining(d, id, cfg), focus = tr.win && tr.win.restricted ? tr.win.focus : [], review = tr.win && tr.win.restricted ? tr.win.review : [];
    const blocked = focus.length ? (() => { const fs = new Set(focus.concat(review)); return lens.flatMap((L) => buildSyllables(st.letters, L)).filter((x) => !fs.has(x)); })() : null;
    const probs0 = sylProbs(st.letters, lens, cfg.round.letter_frequency_default, bal, sylAvg, sd, blocked, rp);
    const rvShare = Math.min(50, cfg.stages?.review_percent ?? DEFAULT_CONFIG.stages.review_percent) / 100, rvList = review.filter((x) => probs0[x] !== undefined);
    const probs: Record<string, number> = {};
    if (focus.length && rvList.length && rvShare > 0) {
      const fKeys = Object.keys(probs0).filter((k2) => focus.indexOf(k2) >= 0), tot = fKeys.reduce((a2, k2) => a2 + probs0[k2], 0) || 1;
      fKeys.forEach((k2) => { probs[k2] = (probs0[k2] / tot) * (1 - rvShare); });
      rvList.forEach((k2) => { probs[k2] = rvShare / rvList.length; });
    } else Object.assign(probs, focus.length ? Object.fromEntries(Object.entries(probs0).filter(([k2]) => focus.indexOf(k2) >= 0)) : probs0);
    const syllables = weight > 1 || focus.length
      ? pickWeighted(probs, 20, (s2) => (isMastered(times[s2], cfg, s2).status === "mastered" ? 1 : weight), rng)
      : makeRound(st.letters, lens, cfg.round.letter_frequency_default, 20, bal, sylAvg, sd, null, rng, rp);
    const stu = await d.db.first<{ display_name: string }>("SELECT display_name FROM students WHERE id=?", [id]);
    return c.json({ student: { id, name: stu ? stu.display_name : "" }, letters: st.letters, lengths: lens, comboKey: comboKey(st.letters, lens), syllables, shown: syllables.map((x) => randomCase(x, rng)), generatedAt: nowIso(d) });
  });
  return r;
}
