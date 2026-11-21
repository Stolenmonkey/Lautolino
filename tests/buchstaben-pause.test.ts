// Buchstaben löschen (vor der ersten Runde) sowie pausieren und fortsetzen (danach): Server-Regeln, Umfang, Auswahl, Auszeichnungen.
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";
import { hashPassword } from "../apps/server/src/crypto";
import { rebuildAfterDelete, resumeScope } from "@silbenflug/engine";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const HOUR = 3600000;

describe("Buchstaben löschen, pausieren, fortsetzen", () => {
  let app: ReturnType<typeof createApp>, raw: any, clock = Date.parse("2026-11-16T10:00:00Z");
  let lead = "", cid = "", code = "", sid = "", yid = "";
  const call = async (method: string, path: string, token?: string | null, body?: unknown) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "1.1.1.1", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const later = () => { clock += HOUR; };
  const release = (letter: string) => call("POST", `/classes/${cid}/releases`, lead, { letter });
  const plan = async () => (await call("GET", `/classes/${cid}/plan`, lead)).json.releases as any[];
  const scopeOf = async (l: string) => (await call("GET", `/classes/${cid}/releases/${l}/scope`, lead)).json as string[];
  const kid = async () => (await call("POST", "/student/login", null, { code })).json.token as string;
  const play = async (id: string) => expect((await call("POST", "/student/rounds", await kid(), { clientRoundId: id, seconds: 20, syllables: [{ s: "lo", sec: 2 }, { s: "ol", sec: 2 }], letters: ["o", "l"] })).status).toBe(201);

  beforeEach(async () => {
    clock = Date.parse("2026-11-16T10:00:00Z");
    raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON"); migrateLocal(raw, process.cwd() + "/db/migrations");
    app = createApp({ db: nodeSqliteDb(raw), pepper: "p".repeat(40), iterations: 1000, now: () => new Date(clock), appUrl: "https://app.test/web/" });
    const at = new Date(clock).toISOString();
    raw.prepare("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('adm','admin@test.de',?,'admin',NULL,1,?,?)").run(await hashPassword("admin-passwort-1", 1000), at, at);
    const adm = (await call("POST", "/auth/login", null, { email: "admin@test.de", password: "admin-passwort-1" })).json.token;
    const s = (await call("POST", "/admin/schools", adm, { name: "Schule" })).json; sid = s.id;
    await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "zahlung_bestaetigt", licenseEnd: "2099-01-01T00:00:00Z" });
    const sl = (await call("POST", "/admin/staff", adm, { role: "schulleitung", schoolId: s.id, email: "l@t.de" })).json;
    lead = (await call("POST", "/auth/login", null, { email: "l@t.de", password: sl.initialPassword })).json.token;
    const y = (await call("POST", `/schools/${s.id}/years`, lead, { label: "26/27" })).json; yid = y.id;
    cid = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1a" })).json.id;
    code = (await call("POST", `/classes/${cid}/students`, lead, { names: ["Mia"] })).json[0].code;
    expect((await call("POST", `/classes/${cid}/releases`, lead, { letters: ["o", "l"] })).status).toBe(201);
  });

  it("Löschen: nur vor der ersten gespielten Runde, später freigegebene Buchstaben werden neu berechnet", async () => {
    later(); expect((await release("e")).status).toBe(201); later(); expect((await release("m")).status).toBe(201);
    expect((await scopeOf("m")).some((w) => w.includes("e"))).toBe(true);
    const r = await call("DELETE", `/classes/${cid}/releases/e`, lead);
    expect(r.status).toBe(200); expect(r.json.recomputed).toEqual(["m"]);
    const rel = await plan();
    expect(rel.map((x) => [x.letter, x.release_order])).toEqual([["o", 1], ["l", 2], ["m", 3]]);
    expect((await scopeOf("e")).length).toBe(0);
    expect((await scopeOf("m")).some((w) => w.includes("e"))).toBe(false);
    expect((await scopeOf("m")).length).toBeGreaterThan(0);
    // Startgruppe braucht mindestens 2 Buchstaben
    expect((await call("DELETE", `/classes/${cid}/releases/l`, lead)).status).toBe(409);
    // nicht freigegeben
    expect((await call("DELETE", `/classes/${cid}/releases/z`, lead)).status).toBe(404);
    // nach einer gespielten Runde nur noch Pausieren
    later(); await play("r1");
    const del = await call("DELETE", `/classes/${cid}/releases/m`, lead);
    expect(del.status).toBe(409); expect(String(del.json.error)).toMatch(/pausiert/);
    expect((await plan()).find((x) => x.letter === "m").played).toBe(1);
  });

  it("Löschen eines Startbuchstabens berechnet die Startgruppe neu", async () => {
    const c2 = (await call("POST", `/schools/${sid}/classes`, lead, { schoolYearId: yid, name: "1b" })).json.id;
    expect((await call("POST", `/classes/${c2}/releases`, lead, { letters: ["o", "l", "m"] })).status).toBe(201);
    const rel = (await call("GET", `/classes/${c2}/plan`, lead)).json.releases as any[], sc = async (l: string) => (await call("GET", `/classes/${c2}/releases/${l}/scope`, lead)).json as string[];
    expect(rel.every((x) => x.start_group === 1)).toBe(true);
    expect((await sc("o")).some((w) => w.includes("m"))).toBe(true);
    expect((await call("DELETE", `/classes/${c2}/releases/m`, lead)).status).toBe(200);
    for (const l of ["o", "l"]) expect((await sc(l)).some((w) => w.includes("m"))).toBe(false);
    expect(((await call("GET", `/classes/${c2}/plan`, lead)).json.releases as any[]).map((x) => x.letter)).toEqual(["o", "l"]);
  });

  it("Pausieren: erst nach gespielter Runde, mindestens 2 aktive Buchstaben, Zeiten bleiben", async () => {
    later(); await release("e");
    const early = await call("PUT", `/classes/${cid}/releases/e/pause`, lead, { paused: true });
    expect(early.status).toBe(409); expect(String(early.json.error)).toMatch(/gelöscht/);
    later(); await play("r1");
    expect((await call("PUT", `/classes/${cid}/releases/e/pause`, lead, { paused: true })).status).toBe(200);
    expect((await plan()).find((x) => x.letter === "e").paused_at).toBeTruthy();
    // nur noch o, l aktiv: l darf nicht auch noch pausiert werden
    expect((await call("PUT", `/classes/${cid}/releases/l/pause`, lead, { paused: true })).status).toBe(409);
    expect((await call("PUT", `/classes/${cid}/releases/e/pause`, lead, { paused: "ja" })).status).toBe(400);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM syllable_times").get().n).toBeGreaterThan(0);
  });

  it("Pausierter Buchstabe: nicht in Runden, nicht in neuen Silben; Fortsetzen ergänzt nur", async () => {
    later(); await release("e"); later(); await play("r1");
    const before = await scopeOf("e");
    expect((await call("PUT", `/classes/${cid}/releases/e/pause`, lead, { paused: true })).status).toBe(200);
    // Kind: Buchstabe e fehlt im Plan und in allen Silben, Übersicht zeigt ihn pausiert
    const tok = await kid(), pl = (await call("GET", "/student/plan", tok)).json;
    expect(pl.letters).toEqual(["o", "l"]);
    expect(Object.values(pl.scopes as Record<string, string[]>).flat().some((w) => w.includes("e"))).toBe(false);
    const aw = (await call("GET", "/student/awards", tok)).json.letters;
    expect(aw.find((x: any) => x.letter === "e")).toMatchObject({ released: false, paused: true });
    expect(aw.find((x: any) => x.letter === "o").paused).toBeUndefined();
    // neuer Buchstabe a: kein e in den neuen Silben
    later(); const a = await release("a");
    expect(a.status).toBe(201); expect((await scopeOf("a")).length).toBeGreaterThan(0);
    expect((await scopeOf("a")).some((w) => w.includes("e"))).toBe(false);
    // Fortsetzen: nur Ergänzung mit e und a, nichts entfernt, nichts doppelt
    later(); const res = await call("PUT", `/classes/${cid}/releases/e/pause`, lead, { paused: false });
    expect(res.status).toBe(200); expect(res.json.added).toBeGreaterThan(0);
    const after = await scopeOf("e"), added = after.filter((w) => !before.includes(w));
    expect(before.every((w) => after.includes(w))).toBe(true);
    expect(added.length).toBe(res.json.added);
    expect(added.every((w) => w.includes("e") && w.includes("a"))).toBe(true);
    expect((await plan()).find((x) => x.letter === "e").paused_at).toBeNull();
    expect((await call("GET", "/student/plan", await kid())).json.letters).toEqual(["o", "l", "e", "a"]);
  });

  it("Datenbank: Umfang nach gespielter Runde unveränderlich, davor löschbar", async () => {
    later(); await release("e");
    expect(() => raw.prepare("UPDATE letter_syllable_scope SET syllable='x' WHERE letter='e'").run()).toThrow();
    later(); await play("r1");
    expect(() => raw.prepare("DELETE FROM letter_syllable_scope WHERE letter='e'").run()).toThrow(/unveränderlich/);
    later(); await release("m");
    expect(() => raw.prepare("DELETE FROM letter_syllable_scope WHERE letter='m'").run()).not.toThrow();
  });

  it("Engine: rebuildAfterDelete und resumeScope", () => {
    const order = [{ letter: "o", start: true, paused: false }, { letter: "l", start: true, paused: false }, { letter: "e", start: false, paused: false }, { letter: "m", start: false, paused: false }];
    const r = rebuildAfterDelete(order, "e");
    expect(Object.keys(r)).toEqual(["m"]); expect(r.m.every((w) => w.includes("m") && !w.includes("e"))).toBe(true);
    const add = resumeScope(["o", "l", "m"], ["m"], "e", []);
    expect(add.length).toBeGreaterThan(0); expect(add.every((w) => w.includes("e") && w.includes("m"))).toBe(true);
  });
});
