// Klassenlernplan: Buchstabenfreigabe (mit festem Silbenumfang), Ausnahmen einzelner Kinder.
import { Hono } from "hono";
import { syllableScope, groupScope, scopeParams } from "@silbenflug/engine";
import type { Env } from "../context";
import { authenticate, requireStaff } from "../middleware";
import { canAccessClass, canAccessStudent } from "../permissions";
import { assertSchoolWritable, activeConfig, audit, body, fail, newId, nowIso } from "../util";
import type { Db } from "../db";

const ROWS_PER_STMT = 14; // D1 erlaubt höchstens 100 Parameter je Anweisung (hier 6 je Zeile)
// Buchstaben, die ein Kind üben darf: Freigaben seiner aktuellen Klasse in Reihenfolge, ohne seine Ausnahmen
export async function studentLetters(db: Db, studentId: string): Promise<{ classId: string | null; letters: string[] }> {
  const h = await db.first<{ class_id: string }>("SELECT class_id FROM student_class_history WHERE student_id=? AND to_date IS NULL", [studentId]);
  if (!h) return { classId: null, letters: [] };
  const rel = await db.all<{ letter: string }>("SELECT letter FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [h.class_id]);
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
    const releases = await d.db.all<any>("SELECT l.letter, l.release_order, l.released_at, (SELECT COUNT(*) FROM letter_syllable_scope s WHERE s.class_id=l.class_id AND s.letter=l.letter) AS syllable_count FROM class_letter_releases l WHERE l.class_id=? ORDER BY l.release_order", [cid]);
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
    const prev = await d.db.all<{ letter: string; release_order: number }>("SELECT letter, release_order FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [cid]);
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
    const { version, config } = await activeConfig(d), at = nowIso(d), known = prev.map((x) => x.letter), sp = scopeParams(config);
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
    } else {
      const groupSyl = prev.length ? [] : groupScope(group, sp);
      scopes = group.map((l) => ({ letter: l, syl: prev.length ? syllableScope(known, l, sp) : groupSyl }));
    }
    if (!prev.length && !scopes.some((x) => x.syl.length)) throw fail(400, "Mit diesen Buchstaben lassen sich keine Silben bilden. Bitte auch einen Vokal wählen.");
    const stmts: Array<{ sql: string; params: Array<string | number> }> = [];
    scopes.forEach((sc, i) => {
      stmts.push({ sql: "INSERT INTO class_letter_releases(class_id,letter,release_order,released_at,released_by) VALUES(?,?,?,?,?)", params: [cid, sc.letter, prev.length + i + 1, at, p.id] });
      for (let k = 0; k < sc.syl.length; k += ROWS_PER_STMT) {
        const part = sc.syl.slice(k, k + ROWS_PER_STMT);
        stmts.push({ sql: "INSERT INTO letter_syllable_scope(class_id,letter,syllable,syl_length,fixed_at,config_version) VALUES " + part.map(() => "(?,?,?,?,?,?)").join(","), params: part.flatMap((s) => [cid, sc.letter, s, s.length, at, version]) });
      }
    });
    await d.db.batch(stmts);
    await audit(d, p.id, "letters_released", cid, { letters: group, syllables: scopes.map((x) => x.syl.length) });
    return c.json({ released: scopes.map((x) => ({ letter: x.letter, syllableCount: x.syl.length })) }, 201);
  });

  r.get("/classes/:cid/releases/:letter/scope", staff, async (c) => {
    const d = c.get("deps"); await cls(c);
    const rows = await d.db.all<{ syllable: string }>("SELECT syllable FROM letter_syllable_scope WHERE class_id=? AND letter=? ORDER BY syl_length, syllable", [c.req.param("cid"), c.req.param("letter").toLowerCase()]);
    return c.json(rows.map((x) => x.syllable));
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
