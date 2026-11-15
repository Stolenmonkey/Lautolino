// @vitest-environment jsdom
// Elternzugang: Code erzeugen, Gerät koppeln, nur lesen, widerrufen (Server) sowie Verwaltungs- und Elternoberfläche.
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";
import { hashPassword } from "../apps/server/src/crypto";
import { buildSyllables } from "@silbenflug/core";
import { DEFAULT_CONFIG, validateConfig } from "@silbenflug/shared";
// @ts-ignore reine JS-Module
import { createApi } from "../apps/web/js/api.js";
// @ts-ignore
import { schoolView } from "../apps/web/js/views/school.js";
// @ts-ignore
import { mount, rundenDiagramm } from "../apps/eltern/app.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const DAY = 86400000;

describe("Elternzugang", () => {
  let app: ReturnType<typeof createApp>, raw: any, clock = Date.parse("2026-11-01T10:00:00Z");
  let adm = "", lead = "", teacher = "", other = "", sid = "", kA = "", kB = "", codes: string[] = [], classId = "";
  const call = async (method: string, path: string, token?: string | null, body?: unknown) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  const tick = () => new Promise((r) => setTimeout(r, 25)), flush = async () => { for (let i = 0; i < 14; i++) await tick(); };
  const click = (root: ParentNode, text: string, nth = 0) => { const b = Array.from(root.querySelectorAll("button")).filter((x) => x.textContent?.trim() === text)[nth]; if (!b) throw new Error("Button fehlt: " + text); (b as HTMLElement).click(); };
  const fetchTo = (u: string, o: any) => app.request(u.replace("http://x", ""), o);

  beforeEach(async () => {
    clock = Date.parse("2026-11-01T10:00:00Z");
    raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON"); migrateLocal(raw, process.cwd() + "/db/migrations");
    app = createApp({ db: nodeSqliteDb(raw), pepper: "p".repeat(40), iterations: 1000, now: () => new Date(clock) });
    const at = new Date(clock).toISOString();
    raw.prepare("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('adm','admin@test.de',?,'admin',NULL,1,?,?)").run(await hashPassword("admin-passwort-1", 1000), at, at);
    adm = (await call("POST", "/auth/login", null, { email: "admin@test.de", password: "admin-passwort-1" })).json.token;
    const s = (await call("POST", "/admin/schools", adm, { name: "Schule" })).json; sid = s.id;
    await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "zahlung_bestaetigt", licenseEnd: "2099-01-01T00:00:00Z" });
    const sl = (await call("POST", "/admin/staff", adm, { role: "schulleitung", schoolId: s.id, email: "l@t.de" })).json; lead = (await call("POST", "/auth/login", null, { email: "l@t.de", password: sl.initialPassword })).json.token;
    const y = (await call("POST", `/schools/${s.id}/years`, lead, { label: "26/27" })).json, k = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1a" })).json, k2 = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1b" })).json; classId = k.id;
    const kids = (await call("POST", `/classes/${k.id}/students`, lead, { names: ["Mia", "Ben"] })).json; codes = kids.map((x: any) => x.code); kA = kids[0].id; kB = kids[1].id;
    const t1 = (await call("POST", `/schools/${s.id}/staff`, lead, { email: "t1@t.de" })).json, t2 = (await call("POST", `/schools/${s.id}/staff`, lead, { email: "t2@t.de" })).json;
    await call("PUT", `/schools/${s.id}/staff/${t1.id}/classes`, lead, { classIds: [k.id] }); await call("PUT", `/schools/${s.id}/staff/${t2.id}/classes`, lead, { classIds: [k2.id] });
    teacher = (await call("POST", "/auth/login", null, { email: "t1@t.de", password: t1.initialPassword })).json.token; other = (await call("POST", "/auth/login", null, { email: "t2@t.de", password: t2.initialPassword })).json.token;
    expect((await call("POST", `/classes/${k.id}/releases`, lead, { letters: ["o", "l"] })).status).toBe(201);
  });
  const newCode = async (id = kA, tok = teacher) => (await call("POST", `/students/${id}/parent-codes`, tok)).json.code as string;
  const link = async (code: string) => (await call("POST", "/parent/activate", null, { code })).json;
  const kidTok = async (i = 0) => (await call("POST", "/student/login", null, { code: codes[i] })).json.token as string;
  const play = async (id = 0) => { const tok = await kidTok(id), all = [...buildSyllables(["o", "l"], 2), ...buildSyllables(["o", "l"], 3)]; for (let i = 0; i < 10; i++) expect((await call("POST", "/student/rounds", tok, { clientRoundId: "e" + id + "_" + i, seconds: 40 - i, syllables: all.map((x) => ({ s: x, sec: 1 })), letters: ["o", "l"], lengths: [2, 3] })).status).toBe(201); };

  it("Code: Format, 30 Tage gültig, Klartext nicht in der Datenbank, Eintrag im Protokoll", async () => {
    const r = await call("POST", `/students/${kA}/parent-codes`, teacher);
    expect(r.status).toBe(201); expect(r.json.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(Date.parse(r.json.expiresAt)).toBe(clock + 30 * DAY);
    expect(JSON.stringify(raw.prepare("SELECT * FROM parent_activation_codes").all())).not.toContain(r.json.code);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='parent_code_created'").get().n).toBe(1);
  });
  it("Koppeln: Schreibweise egal, Code nur einmal, falscher und abgelaufener Code abgelehnt", async () => {
    const c1 = await newCode(), ok = await call("POST", "/parent/activate", null, { code: c1.toLowerCase().replace(/-/g, " ") });
    expect(ok.status).toBe(200); expect(ok.json.student.displayName).toBe("Mia"); expect(ok.json.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await call("POST", "/parent/activate", null, { code: c1 })).status).toBe(401);
    expect((await call("POST", "/parent/activate", null, { code: "AAAA-BBBB-CCCC" })).status).toBe(401);
    const c2 = await newCode(); clock += 31 * DAY; expect((await call("POST", "/parent/activate", null, { code: c2 })).status).toBe(401);
  });
  it("Fehlversuche werden begrenzt (429)", async () => {
    for (let i = 0; i < 10; i++) expect((await call("POST", "/parent/activate", null, { code: "ZZZZ-ZZZZ-ZZ" + (i % 10) + "9" })).status).toBe(401);
    const c = await newCode(); expect((await call("POST", "/parent/activate", null, { code: c })).status).toBe(429);
  });
  it("Elterngerät sieht nur sein Kind und nur lesend: Stufen ohne Prozentwerte, Rundenzeiten", async () => {
    await play(0); await play(1);
    const t = (await link(await newCode(kA))).token, me = await call("GET", "/parent/me", t); expect(me.json.displayName).toBe("Mia");
    const lt = (await call("GET", "/parent/letters", t)).json.letters; expect(lt.length).toBe(26);
    expect(lt.filter((x: any) => x.released).map((x: any) => x.letter)).toEqual(["l", "o"]); expect(lt.find((x: any) => x.letter === "o").level).toBe("gold");
    expect(JSON.stringify(lt)).not.toMatch(/percent|prozent|mastered/i);
    const rr = (await call("GET", "/parent/rounds", t)).json.rounds; expect(rr.length).toBe(10); expect(Object.keys(rr[0]).sort()).toEqual(["id", "played_at", "seconds"]);
    // alles andere ist gesperrt
    for (const [m, p, b] of [["POST", "/student/rounds", { clientRoundId: "x", seconds: 5, syllables: [{ s: "ol", sec: 1 }], letters: ["o", "l"], lengths: [2] }], ["GET", "/student/plan"], ["GET", "/student/awards"], ["POST", "/student/awards/ack"], ["GET", "/student/sync-data"], ["GET", `/students/${kA}/progress`], ["GET", `/students/${kA}/rounds`], ["GET", `/students/${kA}/syllable-train`], ["GET", `/students/${kB}/progress`], ["POST", `/students/${kA}/parent-codes`], ["GET", `/students/${kA}/parent-devices`], ["POST", `/students/${kA}/code/regenerate`], ["GET", `/classes/${classId}/students`], ["GET", "/admin/schools"]] as any[]) {
      const r = await call(m, p, t, b); expect([401, 403, 404], `${m} ${p} -> ${r.status}`).toContain(r.status); expect(r.status, `${m} ${p}`).not.toBe(200); expect(r.status, `${m} ${p}`).not.toBe(201);
    }
    expect((await call("GET", "/parent/me", await kidTok(0))).status).toBe(403); expect((await call("GET", "/parent/me", null)).status).toBe(401); expect((await call("GET", "/parent/letters", teacher)).status).toBe(403);
  });
  it("mehrere Geräte je Kind; Widerruf wirkt sofort nur auf das eine Gerät; Protokoll", async () => {
    const t1 = (await link(await newCode())).token, t2 = (await link(await newCode())).token;
    const list = (await call("GET", `/students/${kA}/parent-devices`, teacher)).json; expect(list.devices.length).toBe(2); expect(list.openCodes).toBe(0);
    expect((await call("POST", `/students/${kA}/parent-devices/${list.devices[0].id}/revoke`, teacher)).status).toBe(200);
    expect((await call("GET", "/parent/me", t1)).status).toBe(401); expect((await call("GET", "/parent/me", t2)).status).toBe(200);
    expect((await call("POST", `/students/${kA}/parent-devices/${list.devices[0].id}/revoke`, teacher)).status).toBe(404);
    expect((await call("GET", `/students/${kA}/parent-devices`, teacher)).json.devices[0].revoked_at).not.toBeNull();
    expect(raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('parent_device_linked','parent_device_revoked')").get().n).toBe(3);
  });
  it("Rechte der Schule: Lehrkraft fremder Klasse 404, Admin und Schulleitung dürfen, Kind nicht", async () => {
    expect((await call("POST", `/students/${kA}/parent-codes`, other)).status).toBe(404); expect((await call("GET", `/students/${kA}/parent-devices`, other)).status).toBe(404);
    expect((await call("POST", `/students/${kA}/parent-codes`, adm)).status).toBe(201); expect((await call("POST", `/students/${kA}/parent-codes`, lead)).status).toBe(201);
    expect((await call("POST", `/students/${kA}/parent-codes`, await kidTok(0))).status).toBe(403); expect((await call("POST", `/students/${kA}/parent-codes`, null)).status).toBe(401);
    const d = (await link(await newCode())); expect(d.token).toBeTruthy(); const dev = (await call("GET", `/students/${kA}/parent-devices`, teacher)).json.devices[0].id;
    expect((await call("POST", `/students/${kA}/parent-devices/${dev}/revoke`, other)).status).toBe(404); expect((await call("POST", `/students/${kB}/parent-devices/${dev}/revoke`, teacher)).status).toBe(404);
  });
  it("abgelaufene Lizenz: Lesen bleibt, neuen Code erzeugen nicht, Widerrufen immer", async () => {
    const t = (await link(await newCode())).token, dev = (await call("GET", `/students/${kA}/parent-devices`, teacher)).json.devices[0].id;
    expect((await call("POST", `/admin/schools/${sid}/license`, adm, { action: "abgelaufen" })).status).toBeLessThan(300);
    expect((await call("GET", "/parent/letters", t)).status).toBe(200); expect((await call("POST", `/students/${kA}/parent-codes`, teacher)).status).toBe(403);
    expect((await call("POST", `/students/${kA}/parent-devices/${dev}/revoke`, teacher)).status).toBe(200);
  });
  it("deaktiviertes Kind: Elterngerät verliert den Zugriff", async () => {
    const t = (await link(await newCode())).token; expect((await call("GET", "/parent/me", t)).status).toBe(200);
    expect((await call("PATCH", `/students/${kA}`, lead, { active: false })).status).toBe(200); expect((await call("GET", "/parent/me", t)).status).toBe(401);
  });
  it("Konfiguration: parent_code_days wird geprüft", () => {
    expect(DEFAULT_CONFIG.security.parent_code_days).toBe(30);
    expect(validateConfig({ ...DEFAULT_CONFIG, security: { ...DEFAULT_CONFIG.security, parent_code_days: 0 } }).join()).toContain("parent_code_days");
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
  });

  it("Verwaltung: Eltern-Bereich beim Kind erzeugt Code, zeigt Geräte, Widerruf mit Rückfrage", async () => {
    const api = createApi({ base: "http://x", storage: mem(), fetchFn: fetchTo }); api.token = lead;
    const root = document.createElement("div"); document.body.appendChild(root);
    await schoolView("schueler", root, { api, user: { id: "x", role: "schulleitung", schoolId: sid } }); await flush();
    const eltern = () => { const tr = Array.from(root.querySelectorAll("tr")).find((x) => x.textContent!.startsWith("Mia"))!; (Array.from(tr.querySelectorAll("button")).find((b) => b.textContent === "Eltern") as HTMLElement).click(); };
    eltern(); await flush(); expect(root.textContent).toContain("Eltern von Mia"); expect(root.textContent).toContain("Noch kein Gerät gekoppelt");
    click(root, "Neuen Elterncode erzeugen"); await flush();
    const code = root.querySelector(".notice .code")!.textContent!; expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){2}$/); expect(root.textContent).toContain("Gültig bis"); expect(root.textContent).toContain("Offene Codes: 1");
    await link(code); eltern(); await flush(); expect(root.textContent).toContain("gekoppelt");
    click(root, "Widerrufen"); await flush(); expect(root.textContent).toContain("Wirklich widerrufen?");
    expect((await call("GET", `/students/${kA}/parent-devices`, lead)).json.devices[0].revoked_at).toBeNull();   // erst nach der Rückfrage
    click(root, "Wirklich widerrufen?"); await flush(); expect(root.textContent).toContain("widerrufen"); expect((await call("GET", `/students/${kA}/parent-devices`, lead)).json.devices[0].revoked_at).not.toBeNull();
  });

  it("Elternseite: koppeln, Stand sehen, Neustart bleibt gekoppelt, Widerruf führt zurück zur Kopplung", async () => {
    await play(0);
    const storage = mem(), root = document.createElement("div"); document.body.appendChild(root);
    const m = mount(root, { base: "http://x", storage, fetchFn: fetchTo }); await m.ready; await flush();
    expect(root.querySelector("#code")).not.toBeNull();
    (root.querySelector("#code") as HTMLInputElement).value = "FALSCH-FALSCH"; click(root, "Koppeln"); await flush(); expect(root.textContent).toContain("nicht gültig");
    (root.querySelector("#code") as HTMLInputElement).value = await newCode(); click(root, "Koppeln"); await flush();
    expect(root.textContent).toContain("Mia"); expect(root.querySelectorAll("#lgrid .lt").length).toBe(26); expect(root.querySelectorAll("#lgrid .lt.on").length).toBe(2);
    expect(root.querySelector('#lgrid [data-letter="o"]')!.textContent).toContain("Gold"); expect(root.textContent).not.toContain("%"); expect(root.textContent).toContain("kein Nachweis der Lesekorrektheit");
    expect(root.querySelectorAll("svg .bar").length).toBe(10); expect(root.querySelectorAll("tbody tr").length).toBe(10);
    const root2 = document.createElement("div"); const m2 = mount(root2, { base: "http://x", storage, fetchFn: fetchTo }); await m2.ready; await flush(); expect(root2.textContent).toContain("Mia");
    const dev = (await call("GET", `/students/${kA}/parent-devices`, lead)).json.devices[0].id; await call("POST", `/students/${kA}/parent-devices/${dev}/revoke`, lead);
    const root3 = document.createElement("div"); const m3 = mount(root3, { base: "http://x", storage, fetchFn: fetchTo }); await m3.ready; await flush();
    expect(root3.textContent).toContain("nicht mehr gekoppelt"); expect(root3.querySelector("#code")).not.toBeNull(); expect(storage.getItem("silbenflug.eltern.token")).toBeNull();
    click(root, "Dieses Gerät trennen"); expect(root.querySelector("#code")).not.toBeNull();
  });
  it("Elternseite: kein Netz zeigt Meldung, Diagramm ohne Absturz bei leeren Daten", async () => {
    const storage = mem(); storage.setItem("silbenflug.eltern.token", "a".repeat(64)); const root = document.createElement("div");
    const m = mount(root, { base: "http://x", storage, fetchFn: async () => { throw new Error("offline"); } }); await m.ready; await flush();
    expect(root.textContent).toContain("Keine Verbindung"); expect(storage.getItem("silbenflug.eltern.token")).not.toBeNull();   // Kopplung bleibt erhalten
    expect(rundenDiagramm([]).tagName.toLowerCase()).toBe("svg");
  });
});
