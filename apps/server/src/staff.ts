import { HTTPException } from "hono/http-exception";
import type { Deps } from "./context";
import { hashPassword, randomPassword, PBKDF2_ITERATIONS } from "./crypto";
import { sendInvite } from "./staffTokens";
import { audit, newId, nowIso } from "./util";

// Legt einen Zugang an. Das Konto bekommt ein zufälliges Passwort, das niemand kennt (nur als Hash gespeichert); die Person legt ihr Passwort über den Einladungslink in der E-Mail selbst fest.
// Nur wenn kein E-Mail-Versand eingerichtet ist (oder er fehlschlägt), wird das Startpasswort wie bisher genau einmal zurückgegeben, damit niemand ausgesperrt bleibt.
export async function createStaff(d: Deps, actor: string, role: "schulleitung" | "lehrer", schoolId: string, em: string) {
  if (await d.db.first("SELECT 1 AS x FROM staff_users WHERE email=?", [em])) throw new HTTPException(409, { message: "E-Mail-Adresse ist schon vergeben" });
  const pw = randomPassword(), id = newId(), at = nowIso(d);
  await d.db.run("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)", [id, em, await hashPassword(pw, d.iterations ?? PBKDF2_ITERATIONS), role, schoolId, at, at]);
  await audit(d, actor, "staff_created", id, { role, schoolId });
  const emailSent = await sendInvite(d, id, em, role);
  if (emailSent) await audit(d, actor, "staff_invite_sent", id);
  return { id, email: em, role, schoolId, emailSent, ...(emailSent ? {} : { initialPassword: pw }) };
}
