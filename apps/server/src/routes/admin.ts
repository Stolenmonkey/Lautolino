import { Hono } from "hono";
import type { Env } from "../context";
import { authenticate, requireStaff } from "../middleware";
import { createStaff } from "../staff";
import { applyLicenseAction, effectiveStatus, type LicenseAction } from "../license";
import { activeConfig, audit, body, email, fail, newId, nowDate, nowIso, parseConfig, str } from "../util";

export function adminRoutes() {
  const r = new Hono<Env>();
  r.use("*", authenticate, requireStaff("admin"));

  r.post("/schools", async (c) => {
    const d = c.get("deps"), p = c.get("p"), b = await body(c), id = newId(), at = nowIso(d);
    const end = b.licenseEnd == null ? null : str(b.licenseEnd, "licenseEnd", 40);
    if (end && isNaN(Date.parse(end))) throw fail(400, "licenseEnd ist kein Datum");
    await d.db.batch([
      { sql: "INSERT INTO schools(id,name,billing_data,license_status,license_start,license_end,fee,active,created_at,updated_at) VALUES(?,?,?,'angelegt',?,?,?,0,?,?)",
        params: [id, str(b.name, "name"), b.billingData == null ? null : String(b.billingData).slice(0, 2000), b.licenseStart ?? null, end, typeof b.fee === "number" ? b.fee : null, at, at] },
      { sql: "INSERT INTO license_events(id,school_id,event,by_user,at,note) VALUES(?,?,'angelegt',?,?,NULL)", params: [newId(), id, p.id, at] },
    ]);
    await audit(d, p.id, "school_created", id);
    return c.json({ id, licenseStatus: "angelegt", active: false }, 201);
  });

  r.get("/schools", async (c) => {
    const d = c.get("deps"), now = nowDate(d);
    const rows = await d.db.all<any>("SELECT id,name,license_status,license_start,license_end,fee,payment_confirmed_at,active FROM schools ORDER BY name");
    return c.json(rows.map((s) => ({ ...s, effective_status: effectiveStatus(s, now) })));
  });

  r.post("/schools/:id/license", async (c) => {
    const d = c.get("deps"), p = c.get("p"), b = await body(c), id = c.req.param("id");
    const s = await d.db.first<any>("SELECT * FROM schools WHERE id=?", [id]);
    if (!s) throw fail(404, "nicht gefunden");
    const action = str(b.action, "action") as LicenseAction, now = nowDate(d);
    const res = applyLicenseAction(s, action, now, b.licenseEnd == null ? undefined : String(b.licenseEnd));
    if (!res.ok) throw fail(409, res.error);
    await d.db.batch([
      { sql: "UPDATE schools SET license_status=?, active=?, payment_confirmed_at=?, license_end=?, updated_at=? WHERE id=?", params: [res.status, res.active, res.paymentConfirmedAt, res.licenseEnd, now.toISOString(), id] },
      { sql: "INSERT INTO license_events(id,school_id,event,by_user,at,note) VALUES(?,?,?,?,?,?)", params: [newId(), id, action, p.id, now.toISOString(), b.note == null ? null : String(b.note).slice(0, 500)] },
    ]);
    await audit(d, p.id, "license_" + action, id);
    return c.json({ licenseStatus: res.status, active: res.active === 1, licenseEnd: res.licenseEnd });
  });

  r.get("/schools/:id/license-events", async (c) => c.json(await c.get("deps").db.all("SELECT event, by_user, at, note FROM license_events WHERE school_id=? ORDER BY at", [c.req.param("id")])));

  r.post("/staff", async (c) => {
    const d = c.get("deps"), p = c.get("p"), b = await body(c), role = b.role;
    if (role !== "schulleitung" && role !== "lehrer") throw fail(400, "role: schulleitung oder lehrer erwartet");
    const sid = str(b.schoolId, "schoolId");
    if (!(await d.db.first("SELECT 1 AS x FROM schools WHERE id=?", [sid]))) throw fail(404, "Schule nicht gefunden");
    return c.json(await createStaff(d, p.id, role, sid, email(b.email)), 201);
  });

  // Konfiguration: nur hier änderbar. Jede Änderung ist eine neue Version, alte Versionen bleiben erhalten.
  r.get("/config/versions", async (c) => c.json(await c.get("deps").db.all("SELECT version, valid_from, changed_by, change_note, is_active FROM config_versions ORDER BY version DESC")));
  r.get("/config/versions/:v", async (c) => {
    const row = await c.get("deps").db.first<any>("SELECT version, json, valid_from, change_note, is_active FROM config_versions WHERE version=?", [Number(c.req.param("v"))]);
    if (!row) throw fail(404, "nicht gefunden");
    return c.json({ version: row.version, validFrom: row.valid_from, note: row.change_note, isActive: row.is_active === 1, config: JSON.parse(row.json) });
  });
  r.post("/config", async (c) => {
    const d = c.get("deps"), p = c.get("p"), b = await body(c), cfg = parseConfig(b.config);
    await activeConfig(d);
    await d.db.batch([
      { sql: "UPDATE config_versions SET is_active=0 WHERE is_active=1" },
      { sql: "INSERT INTO config_versions(json,valid_from,changed_by,change_note,is_active) VALUES(?,?,?,?,1)", params: [JSON.stringify(cfg), nowIso(d), p.id, b.note == null ? null : String(b.note).slice(0, 500)] },
    ]);
    const v = (await activeConfig(d)).version;
    await audit(d, p.id, "config_changed", String(v), { note: b.note ?? null });
    return c.json({ version: v }, 201);
  });

  r.get("/audit", async (c) => c.json(await c.get("deps").db.all("SELECT actor, action, target, at, details FROM audit_log ORDER BY at DESC LIMIT 200")));
  return r;
}
