import { Hono } from "hono";
import type { Env } from "../context";
import { PBKDF2_ITERATIONS, hashPassword, hmacHex, normalizeCode, randomToken, sha256Hex, verifyPassword } from "../crypto";
import { authenticate } from "../middleware";
import { activeConfig, audit, body, email, fail, newId, nowDate, nowIso, str } from "../util";

let dummyHash: string | null = null; // gleicher Zeitaufwand, auch wenn die E-Mail nicht existiert

export function authRoutes() {
  const r = new Hono<Env>();

  r.post("/login", async (c) => {
    const d = c.get("deps"), b = await body(c), em = email(b.email), pw = str(b.password, "password");
    const sec = (await activeConfig(d)).config.security, now = nowDate(d);
    const ip = await hmacHex(d.pepper, c.req.header("cf-connecting-ip") || "local");
    const u = await d.db.first<any>("SELECT * FROM staff_users WHERE email=?", [em]);
    if (u?.locked_until && u.locked_until > now.toISOString()) throw fail(429, "Zu viele Fehlversuche. Bitte später erneut versuchen.");
    if (!u && !dummyHash) dummyHash = await hashPassword("dummy", d.iterations ?? PBKDF2_ITERATIONS);
    const ok = await verifyPassword(pw, u ? u.password_hash : dummyHash!);
    await d.db.run("INSERT INTO login_attempts(id,scope,key_hash,ip_hash,at,success) VALUES(?,?,?,?,?,?)", [newId(), "email", await sha256Hex(em), ip, now.toISOString(), u && ok ? 1 : 0]);
    if (!u || !ok) {
      if (u) {
        const f = u.failed_logins + 1;
        if (f >= sec.max_failed_logins) await d.db.run("UPDATE staff_users SET failed_logins=0, locked_until=? WHERE id=?", [new Date(now.getTime() + sec.lock_minutes * 60000).toISOString(), u.id]);
        else await d.db.run("UPDATE staff_users SET failed_logins=? WHERE id=?", [f, u.id]);
      }
      throw fail(401, "E-Mail oder Passwort falsch");
    }
    if (!u.active) throw fail(403, "Zugang ist deaktiviert");
    if (u.role !== "admin") {
      const s = await d.db.first<{ active: number }>("SELECT active FROM schools WHERE id=?", [u.school_id]);
      if (!s || !s.active) throw fail(403, "Die Schule ist noch nicht freigeschaltet");
    }
    const token = randomToken(), exp = new Date(now.getTime() + (d.staffSessionHours ?? 12) * 3600000).toISOString();
    await d.db.batch([
      { sql: "UPDATE staff_users SET failed_logins=0, locked_until=NULL WHERE id=?", params: [u.id] },
      { sql: "INSERT INTO sessions(id,staff_user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)", params: [newId(), u.id, await sha256Hex(token), exp, nowIso(d)] },
    ]);
    return c.json({ token, expiresAt: exp, user: { id: u.id, email: u.email, role: u.role, schoolId: u.school_id } });
  });

  r.post("/logout", authenticate, async (c) => {
    const d = c.get("deps"), th = await sha256Hex((c.req.header("authorization") || "").slice(7));
    await d.db.run("DELETE FROM sessions WHERE token_hash=?", [th]); await d.db.run("DELETE FROM student_sessions WHERE token_hash=?", [th]);
    return c.json({ ok: true });
  });

  r.get("/me", authenticate, (c) => c.json({ principal: c.get("p") }));

  r.post("/change-password", authenticate, async (c) => {
    const d = c.get("deps"), p = c.get("p"), b = await body(c);
    if (p.kind !== "staff") throw fail(403, "Keine Berechtigung");
    const np = str(b.newPassword, "newPassword", 200);
    if (np.length < 10) throw fail(400, "Das neue Passwort braucht mindestens 10 Zeichen");
    const u = await d.db.first<any>("SELECT password_hash FROM staff_users WHERE id=?", [p.id]);
    if (!(await verifyPassword(str(b.oldPassword, "oldPassword"), u.password_hash))) throw fail(401, "Das alte Passwort stimmt nicht");
    await d.db.run("UPDATE staff_users SET password_hash=?, updated_at=? WHERE id=?", [await hashPassword(np, d.iterations ?? PBKDF2_ITERATIONS), nowIso(d), p.id]);
    await audit(d, p.id, "password_changed", p.id);
    return c.json({ ok: true });
  });
  return r;
}
