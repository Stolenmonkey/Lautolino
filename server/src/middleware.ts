import type { MiddlewareHandler } from "hono";
import type { Env, Principal } from "./context";
import { sha256Hex } from "./crypto";
import { fail, nowIso } from "./util";

// Liest den Token (Authorization: Bearer ...), prüft Sitzung und Konto, setzt den angemeldeten Benutzer.
export const authenticate: MiddlewareHandler<Env> = async (c, next) => {
  const d = c.get("deps"), h = c.req.header("authorization") || "";
  const m = /^Bearer ([0-9a-f]{32,128})$/.exec(h);
  if (!m) throw fail(401, "Anmeldung erforderlich");
  const th = await sha256Hex(m[1]), now = nowIso(d);
  const st = await d.db.first<{ id: string; role: any; school_id: string | null }>(
    "SELECT u.id, u.role, u.school_id FROM sessions s JOIN staff_users u ON u.id=s.staff_user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1", [th, now]);
  let p: Principal | null = st ? { kind: "staff", id: st.id, role: st.role, schoolId: st.school_id } : null;
  if (!p) {
    const sv = await d.db.first<{ id: string; school_id: string }>(
      "SELECT k.id, k.school_id FROM student_sessions s JOIN students k ON k.id=s.student_id WHERE s.token_hash=? AND s.expires_at>? AND k.active=1", [th, now]);
    if (sv) p = { kind: "student", id: sv.id, schoolId: sv.school_id };
  }
  if (!p) {   // Elterngerät: bleibt gekoppelt, bis die Schule es widerruft (kein Ablaufdatum)
    const pd = await d.db.first<{ id: string; sid: string; school_id: string }>(
      "SELECT d.id, k.id AS sid, k.school_id FROM parent_devices d JOIN students k ON k.id=d.student_id WHERE d.device_token_hash=? AND d.revoked_at IS NULL AND k.active=1", [th]);
    if (pd) p = { kind: "parent", id: pd.sid, schoolId: pd.school_id, deviceId: pd.id };
  }
  if (!p) throw fail(401, "Anmeldung abgelaufen oder ungültig");
  c.set("p", p);
  await next();
};
export const requireStaff = (...roles: Array<"admin" | "schulleitung" | "lehrer">): MiddlewareHandler<Env> => async (c, next) => {
  const p = c.get("p");
  if (p.kind !== "staff" || roles.indexOf(p.role) < 0) throw fail(403, "Keine Berechtigung");
  await next();
};
