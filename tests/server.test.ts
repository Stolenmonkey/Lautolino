import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";
import { hashPassword } from "../apps/server/src/crypto";
import { DEFAULT_CONFIG } from "@silbenflug/shared";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const PEPPER = "test-pepper-test-pepper-test-pepper-1234";
let clock = new Date("2026-11-01T10:00:00Z");
let app: ReturnType<typeof createApp>;
let raw: any;

async function call(method: string, path: string, token?: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function login(email: string, password: string) { const r = await call("POST", "/auth/login", null, { email, password }); return r; }

async function setup() {
  raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON");
  migrateLocal(raw, new URL("../db/migrations", import.meta.url).pathname);
  clock = new Date("2026-11-01T10:00:00Z");
  app = createApp({ db: nodeSqliteDb(raw), pepper: PEPPER, iterations: 1000, now: () => clock });
  const at = clock.toISOString();
  raw.prepare("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('adm','admin@test.de',?,'admin',NULL,1,?,?)").run(await hashPassword("admin-passwort-1", 1000), at, at);
}
// Schule anlegen, Zahlung bestätigen, Schulleitung anlegen und anmelden
async function makeSchool(adminTok: string, name: string, mail: string) {
  const s = (await call("POST", "/admin/schools", adminTok, { name })).json;
  expect((await call("POST", `/admin/schools/${s.id}/license`, adminTok, { action: "zahlung_bestaetigt", licenseEnd: "2027-07-31T00:00:00Z" })).status).toBe(200);
  const sl = (await call("POST", "/admin/staff", adminTok, { role: "schulleitung", schoolId: s.id, email: mail })).json;
  const tok = (await login(mail, sl.initialPassword)).json.token;
  return { id: s.id as string, lead: tok as string, leadPw: sl.initialPassword as string, mail };
}

beforeEach(setup);

describe("Anmeldung", () => {
  it("Admin meldet sich an; falsches Passwort wird abgelehnt; nach 5 Fehlversuchen Sperre", async () => {
    expect((await login("admin@test.de", "falsch")).status).toBe(401);
    for (let i = 0; i < 4; i++) await login("admin@test.de", "falsch");
    expect((await login("admin@test.de", "admin-passwort-1")).status).toBe(429); // gesperrt, auch mit richtigem Passwort
    clock = new Date(clock.getTime() + 16 * 60000);
    expect((await login("admin@test.de", "admin-passwort-1")).status).toBe(200);
  });
  it("unbekannte E-Mail und falsches Passwort sind nicht unterscheidbar", async () => {
    const a = await login("niemand@test.de", "x12345678901"), b = await login("admin@test.de", "x12345678901");
    expect(a.status).toBe(401); expect(a.json).toEqual(b.json);
  });
  it("ohne Token kein Zugriff, Token nach Logout ungültig", async () => {
    expect((await call("GET", "/auth/me")).status).toBe(401);
    const t = (await login("admin@test.de", "admin-passwort-1")).json.token;
    expect((await call("GET", "/auth/me", t)).status).toBe(200);
    await call("POST", "/auth/logout", t);
    expect((await call("GET", "/auth/me", t)).status).toBe(401);
  });
  it("Sitzung läuft ab", async () => {
    const t = (await login("admin@test.de", "admin-passwort-1")).json.token;
    clock = new Date(clock.getTime() + 13 * 3600000);
    expect((await call("GET", "/auth/me", t)).status).toBe(401);
  });
});

describe("Schulen und Lizenz", () => {
  it("Schule ist erst nach bestätigtem Zahlungseingang aktiv; Schulleitung kann sich vorher nicht anmelden", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token;
    const s = (await call("POST", "/admin/schools", adm, { name: "Grundschule A" })).json;
    const sl = (await call("POST", "/admin/staff", adm, { role: "schulleitung", schoolId: s.id, email: "leitung@a.de" })).json;
    expect((await login("leitung@a.de", sl.initialPassword)).status).toBe(403);
    expect((await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "zahlung_bestaetigt" })).status).toBe(409); // Lizenzende fehlt
    expect((await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "verlaengert", licenseEnd: "2027-01-01T00:00:00Z" })).status).toBe(409); // aus 'angelegt' nicht erlaubt
    expect((await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "zahlung_bestaetigt", licenseEnd: "2027-07-31T00:00:00Z" })).status).toBe(200);
    expect((await login("leitung@a.de", sl.initialPassword)).status).toBe(200);
  });
  it("abgelaufene Lizenz: Lesen bleibt, neue Aktivitäten gesperrt; Verlängerung stellt alles wieder her", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, sc = await makeSchool(adm, "Schule B", "l@b.de");
    const y = (await call("POST", `/schools/${sc.id}/years`, sc.lead, { label: "2026/27" })).json;
    const k = (await call("POST", `/schools/${sc.id}/classes`, sc.lead, { schoolYearId: y.id, name: "1a" })).json;
    expect((await call("POST", `/classes/${k.id}/students`, sc.lead, { names: ["Mia"] })).status).toBe(201);
    clock = new Date("2027-08-02T00:00:00Z"); // nach Lizenzende, alte Sitzungen sind abgelaufen
    const adm2 = (await login("admin@test.de", "admin-passwort-1")).json.token, lead2 = (await login(sc.mail, sc.leadPw)).json.token;
    expect((await call("GET", "/admin/schools", adm2)).json[0].effective_status).toBe("abgelaufen");
    expect((await call("POST", `/classes/${k.id}/students`, lead2, { names: ["Leo"] })).status).toBe(403);   // neue Aktivität gesperrt
    expect((await call("POST", `/schools/${sc.id}/classes`, lead2, { schoolYearId: y.id, name: "1b" })).status).toBe(403);
    expect((await call("GET", `/classes/${k.id}/students`, lead2)).json.length).toBe(1);                    // Daten bleiben lesbar
    expect((await call("POST", `/admin/schools/${sc.id}/license`, adm2, { action: "verlaengert", licenseEnd: "2028-07-31T00:00:00Z" })).status).toBe(200);
    expect((await call("POST", `/classes/${k.id}/students`, lead2, { names: ["Leo"] })).status).toBe(201);   // wieder voller Umfang
  });
});

describe("Rechte: Schule, Klasse, Kind", () => {
  it("Lehrer sieht nur zugewiesene Klassen; fremde Klassen und Schulen wirken wie nicht vorhanden", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token;
    const A = await makeSchool(adm, "Schule A", "lead@a.de"), B = await makeSchool(adm, "Schule B", "lead@b.de");
    const yA = (await call("POST", `/schools/${A.id}/years`, A.lead, { label: "26/27" })).json;
    const k1 = (await call("POST", `/schools/${A.id}/classes`, A.lead, { schoolYearId: yA.id, name: "1a" })).json;
    const k2 = (await call("POST", `/schools/${A.id}/classes`, A.lead, { schoolYearId: yA.id, name: "1b" })).json;
    const t1 = (await call("POST", `/schools/${A.id}/staff`, A.lead, { email: "t1@a.de" })).json, t2 = (await call("POST", `/schools/${A.id}/staff`, A.lead, { email: "t2@a.de" })).json;
    expect(t1.role).toBe("lehrer");
    await call("PUT", `/schools/${A.id}/staff/${t1.id}/classes`, A.lead, { classIds: [k1.id] });
    await call("PUT", `/schools/${A.id}/staff/${t2.id}/classes`, A.lead, { classIds: [k2.id] });
    const T1 = (await login("t1@a.de", t1.initialPassword)).json.token, T2 = (await login("t2@a.de", t2.initialPassword)).json.token;
    const kids = (await call("POST", `/classes/${k1.id}/students`, T1, { names: ["Mia", "Ben"] })).json;
    expect(kids.length).toBe(2); expect(kids[0].code).toMatch(/^[^-]+-[^-]+-\d\d$/);
    expect((await call("GET", `/schools/${A.id}/classes`, T1)).json.map((x: any) => x.name)).toEqual(["1a"]);
    expect((await call("GET", `/classes/${k1.id}/students`, T2)).status).toBe(404);          // Lehrer 2 sieht Klasse 1 nicht
    expect((await call("POST", `/classes/${k1.id}/students`, T2, { names: ["X"] })).status).toBe(404);
    expect((await call("POST", `/students/${kids[0].id}/code/regenerate`, T2)).status).toBe(404);
    expect((await call("GET", `/schools/${A.id}/classes`, B.lead)).status).toBe(404);          // andere Schule
    expect((await call("GET", `/classes/${k1.id}/students`, B.lead)).status).toBe(404);
    expect((await call("POST", `/students/${kids[0].id}/code/regenerate`, B.lead)).status).toBe(404);
    expect((await call("GET", `/schools/${A.id}/staff`, T1)).status).toBe(403);               // Lehrer verwaltet keine Zugänge
    expect((await call("POST", `/schools/${A.id}/classes`, T1, { schoolYearId: yA.id, name: "x" })).status).toBe(403);
    expect((await call("GET", `/schools/${A.id}/staff`, A.lead)).status).toBe(200);
  });
  it("Lehrer und Schulleitung haben keinen Zugriff auf Admin-Bereich und globale Konfiguration", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, A = await makeSchool(adm, "Schule A", "lead@a.de");
    for (const path of ["/admin/schools", "/admin/config/versions", "/admin/audit"]) expect((await call("GET", path, A.lead)).status).toBe(403);
    expect((await call("POST", "/admin/config", A.lead, { config: DEFAULT_CONFIG })).status).toBe(403);
    expect((await call("POST", "/admin/staff", A.lead, { role: "schulleitung", schoolId: A.id, email: "x@y.de" })).status).toBe(403);
  });
  it("Schulleitung legt nur Lehrer an, auch wenn sie 'schulleitung' verlangt", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, A = await makeSchool(adm, "Schule A", "lead@a.de");
    expect((await call("POST", `/schools/${A.id}/staff`, A.lead, { email: "neu@a.de", role: "schulleitung" })).json.role).toBe("lehrer");
  });
  it("deaktivierter Lehrer verliert sofort den Zugang", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, A = await makeSchool(adm, "Schule A", "lead@a.de");
    const t = (await call("POST", `/schools/${A.id}/staff`, A.lead, { email: "t@a.de" })).json, T = (await login("t@a.de", t.initialPassword)).json.token;
    expect((await call("GET", "/auth/me", T)).status).toBe(200);
    await call("PATCH", `/schools/${A.id}/staff/${t.id}`, A.lead, { active: false });
    expect((await call("GET", "/auth/me", T)).status).toBe(401);
    expect((await login("t@a.de", t.initialPassword)).status).toBe(403);
  });
});

describe("Schülercode", () => {
  async function klasse() {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, A = await makeSchool(adm, "Schule A", "lead@a.de");
    const y = (await call("POST", `/schools/${A.id}/years`, A.lead, { label: "26/27" })).json, k = (await call("POST", `/schools/${A.id}/classes`, A.lead, { schoolYearId: y.id, name: "1a" })).json;
    const kids = (await call("POST", `/classes/${k.id}/students`, A.lead, { names: ["Mia", "Ben", "Zoe"] })).json;
    return { adm, A, k, kids };
  }
  it("Kind meldet sich mit Code an (Schreibweise egal) und sieht nur das eigene Profil", async () => {
    const { kids } = await klasse(), code = kids[0].code as string;
    const r = await call("POST", "/student/login", null, { code: code.toUpperCase().replace(/-/g, " ") });
    expect(r.status).toBe(200); expect(r.json.student.displayName).toBe("Mia");
    const me = await call("GET", "/student/me", r.json.token); expect(me.json.displayName).toBe("Mia");
    expect((await call("GET", "/admin/schools", r.json.token)).status).toBe(403);
    expect((await call("GET", "/classes/x/students", r.json.token)).status).toBe(403);
    expect((await call("GET", "/config", r.json.token)).json.config.security).toBeUndefined();
  });
  it("Codes sind eindeutig und werden nicht im Klartext gespeichert", async () => {
    const { kids } = await klasse(); expect(new Set(kids.map((x: any) => x.code)).size).toBe(3);
    const rows = raw.prepare("SELECT code_hash, code_lookup FROM student_codes").all();
    for (const k of kids) for (const row of rows) { expect(row.code_hash).not.toContain(k.code); expect(row.code_lookup).not.toContain(k.code.toLowerCase()); }
  });
  it("neuer Code macht den alten sofort ungültig, auch laufende Anmeldungen", async () => {
    const { A, kids } = await klasse(), old = kids[0].code as string;
    const tok = (await call("POST", "/student/login", null, { code: old })).json.token;
    const n = (await call("POST", `/students/${kids[0].id}/code/regenerate`, A.lead)).json.code;
    expect(n).not.toBe(old);
    expect((await call("GET", "/student/me", tok)).status).toBe(401);
    expect((await call("POST", "/student/login", null, { code: old })).status).toBe(401);
    expect((await call("POST", "/student/login", null, { code: n })).status).toBe(200);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM student_codes WHERE student_id=? AND revoked_at IS NULL").get(kids[0].id).n).toBe(1);
  });
  it("Fehlversuche werden begrenzt (10 pro Stunde und Netz), danach auch der richtige Code gesperrt", async () => {
    const { kids } = await klasse();
    for (let i = 0; i < 10; i++) expect((await call("POST", "/student/login", null, { code: "Tiger-Sonne-00" })).status).toBe(401);
    expect((await call("POST", "/student/login", null, { code: kids[0].code })).status).toBe(429);
    expect((await call("POST", "/student/login", null, { code: kids[0].code }, { "cf-connecting-ip": "5.6.7.8" })).status).toBe(200); // anderes Netz
    clock = new Date(clock.getTime() + 61 * 60000);
    expect((await call("POST", "/student/login", null, { code: kids[0].code })).status).toBe(200);
  });
  it("Klassenwechsel behält das Profil; alte Klasse sieht das Kind nicht mehr", async () => {
    const { A, k, kids } = await klasse();
    const y = (await call("GET", `/schools/${A.id}/years`, A.lead)).json[0], k2 = (await call("POST", `/schools/${A.id}/classes`, A.lead, { schoolYearId: y.id, name: "2a" })).json;
    expect((await call("POST", `/students/${kids[0].id}/move`, A.lead, { classId: k2.id })).status).toBe(200);
    expect((await call("GET", `/classes/${k.id}/students`, A.lead)).json.length).toBe(2);
    expect((await call("GET", `/classes/${k2.id}/students`, A.lead)).json[0].id).toBe(kids[0].id);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM student_class_history WHERE student_id=?").get(kids[0].id).n).toBe(2); // Historie bleibt
    expect((await call("POST", "/student/login", null, { code: kids[0].code })).status).toBe(200);                 // gleicher Code gilt weiter
  });
});

describe("Konfigurationsversionen", () => {
  it("Standardkonfiguration wird als Version 1 angelegt; Änderung erzeugt neue Version, alte bleibt", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token;
    expect((await call("GET", "/config", adm)).json.version).toBe(1);
    const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); c.award.gold_percent = 90;
    expect((await call("POST", "/admin/config", adm, { config: c, note: "Gold 90" })).json.version).toBe(2);
    expect((await call("GET", "/config", adm)).json.config.award.gold_percent).toBe(90);
    expect((await call("GET", "/admin/config/versions/1", adm)).json.config.award.gold_percent).toBe(95);
    expect((await call("GET", "/admin/config/versions", adm)).json.filter((v: any) => v.is_active === 1).length).toBe(1);
  });
  it("ungültige Konfiguration wird abgelehnt und ändert nichts", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); c.award.bronze_percent = 99;
    const r = await call("POST", "/admin/config", adm, { config: c }); expect(r.status).toBe(400);
    expect((await call("GET", "/config", adm)).json.version).toBe(1);
    expect((await call("POST", "/admin/config", adm, { config: { syl_time: {} } })).status).toBe(400);
  });
  it("Änderungen werden protokolliert", async () => {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token;
    await call("POST", "/admin/schools", adm, { name: "X" });
    expect((await call("GET", "/admin/audit", adm)).json.some((a: any) => a.action === "school_created")).toBe(true);
  });
});

describe("Passwort", () => {
  it("ändern: altes Passwort nötig, mindestens 10 Zeichen", async () => {
    const t = (await login("admin@test.de", "admin-passwort-1")).json.token;
    expect((await call("POST", "/auth/change-password", t, { oldPassword: "falsch", newPassword: "neues-passwort-123" })).status).toBe(401);
    expect((await call("POST", "/auth/change-password", t, { oldPassword: "admin-passwort-1", newPassword: "kurz" })).status).toBe(400);
    expect((await call("POST", "/auth/change-password", t, { oldPassword: "admin-passwort-1", newPassword: "neues-passwort-123" })).status).toBe(200);
    expect((await login("admin@test.de", "neues-passwort-123")).status).toBe(200);
  });
});

describe("Klassenlernplan", () => {
  async function setupPlan() {
    const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, A = await makeSchool(adm, "Schule A", "lead@a.de");
    const y = (await call("POST", `/schools/${A.id}/years`, A.lead, { label: "26/27" })).json, k = (await call("POST", `/schools/${A.id}/classes`, A.lead, { schoolYearId: y.id, name: "1a" })).json;
    const t = (await call("POST", `/schools/${A.id}/staff`, A.lead, { email: "t@a.de" })).json;
    await call("PUT", `/schools/${A.id}/staff/${t.id}/classes`, A.lead, { classIds: [k.id] });
    const T = (await login("t@a.de", t.initialPassword)).json.token;
    const kids = (await call("POST", `/classes/${k.id}/students`, T, { names: ["Mia", "Ben"] })).json;
    return { adm, A, k, T, kids };
  }
  it("erste Freigabe braucht mindestens 2 Buchstaben (Startgruppe); Umfang wird einmalig gespeichert", async () => {
    const { k, T } = await setupPlan();
    for (const bad of [{ letter: "o" }, { letters: ["o"] }, { letters: ["o", "o"] }, { letters: ["o", "ä"] }, { letters: ["m", "n"] }]) expect((await call("POST", `/classes/${k.id}/releases`, T, bad)).status).toBe(400);
    const r = await call("POST", `/classes/${k.id}/releases`, T, { letters: ["o", "l"] }); expect(r.status).toBe(201);
    expect(r.json.released.map((x: any) => x.letter)).toEqual(["o", "l"]); expect(r.json.released.every((x: any) => x.syllableCount > 0)).toBe(true);
    const sc = async (l: string) => (await call("GET", `/classes/${k.id}/releases/${l}/scope`, T)).json as string[];
    const o = await sc("o"), l = await sc("l");
    expect(o.length).toBeGreaterThan(0); expect(o.every((s) => /^[ol]+$/.test(s))).toBe(true); expect(l).toEqual(o); // Startgruppe: alle Startbuchstaben teilen sich alle Silben der Gruppe
    expect(o).toEqual(expect.arrayContaining(["ol", "lo"]));
    expect((await call("POST", `/classes/${k.id}/releases`, T, { letters: ["a", "b"] })).status).toBe(400); // nach dem Start nur noch einzeln
    expect((await call("POST", `/classes/${k.id}/releases`, T, { letter: "e" })).status).toBe(201);
    const e = await sc("e");
    expect(e.length).toBeGreaterThan(0); expect(e.every((s) => s.includes("e") && /^[ole]+$/.test(s))).toBe(true);
    await call("POST", `/classes/${k.id}/releases`, T, { letter: "m" });
    expect(await sc("o")).toEqual(o); expect(await sc("l")).toEqual(l); expect(await sc("e")).toEqual(e); // unverändert
    expect(() => raw.prepare("UPDATE letter_syllable_scope SET syllable='xx'").run()).toThrow();
    expect(() => raw.prepare("DELETE FROM letter_syllable_scope").run()).toThrow();
    const plan = (await call("GET", `/classes/${k.id}/plan`, T)).json;
    expect(plan.releases.map((x: any) => x.letter)).toEqual(["o", "l", "e", "m"]); expect(plan.releases[2].syllable_count).toBe(e.length);
  });
  it("doppelte oder ungültige Buchstaben werden abgelehnt", async () => {
    const { k, T } = await setupPlan();
    await call("POST", `/classes/${k.id}/releases`, T, { letters: ["o", "l"] });
    expect((await call("POST", `/classes/${k.id}/releases`, T, { letter: "O" })).status).toBe(409);
    for (const bad of ["ä", "ab", "", "1", null]) expect((await call("POST", `/classes/${k.id}/releases`, T, { letter: bad })).status).toBe(400);
  });
  it("Silbenlängen der Klasse bestimmen den Umfang künftiger Freigaben", async () => {
    const { k, T } = await setupPlan();
    await call("PUT", `/classes/${k.id}/settings`, T, { allowedLengths: [2] });
    await call("POST", `/classes/${k.id}/releases`, T, { letters: ["o", "l"] });
    expect(((await call("GET", `/classes/${k.id}/releases/l/scope`, T)).json as string[]).every((s) => s.length === 2)).toBe(true);
    expect((await call("PUT", `/classes/${k.id}/settings`, T, { allowedLengths: [] })).status).toBe(400);
  });
  it("Ausnahmen: Kind bekommt einen Buchstaben nicht, Klasse bleibt unberührt; Kind sieht seinen Plan", async () => {
    const { k, T, kids } = await setupPlan();
    await call("POST", `/classes/${k.id}/releases`, T, { letters: ["o", "l"] }); await call("POST", `/classes/${k.id}/releases`, T, { letter: "e" });
    expect((await call("PUT", `/students/${kids[0].id}/exclusions`, T, { letters: ["e"] })).status).toBe(200);
    const mia = (await call("POST", "/student/login", null, { code: kids[0].code })).json.token, ben = (await call("POST", "/student/login", null, { code: kids[1].code })).json.token;
    expect((await call("GET", "/student/plan", mia)).json.letters).toEqual(["o", "l"]);
    expect((await call("GET", "/student/plan", ben)).json.letters).toEqual(["o", "l", "e"]);
    expect((await call("GET", `/classes/${k.id}/plan`, T)).json.exclusions[kids[0].id]).toEqual(["e"]);
    expect((await call("PUT", `/students/${kids[0].id}/exclusions`, T, { letters: ["ä"] })).status).toBe(400);
  });
  it("Rechte: fremder Lehrer, Kind und andere Schule dürfen nichts freigeben; abgelaufene Lizenz sperrt", async () => {
    const { adm, A, k, T, kids } = await setupPlan(), B = await makeSchool(adm, "Schule B", "lead@b.de");
    const kid = (await call("POST", "/student/login", null, { code: kids[0].code })).json.token;
    expect((await call("POST", `/classes/${k.id}/releases`, kid, { letters: ["o", "l"] })).status).toBe(403);
    expect((await call("POST", `/classes/${k.id}/releases`, B.lead, { letters: ["o", "l"] })).status).toBe(404);
    expect((await call("GET", `/classes/${k.id}/plan`, B.lead)).status).toBe(404);
    expect((await call("PUT", `/students/${kids[0].id}/exclusions`, B.lead, { letters: ["o"] })).status).toBe(404);
    await call("POST", `/admin/schools/${A.id}/license`, adm, { action: "abgelaufen" });
    expect((await call("POST", `/classes/${k.id}/releases`, T, { letters: ["o", "l"] })).status).toBe(403);
    expect((await call("GET", `/classes/${k.id}/plan`, T)).status).toBe(200);
  });
  it("große Silbenumfänge (viele Zeilen) werden vollständig gespeichert", async () => {
    const { k, T } = await setupPlan();
    await call("PUT", `/classes/${k.id}/settings`, T, { allowedLengths: [2, 3, 4] });
    await call("POST", `/classes/${k.id}/releases`, T, { letters: ["o", "l"] }); for (const l of "emanrtis") await call("POST", `/classes/${k.id}/releases`, T, { letter: l });
    const plan2 = (await call("GET", `/classes/${k.id}/plan`, T)).json, total = plan2.releases.reduce((a: number, x: any) => a + x.syllable_count, 0);
    expect(total).toBeGreaterThan(500);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM letter_syllable_scope").get().n).toBe(total);
  });
});

// ---------------- Phase 4: Messwerte, Bewertung, Auszeichnungen ----------------
async function klasseMitKindern(extraLetters: string[] = []) {
  const adm = (await login("admin@test.de", "admin-passwort-1")).json.token, A = await makeSchool(adm, "Schule A", "lead@a.de");
  const y = (await call("POST", `/schools/${A.id}/years`, A.lead, { label: "26/27" })).json, k = (await call("POST", `/schools/${A.id}/classes`, A.lead, { schoolYearId: y.id, name: "1a" })).json;
  const t = (await call("POST", `/schools/${A.id}/staff`, A.lead, { email: "t@a.de" })).json;
  await call("PUT", `/schools/${A.id}/staff/${t.id}/classes`, A.lead, { classIds: [k.id] });
  const T = (await login("t@a.de", t.initialPassword)).json.token;
  await call("POST", `/classes/${k.id}/releases`, T, { letters: ["o", "l"] });
  for (const l of extraLetters) await call("POST", `/classes/${k.id}/releases`, T, { letter: l });
  const kids = (await call("POST", `/classes/${k.id}/students`, T, { names: ["Mia", "Ben"] })).json;
  const tok = async (i: number) => (await call("POST", "/student/login", null, { code: kids[i].code })).json.token as string;
  const scope = async (l: string) => (await call("GET", `/classes/${k.id}/releases/${l}/scope`, T)).json as string[];
  return { adm, A, k, T, kids, tok, scope };
}
let rid = 0;
const round = (tok: string, syls: string[], sec: number, letters = ["o", "l"], id = "r" + ++rid) =>
  call("POST", "/student/rounds", tok, { clientRoundId: id, seconds: 40, letters, lengths: [2, 3], syllables: syls.map((s) => ({ s, sec })) });

describe("Messwerte und Auszeichnungen", () => {
  it("keine Bewertung unter 10 Messungen; ab der 10. Messung Bronze, Silber, Gold; Popup nur für die höchste Stufe", async () => {
    const { T, kids, tok, scope } = await klasseMitKindern(), mia = await tok(0), syls = [...new Set([...(await scope("o")), ...(await scope("l"))])];
    for (let i = 0; i < 9; i++) { const r = await round(mia, syls, 2); expect(r.status).toBe(201); expect(r.json.awards).toEqual([]); }
    expect((await call("GET", `/students/${kids[0].id}/progress`, T)).json.every((x: any) => x.mastered === 0 && x.unrated === x.total)).toBe(true);
    const r10 = await round(mia, syls, 2);
    expect(r10.json.awards.map((a: any) => a.letter).sort()).toEqual(["l", "o"]);
    for (const a of r10.json.awards) { expect(a.levels).toEqual(["bronze", "silber", "gold"]); expect(a.highest).toBe("gold"); }
    const ov = (await call("GET", "/student/awards", mia)).json;
    expect(ov.letters.length).toBe(26); expect(ov.letters.find((x: any) => x.letter === "o")).toEqual({ letter: "o", released: true, level: "gold" });
    expect(ov.letters.find((x: any) => x.letter === "z")).toEqual({ letter: "z", released: false, level: null });
    expect(ov.pending.sort((a: any, b: any) => a.letter.localeCompare(b.letter))).toEqual([{ letter: "l", level: "gold" }, { letter: "o", level: "gold" }]); // je Buchstabe nur die höchste Stufe
    expect(JSON.stringify(ov)).not.toContain("percent");                // Kinder sehen keine Prozentwerte
    await call("POST", "/student/awards/ack", mia);
    expect((await call("GET", "/student/awards", mia)).json.pending).toEqual([]);
    expect((await round(mia, syls, 2)).json.awards).toEqual([]);          // nichts doppelt vergeben
  });
  it("vergebene Auszeichnungen bleiben, auch wenn der Durchschnitt später schlechter wird", async () => {
    const { T, kids, tok, scope } = await klasseMitKindern(), mia = await tok(0), syls = await scope("l");
    for (let i = 0; i < 10; i++) await round(mia, syls, 2);
    expect((await call("GET", "/student/awards", mia)).json.letters.find((x: any) => x.letter === "l").level).toBe("gold");
    for (let i = 0; i < 12; i++) await round(mia, syls, 9);
    const pr = (await call("GET", `/students/${kids[0].id}/progress`, T)).json.find((x: any) => x.letter === "l");
    expect(pr.percent).toBe(0); expect(pr.level).toBe("gold");
    expect((await call("GET", "/student/awards", mia)).json.letters.find((x: any) => x.letter === "l").level).toBe("gold");
    expect(raw.prepare("SELECT COUNT(*) AS n FROM awards WHERE student_id=? AND letter='l'").get(kids[0].id).n).toBe(3);
  });
  it("Konfigurationsänderung verändert bestehende Auszeichnungen nicht", async () => {
    const { adm, tok, scope } = await klasseMitKindern(), mia = await tok(0), syls = await scope("l");
    for (let i = 0; i < 10; i++) await round(mia, syls, 2);
    const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); c.award = { bronze_percent: 96, silver_percent: 98, gold_percent: 100 }; c.mastery.time_limit_seconds = { "2": 0.5, "3": 0.5, "4": 0.5 };
    expect((await call("POST", "/admin/config", adm, { config: c })).status).toBe(201);
    expect((await call("GET", "/student/awards", mia)).json.letters.find((x: any) => x.letter === "l").level).toBe("gold");
    expect(raw.prepare("SELECT DISTINCT config_version AS v FROM awards").all().map((x: any) => x.v)).toEqual([1]); // Version der Vergabe bleibt gespeichert
  });
  it("Zeiten je Silbe: nur die letzten 12 bleiben, Einzelzeit wird auf das Maximum begrenzt", async () => {
    const { kids, tok } = await klasseMitKindern(), mia = await tok(0);
    for (let i = 0; i < 14; i++) await round(mia, ["ol"], i + 1);
    const rows = raw.prepare("SELECT seq, seconds FROM syllable_times WHERE student_id=? AND syllable='ol' ORDER BY seq").all(kids[0].id);
    expect(rows.length).toBe(12); expect(rows[0].seq).toBe(3); expect(rows[11].seconds).toBe(14);
    await round(mia, ["lo"], 500);
    expect(raw.prepare("SELECT seconds FROM syllable_times WHERE student_id=? AND syllable='lo'").get(kids[0].id).seconds).toBe(60);
  });
  it("doppelt gesendete Runde (Offline-Puffer) zählt nur einmal", async () => {
    const { kids, tok } = await klasseMitKindern(), mia = await tok(0);
    expect((await round(mia, ["ol", "lo"], 2, ["o", "l"], "abc")).json.duplicate).toBe(false);
    const again = await round(mia, ["ol", "lo"], 2, ["o", "l"], "abc");
    expect(again.status).toBe(200); expect(again.json.duplicate).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM rounds WHERE student_id=?").get(kids[0].id).n).toBe(1);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM syllable_times WHERE student_id=?").get(kids[0].id).n).toBe(2);
  });
  it("Markierung neuer Buchstaben im Rundenverlauf", async () => {
    const { T, kids, tok } = await klasseMitKindern(["e"]), mia = await tok(0);
    const r1 = (await round(mia, ["ol"], 5, ["o", "l"])).json.roundId, r2 = (await round(mia, ["ole"], 5, ["o", "l", "e"])).json.roundId;
    const v = (await call("GET", `/students/${kids[0].id}/rounds`, T)).json;
    expect(v.rounds.length).toBe(2); expect(Object.fromEntries(v.markers.map((m: any) => [m.letter, m.round_id]))).toEqual({ o: r1, l: r1, e: r2 });
  });
  it("Ausnahme: ausgenommener Buchstabe wird nicht bewertet", async () => {
    const { T, kids, tok, scope } = await klasseMitKindern(["e"]), mia = await tok(0), ben = await tok(1), e = await scope("e");
    await call("PUT", `/students/${kids[0].id}/exclusions`, T, { letters: ["e"] });
    for (let i = 0; i < 10; i++) { await round(mia, e, 2, ["o", "l", "e"]); await round(ben, e, 2, ["o", "l", "e"]); }
    const g = async (t: string) => (await call("GET", "/student/awards", t)).json.letters.find((x: any) => x.letter === "e");
    expect((await g(mia)).level).toBeNull(); expect((await g(mia)).released).toBe(false); expect((await g(ben)).level).toBe("gold");
  });
  it("Automatik-Stand wird gespeichert und kann abgerufen werden", async () => {
    const { tok } = await klasseMitKindern(), mia = await tok(0);
    await call("POST", "/student/rounds", mia, { clientRoundId: "a1", seconds: 30, letters: ["o", "l"], lengths: [2, 3], syllables: [{ s: "ol", sec: 2 }], autoState: { key: "lo|2,3", bal: 55, sd: 100 } });
    expect((await call("GET", "/student/auto-state", mia)).json).toEqual([{ combo_key: "lo|2,3", len_balance: 55, syl_difficulty: 100 }]);
  });
  it("abgelaufene Lizenz sperrt neue Runden, Lesen bleibt", async () => {
    const { adm, A, kids, tok } = await klasseMitKindern(), mia = await tok(0);
    await call("POST", `/admin/schools/${A.id}/license`, adm, { action: "abgelaufen" });
    expect((await round(mia, ["ol"], 2)).status).toBe(403);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM rounds WHERE student_id=?").get(kids[0].id).n).toBe(0);
    expect((await call("GET", "/student/awards", mia)).status).toBe(200);
  });
  it("Rechte: nur das Kind selbst meldet Runden, nur zuständige Lehrkräfte sehen den Fortschritt", async () => {
    const { adm, A, k, T, kids, tok } = await klasseMitKindern(), mia = await tok(0), B = await makeSchool(adm, "Schule B", "lead@b.de");
    expect((await round(T, ["ol"], 2)).status).toBe(403);                                  // Lehrkraft meldet keine Runden
    expect((await round(A.lead, ["ol"], 2)).status).toBe(403);
    expect((await round("0".repeat(64), ["ol"], 2)).status).toBe(401);
    expect((await call("GET", `/students/${kids[0].id}/progress`, mia)).status).toBe(403); // Kind sieht keine Lehrkraft-Auswertung
    expect((await call("GET", `/students/${kids[0].id}/progress`, B.lead)).status).toBe(404);
    expect((await call("GET", `/students/${kids[0].id}/rounds`, B.lead)).status).toBe(404);
    const t2 = (await call("POST", `/schools/${A.id}/staff`, A.lead, { email: "t2@a.de" })).json, T2 = (await login("t2@a.de", t2.initialPassword)).json.token;
    expect((await call("GET", `/students/${kids[0].id}/progress`, T2)).status).toBe(404);   // Lehrkraft ohne diese Klasse
    expect((await call("GET", `/students/${kids[0].id}/progress`, T)).status).toBe(200);
    expect(k.id).toBeTruthy();
  });
  it("ungültige Meldungen werden abgelehnt", async () => {
    const { tok } = await klasseMitKindern(), mia = await tok(0), post = (b: any) => call("POST", "/student/rounds", mia, b);
    const ok = { clientRoundId: "x", seconds: 10, letters: ["o", "l"], lengths: [2], syllables: [{ s: "ol", sec: 2 }] };
    expect((await post({ ...ok, clientRoundId: undefined })).status).toBe(400);
    expect((await post({ ...ok, seconds: -1 })).status).toBe(400);
    expect((await post({ ...ok, syllables: [] })).status).toBe(400);
    expect((await post({ ...ok, syllables: [{ s: "x", sec: 1 }] })).status).toBe(400);
    expect((await post({ ...ok, syllables: [{ s: "ol", sec: -2 }] })).status).toBe(400);
    expect((await post({ ...ok, syllables: Array(101).fill({ s: "ol", sec: 1 }) })).status).toBe(400);
    expect((await post(ok)).status).toBe(201);
  });
});
