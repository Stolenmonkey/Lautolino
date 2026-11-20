// @vitest-environment jsdom
// Läuft die Oberfläche (apps/web) gegen den echten Server (im Speicher)? Kompletter Ablauf: Admin -> Schule -> Schulleitung -> Lehrkraft -> Kinder -> Lernplan.
import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";
import { hashPassword } from "../apps/server/src/crypto";
// @ts-ignore reine JS-Module
import { createApi } from "../apps/web/js/api.js";
// @ts-ignore
import { adminView } from "../apps/web/js/views/admin.js";
// @ts-ignore
import { schoolView } from "../apps/web/js/views/school.js";
// @ts-ignore
import { loginView } from "../apps/web/js/views/login.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
let app: ReturnType<typeof createApp>;
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const mk = () => createApi({ base: "http://x", storage: mem(), fetchFn: (u: string, o: any) => app.request(u.replace("http://x", ""), o) });
const tick = () => new Promise((r) => setTimeout(r, 30));
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };
const click = (root: ParentNode, text: string) => { const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent?.trim() === text); if (!b) throw new Error("Button fehlt: " + text); (b as HTMLElement).click(); };

beforeAll(async () => {
  const raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON");
  migrateLocal(raw, process.cwd() + "/db/migrations");
  app = createApp({ db: nodeSqliteDb(raw), pepper: "p".repeat(40), iterations: 1000 });
  const at = new Date().toISOString();
  raw.prepare("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('adm','admin@test.de',?,'admin',NULL,1,?,?)").run(await hashPassword("admin-passwort-1", 1000), at, at);
});

describe("Oberfläche gegen echten Server", () => {
  it("Anmeldemaske: falsche Daten zeigen eine Meldung", async () => {
    const root = document.createElement("div"), api = mk(); let got: any = null;
    loginView(root, { api, onLogin: (u: any) => (got = u) });
    (root.querySelector("input[type=email]") as HTMLInputElement).value = "admin@test.de"; (root.querySelector("input[type=password]") as HTMLInputElement).value = "falsch";
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true })); await flush();
    expect(got).toBeNull(); expect(root.textContent).toContain("falsch");
    (root.querySelector("input[type=password]") as HTMLInputElement).value = "admin-passwort-1";
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true })); await flush();
    expect(got.role).toBe("admin");
  });

  it("kompletter Ablauf über die Ansichten", async () => {
    const adminApi = mk(), admin = await adminApi.login("admin@test.de", "admin-passwort-1");
    // Admin: Schule anlegen, aktivieren, Schulleitung anlegen
    let root = document.createElement("div");
    await adminView("schulen", root, { api: adminApi, user: admin }); await flush();
    const inputs = root.querySelectorAll("input[type=text]"); (inputs[inputs.length - 1] as HTMLInputElement).value = "Grundschule Test";
    click(root, "Schule anlegen"); await flush();
    expect(root.textContent).toContain("Grundschule Test"); expect(root.textContent).toContain("Angelegt");
    const schools = await adminApi.get("/admin/schools"), sid = schools[0].id;
    await adminApi.post(`/admin/schools/${sid}/license`, { action: "zahlung_bestaetigt", licenseEnd: "2099-01-01T00:00:00Z" });
    const lead = await adminApi.post("/admin/staff", { role: "schulleitung", schoolId: sid, email: "leitung@test.de" });
    // Admin: Konfiguration sichtbar und speicherbar
    root = document.createElement("div"); await adminView("konfiguration", root, { api: adminApi, user: admin }); await flush();
    expect(root.textContent).toContain("Globale Konfiguration (aktive Version 1)");
    const gold = root.querySelector('input[aria-label="award.share_percent"]') as HTMLInputElement; expect(gold.value).toBe("90"); gold.value = "85";
    click(root, "Als neue Version speichern"); await flush();
    expect(root.textContent).toContain("Neue Version 2"); expect((await adminApi.get("/config")).config.award.share_percent).toBe(85);
    // Schulleitung: Schuljahr und Klasse anlegen, Lehrkraft anlegen und zuweisen
    const leadApi = mk(), L = await leadApi.login("leitung@test.de", lead.initialPassword);
    await leadApi.post(`/schools/${sid}/years`, { label: "2026/27" });
    root = document.createElement("div"); await schoolView("klassen", root, { api: leadApi, user: L }); await flush();
    expect(root.textContent).toContain("2026/27");
    (root.querySelector('input[placeholder="z. B. 1a"]') as HTMLInputElement).value = "1a"; click(root, "Klasse anlegen"); await flush();
    expect(root.textContent).toContain("1a");
    root = document.createElement("div"); await schoolView("zugaenge", root, { api: leadApi, user: L }); await flush();
    (root.querySelector('input[type=email]') as HTMLInputElement).value = "lehrkraft@test.de"; click(root, "Anlegen"); await flush();
    const pwText = root.textContent!.match(/Startpasswort \(nur jetzt sichtbar\): (\S+)/)!; expect(pwText).toBeTruthy();
    const staff = await leadApi.get(`/schools/${sid}/staff`), t = staff.find((x: any) => x.role === "lehrer"), classes = await leadApi.get(`/schools/${sid}/classes`);
    await leadApi.put(`/schools/${sid}/staff/${t.id}/classes`, { classIds: [classes[0].id] });
    // Lehrkraft: Kinder anlegen, Buchstaben freigeben, Ausnahme setzen
    const tApi = mk(), T = await tApi.login("lehrkraft@test.de", pwText[1]);
    root = document.createElement("div"); await schoolView("schueler", root, { api: tApi, user: T }); await flush();
    (root.querySelector("textarea") as HTMLTextAreaElement).value = "Mia\nBen"; click(root, "Anlegen"); await flush();
    expect(root.textContent).toContain("2 Kinder angelegt"); expect(root.querySelectorAll(".code").length).toBe(8); /* 4 im Anlege-Panel, 4 (Kind+Eltern je 2 Kinder) in der Tabelle */
    const codes = Array.from(root.querySelectorAll(".code")).map((x) => x.textContent!);
    root = document.createElement("div"); await schoolView("lernplan", root, { api: tApi, user: T }); await flush();
    (root.querySelector('input[aria-label="Startbuchstaben"]') as HTMLInputElement).value = "O L"; click(root, "Startbuchstaben freigeben"); await flush();
    (root.querySelector('input[aria-label="Neuer Buchstabe"]') as HTMLInputElement).value = "e"; click(root, "Freigeben"); await flush();
    expect(root.textContent).toContain("E freigegeben"); expect(root.querySelectorAll("tbody tr").length).toBeGreaterThanOrEqual(3);
    const kids = await tApi.get(`/classes/${classes[0].id}/students`), mia = kids.find((k: any) => k.display_name === "Mia");
    const ex = root.querySelector(`input[aria-label="Mia ohne e"]`) as HTMLInputElement; ex.checked = true;
    const row = ex.closest("tr")!; click(row, "Speichern"); await flush();
    // Kind: Anmeldung und eigener Plan
    const kApi = mk(); const r = await kApi.post("/student/login", { code: codes[0] }); kApi.token = r.token;
    expect((await kApi.get("/student/plan")).letters).toEqual(r.student.displayName === "Mia" ? ["o", "l"] : ["o", "l", "e"]);
    expect(mia).toBeTruthy();
    // Rechte: Lehrkraft sieht keine Konfiguration, Kind keine Verwaltung
    await expect(tApi.get("/admin/schools")).rejects.toMatchObject({ status: 403 });
    await expect(kApi.get(`/classes/${classes[0].id}/plan`)).rejects.toMatchObject({ status: 403 });
  });
});
