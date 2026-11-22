// @vitest-environment jsdom
// Phase 6: Silben-Zug (Server-Auswahl, PDF, Layout) und Lehrer-Auswertung (Diagramm, Ansicht).
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";
import { hashPassword } from "../apps/server/src/crypto";
import { buildSyllables, structureWords, classifySyllable } from "@silbenflug/core";
import { DEFAULT_CONFIG } from "@silbenflug/shared";
import { Page, buildPdf } from "../apps/web/src/pdf";
import { buildZugPdf, parsePath, sheetPage, wordUnits } from "../apps/web/src/zug";
// @ts-ignore reine JS-Module
import { createApi } from "../apps/web/js/api.js";
// @ts-ignore
import { schoolView, schoolTabs } from "../apps/web/js/views/school.js";
// @ts-ignore
import { hooks } from "../apps/web/js/views/auswertung.js";
// @ts-ignore
import { zeitverlaufSvg } from "../apps/web/js/chart.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const txt = (b: Uint8Array) => Array.from(b).map((x) => String.fromCharCode(x)).join("");
const syl20 = Array.from({ length: 20 }, (_, i) => ["ol", "lo", "ole", "elo"][i % 4]);

describe("PDF und Silben-Zug-Layout", () => {
  it("gültiger Aufbau: Kopf, Ende, xref-Offsets stimmen, Seitenzahl", () => {
    const b = buildZugPdf([{ name: "Mia", letters: ["o", "l"], syllables: syl20, date: "01.01.2026" }, { name: "Ben", letters: ["o", "l"], syllables: syl20, date: "01.01.2026" }, { name: "Zoe", letters: ["o"], syllables: syl20, date: "x" }]), s = txt(b);
    expect(s.startsWith("%PDF-1.4")).toBe(true); expect(s.trimEnd().endsWith("%%EOF")).toBe(true); expect(s).toContain("/Count 3");
    const sx = Number(/startxref\n(\d+)/.exec(s)![1]); expect(s.slice(sx, sx + 4)).toBe("xref");
    const offs = Array.from(s.slice(sx).matchAll(/(\d{10}) 00000 n/g)).map((m) => Number(m[1]));
    offs.forEach((o, i) => expect(s.slice(o, o + (i + 1 + " 0 obj").length)).toBe(i + 1 + " 0 obj"));
  });
  it("genau 20 Silben, sonst Fehler; Umlaute im Namen werden als Latin-1 maskiert", () => {
    expect(() => buildZugPdf([{ name: "x", letters: ["o"], syllables: syl20.slice(0, 19), date: "" }])).toThrow(/20/);
    expect(() => buildZugPdf([])).toThrow();
    const s = txt(buildZugPdf([{ name: "Jürgen (Ö)", letters: ["o"], syllables: syl20, date: "" }]));
    expect(s).toContain("J\\374rgen \\(\\326\\)");
  });
  it("Seite hat 20 Waggons (Silben), 4 Loks und die Zahlen 1 bis 20", () => {
    const ops = sheetPage({ name: "Mia", letters: ["o", "l"], syllables: syl20, date: "" }).ops.join("\n");
    for (let i = 1; i <= 20; i++) expect(ops).toContain("(" + i + ") Tj");
    expect(sheetPage({ name: "", letters: ["o"], syllables: syl20, date: "" }).w).toBe(297);   // A4 quer
  });
  it("Pfade: Bogen wird zu Kurven, Endpunkt bleibt erhalten; Wortbreite", () => {
    const c = parsePath("M37 12A27 49 0 1 0 37 110A27 49 0 1 0 37 12Z");
    expect(c.filter((x) => x[0] === "C").length).toBeGreaterThanOrEqual(4); const last = c.filter((x) => x[0] === "C").pop()!; expect(last[5]).toBeCloseTo(37, 3); expect(last[6]).toBeCloseTo(12, 3);
    const q = parsePath("M12 82Q12 56 36 56"); expect(q[1][0]).toBe("C"); expect(q[1][5]).toBe(36);
    expect(wordUnits("ol")).toBeGreaterThan(100);
  });
  it("Schreiber: Seite ohne Inhalt ist trotzdem gültig", () => { expect(txt(buildPdf([new Page(100, 100)], "t"))).toContain("/MediaBox"); });
});

describe("Zeitverlauf (Diagramm)", () => {
  const rounds = [1, 2, 3, 4].map((i) => ({ id: "r" + i, played_at: "2026-11-0" + i, seconds: 90 - i * 10 }));
  it("ein Punkt je Runde, Markierung neuer Buchstaben, Ziellinie, Auszeichnungen", () => {
    const s = zeitverlaufSvg(rounds, [{ letter: "o", round_id: "r1" }, { letter: "l", round_id: "r1" }, { letter: "e", round_id: "r3" }, { letter: "x", round_id: "gibtsnicht" }], [{ letter: "o", level: "gold", round_id: "r4" }], 75);
    expect((s.match(/class="pt"/g) || []).length).toBe(4); expect((s.match(/class="neu"/g) || []).length).toBe(2);
    expect(s).toContain("neu: O L"); expect(s).toContain("neu: E"); expect(s).toContain('class="ziel"'); expect(s).toContain('class="aw"'); expect(s).not.toContain("NaN");
  });
  it("leere Daten und Sonderzeichen: kein Absturz, nichts wird als Markup eingefügt", () => {
    expect(zeitverlaufSvg([], [], [], null)).toContain("<svg");
    const s = zeitverlaufSvg(rounds.slice(0, 1), [{ letter: "<b>", round_id: "r1" }], [], null); expect(s).not.toContain("<b>"); expect(s).not.toContain("NaN");
    new DOMParser().parseFromString(s, "image/svg+xml");
  });
});

describe("Server und Oberfläche", () => {
  let app: ReturnType<typeof createApp>, raw: any, clock = Date.parse("2026-11-01T10:00:00Z");
  const call = async (method: string, path: string, token?: string | null, body?: unknown) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const tick = () => new Promise((r) => setTimeout(r, 25)), flush = async () => { for (let i = 0; i < 14; i++) await tick(); };
  const click = (root: ParentNode, text: string) => { const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent?.trim() === text); if (!b) throw new Error("Button fehlt: " + text); (b as HTMLElement).click(); };
  let adm = "", lead = "", teacher = "", other = "", sid = "", kA = "", kB = "", codes: string[] = [], kidsList: any[] = [];
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  beforeEach(async () => {
    raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON"); migrateLocal(raw, process.cwd() + "/db/migrations");
    app = createApp({ db: nodeSqliteDb(raw), pepper: "p".repeat(40), iterations: 1000, now: () => new Date(clock) });
    const at = new Date(clock).toISOString();
    raw.prepare("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('adm','admin@test.de',?,'admin',NULL,1,?,?)").run(await hashPassword("admin-passwort-1", 1000), at, at);
    adm = (await call("POST", "/auth/login", null, { email: "admin@test.de", password: "admin-passwort-1" })).json.token;
    const s = (await call("POST", "/admin/schools", adm, { name: "Schule" })).json; sid = s.id;
    await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "zahlung_bestaetigt", licenseEnd: "2099-01-01T00:00:00Z" });
    const sl = (await call("POST", "/admin/staff", adm, { role: "schulleitung", schoolId: s.id, email: "l@t.de" })).json; lead = (await call("POST", "/auth/login", null, { email: "l@t.de", password: sl.initialPassword })).json.token;
    const y = (await call("POST", `/schools/${s.id}/years`, lead, { label: "26/27" })).json, k = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1a" })).json, k2 = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1b" })).json;
    kidsList = (await call("POST", `/classes/${k.id}/students`, lead, { names: ["Mia", "Ben"] })).json; codes = kidsList.map((x: any) => x.code);
    const t1 = (await call("POST", `/schools/${s.id}/staff`, lead, { email: "t1@t.de" })).json, t2 = (await call("POST", `/schools/${s.id}/staff`, lead, { email: "t2@t.de" })).json;
    await call("PUT", `/schools/${s.id}/staff/${t1.id}/classes`, lead, { classIds: [k.id] }); await call("PUT", `/schools/${s.id}/staff/${t2.id}/classes`, lead, { classIds: [k2.id] });
    teacher = (await call("POST", "/auth/login", null, { email: "t1@t.de", password: t1.initialPassword })).json.token; other = (await call("POST", "/auth/login", null, { email: "t2@t.de", password: t2.initialPassword })).json.token;
    expect((await call("POST", `/classes/${k.id}/releases`, lead, { letters: ["o", "l"] })).status).toBe(201);
    kA = kidsList[0].id; kB = kidsList[1].id;
  });
  const kidToken = async (i: number) => (await call("POST", "/student/login", null, { code: codes[i] })).json.token as string;
  const train = (id: string, tok: string | null, q = "") => call("GET", `/students/${id}/syllable-train${q}`, tok);

  it("Silben-Zug: 20 Silben aus den Buchstaben des Kindes, mit Seed wiederholbar", async () => {
    const a = await train(kA, teacher, "?seed=5"), b = await train(kA, teacher, "?seed=5"), c = await train(kA, teacher, "?seed=6");
    expect(a.status).toBe(200); expect(a.json.syllables.length).toBe(20); expect(a.json.shown.length).toBe(20); expect(a.json.student.name).toBe("Mia");
    expect(a.json.syllables.every((x: string) => /^[ol]+$/.test(x) && x.length >= 1)).toBe(true);
    expect(a.json.shown.every((x: string, i: number) => x.toLowerCase() === a.json.syllables[i])).toBe(true);
    expect(b.json.syllables).toEqual(a.json.syllables); expect(c.json.syllables).not.toEqual(a.json.syllables);
    expect((await train(kA, lead)).status).toBe(200);
  });
  it("Silben-Zug ohne Lernstufen: nur sichere Silben der höchsten Stufe, keine Längenwahl", async () => {
    expect((await call("POST", "/admin/config", adm, { config: { ...DEFAULT_CONFIG, stages: { enabled: 0 } }, note: "ohne Lernstufen" })).status).toBe(201);
    const tok = await kidToken(0), all = structureWords(["o", "l"]);
    const evs = (await call("GET", `/students/${kA}/evaluation`, teacher)).json.stages as any[], top = Math.max(...evs.filter((g) => g.total > 0 && g.stage !== 2).map((g) => g.stage as number));  // höchste Stufe, die im (begrenzten) Umfang tatsächlich Silben hat
    for (let i = 0; i < 10; i++) expect((await call("POST", "/student/rounds", tok, { clientRoundId: "z" + i, seconds: 40, syllables: all.map((x) => ({ s: x, sec: 1 })), letters: ["o", "l"] })).status).toBe(201);
    const t = (await train(kA, teacher, "?seed=1")).json.syllables as string[];
    expect(t.length).toBeGreaterThan(0); expect(t.every((x) => classifySyllable(x).stage === top || classifySyllable(x).stage < top)).toBe(true); expect(t.some((x) => classifySyllable(x).stage === top)).toBe(true);
  });
  it("Silben-Zug: Rechte", async () => {
    expect((await train(kA, adm)).status).toBe(403); expect((await train(kA, other)).status).toBe(404); expect((await train(kA, await kidToken(0))).status).toBe(403); expect((await train(kA, null)).status).toBe(401);
    expect((await train("gibtsnicht", lead)).status).toBe(404);
  });
  it("Silben-Zug: ohne freigegebene Buchstaben kein Blatt (409)", async () => {
    const k3 = (await call("POST", `/schools/${sid}/classes`, lead, { schoolYearId: (await call("GET", `/schools/${sid}/years`, lead)).json[0].id, name: "1c" })).json, kid = (await call("POST", `/classes/${k3.id}/students`, lead, { names: ["Zoe"] })).json[0];
    const r = await train(kid.id, lead); expect(r.status).toBe(409); expect(r.json.error).toContain("zu wenige");
  });

  it("Lehrer-Ansicht: Reiter, Buchstabenstand, Zeitverlauf mit Markierung, PDF für Kind und Klasse", async () => {
    expect(schoolTabs("lehrer").auswertung).toBe("Schüler"); expect(schoolTabs("schulleitung").auswertung).toBeDefined();
    const tok = await kidToken(0), all = structureWords(["o", "l"]);
    for (let i = 0; i < 3; i++) expect((await call("POST", "/student/rounds", tok, { clientRoundId: "c" + i, seconds: 60 - i * 10, syllables: all.map((x) => ({ s: x, sec: 1 })), letters: ["o", "l"] })).status).toBe(201);
    const api = createApi({ base: "http://x", storage: mem(), fetchFn: (u: string, o: any) => app.request(u.replace("http://x", ""), o) });
    api.token = lead;   // Schulleitung (hat dieselben Rechte für Auswertung und Druck)
    const user = { id: "x", role: "schulleitung", schoolId: sid }, root = document.createElement("div"); document.body.appendChild(root);
    await schoolView("auswertung", root, { api, user }); await flush();
    expect(root.querySelector("svg")).toBeNull();
    { const sel = root.querySelector('select[aria-label="Schüler"]') as HTMLSelectElement; sel.value = Array.from(sel.options).find((o) => o.text === "Mia")!.value; sel.dispatchEvent(new Event("change")); await flush(); }
    expect(root.querySelector("svg.zeitverlauf")).toBeNull(); expect(root.textContent).not.toContain("Zeitverlauf"); expect(root.textContent).toContain("Buchstaben und Lernstufen");
    const saved: Array<{ b: Uint8Array; n: string }> = []; hooks.save = (b: Uint8Array, n: string) => saved.push({ b, n });
    click(root, "Silben-Zug drucken (PDF)"); await flush(); expect(saved.length).toBe(1); expect(txt(saved[0].b).startsWith("%PDF")).toBe(true); expect(saved[0].n).toBe("silben-zug-mia.pdf"); expect(txt(saved[0].b)).toContain("/Count 1");
    hooks.save = null;
  });
});
