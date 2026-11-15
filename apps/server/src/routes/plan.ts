// Klassenlernplan: Buchstabenfreigabe (mit festem Silbenumfang), Silbenlängen, Ausnahmen einzelner Kinder.
import { Hono } from "hono";
import { buildSyllables } from "@silbenflug/core";
import { syllableScope } from "@silbenflug/engine";
import type { Env } from "../context";
import { authenticate, requireStaff } from "../middleware";
import { canAccessClass, canAccessStudent } from "../permissions";
import { assertSchoolWritable, activeConfig, audit, body, fail, newId, nowIso } from "../util";
import type { Db } from "../db";

const ROWS_PER_STMT = 14; // D1 erlaubt höchstens 100 Parameter je Anweisung (hier 6 je Zeile)
const parseLens = (s: string) => s.split(",").map(Number).filter((x) => x >= 2 && x <= 4);

export async function classLens(db: Db, classId: string): Promise<number[]> {
  const r = await db.first<{ allowed_lengths: string }>("SELECT allowed_lengths FROM class_learning_settings WHERE class_id=?", [classId]);
  const l = parseLens(r?.allowed_lengths ?? "2,3");
  return l.length ? l : [2, 3];
}
// Buchstaben, die ein Kind üben darf: Freigaben seiner aktuellen Klasse in Reihenfolge, ohne seine Ausnahmen
export async function studentLetters(db: Db, studentId: string): Promise<{ classId: string | null; letters: string[]; lengths: number[] }> {
  const h = await db.first<{ class_id: string }>("SELECT class_id FROM student_class_history WHERE student_id=? AND to_date IS NULL", [studentId]);
  if (!h) return { classId: null, letters: [], lengths: [2, 3] };
  const rel = await db.all<{ letter: string }>("SELECT letter FROM class_letter_releases WHERE class_id=? ORDER BY release_order", [h.class_id]);
  const ex = new Set((await db.all<{ letter: string }>("SELECT letter FROM student_letter_exclusions WHERE student_id=?", [studentId])).map((x) => x.letter));
  return { classId: h.class_id, letters: rel.map((x) => x.letter).filter((l) => !ex.has(l)), lengths: await classLens(db, h.class_id) };
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
    return c.json({ allowedLengths: await classLens(d.db, cid), releases, exclusions: byStudent });
  });

  r.put("/classes/:cid/settings", staff, async (c) => {
    const d = c.get("deps"), cid = c.req.param("cid"), sid = await cls(c), b = await body(c);
    await assertSchoolWritable(d, sid);
    const lens = Array.isArray(b.allowedLengths) ? [...new Set(b.allowedLengths.map(Number))].filter((x) => x >= 2 && x <= 4).sort() : [];
    if (!lens.length) throw fail(400, "allowedLengths: mindestens eine Länge aus 2, 3, 4 erwartet");
    await d.db.run("INSERT INTO class_learning_settings(class_id,allowed_lengths,updated_at) VALUES(?,?,?) ON CONFLICT(class_id) DO UPDATE SET allowed_lengths=excluded.allowed_lengths, updated_at=excluded.updated_at", [cid, lens.join(","), nowIso(d)]);
    await audit(d, c.get("p").id, "class_lengths_set", cid, { lens });
    return c.json({ allowedLengths: lens }); // gilt für künftige Freigaben; bereits festgelegte Silbenumfänge ändern sich nie
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
    const lens = await classLens(d.db, cid), { version } = await activeConfig(d), at = nowIso(d), known = prev.map((x) => x.letter);
    const groupSyl = prev.length ? [] : lens.slice().sort((a, b) => a - b).flatMap((L) => buildSyllables(group, L));
    const scopes = group.map((l) => ({ letter: l, syl: prev.length ? syllableScope(known, l, lens) : groupSyl }));
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
    return c.json({ released: scopes.map((x) => ({ letter: x.letter, syllableCount: x.syl.length })), lengths: lens }, 201);
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
