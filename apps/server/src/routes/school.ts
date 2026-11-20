// Schul- und Lehrerbereich: Schuljahre, Klassen, Zugänge, Kinder. Alle Zugriffe werden pro Schule, Klasse und Kind serverseitig geprüft.
import { Hono } from "hono";
import type { Env } from "../context";
import { issueParentCode, issueStudentCode } from "../codes";
import { authenticate, requireStaff } from "../middleware";
import { canAccessClass, canAccessSchool, canAccessStudent, isAdmin } from "../permissions";
import { createStaff } from "../staff";
import { assertSchoolWritable, audit, body, email, fail, newId, nowIso, str } from "../util";

export function schoolRoutes() {
  const r = new Hono<Env>();
  for (const path of ["/schools/*", "/classes/*", "/students/*"]) r.use(path, authenticate, requireStaff("admin", "schulleitung", "lehrer"));
  const manager = requireStaff("admin", "schulleitung");

  const school = (c: any) => { const sid = c.req.param("sid"); if (!canAccessSchool(c.get("p"), sid)) throw fail(404, "nicht gefunden"); return sid as string; };

  // ----- Schuljahre und Klassen -----
  r.get("/schools/:sid/years", async (c) => c.json(await c.get("deps").db.all("SELECT id,label,start_date,end_date FROM school_years WHERE school_id=? ORDER BY start_date DESC", [school(c)])));
  r.post("/schools/:sid/years", manager, async (c) => {
    const d = c.get("deps"), sid = school(c), b = await body(c), id = newId(), at = nowIso(d);
    await assertSchoolWritable(d, sid);
    await d.db.run("INSERT INTO school_years(id,school_id,label,start_date,end_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", [id, sid, str(b.label, "label", 60), b.startDate ?? null, b.endDate ?? null, at, at]);
    return c.json({ id }, 201);
  });
  r.get("/schools/:sid/classes", async (c) => {
    const d = c.get("deps"), p = c.get("p"), sid = school(c);
    if (p.kind === "staff" && p.role === "lehrer")
      return c.json(await d.db.all("SELECT k.id,k.name,k.school_year_id,k.active FROM classes k JOIN teacher_classes t ON t.class_id=k.id WHERE k.school_id=? AND t.staff_user_id=? ORDER BY k.name", [sid, p.id]));
    return c.json(await d.db.all("SELECT id,name,school_year_id,active FROM classes WHERE school_id=? ORDER BY name", [sid]));
  });
  r.post("/schools/:sid/classes", manager, async (c) => {
    const d = c.get("deps"), sid = school(c), b = await body(c), id = newId(), at = nowIso(d);
    await assertSchoolWritable(d, sid);
    if (!(await d.db.first("SELECT 1 AS x FROM school_years WHERE id=? AND school_id=?", [String(b.schoolYearId), sid]))) throw fail(404, "Schuljahr nicht gefunden");
    await d.db.run("INSERT INTO classes(id,school_id,school_year_id,name,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)", [id, sid, b.schoolYearId, str(b.name, "name", 60), at, at]);
    return c.json({ id }, 201);
  });

  // ----- Lehrerzugänge -----
  r.get("/schools/:sid/staff", manager, async (c) => c.json(await c.get("deps").db.all(
    "SELECT u.id,u.email,u.role,u.active,(SELECT GROUP_CONCAT(class_id) FROM teacher_classes WHERE staff_user_id=u.id) AS class_ids FROM staff_users u WHERE u.school_id=? ORDER BY u.email", [school(c)])));
  r.post("/schools/:sid/staff", manager, async (c) => {
    const d = c.get("deps"), p = c.get("p"), sid = school(c), b = await body(c);
    await assertSchoolWritable(d, sid);
    const role = p.kind === "staff" && p.role === "admin" && b.role === "schulleitung" ? "schulleitung" : "lehrer"; // Schulleitung legt nur Lehrer an
    return c.json(await createStaff(d, p.id, role, sid, email(b.email)), 201);
  });
  r.patch("/schools/:sid/staff/:uid", manager, async (c) => {
    const d = c.get("deps"), p = c.get("p"), sid = school(c), b = await body(c), uid = c.req.param("uid");
    const u = await d.db.first<any>("SELECT role FROM staff_users WHERE id=? AND school_id=?", [uid, sid]);
    if (!u) throw fail(404, "nicht gefunden");
    if (u.role !== "lehrer" && !isAdmin(p)) throw fail(403, "Keine Berechtigung");
    if (typeof b.active !== "boolean") throw fail(400, "active: true oder false erwartet");
    await d.db.run("UPDATE staff_users SET active=?, updated_at=? WHERE id=?", [b.active ? 1 : 0, nowIso(d), uid]);
    if (!b.active) await d.db.run("DELETE FROM sessions WHERE staff_user_id=?", [uid]); // Zugang sofort beenden
    await audit(d, p.id, b.active ? "staff_activated" : "staff_deactivated", uid);
    return c.json({ ok: true });
  });
  r.put("/schools/:sid/staff/:uid/classes", manager, async (c) => {
    const d = c.get("deps"), p = c.get("p"), sid = school(c), b = await body(c), uid = c.req.param("uid");
    await assertSchoolWritable(d, sid);
    if (!(await d.db.first("SELECT 1 AS x FROM staff_users WHERE id=? AND school_id=? AND role='lehrer'", [uid, sid]))) throw fail(404, "nicht gefunden");
    const ids: string[] = Array.isArray(b.classIds) ? b.classIds.map(String) : [];
    for (const id of ids) if (!(await d.db.first("SELECT 1 AS x FROM classes WHERE id=? AND school_id=?", [id, sid]))) throw fail(404, "Klasse nicht gefunden");
    await d.db.batch([{ sql: "DELETE FROM teacher_classes WHERE staff_user_id=?", params: [uid] }, ...ids.map((id) => ({ sql: "INSERT INTO teacher_classes(staff_user_id,class_id) VALUES(?,?)", params: [uid, id] }))]);
    await audit(d, p.id, "teacher_classes_set", uid, { classIds: ids });
    return c.json({ ok: true });
  });

  // ----- Kinder -----
  r.get("/classes/:cid/students", async (c) => {
    const d = c.get("deps"), a = await canAccessClass(d.db, c.get("p"), c.req.param("cid"));
    if (!a.ok) throw fail(404, "nicht gefunden");
    // Klartext-Codes (code_plain) sehen nur Personal mit Zugriff auf die Klasse; null = Code vor Migration 0009 erzeugt.
    return c.json(await d.db.all("SELECT k.id, k.display_name, k.active, (SELECT code_plain FROM student_codes sc WHERE sc.student_id=k.id AND sc.revoked_at IS NULL) AS code, (SELECT code_plain FROM parent_codes pc WHERE pc.student_id=k.id AND pc.revoked_at IS NULL) AS parent_code FROM students k JOIN student_class_history h ON h.student_id=k.id AND h.to_date IS NULL WHERE h.class_id=? ORDER BY k.display_name", [c.req.param("cid")]));
  });
  // Erzeugt für Kinder, deren Code nicht im Klartext vorliegt (alte Codes), neue Codes. Die alten Codes werden dabei ungültig.
  r.post("/classes/:cid/codes/missing", async (c) => {
    const d = c.get("deps"), p = c.get("p"), cid = c.req.param("cid"), a = await canAccessClass(d.db, p, cid);
    if (!a.ok || p.kind !== "staff") throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const kids = await d.db.all<{ id: string; sc: string | null; pc: string | null }>("SELECT k.id, (SELECT code_plain FROM student_codes sc WHERE sc.student_id=k.id AND sc.revoked_at IS NULL) AS sc, (SELECT code_plain FROM parent_codes pc WHERE pc.student_id=k.id AND pc.revoked_at IS NULL) AS pc FROM students k JOIN student_class_history h ON h.student_id=k.id AND h.to_date IS NULL WHERE h.class_id=? AND k.active=1", [cid]);
    let n = 0;
    for (const k of kids) {
      if (!k.sc) { await issueStudentCode(d, k.id); await d.db.run("DELETE FROM student_sessions WHERE student_id=?", [k.id]); n++; }
      if (!k.pc) { await issueParentCode(d, k.id); n++; }
    }
    await audit(d, p.id, "codes_missing_created", cid, { count: n });
    return c.json({ created: n });
  });
  // Legt Kinder an und gibt Schülercode und Elterncode genau einmal zurück (danach nur noch neu erzeugen).
  r.post("/classes/:cid/students", async (c) => {
    const d = c.get("deps"), p = c.get("p"), cid = c.req.param("cid"), a = await canAccessClass(d.db, p, cid);
    if (!a.ok) throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const b = await body(c), names: unknown[] = Array.isArray(b.names) ? b.names : [];
    if (!names.length || names.length > 40) throw fail(400, "names: 1 bis 40 Namen erwartet");
    const out: Array<{ id: string; displayName: string; code: string; parentCode: string }> = [];
    for (const n of names) {
      const name = str(n, "Name", 60), id = newId(), at = nowIso(d);
      await d.db.batch([
        { sql: "INSERT INTO students(id,school_id,display_name,active,created_at,updated_at) VALUES(?,?,?,1,?,?)", params: [id, a.schoolId!, name, at, at] },
        { sql: "INSERT INTO student_class_history(id,student_id,class_id,from_date,to_date) VALUES(?,?,?,?,NULL)", params: [newId(), id, cid, at] },
      ]);
      out.push({ id, displayName: name, code: await issueStudentCode(d, id), parentCode: await issueParentCode(d, id) });
    }
    await audit(d, p.id, "students_created", cid, { count: out.length });
    return c.json(out, 201);
  });
  r.post("/students/:id/code/regenerate", async (c) => {
    const d = c.get("deps"), p = c.get("p"), id = c.req.param("id"), a = await canAccessStudent(d.db, p, id);
    if (!a.ok || p.kind !== "staff") throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const code = await issueStudentCode(d, id);
    await d.db.run("DELETE FROM student_sessions WHERE student_id=?", [id]); // alte Anmeldungen enden mit dem alten Code
    await audit(d, p.id, "student_code_regenerated", id);
    return c.json({ code });
  });
  r.patch("/students/:id", async (c) => {
    const d = c.get("deps"), p = c.get("p"), id = c.req.param("id"), a = await canAccessStudent(d.db, p, id);
    if (!a.ok || p.kind !== "staff") throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const b = await body(c);
    if (b.displayName !== undefined) await d.db.run("UPDATE students SET display_name=?, updated_at=? WHERE id=?", [str(b.displayName, "displayName", 60), nowIso(d), id]);
    if (typeof b.active === "boolean") {
      await d.db.run("UPDATE students SET active=?, updated_at=? WHERE id=?", [b.active ? 1 : 0, nowIso(d), id]);
      if (!b.active) await d.db.run("DELETE FROM student_sessions WHERE student_id=?", [id]);
    }
    return c.json({ ok: true });
  });
  // Klassenwechsel: Das Profil und die Lernhistorie bleiben, nur die Zuordnung wechselt (Historie bleibt nachvollziehbar).
  r.post("/students/:id/move", async (c) => {
    const d = c.get("deps"), p = c.get("p"), id = c.req.param("id"), b = await body(c), a = await canAccessStudent(d.db, p, id), t = await canAccessClass(d.db, p, String(b.classId));
    if (!a.ok || !t.ok || a.schoolId !== t.schoolId || p.kind !== "staff") throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const at = nowIso(d);
    await d.db.batch([
      { sql: "UPDATE student_class_history SET to_date=? WHERE student_id=? AND to_date IS NULL", params: [at, id] },
      { sql: "INSERT INTO student_class_history(id,student_id,class_id,from_date,to_date) VALUES(?,?,?,?,NULL)", params: [newId(), id, b.classId, at] },
    ]);
    await audit(d, p.id, "student_moved", id, { classId: b.classId });
    return c.json({ ok: true });
  });
  return r;
}
