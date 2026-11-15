// Elternzugang: Aktivierungscode (von der Schule erzeugt) koppelt ein Gerät mit einem Kind. Elterngeräte dürfen nur lesen:
// Buchstaben mit Bronze/Silber/Gold (ohne Prozentwerte) und Rundenzeiten des eigenen Kindes.
import { Hono } from "hono";
import { highestLevel } from "@silbenflug/engine";
import type { AwardLevel } from "@silbenflug/shared";
import { DEFAULT_CONFIG } from "@silbenflug/shared";
import type { Env } from "../context";
import { PBKDF2_ITERATIONS, generateParentCode, hashPassword, hmacHex, normalizeCode, randomToken, sha256Hex, verifyPassword } from "../crypto";
import { authenticate, requireStaff } from "../middleware";
import { canAccessStudent } from "../permissions";
import { studentLetters } from "./plan";
import { activeConfig, assertSchoolWritable, audit, body, fail, newId, nowDate, nowIso, str } from "../util";

export function parentRoutes() {
  const r = new Hono<Env>(), staff = requireStaff("admin", "schulleitung", "lehrer");

  // ---------- Schule: Code erzeugen, Geräte ansehen und widerrufen ----------
  r.post("/students/:id/parent-codes", authenticate, staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), id = c.req.param("id"), a = await canAccessStudent(d.db, p, id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    await assertSchoolWritable(d, a.schoolId!);   // Code erzeugen ist eine Änderung (Widerrufen bleibt immer möglich)
    const cfg = (await activeConfig(d)).config, days = cfg.security.parent_code_days ?? DEFAULT_CONFIG.security.parent_code_days;
    for (let i = 0; i < 8; i++) {
      const code = generateParentCode(), norm = normalizeCode(code), lookup = await hmacHex(d.pepper, norm);
      if (await d.db.first("SELECT 1 AS x FROM parent_activation_codes WHERE code_lookup=?", [lookup])) continue;
      const hash = await hashPassword(norm, d.iterations ?? PBKDF2_ITERATIONS), now = nowDate(d), expires = new Date(now.getTime() + days * 86400000).toISOString();
      await d.db.run("INSERT INTO parent_activation_codes(id,student_id,code_hash,code_lookup,created_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?)", [newId(), id, hash, lookup, p.id, expires, now.toISOString()]);
      await audit(d, p.id, "parent_code_created", id, { expiresAt: expires });
      return c.json({ code, expiresAt: expires }, 201);
    }
    throw new Error("Kein freier Code gefunden");
  });
  r.get("/students/:id/parent-devices", authenticate, staff, async (c) => {
    const d = c.get("deps"), id = c.req.param("id"), a = await canAccessStudent(d.db, c.get("p"), id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const devices = await d.db.all<{ id: string; linked_at: string; revoked_at: string | null }>("SELECT id, linked_at, revoked_at FROM parent_devices WHERE student_id=? ORDER BY linked_at", [id]);
    const open = await d.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM parent_activation_codes WHERE student_id=? AND used_at IS NULL AND expires_at>?", [id, nowIso(d)]);
    return c.json({ devices, openCodes: open?.n ?? 0 });
  });
  r.post("/students/:id/parent-devices/:did/revoke", authenticate, staff, async (c) => {
    const d = c.get("deps"), p = c.get("p"), id = c.req.param("id"), a = await canAccessStudent(d.db, p, id);
    if (!a.ok) throw fail(404, "nicht gefunden");
    const res = await d.db.run("UPDATE parent_devices SET revoked_at=?, revoked_by=? WHERE id=? AND student_id=? AND revoked_at IS NULL", [nowIso(d), p.id, c.req.param("did"), id]);
    if (!res.changes) throw fail(404, "nicht gefunden");
    await audit(d, p.id, "parent_device_revoked", id, { deviceId: c.req.param("did") });
    return c.json({ ok: true });
  });

  // ---------- Elterngerät koppeln (ohne Anmeldung, Fehlversuche werden begrenzt) ----------
  r.post("/parent/activate", async (c) => {
    const d = c.get("deps"), b = await body(c), code = normalizeCode(str(b.code, "code", 60)), now = nowDate(d), sec = (await activeConfig(d)).config.security;
    const ip = await hmacHex(d.pepper, c.req.header("cf-connecting-ip") || "local"), since = new Date(now.getTime() - 3600000).toISOString();
    const n = await d.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM login_attempts WHERE scope='code' AND ip_hash=? AND success=0 AND at>?", [ip, since]);
    if ((n?.n ?? 0) >= sec.code_max_attempts_per_hour) throw fail(429, "Zu viele Versuche. Bitte später noch einmal probieren.");
    const lookup = await hmacHex(d.pepper, code);
    const row = await d.db.first<any>("SELECT c.id, c.code_hash, c.expires_at, k.id AS sid, k.display_name, k.active AS kactive, s.active AS sactive FROM parent_activation_codes c JOIN students k ON k.id=c.student_id JOIN schools s ON s.id=k.school_id WHERE c.code_lookup=? AND c.used_at IS NULL", [lookup]);
    let ok = !!row && row.expires_at > now.toISOString() && (await verifyPassword(code, row.code_hash)) && row.kactive === 1 && row.sactive === 1;
    if (ok) {   // Code genau einmal verbrauchen (auch bei gleichzeitigen Versuchen)
      const used = await d.db.run("UPDATE parent_activation_codes SET used_at=? WHERE id=? AND used_at IS NULL", [now.toISOString(), row.id]);
      ok = used.changes === 1;
    }
    await d.db.run("INSERT INTO login_attempts(id,scope,key_hash,ip_hash,at,success) VALUES(?,?,?,?,?,?)", [newId(), "code", lookup, ip, now.toISOString(), ok ? 1 : 0]);
    if (!ok) throw fail(401, "Dieser Code ist nicht gültig oder abgelaufen");
    const token = randomToken(), did = newId();
    await d.db.run("INSERT INTO parent_devices(id,student_id,device_token_hash,linked_at) VALUES(?,?,?,?)", [did, row.sid, await sha256Hex(token), now.toISOString()]);
    await audit(d, null, "parent_device_linked", row.sid, { deviceId: did });
    return c.json({ token, student: { displayName: row.display_name } });
  });

  // ---------- Elterngerät: nur lesen ----------
  const parentOnly = async (c: any): Promise<string> => { const p = c.get("p"); if (p.kind !== "parent") throw fail(403, "Keine Berechtigung"); return p.id as string; };
  r.get("/parent/me", authenticate, async (c) => {
    const id = await parentOnly(c), k = await c.get("deps").db.first<{ display_name: string }>("SELECT display_name FROM students WHERE id=?", [id]);
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
