// Lehrkräfte: Lernstufen und Silbenauswertung je Kind, Klassenübersicht je Buchstabe, mögliche Silben einer Klasse mit Stufenzuordnung.
// Alles wird aus vorhandenen Daten berechnet (Silbenzeiten, fester Silbenumfang, Auszeichnungen). Die Bewertung selbst (isMastered, Schwellen) bleibt unverändert.
import { Hono } from "hono";
import { classifySyllable, stagePlan, subName, STAGES, STAGE_COUNT } from "@silbenflug/core";
import { contrastStat, isKKey, isMastered, kKey, sylStat, sylTimeParams, timeLimitFor } from "@silbenflug/engine";
import type { StageRow } from "@silbenflug/engine";
import type { SilbenflugConfig } from "@silbenflug/shared";
import type { Deps, Env } from "../context";
import { authenticate, requireStaff } from "../middleware";
import { canAccessClass, canAccessStudent } from "../permissions";
import { activeConfig, assertSchoolWritable, body, fail } from "../util";
import { studentLetters } from "./plan";
import { loadBlocked, loadScopes, loadScopesEx, studentSylPlan, studentTraining } from "./progress";
// Silben der gespeicherten Kontrastblöcke (nur freigegebene Silben des Umfangs; Blöcke mit weniger als 2 Silben zählen nicht)
const blockCon = (all: string[], blocks: string[][]): Set<string> => { const p = new Set(all); return new Set(blocks.map((b) => b.filter((x) => p.has(x))).filter((b) => b.length >= 2).flat()); };

const MAX_ROWS = 1500;
const DEFAULT_BAND = 50;   // Mittelfeld-Anteil in Prozent der Kinder (Rangbasis)
const median = (v: number[]): number => { const s = [...v].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const uniqLetters = (s: string): string[] => [...new Set(s.split(""))];
const upper = (s: string): string => s.toUpperCase();

function sylRow(s: string, times: Record<string, number[]>, maxSeq: Record<string, number>, cfg: SilbenflugConfig, con: Set<string>, locked?: Set<string>) {
  const c = classifySyllable(s), t = times[s] || [], limit = timeLimitFor(cfg.mastery.time_limit_seconds, s);
  const m = isMastered(t, cfg, s), st = sylStat(t, sylTimeParams(cfg));
  return {
    syllable: s, parts: c.parts, structure: c.structure, length: s.length, letters: uniqLetters(s), stage: c.stage, sub: c.sub, subName: subName(c.sub), contrast: con.has(s), locked: !!locked && locked.has(s),
    count: maxSeq[s] || 0,                 // Anzahl aller bisherigen Abfragen (laufende Nummer der letzten Messung)
    stored: t.length,                      // davon noch gespeicherte Messwerte (die letzten 12)
    avg: st.avg,                           // durchschnittliche Lesezeit wie in der Bewertung (letzte 12, die 2 längsten gestrichen)
    successful: limit === null ? null : t.filter((x) => x <= limit).length,   // gespeicherte Messungen innerhalb der Zeitvorgabe
    limit, status: m.status,               // mastered = sicher beherrscht, not_mastered, unrated (noch zu wenige Messungen)
    ...(con.has(s) ? (() => { const kt = times[kKey(s)] || [], ks = contrastStat(kt, cfg), kst = sylStat(kt, { window: cfg.contrast.window, dropLongest: cfg.contrast.drop_longest, minKeep: Math.max(1, cfg.contrast.window - cfg.contrast.drop_longest) });
      return { kStored: kt.length, kAvg: kst.avg, kLimit: cfg.contrast.time_limit_seconds, kStatus: ks.status }; })() : {}),   // Kontrastzeit (Stufe 2)
  };
}

// Einstufung der Kinder einer Klasse. Quote = sicher beherrschte Silben / freigegebene Silben des Kindes (ohne Ausnahmen).
// Rangbasiert: Perzentilrang je Kind (Mittelrang bei Gleichstand) unter den Kindern mit Daten. Mittelfeld = mittlere `band` % der Kinder (Rang 50 ± band/2), mindestens das dem Rang 50 nächste Kind; Grenzen zählen als durchschnittlich.
// Kinder ohne Messungen oder ohne freigegebene Silben: "nodata", nicht im Median.
async function childGroups(d: Deps, cid: string, letters: string[], excluded: Set<string>) {
  const cfg = (await activeConfig(d)).config;
  const band = ((await d.db.first("SELECT mid_share FROM classes WHERE id=?", [cid])) as { mid_share: number } | null)?.mid_share ?? DEFAULT_BAND;
  const kids = await d.db.all("SELECT k.id, k.display_name AS name FROM students k JOIN student_class_history h ON h.student_id=k.id AND h.to_date IS NULL WHERE h.class_id=? AND k.active=1 ORDER BY k.display_name", [cid]) as { id: string; name: string }[];
  const scopes = await loadScopes(d, cid, letters);
  const rows = await d.db.all("SELECT t.student_id, t.syllable, t.seconds FROM syllable_times t JOIN student_class_history h ON h.student_id=t.student_id AND h.to_date IS NULL JOIN students k ON k.id=t.student_id WHERE h.class_id=? AND k.active=1 ORDER BY t.student_id, t.syllable, t.seq", [cid]) as { student_id: string; syllable: string; seconds: number }[];
  const roundRows = await d.db.all("SELECT r.student_id, COUNT(*) AS n FROM rounds r JOIN student_class_history h ON h.student_id=r.student_id AND h.to_date IS NULL JOIN students k ON k.id=r.student_id WHERE h.class_id=? AND k.active=1 GROUP BY r.student_id", [cid]) as { student_id: string; n: number }[];
  const roundsOf: Record<string, number> = {};
  roundRows.forEach((x) => { roundsOf[x.student_id] = Number(x.n); });
  const times: Record<string, Record<string, number[]>> = {};
  rows.forEach((x) => { ((times[x.student_id] ||= {})[x.syllable] ||= []).push(x.seconds); });
  const list = kids.map((k) => {
    const scope = new Set<string>(); letters.filter((l) => !excluded.has(k.id + "|" + l)).forEach((l) => (scopes[l] || []).forEach((s) => scope.add(s)));
    const own = times[k.id] || {}, total = scope.size, hasData = total > 0 && Object.keys(own).length > 0;
    const mastered = hasData ? [...scope].filter((s) => own[s] && isMastered(own[s], cfg, s).status === "mastered").length : 0;
    const rounds = roundsOf[k.id] || 0;
    return { id: k.id, name: k.name, mastered, total, rounds, percent: hasData ? Math.round((mastered / total) * 1000) / 10 : null as number | null, group: "nodata" as string, rank: null as number | null };
  });
  const rated = list.filter((x) => x.percent !== null), med = rated.length ? median(rated.map((x) => x.percent as number)) : null, eps = 1e-9;
  const pcts = rated.map((x) => x.percent as number);
  rated.forEach((x) => { const p = x.percent as number; x.rank = Math.round(((pcts.filter((v) => v < p).length + pcts.filter((v) => v === p).length / 2) / pcts.length) * 1e6) / 1e4; });
  const thr = rated.length ? Math.max(band / 2, Math.min(...rated.map((x) => Math.abs((x.rank as number) - 50)))) : 0;
  rated.forEach((x) => { const dist = (x.rank as number) - 50; x.group = Math.abs(dist) <= thr + eps ? "average" : dist > 0 ? "over" : "under"; });
  const mid = rated.filter((x) => x.group === "average").map((x) => x.percent as number);
  list.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || (a.name < b.name ? -1 : 1));
  return { band, median: med === null ? null : Math.round(med * 10) / 10, midFrom: mid.length ? Math.min(...mid) : null, midTo: mid.length ? Math.max(...mid) : null, children: list };
}

export function evaluationRoutes() {
  const r = new Hono<Env>(), staff = requireStaff("admin", "schulleitung", "lehrer");

  // ---------- Ein Kind: Lernstufen, Buchstaben, trainierte Silben ----------
  r.get("/students/:id/evaluation", authenticate, staff, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const cfg = (await activeConfig(d)).config, tr = await studentTraining(d, id, cfg), name = await d.db.first<{ display_name: string }>("SELECT display_name FROM students WHERE id=?", [id]);
    const all = [...new Set(Object.values(tr.scopes).flat())], con = blockCon(all, tr.blocks);
    // Gesamtstand je Stufe (alle Silben aller Buchstaben des Kindes)
    const plan = stagePlan(all, undefined, con), master = (s: string) => isMastered(tr.times[s], cfg, s).status === "mastered";
    // Stufe 2 (Kontrast) wird nach der Kontrastzeit bewertet, alle anderen Stufen nach der normalen Silbenzeit
    const masterIn = (st: number) => (s: string): boolean => st === 2 ? contrastStat(tr.times[kKey(s)], cfg).status === "mastered" : master(s);
    const doneIn = (st: number) => (s: string): boolean => (tr.times[st === 2 ? kKey(s) : s] || []).length > 0;
    const sp = studentSylPlan(tr, cfg), openNow = new Set(sp ? [...sp.fresh, ...sp.building, ...sp.weak] : []);   // freigeschaltete, noch nicht sichere Silben
    const stages = plan.map((g) => {
      const total = g.syllables.length, mastered = g.syllables.filter(masterIn(g.stage)).length, processed = g.syllables.filter(doneIn(g.stage)).length;
      const unlocked = g.syllables.filter((x) => openNow.has(x)).length;
      const status = !total ? "empty" : mastered === total ? "done" : g.stage === 2 || unlocked > 0 ? "active" : "locked";
      return { stage: g.stage, name: g.name, structure: g.structure, status, unlocked, total, processed, mastered, open: total - mastered,
        subs: g.subs.map((u) => ({ id: u.id, name: u.name, total: u.syllables.length, mastered: u.syllables.filter(masterIn(g.stage)).length })) };
    });
    const stageRowsOf = (scope: string[]): StageRow[] => {
      const mem = new Map<number, string[]>(); for (let k = 1; k <= STAGE_COUNT; k++) mem.set(k, []);
      scope.forEach((x) => { const c = classifySyllable(x); mem.get(c.stage)!.push(x); if (con.has(x)) mem.get(2)!.push(x); });
      return [...mem.keys()].map((k) => {
        const list = mem.get(k)!, mas = list.filter(masterIn(k)).length, proc = list.filter(doneIn(k)).length, act = k === 2 ? mas < list.length : list.some((x) => openNow.has(x));
        return { stage: k, status: !list.length ? "empty" : mas === list.length ? "done" : act ? "active" : "locked", total: list.length, processed: proc, mastered: mas, open: list.length - mas } as StageRow;
      });
    };
    const letters = Object.keys(tr.scopes).map((l, i) => { const rows = stageRowsOf(tr.scopes[l]), cur = rows.find((x) => x.status === "active" || x.status === "locked"); return { letter: l, order: i + 1, current: cur ? cur.stage : null, window: rows.filter((x) => x.status === "active").map((x) => x.stage), stages: rows }; });
    // Trainierte Silben (mindestens eine Messung), nach Stufe sortiert
    const trained = Object.keys(tr.times).filter((k) => !isKKey(k)).map((s) => sylRow(s, tr.times, tr.maxSeq, cfg, con))
      .sort((x, y) => x.stage - y.stage || x.length - y.length || (x.syllable < y.syllable ? -1 : 1));
    // Aktive Silben: freigeschaltet und noch nicht sicher (werden gerade geübt)
    const active = [...openNow].map((s) => sylRow(s, tr.times, tr.maxSeq, cfg, con))
      .sort((x, y) => x.stage - y.stage || x.length - y.length || (x.syllable < y.syllable ? -1 : 1)).slice(0, MAX_ROWS);
    return c.json({
      student: { id, name: name ? name.display_name : "" }, active, enabled: !!cfg.stages.enabled, gatePercent: cfg.stages.gate_percent, mix: { fresh: cfg.stages.mix_new_percent, weak: cfg.stages.mix_weak_percent, review: cfg.stages.mix_review_percent },
      minMeasurements: cfg.mastery.min_measurements, timeLimits: cfg.mastery.time_limit_seconds,
      stages, letters, syllables: trained,
    });
  });

  // Alle Silben einer Stufe für ein Kind (auch noch nicht geübte), höchstens MAX_ROWS
  r.get("/students/:id/stages/:n", authenticate, staff, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), n = Number(c.req.param("n")), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    if (!Number.isInteger(n) || n < 1 || n > STAGE_COUNT) throw fail(400, "Stufe 1 bis 7 erwartet");
    const cfg = (await activeConfig(d)).config, tr = await studentTraining(d, id, cfg), all = [...new Set(Object.values(tr.scopes).flat())], con = blockCon(all, tr.blocks);
    const sp2 = studentSylPlan(tr, cfg), g = stagePlan(all, undefined, con).find((x) => x.stage === n)!, list = g.syllables.slice(0, MAX_ROWS);
    return c.json({ stage: n, name: g.name, total: g.syllables.length, truncated: g.syllables.length > list.length, syllables: list.map((s) => sylRow(s, tr.times, tr.maxSeq, cfg, con, sp2 ? new Set(sp2.locked) : undefined)) });
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
    return c.json({ classId: cid, students: kids.length, letters, ...(await childGroups(d, cid, rel.map((x) => x.letter), excluded)) });
  });

  // Mittelfeld-Anteil (Prozent der Kinder, 5er-Schritte) je Klasse einstellen
  r.put("/classes/:cid/band", authenticate, staff, async (c) => {
    const d = c.get("deps"), cid = c.req.param("cid"), a = await canAccessClass(d.db, c.get("p"), cid);
    if (!a.ok) throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId as string);
    const b = await body(c), band = Number(b.band);
    if (!Number.isInteger(band) || band < 10 || band > 100 || band % 5) throw fail(400, "band: Vielfaches von 5 zwischen 10 und 100 erwartet");
    await d.db.run("UPDATE classes SET mid_share=? WHERE id=?", [band, cid]);
    return c.json({ band });
  });

  // ---------- Mögliche Silben der Klasse mit Stufe und Unterkategorie ----------
  // Ohne ?stage: nur Zahlen je Stufe und Unterkategorie. Mit ?stage=N: die Silben dieser Stufe (höchstens 1500).
  r.get("/classes/:cid/syllables", authenticate, staff, async (c) => {
    const d = c.get("deps"), cid = c.req.param("cid"), a = await canAccessClass(d.db, c.get("p"), cid);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const rel = await d.db.all<{ letter: string }>("SELECT letter FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [cid]), letters = rel.map((x) => x.letter);
    // Alle Silben des festen Umfangs (auch gesperrte, damit Lehrkräfte sie wieder freigeben können); Zahlen zählen nur nicht gesperrte
    const blocked = await loadBlocked(d, cid), ex = await loadScopesEx(d, cid, letters), possible = [...new Set(Object.values(ex.full).flat())], con = blockCon(possible, ex.fullBlocks), plan = stagePlan(possible, undefined, con), active = (xs: string[]) => xs.filter((s) => !blocked.has(s)).length;
    // Stufe 2 besteht aus den gespeicherten Kontrastblöcken (Schlüssel z. B. la+ma+pa), nicht aus einzelnen Silben
    const blockKeys = ex.fullBlocks.map((b) => [...b].sort().join("+")), activeBlocks = blockKeys.filter((k) => !blocked.has(k)).length;
    const stageQ = c.req.query("stage"), summary = plan.map((g) => g.stage === 2
      ? { stage: g.stage, name: g.name, structure: g.structure, total: activeBlocks, blocked: blockKeys.length - activeBlocks, blocks: true, subs: g.subs.map((u) => ({ id: u.id, name: u.name, total: activeBlocks })) }
      : { stage: g.stage, name: g.name, structure: g.structure, total: active(g.syllables), blocked: g.syllables.length - active(g.syllables),
      subs: g.subs.map((u) => ({ id: u.id, name: u.name, total: active(u.syllables) })) });
    if (stageQ === undefined) return c.json({ letters, total: active(possible), blocked: possible.length - active(possible), stages: summary });
    const n = Number(stageQ);
    if (!Number.isInteger(n) || n < 1 || n > STAGE_COUNT) throw fail(400, "Stufe 1 bis 7 erwartet");
    const order = new Map(letters.map((l, i) => [l, i]));
    const g = plan.find((x) => x.stage === n)!, list = g.syllables.slice(0, MAX_ROWS);
    if (n === 2) {
      const bl = blockKeys.slice(0, MAX_ROWS);
      return c.json({ stage: 2, name: g.name, blocks: true, total: activeBlocks, blocked: blockKeys.length - activeBlocks, truncated: blockKeys.length > bl.length, subs: g.subs.map((u) => ({ id: u.id, name: u.name, syllables: bl.map((k) => {
        const parts = k.split("+"), ls = uniqLetters(parts.join("")), newest = ls.slice().sort((p1, p2) => (order.get(p2) ?? 0) - (order.get(p1) ?? 0))[0];
        return { syllable: k, parts, letters: ls, newestLetter: newest, length: k.length, contrast: true, block: true, blocked: blocked.has(k) };
      }) })) });
    }
    return c.json({ stage: n, name: g.name, total: active(g.syllables), blocked: g.syllables.length - active(g.syllables), truncated: g.syllables.length > list.length,
      subs: g.subs.map((u) => ({ id: u.id, name: u.name, syllables: u.syllables.filter((s) => list.indexOf(s) >= 0).map((s) => {
        const cl = classifySyllable(s), ls = uniqLetters(s), newest = ls.slice().sort((p1, p2) => (order.get(p2) ?? 0) - (order.get(p1) ?? 0))[0];
        return { syllable: s, parts: cl.parts, letters: ls, newestLetter: newest, length: s.length, contrast: con.has(s), blocked: blocked.has(s) };
      }) })) });
  });
  return r;
}
