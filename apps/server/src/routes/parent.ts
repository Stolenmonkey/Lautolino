// Elternzugang mit Elterncode (ersetzt die frühere Geräte-Kopplung): Die Eltern geben den Elterncode ihres Kindes auf der Elternseite ein und sehen nur lesend
// Buchstaben mit Bronze/Silber/Gold (ohne Prozentwerte) und Rundenzeiten ihres Kindes. Es gibt keine Geräte-Kopplung mehr.
import { Hono } from "hono";
import { highestLevel } from "@silbenflug/engine";
import type { AwardLevel } from "@silbenflug/shared";
import type { Deps, Env } from "../context";
import { hmacHex, normalizeParentCode, randomToken, sha256Hex, verifyPassword } from "../crypto";
import { issueParentCode } from "../codes";
import { authenticate, requireStaff } from "../middleware";
import { canAccessClass, canAccessStudent } from "../permissions";
import { studentLetters } from "./plan";
import { activeConfig, assertSchoolWritable, audit, body, fail, newId, nowDate, nowIso, str } from "../util";

export function parentRoutes() {
  const r = new Hono<Env>(), staff = requireStaff("admin", "schulleitung", "lehrer");

  // ---------- Schule: Elterncode neu erzeugen, Stand ansehen ----------
  r.post("/students/:id/parent-code/regenerate", authenticate, staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), id = c.req.param("id"), a = await canAccessStudent(d.db, p, id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const code = await issueParentCode(d, id);   // der alte Code und alle Anmeldungen der Eltern enden
    await audit(d, p.id, "parent_code_regenerated", id);
    return c.json({ code });
  });
  // Kinder einer Klasse ohne gültigen Elterncode bekommen einen (für bereits vorhandene Kinder). Die Codes sind nur in dieser Antwort sichtbar.
  r.post("/classes/:cid/parent-codes/missing", authenticate, staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), cid = c.req.param("cid"), a = await canAccessClass(d.db, p, cid);
    if (!a.ok) throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);
    const kids = await d.db.all<{ id: string; display_name: string }>("SELECT k.id, k.display_name FROM students k JOIN student_class_history h ON h.student_id=k.id AND h.to_date IS NULL WHERE h.class_id=? AND k.active=1 AND NOT EXISTS (SELECT 1 FROM parent_codes pc WHERE pc.student_id=k.id AND pc.revoked_at IS NULL) ORDER BY k.display_name", [cid]);
    const out: Array<{ id: string; displayName: string; code: string }> = [];
    for (const k of kids) out.push({ id: k.id, displayName: k.display_name, code: await issueParentCode(d, k.id) });
    await audit(d, p.id, "parent_codes_created", cid, { count: out.length });
    return c.json(out, 201);
  });
  r.get("/students/:id/parent-access", authenticate, staff, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const code = await d.db.first<{ created_at: string }>("SELECT created_at FROM parent_codes WHERE student_id=? AND revoked_at IS NULL", [id]);
    const s = await d.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM parent_sessions WHERE student_id=? AND expires_at>?", [id, nowIso(d)]);
    return c.json({ hasCode: !!code, createdAt: code ? code.created_at : null, activeLogins: s?.n ?? 0 });
  });

  // ---------- Eltern: Anmeldung mit dem Elterncode (ohne Konto, Fehlversuche werden begrenzt) ----------
  const login = async (c: any) => {
    const d: Deps = c.get("deps"), b = await body(c), code = normalizeParentCode(str(b.code, "code", 60)), now = nowDate(d), sec = (await activeConfig(d)).config.security;
    const ip = await hmacHex(d.pepper, c.req.header("cf-connecting-ip") || "local"), since = new Date(now.getTime() - 3600000).toISOString();
    const n = await d.db.first("SELECT COUNT(*) AS n FROM login_attempts WHERE scope='code' AND ip_hash=? AND success=0 AND at>?", [ip, since]) as { n: number } | null;
    if ((n?.n ?? 0) >= sec.code_max_attempts_per_hour) throw fail(429, "Zu viele Versuche. Bitte später noch einmal probieren.");
    const lookup = await hmacHex(d.pepper, "eltern:" + code);
    const row: any = await d.db.first("SELECT c.code_hash, k.id AS sid, k.display_name, k.active AS kactive, s.active AS sactive FROM parent_codes c JOIN students k ON k.id=c.student_id JOIN schools s ON s.id=k.school_id WHERE c.code_lookup=? AND c.revoked_at IS NULL", [lookup]);
    const ok = !!row && (await verifyPassword(code, row.code_hash)) && row.kactive === 1 && row.sactive === 1;
    await d.db.run("INSERT INTO login_attempts(id,scope,key_hash,ip_hash,at,success) VALUES(?,?,?,?,?,?)", [newId(), "code", lookup, ip, now.toISOString(), ok ? 1 : 0]);
    if (!ok) throw fail(401, "Dieser Elterncode ist nicht richtig");
    const token = randomToken(), exp = new Date(now.getTime() + sec.parent_session_days * 86400000).toISOString();
    await d.db.run("INSERT INTO parent_sessions(id,student_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)", [newId(), row.sid, await sha256Hex(token), exp, now.toISOString()]);
    return c.json({ token, expiresAt: exp, student: { displayName: row.display_name } });
  };
  r.post("/parent/login", login);
  r.post("/parent/activate", login);   // alter Name, damit bereits geladene Elternseiten weiter funktionieren

  // ---------- Eltern: nur lesen ----------
  const parentOnly = async (c: any): Promise<string> => { const p = c.get("p"); if (p.kind !== "parent") throw fail(403, "Keine Berechtigung"); return p.id as string; };
  r.get("/parent/me", authenticate, async (c) => {
    const id = await parentOnly(c), k = await c.get("deps").db.first("SELECT display_name FROM students WHERE id=?", [id]) as { display_name: string } | null;
    return c.json({ displayName: k ? k.display_name : "" });
  });
  r.get("/parent/letters", authenticate, async (c) => {
    const d = c.get("deps"), id = await parentOnly(c), st = await studentLetters(d.db, id);
    const rows = await d.db.all<{ letter: string; level: AwardLevel }>("SELECT letter, level FROM awards WHERE student_id=?", [id]), held: Record<string, AwardLevel[]> = {};
    rows.forEach((x) => { (held[x.letter] ||= []).push(x.level); });
    return c.json({ letters: "abcdefghijklmnopqrstuvwxyz".split("").map((l) => ({ letter: l, released: st.letters.includes(l), level: highestLevel(held[l] || []) })) });
  });
  r.get("/parent/rounds", authenticate, async (c) => {
    const d = c.get("deps"), id = await parentOnly(c);
    const rounds = await d.db.all("SELECT id, played_at, seconds FROM rounds WHERE student_id=? ORDER BY played_at DESC, id DESC LIMIT 100", [id]);
    return c.json({ rounds: rounds.reverse() });
  });
  return r;
}
