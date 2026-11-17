// Lehrkräfte: Lernstufen und Silbenauswertung je Kind, Klassenübersicht je Buchstabe, mögliche Silben einer Klasse mit Stufenzuordnung.
// Alles wird aus vorhandenen Daten berechnet (Silbenzeiten, fester Silbenumfang, Auszeichnungen). Die Bewertung selbst (isMastered, Schwellen) bleibt unverändert.
import { Hono } from "hono";
import { buildSyllables, classifySyllable, contrastSet, stagePlan, subName, STAGES, STAGE_COUNT } from "@silbenflug/core";
import { isMastered, sylStat, sylTimeParams } from "@silbenflug/engine";
import type { StageRow } from "@silbenflug/engine";
import type { SilbenflugConfig } from "@silbenflug/shared";
import type { Env } from "../context";
import { authenticate, requireStaff } from "../middleware";
import { canAccessClass, canAccessStudent } from "../permissions";
import { activeConfig, fail } from "../util";
import { classLens, studentLetters } from "./plan";
import { loadScopes, studentTraining } from "./progress";

const MAX_ROWS = 1500;
const cache = new Map<string, string[]>();
// Alle gültigen Silben der Längen 2 bis 4 für die Buchstaben (zwischengespeichert, weil die Erzeugung bei vielen Buchstaben etwas dauert)
export function possibleSyllables(letters: string[], lens: number[]): string[] {
  const key = letters.join("") + "|" + lens.join(",");
  let r = cache.get(key);
  if (!r) { r = lens.flatMap((L) => buildSyllables(letters, L)); if (cache.size > 40) cache.clear(); cache.set(key, r); }
  return r;
}
const uniqLetters = (s: string): string[] => [...new Set(s.split(""))];
const upper = (s: string): string => s.toUpperCase();

function sylRow(s: string, times: Record<string, number[]>, maxSeq: Record<string, number>, cfg: SilbenflugConfig, con: Set<string>) {
  const c = classifySyllable(s), t = times[s] || [], limit = cfg.mastery.time_limit_seconds[String(s.length) as "2" | "3" | "4"] ?? null;
  const m = isMastered(t, cfg, s), st = sylStat(t, sylTimeParams(cfg));
  return {
    syllable: s, parts: c.parts, structure: c.structure, length: s.length, letters: uniqLetters(s), stage: c.stage, sub: c.sub, subName: subName(c.sub), contrast: con.has(s),
    count: maxSeq[s] || 0,                 // Anzahl aller bisherigen Abfragen (laufende Nummer der letzten Messung)
    stored: t.length,                      // davon noch gespeicherte Messwerte (die letzten 12)
    avg: st.avg,                           // durchschnittliche Lesezeit wie in der Bewertung (letzte 12, die 2 längsten gestrichen)
    successful: limit === null ? null : t.filter((x) => x <= limit).length,   // gespeicherte Messungen innerhalb der Zeitvorgabe
    limit, status: m.status,               // mastered = sicher beherrscht, not_mastered, unrated (noch zu wenige Messungen)
  };
}

export function evaluationRoutes() {
  const r = new Hono<Env>(), staff = requireStaff("admin", "schulleitung", "lehrer");

  // ---------- Ein Kind: Lernstufen, Buchstaben, trainierte Silben ----------
  r.get("/students/:id/evaluation", authenticate, staff, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const cfg = (await activeConfig(d)).config, tr = await studentTraining(d, id, cfg), name = await d.db.first<{ display_name: string }>("SELECT display_name FROM students WHERE id=?", [id]);
    const all = [...new Set(Object.values(tr.scopes).flat())], con = contrastSet(all), win = tr.win;
    // Gesamtstand je Stufe (alle Silben aller Buchstaben des Kindes)
    const plan = stagePlan(all), master = (s: string) => isMastered(tr.times[s], cfg, s).status === "mastered";
    const stages = plan.map((g) => {
      const total = g.syllables.length, mastered = g.syllables.filter(master).length, processed = g.syllables.filter((s) => (tr.times[s] || []).length > 0).length;
      const activeLetters = (win ? win.letters : []).filter((l) => l.stages.find((x) => x.stage === g.stage)?.status === "active").map((l) => l.letter), anyActive = activeLetters.length > 0;
      return { stage: g.stage, name: g.name, structure: g.structure, status: !total ? "empty" : mastered === total ? "done" : anyActive ? "active" : "locked", activeLetters, total, processed, mastered, open: total - mastered,
        subs: g.subs.map((u) => ({ id: u.id, name: u.name, total: u.syllables.length, mastered: u.syllables.filter(master).length })) };
    });
    const letters = (win ? win.letters : []).map((l, i) => ({ letter: l.letter, order: i + 1, current: l.current, window: l.window, stages: l.stages as StageRow[] }));
    // Trainierte Silben (mindestens eine Messung), nach Stufe sortiert
    const trained = Object.keys(tr.times).map((s) => sylRow(s, tr.times, tr.maxSeq, cfg, con))
      .sort((x, y) => x.stage - y.stage || x.length - y.length || (x.syllable < y.syllable ? -1 : 1));
    return c.json({
      student: { id, name: name ? name.display_name : "" }, extended: win ? win.extended : 0, restricted: win ? win.restricted : false,
      reviewPercent: cfg.stages.review_percent, minMeasurements: cfg.mastery.min_measurements, timeLimits: cfg.mastery.time_limit_seconds,
      stages, letters, syllables: trained,
    });
  });

  // Alle Silben einer Stufe für ein Kind (auch noch nicht geübte), höchstens MAX_ROWS
  r.get("/students/:id/stages/:n", authenticate, staff, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), n = Number(c.req.param("n")), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    if (!Number.isInteger(n) || n < 1 || n > STAGE_COUNT) throw fail(400, "Stufe 1 bis 7 erwartet");
    const cfg = (await activeConfig(d)).config, tr = await studentTraining(d, id, cfg), all = [...new Set(Object.values(tr.scopes).flat())], con = contrastSet(all);
    const g = stagePlan(all).find((x) => x.stage === n)!, list = g.syllables.slice(0, MAX_ROWS);
    return c.json({ stage: n, name: g.name, total: g.syllables.length, truncated: g.syllables.length > list.length, syllables: list.map((s) => sylRow(s, tr.times, tr.maxSeq, cfg, con)) });
  });

  // ---------- Klassenübersicht je Buchstabe ----------
  // erreicht = hat den Buchstaben in einer Runde geübt; Bronze/Silber/Gold = erreichte Auszeichnung (jeweils diese Stufe oder höher). Bezug: Kinder der Klasse, die den Buchstaben üben (nicht ausgenommen).
  r.get("/classes/:cid/overview", authenticate, staff, async (c) => {
    const d = c.get("deps"), cid = c.req.param("cid"), a = await canAccessClass(d.db, c.get("p"), cid);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const rel = await d.db.all<{ letter: string; release_order: number }>("SELECT letter, release_order FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [cid]);
    const kids = await d.db.all<{ id: string }>("SELECT k.id FROM students k JOIN student_class_history h ON h.student_id=k.id AND h.to_date IS NULL WHERE h.class_id=? AND k.active=1", [cid]);
    const ex = await d.db.all<{ student_id: string; letter: string }>("SELECT e.student_id, e.letter FROM student_letter_exclusions e JOIN student_class_history h ON h.student_id=e.student_id AND h.to_date IS NULL WHERE h.class_id=?", [cid]);
    const marks = await d.db.all<{ student_id: string; letter: string }>("SELECT m.student_id, m.letter FROM letter_markers m JOIN student_class_history h ON h.student_id=m.student_id AND h.to_date IS NULL JOIN students k ON k.id=m.student_id WHERE h.class_id=? AND k.active=1", [cid]);
    const aw = await d.db.all<{ student_id: string; letter: string; level: string }>("SELECT w.student_id, w.letter, w.level FROM awards w JOIN student_class_history h ON h.student_id=w.student_id AND h.to_date IS NULL JOIN students k ON k.id=w.student_id WHERE h.class_id=? AND k.active=1", [cid]);
    const excluded = new Set(ex.map((x) => x.student_id + "|" + x.letter)), pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0);
    const letters = rel.map((r2) => {
      const eligible = kids.filter((k) => !excluded.has(k.id + "|" + r2.letter)).map((k) => k.id), set = new Set(eligible), cnt = (lv: string[]) => new Set(aw.filter((x) => x.letter === r2.letter && set.has(x.student_id) && lv.indexOf(x.level) >= 0).map((x) => x.student_id)).size;
      const reached = new Set(marks.filter((x) => x.letter === r2.letter && set.has(x.student_id)).map((x) => x.student_id)).size;
      const bronze = cnt(["bronze", "silber", "gold"]), silber = cnt(["silber", "gold"]), gold = cnt(["gold"]);
      return { letter: r2.letter, order: r2.release_order, students: eligible.length, reached, bronze, silber, gold, reachedPercent: pct(reached, eligible.length), bronzePercent: pct(bronze, eligible.length), silberPercent: pct(silber, eligible.length), goldPercent: pct(gold, eligible.length) };
    });
    return c.json({ classId: cid, students: kids.length, letters });
  });

  // ---------- Mögliche Silben der Klasse mit Stufe und Unterkategorie ----------
  // Ohne ?stage: nur Zahlen je Stufe und Unterkategorie. Mit ?stage=N: die Silben dieser Stufe (höchstens 1500).
  r.get("/classes/:cid/syllables", authenticate, staff, async (c) => {
    const d = c.get("deps"), cid = c.req.param("cid"), a = await canAccessClass(d.db, c.get("p"), cid);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const rel = await d.db.all<{ letter: string }>("SELECT letter FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [cid]), letters = rel.map((x) => x.letter);
    const allowed = await classLens(d.db, cid), lens = [2, 3, 4];
    const possible = letters.length ? possibleSyllables(letters, lens) : [], con = contrastSet(possible), plan = stagePlan(possible), allowedSet = new Set(allowed);
    const trainable = (s: string) => allowedSet.has(s.length);
    const stageQ = c.req.query("stage"), summary = plan.map((g) => ({ stage: g.stage, name: g.name, structure: g.structure, total: g.syllables.length, trainable: g.syllables.filter(trainable).length,
      subs: g.subs.map((u) => ({ id: u.id, name: u.name, total: u.syllables.length, trainable: u.syllables.filter(trainable).length })) }));
    if (stageQ === undefined) return c.json({ letters, allowedLengths: allowed, possibleLengths: lens, total: possible.length, trainable: possible.filter(trainable).length, stages: summary });
    const n = Number(stageQ);
    if (!Number.isInteger(n) || n < 1 || n > STAGE_COUNT) throw fail(400, "Stufe 1 bis 7 erwartet");
    const scopeRows = await loadScopes(d, cid, letters), inScope = new Set(Object.values(scopeRows).flat()), order = new Map(letters.map((l, i) => [l, i]));
    const g = plan.find((x) => x.stage === n)!, list = g.syllables.slice(0, MAX_ROWS);
    return c.json({ stage: n, name: g.name, total: g.syllables.length, truncated: g.syllables.length > list.length, allowedLengths: allowed,
      subs: g.subs.map((u) => ({ id: u.id, name: u.name, syllables: u.syllables.filter((s) => list.indexOf(s) >= 0).map((s) => {
        const cl = classifySyllable(s), ls = uniqLetters(s), newest = ls.slice().sort((p1, p2) => (order.get(p2) ?? 0) - (order.get(p1) ?? 0))[0];
        return { syllable: s, parts: cl.parts, letters: ls, newestLetter: newest, length: s.length, trainable: trainable(s), inScope: inScope.has(s), contrast: con.has(s) };
      }) })) });
  });
  return r;
}
