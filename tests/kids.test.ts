// @vitest-environment jsdom
// Kinder-App: Lernlogik (reine Funktionen), Offline-Puffer und kompletter Ablauf der Oberfläche gegen den echten Server (im Speicher).
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";
import { hashPassword } from "../apps/server/src/crypto";
import { DEFAULT_CONFIG } from "@silbenflug/shared";
import { buildSyllables, structureWords } from "@silbenflug/core";
import { canPractice, emptyState, adoptServer, finishRound, prepareRound } from "../apps/kids/src/logic";
import { ApiError, createKidsApi, flushQueue } from "../apps/kids/src/api";
import type { QueuedRound } from "../apps/kids/src/api";
import { mountKids } from "../apps/kids/src/ui";
import { mulberry32 } from "./helpers";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const cfg = DEFAULT_CONFIG;
const plan = { classId: "k", letters: ["o", "l", "e"], syllables: structureWords(["o", "l", "e"]) };

describe("Lernlogik der Kinder-App", () => {
  it("Runde: 20 Aufgaben aus den freigegebenen Buchstaben", () => {
    const s = prepareRound(plan, cfg, emptyState(), mulberry32(1));
    expect(s.tasks.length).toBe(20); expect(s.shown.length).toBe(20);
    expect(s.tasks.every((t) => /^[ole]+$/.test(t) && t.length >= 1)).toBe(true);
    expect(s.shown.every((x, i) => x.toLowerCase() === s.tasks[i])).toBe(true);
    expect(s.letters).toEqual(plan.letters);
  });
  it("zu wenige Silben: keine Übung", () => {
    expect(canPractice({ classId: null, letters: [], syllables: [] }, cfg)).toBe(false);
    expect(canPractice({ classId: null, letters: ["x", "y"], syllables: [] }, cfg)).toBe(false);
    expect(canPractice(plan, cfg)).toBe(true);
  });
  it("Rundenende merkt die Silbenzeiten; der Server-Stand ersetzt den lokalen", () => {
    const s = prepareRound(plan, cfg, emptyState(), mulberry32(2)), syl = s.tasks.map((t) => ({ s: t, sec: 3 }));
    const st = finishRound(emptyState(), { seconds: 150, syllables: syl }, cfg);
    expect(Object.keys(st.sylTimes).length).toBeGreaterThan(0);
    expect(adoptServer({ sylTimes: { ol: [1.5] } }).sylTimes).toEqual({ ol: [1.5] }); expect(adoptServer(null).sylTimes).toEqual({});
  });
});


describe("Offline-Puffer", () => {
  const rnd = (id: string): QueuedRound => ({ clientRoundId: id, seconds: 10, syllables: [{ s: "ol", sec: 1 }], letters: ["o", "l"], playedAt: new Date().toISOString() });
  const fakeApi = (script: Array<number | "net">) => { const calls: string[] = []; const api = createKidsApi({ base: "http://x", fetchFn: async (_u, o) => { calls.push(JSON.parse(o.body).clientRoundId); const s = script.shift() ?? 201; if (s === "net") throw new Error("offline"); return { ok: s < 400, status: s, text: async () => JSON.stringify(s < 400 ? { ok: true } : { error: "x" }) }; } }); return { api, calls }; };
  it("Netzfehler: Rest bleibt, Reihenfolge bleibt", async () => {
    const { api } = fakeApi([201, "net"]), r = await flushQueue(api, [rnd("a"), rnd("b"), rnd("c")]);
    expect(r.queue.map((x) => x.clientRoundId)).toEqual(["b", "c"]); expect(r.result).toMatchObject({ sent: 1, left: 2, offline: true, authLost: false });
  });
  it("abgelehnte Runde blockiert nicht, 401 und Serverfehler lassen alles liegen", async () => {
    expect((await flushQueue(fakeApi([400, 201]).api, [rnd("a"), rnd("b")])).queue.length).toBe(0);
    const a = await flushQueue(fakeApi([401]).api, [rnd("a"), rnd("b")]); expect(a.result.authLost).toBe(true); expect(a.queue.length).toBe(2);
    const b = await flushQueue(fakeApi([503]).api, [rnd("a")]); expect(b.queue.length).toBe(1); expect(b.result.offline).toBe(false);
  });
  it("ApiError trägt den Status", () => { expect(new ApiError(0, "x").status).toBe(0); });
});

describe("Kinder-App gegen echten Server", () => {
  let app: ReturnType<typeof createApp>, raw: any, offline = false, clock = Date.parse("2026-11-01T10:00:00Z");
  const call = async (method: string, path: string, token?: string | null, body?: unknown) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  const tick = () => new Promise((r) => setTimeout(r, 25)), flush = async () => { for (let i = 0; i < 14; i++) await tick(); };
  const click = (root: ParentNode, text: string) => { const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent?.trim() === text); if (!b) throw new Error("Button fehlt: " + text); (b as HTMLElement).click(); };
  const play = (root: HTMLElement, n = 20) => { for (let i = 0; i < n; i++) { clock += 1500; click(root, "Weiter"); } };
  let code = "", kidTok = "", classId = "";

  beforeEach(async () => {
    offline = false; clock = Date.parse("2026-11-01T10:00:00Z");
    raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON");
    migrateLocal(raw, process.cwd() + "/db/migrations");
    app = createApp({ db: nodeSqliteDb(raw), pepper: "p".repeat(40), iterations: 1000, now: () => new Date(clock) });
    const at = new Date(clock).toISOString();
    raw.prepare("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('adm','admin@test.de',?,'admin',NULL,1,?,?)").run(await hashPassword("admin-passwort-1", 1000), at, at);
    const adm = (await call("POST", "/auth/login", null, { email: "admin@test.de", password: "admin-passwort-1" })).json.token;
    const s = (await call("POST", "/admin/schools", adm, { name: "Schule" })).json;
    await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "zahlung_bestaetigt", licenseEnd: "2099-01-01T00:00:00Z" });
    const sl = (await call("POST", "/admin/staff", adm, { role: "schulleitung", schoolId: s.id, email: "l@t.de" })).json, lead = (await call("POST", "/auth/login", null, { email: "l@t.de", password: sl.initialPassword })).json.token;
    const y = (await call("POST", `/schools/${s.id}/years`, lead, { label: "26/27" })).json, k = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1a" })).json; classId = k.id;
    code = (await call("POST", `/classes/${k.id}/students`, lead, { names: ["Mia"] })).json[0].code;
    expect((await call("POST", `/classes/${k.id}/releases`, lead, { letters: ["o", "l"] })).status).toBe(201);
    kidTok = (await call("POST", "/student/login", null, { code })).json.token;
  });
  const roundsOnServer = () => raw.prepare("SELECT COUNT(*) AS n FROM rounds").get().n as number;
  const mount = () => { const root = document.createElement("div"), storage = mem(); document.body.appendChild(root); const m = mountKids(root, { base: "http://x", storage, rng: mulberry32(7), now: () => clock, fetchFn: async (u, o) => { if (offline) throw new Error("offline"); const r = await app.request(u.replace("http://x", ""), o); return { ok: r.ok, status: r.status, text: () => r.text() }; } }); return { root, storage, ready: m.ready }; };
  async function prefill() {   // 10 schnelle Durchgänge über den ganzen Silbenumfang -> Bronze, Silber, Gold stehen als neue Auszeichnung an
    const all = structureWords(["o", "l"]);
    for (let i = 0; i < 10; i++) expect((await call("POST", "/student/rounds", kidTok, { clientRoundId: "pre" + i, seconds: 40, syllables: all.map((s) => ({ s, sec: 1 })), letters: ["o", "l"] })).status).toBe(201);
  }

  it("falscher Merkschlüssel zeigt eine freundliche Meldung, richtiger führt zur Übersicht", async () => {
    const { root, ready } = mount(); await ready; await flush();
    const inp = root.querySelector("#code") as HTMLInputElement; inp.value = "Falsch-Falsch-00"; click(root, "Anmelden"); await flush();
    expect(root.textContent).toContain("nicht richtig"); expect(root.querySelector("#lgrid")).toBeNull();
    (root.querySelector("#code") as HTMLInputElement).value = code.toUpperCase(); click(root, "Anmelden"); await flush();
    expect(root.textContent).toContain("Hallo, Mia!"); expect(root.querySelectorAll("#lgrid .lt").length).toBe(26); expect(root.querySelectorAll("#lgrid .lt.on").length).toBe(2);
    expect((root.querySelector("#start") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Auszeichnungen: Popup nur mit höchster Stufe, ohne Prozentwerte, Bestätigung wird gesendet", async () => {
    await prefill();
    const { root, ready } = mount(); await ready; await flush(); (root.querySelector("#code") as HTMLInputElement).value = code; click(root, "Anmelden"); await flush();
    expect(root.querySelector(".dlg")!.textContent).toContain("Neue"); click(root, "Los geht's!"); await flush();
    const dlg = root.querySelector(".dlg"); expect(dlg).not.toBeNull();
    expect(dlg!.textContent).toContain("Gold"); expect(dlg!.textContent).not.toContain("Bronze"); expect(dlg!.textContent).not.toContain("%");
    expect(root.querySelector("#lgrid")!.textContent).not.toContain("%"); expect(root.querySelectorAll("#lgrid .medal").length).toBe(2);
    click(root, "Toll!"); await flush(); expect(root.querySelector(".dlg")).toBeNull();
    expect((await call("GET", "/student/awards", kidTok)).json.pending).toEqual([]);
  });

  it("Übung: 20 Aufgaben, Zeit am Rundenende, die Runde kommt beim Server an; Sitzung bleibt nach Neustart", async () => {
    const a = mount(); await a.ready; await flush(); (a.root.querySelector("#code") as HTMLInputElement).value = code; click(a.root, "Anmelden"); await flush();
    click(a.root, "Übung starten"); expect(a.root.querySelector("#prog")!.textContent).toBe("Aufgabe 1 von 20");
    clock += 1500; click(a.root, "Weiter"); expect(a.root.querySelector("#prog")!.textContent).toBe("Aufgabe 1 von 20");   // erst Sterne, dann Übergang
    await new Promise((r) => setTimeout(r, 400)); expect(a.root.querySelector("#prog")!.textContent).toBe("Aufgabe 2 von 20");
    play(a.root, 19); await flush();
    expect(a.root.textContent).toContain("Herzlichen Glückwunsch, Mia!"); expect(a.root.textContent).toMatch(/Deine Zeit\s*\d+ Sekunden/);
    expect(roundsOnServer()).toBe(1);
    expect((await call("GET", "/student/auto-state", kidTok)).status).toBe(404);
    click(a.root, "Ende"); expect(a.root.textContent).toContain("Hallo, Mia!");
    const b = (() => { const root = document.createElement("div"); const m = mountKids(root, { base: "http://x", storage: a.storage, rng: mulberry32(9), now: () => clock, fetchFn: async (u, o) => { const r = await app.request(u.replace("http://x", ""), o); return { ok: r.ok, status: r.status, text: () => r.text() }; } }); return { root, ready: m.ready }; })();
    await b.ready; await flush(); expect(b.root.textContent).toContain("Hallo, Mia!");
  });

  it("ohne Netz: Runde wird gemerkt, später gesendet, nie doppelt", async () => {
    const a = mount(); await a.ready; await flush(); (a.root.querySelector("#code") as HTMLInputElement).value = code; click(a.root, "Anmelden"); await flush();
    offline = true; click(a.root, "Übung starten"); play(a.root); await flush();
    expect(a.root.textContent).toMatch(/Deine Zeit\s*\d+ Sekunden/); expect(roundsOnServer()).toBe(0);
    click(a.root, "Ende"); expect(a.root.textContent).toContain("Gemerkt, wird später gesendet: 1");
    click(a.root, "Übung starten"); expect(a.root.querySelector("#prog")).not.toBeNull();   // Übung geht offline weiter
    click(a.root, "×"); offline = false; window.dispatchEvent(new Event("online")); await flush();
    expect(roundsOnServer()).toBe(1); expect(a.root.textContent).not.toContain("Gemerkt");
    const q = JSON.parse(a.storage.getItem("silbenflug.kind.data." + (JSON.parse(a.storage.getItem("silbenflug.kind.session")!)).studentId)!).queue; expect(q).toEqual([]);
    window.dispatchEvent(new Event("online")); await flush(); expect(roundsOnServer()).toBe(1);
  });

  it("zwei Geräte desselben Kindes: Silbenzeiten kommen über den Server auf das andere Gerät", async () => {
    const a = mount(), b = mount(); await a.ready; await b.ready; await flush();
    for (const x of [a, b]) { (x.root.querySelector("#code") as HTMLInputElement).value = code; click(x.root, "Anmelden"); await flush(); }
    const dataOf = (m: { storage: { getItem(k: string): string | null } }) => { const sess = JSON.parse(m.storage.getItem("silbenflug.kind.session")!); return JSON.parse(m.storage.getItem("silbenflug.kind.data." + sess.studentId)!); };
    expect(Object.keys(dataOf(b).st.sylTimes).length).toBe(0);
    click(a.root, "Übung starten"); play(a.root); await flush(); click(a.root, "Ende");
    expect(Object.keys(dataOf(a).st.sylTimes).length).toBeGreaterThan(0);
    window.dispatchEvent(new Event("online")); await flush();   // Gerät B gleicht ab
    expect(Object.keys(dataOf(b).st.sylTimes).sort()).toEqual(Object.keys(dataOf(a).st.sylTimes).sort());
    expect(dataOf(b).st.sylTimes).toEqual(dataOf(a).st.sylTimes);
    const r = await call("GET", "/student/sync-data", kidTok); expect(r.status).toBe(200); expect(Object.keys(r.json.sylTimes).length).toBeGreaterThan(0);
    expect((await call("GET", "/student/sync-data", null)).status).toBe(401);
  });

  it("abgelaufene Anmeldung: zurück zur Anmeldung, gemerkte Runden bleiben erhalten", async () => {
    const a = mount(); await a.ready; await flush(); (a.root.querySelector("#code") as HTMLInputElement).value = code; click(a.root, "Anmelden"); await flush();
    offline = true; click(a.root, "Übung starten"); play(a.root); await flush(); click(a.root, "Ende");
    raw.prepare("DELETE FROM student_sessions").run(); offline = false; window.dispatchEvent(new Event("online")); await flush();
    expect(a.root.querySelector("#code")).not.toBeNull(); expect(roundsOnServer()).toBe(0);
    (a.root.querySelector("#code") as HTMLInputElement).value = code; click(a.root, "Anmelden"); await flush();
    expect(roundsOnServer()).toBe(1);   // nach erneuter Anmeldung wird nachgesendet
  });
});
