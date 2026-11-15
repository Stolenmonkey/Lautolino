import { HTTPException } from "hono/http-exception";
import type { Deps } from "./context";
import { hashPassword, randomPassword, PBKDF2_ITERATIONS } from "./crypto";
import { audit, newId, nowIso } from "./util";

// Legt einen Zugang an und gibt das Startpasswort genau einmal zurück (wird nur als Hash gespeichert).
export async function createStaff(d: Deps, actor: string, role: "schulleitung" | "lehrer", schoolId: string, em: string) {
  if (await d.db.first("SELECT 1 AS x FROM staff_users WHERE email=?", [em])) throw new HTTPException(409, { message: "E-Mail-Adresse ist schon vergeben" });
  const pw = randomPassword(), id = newId(), at = nowIso(d);
  await d.db.run("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)", [id, em, await hashPassword(pw, d.iterations ?? PBKDF2_ITERATIONS), role, schoolId, at, at]);
  await audit(d, actor, "staff_created", id, { role, schoolId });
  return { id, email: em, role, schoolId, initialPassword: pw };
}
