import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { DEFAULT_CONFIG, validateConfig, withDefaults, type SilbenflugConfig } from "@silbenflug/shared";
import type { Env, Deps } from "./context";
import { isWritable, type SchoolLicense } from "./license";

export const fail = (status: 400 | 401 | 403 | 404 | 409 | 423 | 429, error: string) => new HTTPException(status, { message: error });
export const nowIso = (d: Deps) => (d.now ? d.now() : new Date()).toISOString();
export const nowDate = (d: Deps) => (d.now ? d.now() : new Date());
export const newId = () => crypto.randomUUID();

export async function body(c: Context<Env>): Promise<Record<string, any>> {
  try { const b = await c.req.json(); if (b && typeof b === "object" && !Array.isArray(b)) return b; } catch { /* fällt unten */ }
  throw fail(400, "JSON-Objekt erwartet");
}
export function str(v: unknown, name: string, max = 200): string {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw fail(400, `${name}: Text (1 bis ${max} Zeichen) erwartet`);
  return v.trim();
}
export function email(v: unknown): string {
  const e = str(v, "email", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw fail(400, "email: ungültige Adresse");
  return e;
}
export async function audit(d: Deps, actor: string | null, action: string, target: string | null, details?: unknown) {
  await d.db.run("INSERT INTO audit_log(id,actor,action,target,at,details) VALUES(?,?,?,?,?,?)", [newId(), actor, action, target, nowIso(d), details === undefined ? null : JSON.stringify(details)]);
}

// Aktive Konfiguration. Gibt es noch keine, wird die Standardkonfiguration als Version 1 gespeichert.
export async function activeConfig(d: Deps): Promise<{ version: number; config: SilbenflugConfig }> {
  let row = await d.db.first<{ version: number; json: string }>("SELECT version, json FROM config_versions WHERE is_active=1");
  if (!row) {
    await d.db.run("INSERT INTO config_versions(json,valid_from,changed_by,change_note,is_active) SELECT ?,?,?,?,1 WHERE NOT EXISTS (SELECT 1 FROM config_versions WHERE is_active=1)", [JSON.stringify(DEFAULT_CONFIG), nowIso(d), "system", "Standardkonfiguration"]);
    row = await d.db.first("SELECT version, json FROM config_versions WHERE is_active=1");
  }
  return { version: row!.version, config: withDefaults(JSON.parse(row!.json)) };
}
export function parseConfig(input: unknown): SilbenflugConfig {
  if (!input || typeof input !== "object") throw fail(400, "config: Objekt erwartet");
  for (const k of ["syl_time", "auto", "round", "mastery", "award", "unlock", "retention", "security"] as const) if (!(input as any)[k] || typeof (input as any)[k] !== "object") throw fail(400, `config.${k} fehlt`);
  const c = withDefaults(input as Partial<SilbenflugConfig>);   // neue Abschnitte (z. B. stages) dürfen fehlen und werden ergänzt
  const errs = validateConfig(c);
  if (errs.length) throw new HTTPException(400, { message: errs.join("; ") });
  return c;
}

// Schreibzugriffe mit Lernaktivität/Verwaltung nur bei gültiger Lizenz (Lesen bleibt bei abgelaufener Lizenz möglich).
export async function assertSchoolWritable(d: Deps, schoolId: string) {
  const s = await d.db.first<SchoolLicense>("SELECT license_status, license_end, active, payment_confirmed_at FROM schools WHERE id=?", [schoolId]);
  if (!s) throw fail(404, "nicht gefunden");
  if (!isWritable(s, nowDate(d))) throw fail(403, "Lizenz nicht aktiv oder abgelaufen: Änderungen sind gesperrt");
}
