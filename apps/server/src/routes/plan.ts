// Klassenlernplan: Buchstabenfreigabe (mit festem Silbenumfang), Ausnahmen einzelner Kinder.
import { Hono } from "hono";
import { syllableScope, groupScope, scopeParams, rebuildAfterDelete, resumeScope, blockScope, groupBlocks, isBlockKey } from "@silbenflug/engine";
import type { ReleaseRef } from "@silbenflug/engine";
import type { Env } from "../context";
import { authenticate, requireStaff } from "../middleware";
import { canAccessClass, canAccessStudent } from "../permissions";
import { assertSchoolWritable, activeConfig, audit, body, fail, newId, nowIso } from "../util";
import type { Db } from "../db";

const ROWS_PER_STMT = 14; // D1 erlaubt höchstens 100 Parameter je Anweisung (hier 6 je Zeile)
// Wurde in der Klasse seit dem Zeitpunkt (Freigabe eines Buchstabens) schon gespielt? Löschen ist nur davor möglich, danach nur Pausieren.
export async function playedSince(db: Db, classId: string, releasedAt: string): Promise<boolean> {
  return !!(await db.first("SELECT 1 AS x FROM rounds r JOIN student_class_history h ON h.student_id=r.student_id AND h.to_date IS NULL WHERE h.class_id=? AND r.played_at>=? LIMIT 1", [classId, releasedAt]));
}
// Buchstaben, die ein Kind üben darf: aktive (nicht pausierte) Freigaben seiner aktuellen Klasse in Reihenfolge, ohne seine Ausnahmen
export async function studentLetters(db: Db, studentId: string): Promise<{ classId: string | null; letters: string[] }> {
  const h = await db.first<{ class_id: string }>("SELECT class_id FROM student_class_history WHERE student_id=? AND to_date IS NULL", [studentId]);
  if (!h) return { classId: null, letters: [] };
  const rel = await db.all<{ letter: string }>("SELECT letter FROM class_letter_releases WHERE class_id=? AND paused_at IS NULL ORDER BY release_order", [h.class_id]);
  const ex = new Set((await db.all<{ letter: string }>("SELECT letter FROM student_letter_exclusions WHERE student_id=?", [studentId])).map((x) => x.letter));
  return { classId: h.class_id, letters: rel.map((x) => x.letter).filter((l) => !ex.has(l)) };
}

export function planRoutes() {
  const r = new Hono<Env>();
  for (const path of ["/classes/*", "/students/*"]) r.use(path, authenticate);
  const staff = requireStaff("admin", "schulleitung", "lehrer");

  const cls = async (c: any) => {
    const a = await canAccessClass(c.get("deps").db, c.get("p"), c.req.param("cid"));
    if (!a.ok) throw fail(404, "nicht gefunden");
    return a.schoolId as string;
  };

  r.get("/classes/:cid/plan", staff, async (c) => {
    const d = c.get("deps"), cid = c.req.param("cid"); await cls(c);
    const releases = await d.db.all<any>("SELECT l.letter, l.release_order, l.released_at, l.paused_at, l.start_group, EXISTS(SELECT 1 FROM rounds r JOIN student_class_history h ON h.student_id=r.student_id AND h.to_date IS NULL WHERE h.class_id=l.class_id AND r.played_at>=l.released_at) AS played, (SELECT COUNT(*) FROM letter_syllable_scope s WHERE s.class_id=l.class_id AND s.letter=l.letter AND s.syllable NOT LIKE '%+%' AND s.syllable NOT IN (SELECT syllable FROM class_blocked_syllables WHERE class_id=l.class_id)) AS syllable_count FROM class_letter_releases l WHERE l.class_id=? ORDER BY l.release_order", [cid]);
    const ex = await d.db.all<{ student_id: string; letter: string }>("SELECT e.student_id, e.letter FROM student_letter_exclusions e JOIN student_class_history h ON h.student_id=e.student_id AND h.to_date IS NULL WHERE h.class_id=?", [cid]);
    const byStudent: Record<string, string[]> = {};
    ex.forEach((x) => { (byStudent[x.student_id] ||= []).push(x.letter); });
    return c.json({ releases, exclusions: byStudent });
  });

  // Gibt Buchstaben frei. Die erste Freigabe einer Klasse braucht mindestens 2 Buchstaben (Startgruppe, "letters"); danach genau einen ("letter").
  // Der Silbenumfang jedes Buchstabens wird dabei einmalig berechnet und dauerhaft gespeichert.
  // Startgruppe: Alle Startbuchstaben teilen sich alle gültigen Silben der Gruppe (jeder hat denselben festen Umfang).
  // Spätere Buchstaben: nur die neuen Silben, die erst durch diesen Buchstaben entstehen.
  r.post("/classes/:cid/releases", staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), cid = c.req.param("cid"), sid = await cls(c), b = await body(c);
    await assertSchoolWritable(d, sid);
    const prev = await d.db.all<{ letter: string; release_order: number; paused_at: string | null }>("SELECT letter, release_order, paused_at FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [cid]);
    const norm = (x: unknown) => String(x ?? "").trim().toLowerCase();
    let group: string[];
    if (!prev.length) {
      group = Array.isArray(b.letters) ? [...new Set(b.letters.map(norm))] : [];
      if (group.length < 2 || group.some((l) => !/^[a-z]$/.test(l))) throw fail(400, "Die erste Freigabe braucht mindestens 2 verschiedene Buchstaben (a bis z)");
    } else {
      const l = norm(b.letter);
      if (!/^[a-z]$/.test(l)) throw fail(400, "letter: ein Buchstabe a bis z erwartet");
      if (prev.some((x) => x.letter === l)) throw fail(409, "Dieser Buchstabe ist schon freigegeben");
      group = [l];
    }
    const { version, config } = await activeConfig(d), at = nowIso(d), known = prev.filter((x) => !x.paused_at).map((x) => x.letter), sp = scopeParams(config);   // pausierte Buchstaben kommen in neuen Silben und Wörtern nicht vor
    // Der Silbenumfang wird im Browser berechnet (Free-Plan: nur 10 ms CPU je Anfrage) und hier nur geprüft und gespeichert.
    // Ohne "scopes" im Body rechnet der Server selbst (Paid-Plan, Tests).
    let scopes: Array<{ letter: string; syl: string[] }>;
    if (b.scopes !== undefined) {
      const given = Array.isArray(b.scopes) ? b.scopes : [];
      const allowed = new Set([...known, ...group]);
      scopes = group.map((l) => {
        const e = given.find((x: any) => x && norm(x.letter) === l), arr = e && Array.isArray(e.syllables) ? e.syllables : null;
        if (!arr || arr.length > 3000) throw fail(400, "scopes: Silbenliste je Buchstabe erwartet");
        const syl: string[] = [...new Set<string>(arr.map((x: unknown) => String(x)))];
        const okLetters = prev.length ? allowed : new Set(group);
        if (syl.some((w) => !/^[a-z]{1,30}$/.test(w) || [...w].some((ch) => !okLetters.has(ch)) || (prev.length > 0 && !w.includes(l)))) throw fail(400, "scopes: ungültige Silbe");
        return { letter: l, syl };
      });
      // Kontrastblöcke (Stufe 2) werden immer vom Server erzeugt und mit dem Umfang fest gespeichert
      scopes = scopes.map((sc, i) => ({ letter: sc.letter, syl: [...sc.syl, ...(prev.length ? blockScope(known, sc.letter) : groupBlocks(group))] }));
    } else {
      const groupSyl = prev.length ? [] : groupScope(group, sp);
      scopes = group.map((l) => ({ letter: l, syl: prev.length ? syllableScope(known, l, sp) : groupSyl }));
    }
    if (!prev.length && !scopes.some((x) => x.syl.some((w) => !isBlockKey(w)))) throw fail(400, "Mit diesen Buchstaben lassen sich keine Silben bilden. Bitte auch einen Vokal wählen.");
    const stmts: Array<{ sql: string; params: Array<string | number> }> = [];
    scopes.forEach((sc, i) => {
      stmts.push({ sql: "INSERT INTO class_letter_releases(class_id,letter,release_order,released_at,released_by,start_group) VALUES(?,?,?,?,?,?)", params: [cid, sc.letter, prev.length + i + 1, at, p.id, prev.length ? 0 : 1] });
      for (let k = 0; k < sc.syl.length; k += ROWS_PER_STMT) {
        const part = sc.syl.slice(k, k + ROWS_PER_STMT);
        stmts.push({ sql: "INSERT INTO letter_syllable_scope(class_id,letter,syllable,syl_length,fixed_at,config_version) VALUES " + part.map(() => "(?,?,?,?,?,?)").join(","), params: part.flatMap((s) => [cid, sc.letter, s, s.length, at, version]) });
      }
    });
    await d.db.batch(stmts);
    await audit(d, p.id, "letters_released", cid, { letters: group, syllables: scopes.map((x) => x.syl.filter((w) => !isBlockKey(w)).length), blocks: scopes.map((x) => x.syl.filter(isBlockKey).length) });
    return c.json({ released: scopes.map((x) => ({ letter: x.letter, syllableCount: x.syl.filter((w) => !isBlockKey(w)).length, blockCount: x.syl.filter(isBlockKey).length })) }, 201);
  });

  type Rel = { letter: string; release_order: number; released_at: string; start_group: number; paused_at: string | null };
  const loadReleases = (d: { db: Db }, cid: string) => d.db.all<Rel>("SELECT letter, release_order, released_at, start_group, paused_at FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [cid]);
  const chunks = (cid: string, letter: string, syl: string[], at: string, version: number) => {
    const out: Array<{ sql: string; params: Array<string | number> }> = [];
    for (let k = 0; k < syl.length; k += ROWS_PER_STMT) {
      const part = syl.slice(k, k + ROWS_PER_STMT);
      out.push({ sql: "INSERT INTO letter_syllable_scope(class_id,letter,syllable,syl_length,fixed_at,config_version) VALUES " + part.map(() => "(?,?,?,?,?,?)").join(",") + " ON CONFLICT(class_id,letter,syllable) DO NOTHING", params: part.flatMap((s) => [cid, letter, s, s.length, at, version]) });
    }
    return out;
  };
  const cleanSyl = (arr: unknown, what: string): string[] => {
    if (!Array.isArray(arr) || arr.length > 3000) throw fail(400, `${what}: Silbenliste erwartet`);
    const syl = [...new Set<string>(arr.map((x: unknown) => String(x)))];
    if (syl.some((w) => !/^[a-z]{1,30}$/.test(w))) throw fail(400, `${what}: ungültige Silbe`);
    return syl;
  };

  // Buchstabe löschen (Tippfehler zurücknehmen): nur, solange seit seiner Freigabe in der Klasse keine Runde gespielt wurde.
  // Danach bleibt nur Pausieren. Der Umfang der später freigegebenen Buchstaben (bei Startbuchstaben aller) wird neu berechnet
  // (im Browser, Body "scopes": [{letter, syllables}]; ohne rechnet der Server selbst).
  r.delete("/classes/:cid/releases/:letter", staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), cid = c.req.param("cid"), sid = await cls(c), letter = c.req.param("letter").toLowerCase();
    await assertSchoolWritable(d, sid);
    let b: Record<string, any> = {};
    try { b = (await c.req.json()) ?? {}; } catch { b = {}; }
    const rel = await loadReleases(d, cid), me = rel.find((x) => x.letter === letter);
    if (!me) throw fail(404, "Dieser Buchstabe ist nicht freigegeben");
    if (await playedSince(d.db, cid, me.released_at)) throw fail(409, "Es wurde schon gespielt. Der Buchstabe kann nur noch pausiert werden.");
    const rest = rel.filter((x) => x.letter !== letter);
    if (rest.length < 2 || (me.start_group && rest.filter((x) => x.start_group).length < 2)) throw fail(409, "Die Startgruppe braucht mindestens 2 Buchstaben.");
    const order: ReleaseRef[] = rel.map((x) => ({ letter: x.letter, start: !!x.start_group, paused: !!x.paused_at })), { version, config } = await activeConfig(d), at = nowIso(d);
    let scopes: Record<string, string[]>;
    if (b.scopes !== undefined) {
      const given = Array.isArray(b.scopes) ? b.scopes : [];
      const affected = me.start_group ? rest.filter((x) => !x.paused_at) : rest.filter((x) => x.release_order > me.release_order && !x.start_group && !x.paused_at);
      scopes = {};
      for (const a of affected) {
        const e = given.find((x: any) => x && String(x.letter ?? "").toLowerCase() === a.letter), syl = cleanSyl(e && e.syllables, "scopes");
        const upTo = rest.filter((x) => !x.paused_at && (a.start_group ? !!x.start_group : x.release_order <= a.release_order)).map((x) => x.letter), ok = new Set(upTo);
        if (syl.some((w) => [...w].some((ch) => !ok.has(ch)) || (!a.start_group && !w.includes(a.letter)))) throw fail(400, "scopes: ungültige Silbe");
        scopes[a.letter] = syl;
      }
    } else scopes = rebuildAfterDelete(order, letter, scopeParams(config));
    const startLetters = rest.filter((x) => x.start_group).map((x) => x.letter);
    if (me.start_group && !startLetters.some((l) => (scopes[l] || []).length)) throw fail(400, "Mit den übrigen Startbuchstaben lassen sich keine Silben bilden. Bitte auch einen Vokal wählen.");
    const stmts: Array<{ sql: string; params: Array<string | number> }> = [{ sql: "DELETE FROM letter_syllable_scope WHERE class_id=? AND letter=?", params: [cid, letter] }];
    for (const l of Object.keys(scopes)) { stmts.push({ sql: "DELETE FROM letter_syllable_scope WHERE class_id=? AND letter=?", params: [cid, l] }); stmts.push(...chunks(cid, l, scopes[l], at, version)); }
    stmts.push({ sql: "DELETE FROM class_letter_releases WHERE class_id=? AND letter=?", params: [cid, letter] });
    stmts.push({ sql: "UPDATE class_letter_releases SET release_order=release_order-1 WHERE class_id=? AND release_order>?", params: [cid, me.release_order] });
    stmts.push({ sql: "DELETE FROM student_letter_exclusions WHERE letter=? AND student_id IN (SELECT student_id FROM student_class_history WHERE class_id=? AND to_date IS NULL)", params: [letter, cid] });
    stmts.push({ sql: "DELETE FROM class_blocked_syllables WHERE class_id=? AND syllable NOT IN (SELECT syllable FROM letter_syllable_scope WHERE class_id=?)", params: [cid, cid] });
    await d.db.batch(stmts);
    await audit(d, p.id, "letter_deleted", cid, { letter, recomputed: Object.keys(scopes) });
    return c.json({ deleted: letter, recomputed: Object.keys(scopes) });
  });

  // Buchstabe pausieren / fortsetzen. Pausieren geht erst nach einer gespielten Runde (davor: löschen) und nur, wenn mindestens 2 Buchstaben aktiv bleiben.
  // Fortsetzen ergänzt den Umfang um neue Silben mit den inzwischen freigegebenen Buchstaben; Bestehendes bleibt (Body "scope": [Silben], sonst rechnet der Server).
  r.put("/classes/:cid/releases/:letter/pause", staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), cid = c.req.param("cid"), sid = await cls(c), letter = c.req.param("letter").toLowerCase(), b = await body(c);
    await assertSchoolWritable(d, sid);
    if (typeof b.paused !== "boolean") throw fail(400, "paused (true/false) erwartet");
    const rel = await loadReleases(d, cid), me = rel.find((x) => x.letter === letter);
    if (!me) throw fail(404, "Dieser Buchstabe ist nicht freigegeben");
    if (b.paused) {
      if (me.paused_at) return c.json({ letter, paused: true });
      if (!(await playedSince(d.db, cid, me.released_at))) throw fail(409, "Es wurde noch nicht gespielt. Der Buchstabe kann gelöscht werden.");
      if (rel.filter((x) => !x.paused_at && x.letter !== letter).length < 2) throw fail(409, "Mindestens 2 Buchstaben müssen aktiv bleiben.");
      await d.db.run("UPDATE class_letter_releases SET paused_at=? WHERE class_id=? AND letter=?", [nowIso(d), cid, letter]);
      await audit(d, p.id, "letter_paused", cid, { letter });
      return c.json({ letter, paused: true });
    }
    if (!me.paused_at) return c.json({ letter, paused: false, added: 0 });
    const { version, config } = await activeConfig(d), at = nowIso(d), active = rel.filter((x) => !x.paused_at).map((x) => x.letter), later = rel.filter((x) => !x.paused_at && x.release_order > me.release_order).map((x) => x.letter);
    const mine = (await d.db.all<{ syllable: string }>("SELECT syllable FROM letter_syllable_scope WHERE class_id=? AND letter=?", [cid, letter])).map((x) => x.syllable);
    let add: string[];
    if (b.scope !== undefined) {
      add = cleanSyl(b.scope, "scope");
      const ok = new Set([...active, letter]), lat = new Set(later);
      if (add.some((w) => [...w].some((ch) => !ok.has(ch)) || !w.includes(letter) || ![...w].some((ch) => lat.has(ch)))) throw fail(400, "scope: ungültige Silbe");
    } else add = resumeScope(active, later, letter, mine, scopeParams(config));
    const known = new Set((await d.db.all<{ syllable: string }>("SELECT DISTINCT syllable FROM letter_syllable_scope WHERE class_id=?", [cid])).map((x) => x.syllable));
    add = add.filter((w) => !known.has(w));   // nichts doppelt, bestehender Umfang bleibt unverändert
    await d.db.batch([{ sql: "UPDATE class_letter_releases SET paused_at=NULL WHERE class_id=? AND letter=?", params: [cid, letter] }, ...chunks(cid, letter, add, at, version)]);
    await audit(d, p.id, "letter_resumed", cid, { letter, added: add.length });
    return c.json({ letter, paused: false, added: add.length });
  });

  r.get("/classes/:cid/releases/:letter/scope", staff, async (c) => {
    const d = c.get("deps"); await cls(c);
    const rows = await d.db.all<{ syllable: string }>("SELECT syllable FROM letter_syllable_scope WHERE class_id=? AND letter=? AND syllable NOT LIKE '%+%' ORDER BY syl_length, syllable", [c.req.param("cid"), c.req.param("letter").toLowerCase()]);
    return c.json(rows.map((x) => x.syllable));
  });

  // Gesperrte Silben der Klasse: gelten für alle Kinder, bleiben im festen Silbenumfang, zählen aber nicht mehr als freigegeben
  r.get("/classes/:cid/blocked-syllables", staff, async (c) => {
    const d = c.get("deps"); await cls(c);
    const rows = await d.db.all<{ syllable: string }>("SELECT syllable FROM class_blocked_syllables WHERE class_id=? ORDER BY syllable", [c.req.param("cid")]);
    return c.json({ syllables: rows.map((x) => x.syllable) });
  });
  r.put("/classes/:cid/blocked-syllables", staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), cid = c.req.param("cid"), sid = await cls(c), b = await body(c);
    await assertSchoolWritable(d, sid);
    const syl = String(b.syllable ?? "").trim().toLowerCase();
    if (!/^[a-z]{1,30}(\+[a-z]{1,30}){0,3}$/.test(syl) || typeof b.blocked !== "boolean") throw fail(400, "syllable (Text, bei Kontrastblöcken z. B. la+ma+pa) und blocked (true/false) erwartet");
    if (!(await d.db.first("SELECT 1 AS x FROM letter_syllable_scope WHERE class_id=? AND syllable=? LIMIT 1", [cid, syl]))) throw fail(404, "Diese Silbe gehört nicht zum Silbenumfang der Klasse");
    if (b.blocked) await d.db.run("INSERT INTO class_blocked_syllables(class_id,syllable,blocked_at,blocked_by) VALUES(?,?,?,?) ON CONFLICT(class_id,syllable) DO NOTHING", [cid, syl, nowIso(d), p.id]);
    else await d.db.run("DELETE FROM class_blocked_syllables WHERE class_id=? AND syllable=?", [cid, syl]);
    await audit(d, p.id, b.blocked ? "syllable_blocked" : "syllable_unblocked", cid, { syllable: syl });
    return c.json({ syllable: syl, blocked: b.blocked });
  });

  // Ausnahmen eines Kindes vom gemeinsamen Plan (nur Buchstaben, keine eigenen Zeitpläne)
  r.put("/students/:id/exclusions", staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), id = c.req.param("id"), a = await canAccessStudent(d.db, p, id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const b = await body(c), letters = Array.isArray(b.letters) ? [...new Set(b.letters.map((x: unknown) => String(x).toLowerCase()))] : null;
    if (!letters || letters.some((l) => !/^[a-z]$/.test(l as string))) throw fail(400, "letters: Liste einzelner Buchstaben erwartet");
    await d.db.batch([{ sql: "DELETE FROM student_letter_exclusions WHERE student_id=?", params: [id] }, ...letters.map((l) => ({ sql: "INSERT INTO student_letter_exclusions(student_id,letter) VALUES(?,?)", params: [id, l as string] }))]);
    await audit(d, p.id, "student_exclusions_set", id, { letters });
    return c.json({ letters });
  });
  r.get("/students/:id/plan", staff, async (c) => {
    const d = c.get("deps"), a = await canAccessStudent(d.db, c.get("p"), c.req.param("id"));
    if (!a.ok) throw fail(404, "nicht gefunden");
    return c.json(await studentLetters(d.db, c.req.param("id")));
  });
  return r;
}
