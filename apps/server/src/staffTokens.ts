// Einladungs- und Zurücksetz-Links für Lehrkräfte und Schulleitung: zufällige Einmal-Tokens, zeitlich begrenzt, gespeichert nur als Hash.
import type { Deps } from "./context";
import { hmacHex, randomToken, sha256Hex } from "./crypto";
import { activeConfig, newId, nowDate, nowIso } from "./util";

export type TokenPurpose = "invite" | "reset";

export async function issueStaffToken(d: Deps, userId: string, purpose: TokenPurpose): Promise<{ token: string; expiresAt: string }> {
  const sec = (await activeConfig(d)).config.security, now = nowDate(d);
  const ms = purpose === "invite" ? sec.invite_hours * 3600000 : sec.reset_minutes * 60000, exp = new Date(now.getTime() + ms).toISOString(), token = randomToken(32);
  await d.db.batch([
    { sql: "UPDATE staff_tokens SET used_at=? WHERE staff_user_id=? AND purpose=? AND used_at IS NULL", params: [now.toISOString(), userId, purpose] },   // nur der neueste Link gilt
    { sql: "INSERT INTO staff_tokens(id,staff_user_id,purpose,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)", params: [newId(), userId, purpose, await sha256Hex(token), exp, now.toISOString()] },
  ]);
  return { token, expiresAt: exp };
}

// Der Link steht hinter # (Fragment): Er wird nicht an Webserver gesendet und taucht nicht in deren Protokollen auf.
export function tokenLink(d: Deps, purpose: TokenPurpose, token: string): string {
  const base = (d.appUrl || "").replace(/#.*$/, "");
  return base + (purpose === "invite" ? "#einladung=" : "#passwort-neu=") + token;
}

const ROLE_NAME: Record<string, string> = { lehrer: "Lehrkraft", schulleitung: "Schulleitung" };
// Sendet die Einladung. Gibt false zurück, wenn kein E-Mail-Versand eingerichtet ist oder der Versand fehlschlägt (dann wird das Konto trotzdem angelegt).
export async function sendInvite(d: Deps, userId: string, email: string, role: string): Promise<boolean> {
  if (!d.mailer || !d.appUrl) return false;
  try {
    const t = await issueStaffToken(d, userId, "invite"), hours = (await activeConfig(d)).config.security.invite_hours;
    await d.mailer({ to: email, subject: "Dein Zugang zu Lautolino", text:
      `Hallo,\n\nfür dich wurde bei Lautolino ein Zugang als ${ROLE_NAME[role] || role} angelegt.\n\nBitte lege hier dein Passwort fest:\n${tokenLink(d, "invite", t.token)}\n\n` +
      `Der Link ist ${hours} Stunden gültig und kann nur einmal benutzt werden. Danach meldest du dich mit dieser E-Mail-Adresse und deinem Passwort an.\n` +
      `Ist der Link abgelaufen, wähle auf der Anmeldeseite „Passwort vergessen“.\n\nWenn du diesen Zugang nicht erwartet hast, kannst du diese E-Mail ignorieren.\n` });
    return true;
  } catch (e) { console.error("Einladung konnte nicht gesendet werden", e instanceof Error ? e.message : e); return false; }
}
export async function sendReset(d: Deps, userId: string, email: string): Promise<void> {
  if (!d.mailer || !d.appUrl) return;
  const t = await issueStaffToken(d, userId, "reset"), min = (await activeConfig(d)).config.security.reset_minutes;
  await d.mailer({ to: email, subject: "Passwort zurücksetzen – Lautolino", text:
    `Hallo,\n\nfür deinen Zugang bei Lautolino wurde ein neues Passwort angefordert.\n\nHier kannst du ein neues Passwort festlegen:\n${tokenLink(d, "reset", t.token)}\n\n` +
    `Der Link ist ${min} Minuten gültig und kann nur einmal benutzt werden.\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail. Dein Passwort bleibt dann unverändert.\n` });
}

// Zähler für Anfragen: gleiche Adresse bzw. gleiches Netz nur begrenzt oft pro Stunde. Gespeichert werden nur HMAC-Werte.
export async function rateKey(d: Deps, scope: string, raw: string): Promise<string> { return hmacHex(d.pepper, scope + ":" + raw); }
export async function rateCount(d: Deps, scope: string, key: string): Promise<number> {
  const since = new Date(nowDate(d).getTime() - 3600000).toISOString();
  return (await d.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM rate_events WHERE scope=? AND key_hash=? AND at>?", [scope, key, since]))?.n ?? 0;
}
export async function rateAdd(d: Deps, scope: string, key: string): Promise<void> {
  await d.db.run("INSERT INTO rate_events(id,scope,key_hash,at) VALUES(?,?,?,?)", [newId(), scope, key, nowIso(d)]);
}
