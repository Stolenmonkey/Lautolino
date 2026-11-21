import { Hono } from "hono";
import type { Env } from "../context";
import { PBKDF2_ITERATIONS, hashPassword, hmacHex, normalizeCode, randomToken, sha256Hex, verifyPassword } from "../crypto";
import { authenticate } from "../middleware";
import { rateAdd, rateCount, rateKey, sendReset } from "../staffTokens";
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
    await d.db.run("DELETE FROM sessions WHERE token_hash=?", [th]); await d.db.run("DELETE FROM student_sessions WHERE token_hash=?", [th]); await d.db.run("DELETE FROM parent_sessions WHERE token_hash=?", [th]);
    return c.json({ ok: true });
  });

  // Passwort vergessen (Lehrkräfte und Schulleitung): Die Antwort ist immer gleich, egal ob die Adresse bekannt ist. Anfragen je Adresse und je Netz werden begrenzt.
  r.post("/forgot-password", async (c) => {
    const d = c.get("deps"), b = await body(c), em = email(b.email), sec = (await activeConfig(d)).config.security;
    const ipK = await rateKey(d, "reset-ip", c.req.header("cf-connecting-ip") || "local"), emK = await rateKey(d, "reset-mail", em);
    if ((await rateCount(d, "reset-ip", ipK)) >= sec.reset_max_per_ip_hour) throw fail(429, "Zu viele Anfragen. Bitte später noch einmal versuchen.");
    const mailCount = await rateCount(d, "reset-mail", emK);
    await rateAdd(d, "reset-ip", ipK); await rateAdd(d, "reset-mail", emK);
    const generic = { ok: true, message: "Falls diese E-Mail-Adresse bei uns hinterlegt ist, haben wir dir einen Link zum Zurücksetzen geschickt." };
    if (mailCount >= sec.reset_max_per_email_hour) return c.json(generic);   // zu oft für diese Adresse: still nichts senden (gleiche Antwort)
    const u = await d.db.first<{ id: string; role: string }>("SELECT u.id, u.role FROM staff_users u JOIN schools s ON s.id=u.school_id WHERE u.email=? AND u.active=1 AND u.role IN ('lehrer','schulleitung') AND s.active=1", [em]);
    if (u) {
      try { await sendReset(d, u.id, em); await audit(d, u.id, "password_reset_requested", u.id); } catch (e) { console.error("Reset-Mail fehlgeschlagen", e instanceof Error ? e.message : e); }
    }
    return c.json(generic);
  });

  // Neues Passwort über den Einladungs- oder Zurücksetz-Link (Einmal-Token). Danach sind alle bisherigen Anmeldungen der Person beendet.
  r.post("/set-password", async (c) => {
    const d = c.get("deps"), b = await body(c), token = str(b.token, "token", 200), np = str(b.newPassword, "newPassword", 200), now = nowDate(d);
    const ipK = await rateKey(d, "token-ip", c.req.header("cf-connecting-ip") || "local");
    if ((await rateCount(d, "token-ip", ipK)) >= 30) throw fail(429, "Zu viele Versuche. Bitte später noch einmal versuchen.");
    if (np.length < 10) throw fail(400, "Das neue Passwort braucht mindestens 10 Zeichen");
    const row = await d.db.first<{ id: string; uid: string; role: string; purpose: string }>(
      "SELECT t.id, u.id AS uid, u.role, t.purpose FROM staff_tokens t JOIN staff_users u ON u.id=t.staff_user_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>? AND u.active=1 AND u.role IN ('lehrer','schulleitung')", [await sha256Hex(token), now.toISOString()]);
    if (!row) { await rateAdd(d, "token-ip", ipK); throw fail(400, "Dieser Link ist ungültig oder abgelaufen. Bitte auf der Anmeldeseite „Passwort vergessen“ wählen."); }
    const used = await d.db.run("UPDATE staff_tokens SET used_at=? WHERE id=? AND used_at IS NULL", [now.toISOString(), row.id]);
    if (!used.changes) throw fail(400, "Dieser Link ist ungültig oder abgelaufen. Bitte auf der Anmeldeseite „Passwort vergessen“ wählen.");   // gleichzeitig schon benutzt
    await d.db.batch([
      { sql: "UPDATE staff_users SET password_hash=?, failed_logins=0, locked_until=NULL, updated_at=? WHERE id=?", params: [await hashPassword(np, d.iterations ?? PBKDF2_ITERATIONS), now.toISOString(), row.uid] },
      { sql: "UPDATE staff_tokens SET used_at=? WHERE staff_user_id=? AND used_at IS NULL", params: [now.toISOString(), row.uid] },
      { sql: "DELETE FROM sessions WHERE staff_user_id=?", params: [row.uid] },
    ]);
    await audit(d, row.uid, row.purpose === "invite" ? "password_set_by_invite" : "password_reset_done", row.uid);
    return c.json({ ok: true });
  });

  r.get("/me", authenticate, async (c) => {
    const p = c.get("p") as any;
    if (p?.kind === "staff") { const u = await c.get("deps").db.first<{ email: string }>("SELECT email FROM staff_users WHERE id=?", [p.id]); return c.json({ principal: { ...p, email: u?.email } }); }
    return c.json({ principal: p });
  });

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
