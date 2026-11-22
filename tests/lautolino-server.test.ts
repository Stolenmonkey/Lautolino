// @vitest-environment jsdom
// Lautolino: Lernstufen-Auswertung, Klassenübersicht, Silbenübersicht, Codes, Einladung und Passwort-Zurücksetzen (Server) sowie die zugehörigen Oberflächen.
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";
import { CODE_WORDS, generateStudentCode, hashPassword, hmacHex, normalizeCode } from "../apps/server/src/crypto";
import type { Mail } from "../apps/server/src/mail";
import { resendMailer } from "../apps/server/src/mail";
import { buildSyllables, classifySyllable, splitSyllables, structureWords } from "@silbenflug/core";
import { sylStat, sylTimeParams, groupScope, syllableScope, scopeParams } from "@silbenflug/engine";
import { DEFAULT_CONFIG } from "@silbenflug/shared";
// @ts-ignore reine JS-Module
import { createApi } from "../apps/web/js/api.js";
// @ts-ignore
import { schoolView } from "../apps/web/js/views/school.js";
// @ts-ignore
import { loginView } from "../apps/web/js/views/login.js";
// @ts-ignore
import { forgotView, setPasswordView } from "../apps/web/js/views/passwort.js";
import { mountKids } from "../apps/kids/src/ui";
import { mulberry32 } from "./helpers";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const HOUR = 3600000;
const KV = "a e o la le lo ma me mo pa pe po".split(" ");   // Stufe 1: einzelne Vokale und KV

describe("Lautolino (Server und Oberfläche)", () => {
  let app: ReturnType<typeof createApp>, raw: any, clock = Date.parse("2026-11-16T10:00:00Z"), mails: Mail[] = [], failMail = false;
  let adm = "", lead = "", teacher = "", other = "", sid = "", cid = "", cid2 = "", kA = "", kB = "", codeA = "", codeB = "";
  const call = async (method: string, path: string, token?: string | null, body?: unknown, ip = "1.1.1.1") => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  const tick = () => new Promise((r) => setTimeout(r, 25)), flush = async () => { for (let i = 0; i < 14; i++) await tick(); };
  const click = (root: ParentNode, text: string, nth = 0) => { const b = Array.from(root.querySelectorAll("button")).filter((x) => x.textContent?.trim() === text)[nth]; if (!b) throw new Error("Button fehlt: " + text); (b as HTMLElement).click(); };
  const fetchTo = (u: string, o: any) => app.request(u.replace("http://x", ""), o);
  const login = (email: string, password: string) => call("POST", "/auth/login", null, { email, password });
  const newApp = (mailer: boolean) => createApp({ db: nodeSqliteDb(raw), pepper: "p".repeat(40), iterations: 1000, now: () => new Date(clock), appUrl: "https://app.test/web/",
    mailer: mailer ? async (m: Mail) => { if (failMail) throw new Error("Anbieter nicht erreichbar"); mails.push(m); } : undefined });
  const linkOf = (m: Mail, kind: "einladung" | "passwort-neu") => { const r = new RegExp("https://app\\.test/web/#" + kind + "=([0-9a-f]{64})").exec(m.text); expect(r, m.text).not.toBeNull(); return r![1]; };
  const rounds = async (tok: string, sylls: string[], n: number, sec: number | ((s: string, i: number) => number), prefix: string, letters = LETTERS) => {
    for (let i = 0; i < n; i++) expect((await call("POST", "/student/rounds", tok, { clientRoundId: prefix + i, seconds: 30, syllables: sylls.map((s) => ({ s, sec: typeof sec === "number" ? sec : sec(s, i) })), letters })).status).toBe(201);
  };
  const LETTERS = ["l", "e", "o", "a", "m", "p"];
  const kidTok = async (code: string) => (await call("POST", "/student/login", null, { code })).json.token as string;

  beforeEach(async () => {
    clock = Date.parse("2026-11-16T10:00:00Z"); mails = []; failMail = false;
    raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON"); migrateLocal(raw, process.cwd() + "/db/migrations");
    app = newApp(false);
    const at = new Date(clock).toISOString();
    raw.prepare("INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('adm','admin@test.de',?,'admin',NULL,1,?,?)").run(await hashPassword("admin-passwort-1", 1000), at, at);
    adm = (await login("admin@test.de", "admin-passwort-1")).json.token;
    const s = (await call("POST", "/admin/schools", adm, { name: "Schule" })).json; sid = s.id;
    await call("POST", `/admin/schools/${s.id}/license`, adm, { action: "zahlung_bestaetigt", licenseEnd: "2099-01-01T00:00:00Z" });
    const sl = (await call("POST", "/admin/staff", adm, { role: "schulleitung", schoolId: s.id, email: "l@t.de" })).json; lead = (await login("l@t.de", sl.initialPassword)).json.token;
    const y = (await call("POST", `/schools/${s.id}/years`, lead, { label: "26/27" })).json;
    cid = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1a" })).json.id; cid2 = (await call("POST", `/schools/${s.id}/classes`, lead, { schoolYearId: y.id, name: "1b" })).json.id;
    const t1 = (await call("POST", `/schools/${s.id}/staff`, lead, { email: "t1@t.de" })).json, t2 = (await call("POST", `/schools/${s.id}/staff`, lead, { email: "t2@t.de" })).json;
    await call("PUT", `/schools/${s.id}/staff/${t1.id}/classes`, lead, { classIds: [cid] }); await call("PUT", `/schools/${s.id}/staff/${t2.id}/classes`, lead, { classIds: [cid2] });
    teacher = (await login("t1@t.de", t1.initialPassword)).json.token; other = (await login("t2@t.de", t2.initialPassword)).json.token;
    const kids = (await call("POST", `/classes/${cid}/students`, lead, { names: ["Mia", "Ben"] })).json; kA = kids[0].id; kB = kids[1].id; codeA = kids[0].code; codeB = kids[1].code;
    expect((await call("POST", `/classes/${cid}/releases`, lead, { letters: LETTERS })).status).toBe(201);
  });

  // ---------------- 4.1 bis 4.4, 5: Lernstufen und Auswertung ----------------
  describe("Silbenübersicht der Klasse", () => {
    it("zeigt alle möglichen Silben mit Stufe und Unterkategorie, ohne ungültige oder doppelte", async () => {
      const r = await call("GET", `/classes/${cid}/syllables`, teacher); expect(r.status).toBe(200);
      const all = groupScope(LETTERS, scopeParams(DEFAULT_CONFIG)).filter((w) => !w.includes("+")); expect(r.json.total).toBe(all.length); expect(r.json.letters).toEqual(LETTERS); expect(r.json.allowedLengths).toBeUndefined();
      expect(r.json.stages.map((x: any) => x.stage)).toEqual([1, 2, 3, 4, 5, 6, 7]); expect(r.json.stages[0].subs.map((x: any) => x.id)).toEqual(["1.1", "1.2"]);
      expect(r.json.stages.filter((x: any) => x.stage !== 2).reduce((a: number, x: any) => a + x.total, 0)).toBe(all.length);
      const b2 = (await call("GET", `/classes/${cid}/syllables?stage=2`, teacher)).json; expect(b2.blocks).toBe(true); expect(b2.total).toBe(3);   // Stufe 2: je Vokal ein Kontrastblock aus den drei Konsonanten
      expect(b2.subs[0].syllables.map((x: any) => x.syllable).sort()).toEqual(["la+ma+pa", "le+me+pe", "lo+mo+po"]); expect(b2.subs[0].syllables[0]).toMatchObject({ block: true, blocked: false });
      const d = (await call("GET", `/classes/${cid}/syllables?stage=3`, teacher)).json, flat = d.subs.flatMap((u: any) => u.syllables);
      expect(new Set(flat.map((x: any) => x.syllable)).size).toBe(flat.length); expect(flat.every((x: any) => x.syllable.length >= 1 && x.letters.every((l: string) => LETTERS.includes(l)))).toBe(true);
      const mal = flat.find((x: any) => x.syllable === "mal"); expect(mal).toMatchObject({ letters: ["m", "a", "l"], newestLetter: "m", length: 3, parts: ["mal"] });
      expect(d.subs.map((u: any) => u.id)).toEqual(["3.1", "3.2"]); expect(d.subs[0].syllables.every((x: any) => classifySyllable(x.syllable).sub === "3.1")).toBe(true);
    });
    it("mehrsilbige Wörter (PAL-ME, MA-LA-MA) sind im Umfang, alle sieben Stufen erreichbar", async () => {
      const r = (await call("GET", `/classes/${cid}/syllables`, teacher)).json;
      expect(r.stages.filter((g: any) => g.stage !== 2 && g.stage !== 6).every((g: any) => g.total > 0)).toBe(true);
      const d = (await call("GET", `/classes/${cid}/syllables?stage=6`, teacher)).json; expect(d.subs.flatMap((u: any) => u.syllables).every((x: any) => x.parts.length === 3)).toBe(true);
    });
    it("später freigegebene Buchstaben erscheinen sofort in den richtigen Stufen", async () => {
      const before = (await call("GET", `/classes/${cid}/syllables`, teacher)).json.total;
      expect((await call("POST", `/classes/${cid}/releases`, teacher, { letter: "n" })).status).toBe(201);
      const after = (await call("GET", `/classes/${cid}/syllables`, teacher)).json; expect(after.total).toBeGreaterThan(before); expect(after.letters).toContain("n");
      const s1 = (await call("GET", `/classes/${cid}/syllables?stage=1`, teacher)).json.subs[1].syllables.map((x: any) => x.syllable), s3 = (await call("GET", `/classes/${cid}/syllables?stage=3`, teacher)).json.subs[0].syllables.map((x: any) => x.syllable);
      expect(s1).toContain("na"); expect(s3).toContain("an"); expect((await call("GET", `/classes/${cid}/syllables?stage=1`, teacher)).json.subs[1].syllables.find((x: any) => x.syllable === "na").newestLetter).toBe("n");
    });
    it("Rechte: fremde Klasse 404, Kind 403, ohne Anmeldung 401, ungültige Stufe 400", async () => {
      expect((await call("GET", `/classes/${cid}/syllables`, other)).status).toBe(404); expect((await call("GET", `/classes/${cid}/syllables`, await kidTok(codeA))).status).toBe(403);
      expect((await call("GET", `/classes/${cid}/syllables`, null)).status).toBe(401); expect((await call("GET", `/classes/${cid}/syllables?stage=9`, teacher)).status).toBe(400);
    });
  });

  describe("Stufenweiser Lernfortschritt", () => {
    it("am Anfang trainiert das Kind nur Stufe 1 und 2 (KV-Silben); höhere Stufen sind nicht freigeschaltet", async () => {
      const ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json;
      expect(ev.stages.map((s: any) => s.status)).toEqual(["active", "active", "locked", "locked", "locked", "empty", "locked"]); expect(ev.letters.every((l: any) => l.current === 1)).toBe(true);
    });
    it("nach sicher beherrschter Stufe 1 rückt der Schwerpunkt vor, Gelerntes wird wiederholt, Stufe 5 bis 7 bleiben gesperrt", async () => {
      const tok = await kidTok(codeA); await rounds(tok, KV, 10, 1, "kv");
      const ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json;
      expect(ev.stages.map((s: any) => s.status)).toEqual(["done", "active", "active", "locked", "locked", "empty", "locked"]);   // Stufe 2 (Kontrast) braucht eigene Kontrastzeiten; Modus 2: Stufe 4 erst, wenn Stufe 3 zu 80 % sicher ist
      expect(ev.letters.find((l: any) => l.letter === "m")).toMatchObject({ current: 2, window: [2, 3] });   // Stufe 2 (Kontrast) ist noch offen
      // die Übungsrunde (Silben-Zug) folgt der Freischaltung je Silbe: nur Stufe 3 (neu) und Stufe 1 (Wiederholung), nichts Gesperrtes
      const z = (await call("GET", `/students/${kA}/syllable-train?seed=3`, teacher)).json.syllables as string[];
      expect(z.every((s) => classifySyllable(s).stage <= 3)).toBe(true); expect(z.some((s) => classifySyllable(s).stage === 3)).toBe(true); expect(z.some((s) => KV.includes(s))).toBe(true);
    });
    it("Kontrastzeit (Stufe 2): getrennt gespeichert, 6 Messungen mit 1 gestrichen, Vorgabe 3 s; normale Zeit bleibt unberührt", async () => {
      const tok = await kidTok(codeA), CON = KV.filter((x) => x.length === 2);
      await rounds(tok, KV, 10, 1, "kv");
      const post = async (id: string, sec: number) => expect((await call("POST", "/student/rounds", tok, { clientRoundId: id, seconds: 30, syllables: CON.map((s) => ({ s, sec, k: 1 })), letters: LETTERS })).status).toBe(201);
      for (let i = 0; i < 5; i++) await post("kk" + i, 1);                                    // 5 Messungen: noch nicht bewertet
      let ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json;
      expect(ev.stages[1]).toMatchObject({ stage: 2, status: "active", mastered: 0 });
      await post("kk5", 1);                                                                   // 6 Messungen, schnell: Stufe 2 abgeschlossen
      ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json;
      expect(ev.stages[1]).toMatchObject({ stage: 2, status: "done", mastered: ev.stages[1].total });
      expect(ev.syllables.every((x: any) => !String(x.syllable).startsWith("k:"))).toBe(true);
      expect(ev.syllables.find((x: any) => x.syllable === "ma")).toMatchObject({ count: 10, stored: 10, status: "mastered", kStored: 6, kStatus: "mastered", kLimit: 3 });
      const k = (raw.prepare("SELECT COUNT(*) n FROM syllable_times WHERE student_id=? AND syllable='k:ma'").get(kA) as any).n; expect(k).toBe(6);
      for (let i = 0; i < 6; i++) await post("ks" + i, 4);                                    // danach nur langsam: Kontrast nicht mehr sicher, normale Zeit bleibt sicher
      ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json;
      expect(ev.syllables.find((x: any) => x.syllable === "ma")).toMatchObject({ status: "mastered", kStatus: "not_mastered" });
    });
    it("Kontrastblöcke werden beim Freigeben erzeugt und fest gespeichert; ein neuer Buchstabe ändert die alten nicht; Blöcke sind sperrbar", async () => {
      const blocksOf = () => (raw.prepare("SELECT letter, syllable FROM letter_syllable_scope WHERE class_id=? AND syllable LIKE '%+%' ORDER BY letter, syllable").all(cid) as any[]).map((x) => x.letter + ":" + x.syllable);
      const before = blocksOf(); expect(new Set(before.map((x) => x.split(":")[1]))).toEqual(new Set(["la+ma+pa", "le+me+pe", "lo+mo+po"]));
      expect((await call("POST", `/classes/${cid}/releases`, lead, { letter: "n" })).status).toBe(201);
      const after = blocksOf(); expect(after.filter((x) => !x.startsWith("n:"))).toEqual(before);                 // alte Blöcke unverändert
      expect(after.filter((x) => x.startsWith("n:")).map((x) => x.split(":")[1]).sort()).toEqual(["ma+na+pa", "me+ne+pe", "mo+no+po"]);   // neuer Konsonant mit den zwei zuletzt freigegebenen
      const b2 = (await call("GET", `/classes/${cid}/syllables?stage=2`, teacher)).json; expect(b2.total).toBe(6);
      expect((await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: "ma+na+pa", blocked: true })).status).toBe(200);
      expect((await call("GET", `/classes/${cid}/syllables?stage=2`, teacher)).json).toMatchObject({ total: 5, blocked: 1 });
      expect((await call("GET", "/student/plan", await kidTok(codeA))).json.blocks).not.toContainEqual(["ma", "na", "pa"]);   // gesperrter Block kommt nicht in die Übung
      expect((await call("GET", "/student/plan", await kidTok(codeA))).json.blocks).toContainEqual(["la", "ma", "pa"]);
    });
    it("Freigabe und Löschen mit vom Browser berechnetem Umfang (ohne Blöcke, auch mit Blöcken eines älteren Browsers): Server erzeugt die Blöcke", async () => {
      const sp = { ...scopeParams(DEFAULT_CONFIG), blocks: false }, syl = syllableScope(LETTERS, "n", sp), blocksOf = (l: string) => (raw.prepare("SELECT syllable FROM letter_syllable_scope WHERE class_id=? AND letter=? AND syllable LIKE '%+%' ORDER BY syllable").all(cid, l) as any[]).map((x) => x.syllable);
      expect(syl.some((w) => w.includes("+"))).toBe(false);
      expect((await call("POST", `/classes/${cid}/releases`, lead, { letter: "n", scopes: [{ letter: "n", syllables: syl }] })).status).toBe(201);
      expect(blocksOf("n")).toEqual(["ma+na+pa", "me+ne+pe", "mo+no+po"]);
      expect((await call("DELETE", `/classes/${cid}/releases/n`, lead, { scopes: [] })).status).toBe(200); expect(blocksOf("n")).toEqual([]);
      expect((await call("POST", `/classes/${cid}/releases`, lead, { letter: "n", scopes: [{ letter: "n", syllables: [...syl, "ma+na+pa"] }] })).status).toBe(201);   // älterer Browser schickt Blöcke mit
      expect(blocksOf("n")).toEqual(["ma+na+pa", "me+ne+pe", "mo+no+po"]);
    });
    it("Schalter stages.enabled = 0: Silbenauswahl wie bisher ohne Lernstufen", async () => {
      expect((await call("POST", "/admin/config", adm, { config: { ...DEFAULT_CONFIG, stages: { enabled: 0 } } })).status).toBe(201);
      expect((await call("GET", "/config", adm)).json.config.stages.enabled).toBe(0);
    });
    it("ältere gespeicherte Konfigurationen ohne Lernstufen-Werte funktionieren (Standardwerte werden ergänzt)", async () => {
      const old: any = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); delete old.stages; delete old.security.invite_hours; delete old.security.parent_session_days;
      raw.exec("UPDATE config_versions SET is_active=0"); raw.prepare("INSERT INTO config_versions(json,valid_from,changed_by,change_note,is_active) VALUES(?,?,?,?,1)").run(JSON.stringify(old), new Date(clock).toISOString(), "t", "alt");
      const c = (await call("GET", "/config", adm)).json.config; expect(c.stages).toMatchObject({ enabled: 1, gate_percent: 80 }); expect(c.security.invite_hours).toBe(72);
    });
  });

  describe("Detaillierte Silbenauswertung", () => {
    it("je Silbe: Ø Lesezeit, Abfragen, Messungen innerhalb der Vorgabe, Status, Stufe; Mindestzahl 10 bleibt; alle Abfragen bleiben zählbar", async () => {
      const tok = await kidTok(codeA);
      await rounds(tok, KV.filter((x) => x !== "ma"), 10, 1, "a");                                                  // 10 Messungen, schnell
      await rounds(tok, ["ma"], 9, 1, "b");                                                                         // nur 9 Messungen: noch nicht bewertet
      await rounds(tok, ["pe"], 4, 9, "c");                                                                         // 14 Messungen, 4 davon langsam
      let ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json, row = (s: string) => ev.syllables.find((x: any) => x.syllable === s);
      expect(row("ma")).toMatchObject({ count: 9, stored: 9, status: "unrated", avg: 1, sub: "1.2", stage: 1, parts: ["ma"], letters: ["m", "a"] });
      expect(row("la")).toMatchObject({ count: 10, stored: 10, status: "mastered", successful: 10, avg: 1, limit: DEFAULT_CONFIG.mastery.time_limit_seconds["1"] });
      expect(row("pe")).toMatchObject({ count: 14, stored: 12 });                                                   // Abfragen zählen alle, gespeichert sind die letzten 12
      const times = (raw.prepare("SELECT seconds FROM syllable_times WHERE student_id=? AND syllable='pe' ORDER BY seq").all(kA) as any[]).map((x) => x.seconds);
      expect(times.length).toBe(12); expect(row("pe").avg).toBe(sylStat(times, sylTimeParams(DEFAULT_CONFIG)).avg);   // Ø stimmt mit den gespeicherten Messwerten überein
      expect(row("pe").successful).toBe(times.filter((x) => x <= DEFAULT_CONFIG.mastery.time_limit_seconds["1"]!).length);
      await rounds(tok, ["ma"], 1, 1, "d"); ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json; expect(row("ma")).toMatchObject({ count: 10, status: "mastered" });
      expect(ev.minMeasurements).toBe(10); expect(Object.keys(ev.syllables[0]).sort()).toEqual(["avg", "contrast", "count", "length", "letters", "limit", "locked", "parts", "stage", "status", "structure", "stored", "sub", "subName", "successful", "syllable"].sort());
    });
    it("Stufen- und Buchstabenstand pro Kind und alle Silben einer Stufe (auch noch nicht geübte)", async () => {
      const tok = await kidTok(codeA); await rounds(tok, KV, 10, 1, "kv"); await rounds(tok, ["mal", "pal"], 3, 1, "k3");
      const ev = (await call("GET", `/students/${kA}/evaluation`, teacher)).json;
      expect(ev.stages[0]).toMatchObject({ stage: 1, status: "done", total: 12, processed: 12, mastered: 12, open: 0 }); expect(ev.stages[2]).toMatchObject({ stage: 3, status: "active", processed: 2, mastered: 0 });
      const st = ev.letters.find((l: any) => l.letter === "p"); expect(st.stages.map((s: any) => s.status)).toEqual(["done", "active", "active", "locked", "locked", "empty", "locked"]);
      const d = (await call("GET", `/students/${kA}/stages/3`, teacher)).json; expect(d.total).toBe(36); expect(d.syllables.find((x: any) => x.syllable === "mal")).toMatchObject({ count: 3, status: "unrated" });
      expect(d.syllables.find((x: any) => x.syllable === "lop")).toMatchObject({ count: 0, avg: null, status: "unrated" });
      expect((await call("GET", `/students/${kA}/stages/8`, teacher)).status).toBe(400);
    });
    it("Rechte: nur eigene Klasse (Lehrkraft), Schulleitung und Admin; Kind nie", async () => {
      expect((await call("GET", `/students/${kA}/evaluation`, other)).status).toBe(404); expect((await call("GET", `/students/${kA}/evaluation`, lead)).status).toBe(200); expect((await call("GET", `/students/${kA}/evaluation`, adm)).status).toBe(200);
      expect((await call("GET", `/students/${kA}/evaluation`, await kidTok(codeA))).status).toBe(403); expect((await call("GET", `/students/${kA}/stages/1`, other)).status).toBe(404); expect((await call("GET", `/students/${kA}/evaluation`, null)).status).toBe(401);
    });
  });

  describe("Klassenübersicht", () => {
    it("Prozentwerte je Buchstabe aus den echten Daten der gewählten Klasse; Ausnahmen zählen nicht mit", async () => {
      await call("POST", `/classes/${cid2}/releases`, other, { letters: ["o", "l"] });
      const k2 = (await call("POST", `/classes/${cid2}/students`, other, { names: ["Eva", "Tom", "Uli", "Zoe"] })).json, all = structureWords(["o", "l"]);
      const play = async (code: string, pre: string, sec: number) => { const tok = await kidTok(code); await rounds(tok, all, 10, sec, pre, ["o", "l"]); };
      await play(k2[0].code, "e", 1);          // Eva: Gold für O und L
      await play(k2[1].code, "t", 2.4);        // Tom: schnell genug, aber knapp (alles sicher bei <= Vorgabe)
      await rounds(await kidTok(k2[2].code), ["lo"], 1, 1, "u", ["o", "l"]);   // Uli: hat nur geübt, keine Auszeichnung
      const r = (await call("GET", `/classes/${cid2}/overview`, other)).json;
      expect(r.students).toBe(4); const o = r.letters.find((l: any) => l.letter === "o"), l = r.letters.find((x: any) => x.letter === "l");
      expect(o).toMatchObject({ students: 4, reached: 3, reachedPercent: 75, gold: 2, goldPercent: 50, bronze: 2, bronzePercent: 50 });
      // Einstufung: mittlere 50 % der Kinder nach Rang (Standard); Zoe ohne Daten steht in eigener Gruppe
      const g = (res: any, n: string) => res.children.find((x: any) => x.name === n);
      expect(r.band).toBe(50); expect(g(r, "Zoe")).toMatchObject({ group: "nodata", percent: null }); expect(g(r, "Eva")).toMatchObject({ percent: 100, group: "average" }); expect(r.median).toBe(100);
      expect(g(r, "Uli")).toMatchObject({ percent: 0, group: "under" });
      expect((await call("PUT", `/classes/${cid2}/band`, other, { band: 101 })).status).toBe(400); expect((await call("PUT", `/classes/${cid2}/band`, other, { band: 12 })).status).toBe(400); expect((await call("PUT", `/classes/${cid}/band`, other, { band: 10 })).status).toBe(404);
      expect((await call("PUT", `/classes/${cid2}/band`, other, { band: 100 })).json).toEqual({ band: 100 });
      const wide = (await call("GET", `/classes/${cid2}/overview`, other)).json; expect(wide.band).toBe(100); expect(g(wide, "Uli").group).toBe("average");
      await call("PUT", `/classes/${cid2}/band`, other, { band: 50 });
      await call("PUT", `/students/${k2[3].id}/exclusions`, other, { letters: ["l"] });
      const r2 = (await call("GET", `/classes/${cid2}/overview`, other)).json.letters.find((x: any) => x.letter === "l"); expect(r2).toMatchObject({ students: 3, reached: 3, reachedPercent: 100, goldPercent: 66.7 });
      expect(l.order).toBe(2);
      expect((await call("GET", `/classes/${cid}/overview`, other)).status).toBe(404);                       // fremde Klasse
      const mine = (await call("GET", `/classes/${cid}/overview`, teacher)).json; expect(mine.students).toBe(2); expect(mine.letters.every((x: any) => x.reached === 0 && x.reachedPercent === 0)).toBe(true);   // eigene Klasse unabhängig
    });
  });

  // ---------------- 6: Passwörter ----------------
  describe("Einladung per E-Mail", () => {
    it("neue Lehrkraft/Schulleitung bekommt einen Einladungslink statt eines Passworts; Link gilt einmal und zeitlich begrenzt", async () => {
      app = newApp(true);
      const r = await call("POST", `/schools/${sid}/staff`, lead, { email: "neu@t.de" });
      expect(r.status).toBe(201); expect(r.json).toMatchObject({ email: "neu@t.de", role: "lehrer", emailSent: true }); expect(r.json.initialPassword).toBeUndefined();
      expect(mails.length).toBe(1); expect(mails[0].to).toBe("neu@t.de"); expect(mails[0].text).toContain("72 Stunden"); const tok = linkOf(mails[0], "einladung");
      expect(JSON.stringify(raw.prepare("SELECT * FROM staff_tokens").all())).not.toContain(tok);   // nur der Hash wird gespeichert
      expect((await call("POST", "/auth/set-password", null, { token: tok, newPassword: "kurz" })).status).toBe(400);   // zu kurz, Link bleibt gültig
      expect((await call("POST", "/auth/set-password", null, { token: tok, newPassword: "mein-neues-passwort" })).status).toBe(200);
      expect((await login("neu@t.de", "mein-neues-passwort")).status).toBe(200);
      expect((await call("POST", "/auth/set-password", null, { token: tok, newPassword: "noch-ein-passwort" })).status).toBe(400);   // Einmal-Link
      expect(raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('staff_invite_sent','password_set_by_invite')").get().n).toBe(2);
      expect(JSON.stringify(raw.prepare("SELECT * FROM audit_log").all())).not.toContain(tok);
      // Schulleitung durch die Administration
      const s2 = await call("POST", "/admin/staff", adm, { role: "schulleitung", schoolId: sid, email: "sl2@t.de" }); expect(s2.json.emailSent).toBe(true); expect(s2.json.initialPassword).toBeUndefined(); expect(mails.length).toBe(2);
      const tok2 = linkOf(mails[1], "einladung"); clock += 73 * HOUR; expect((await call("POST", "/auth/set-password", null, { token: tok2, newPassword: "mein-neues-passwort" })).status).toBe(400);   // abgelaufen
    });
    it("kein dauerhaftes Passwort im Klartext: weder in der E-Mail noch in der Antwort; Konto ohne Link nicht nutzbar", async () => {
      app = newApp(true); const r = await call("POST", `/schools/${sid}/staff`, lead, { email: "x@t.de" });
      expect(JSON.stringify(r.json)).not.toContain("initialPassword"); expect(mails[0].text).not.toMatch(/Startpasswort|Passwort:/);
      expect((await login("x@t.de", "irgendwas-langes")).status).toBe(401);
    });
    it("ohne E-Mail-Versand oder bei Versandfehler bleibt das Konto anlegbar (Startpasswort wie bisher einmalig)", async () => {
      const a = await call("POST", `/schools/${sid}/staff`, lead, { email: "a@t.de" }); expect(a.json.emailSent).toBe(false); expect((await login("a@t.de", a.json.initialPassword)).status).toBe(200);
      app = newApp(true); failMail = true; const b = await call("POST", `/schools/${sid}/staff`, lead, { email: "b@t.de" }); expect(b.status).toBe(201); expect(b.json.emailSent).toBe(false); expect((await login("b@t.de", b.json.initialPassword)).status).toBe(200);
    });
    it("E-Mail-Anbieter Resend: korrekte Anfrage", async () => {
      let seen: any = null; const m = resendMailer("KEY", "Lautolino <a@b.de>", async (u, i) => { seen = { u, i }; return { ok: true, status: 200 }; });
      await m({ to: "x@y.de", subject: "S", text: "T" }); expect(seen.u).toBe("https://api.resend.com/emails"); expect(seen.i.headers.authorization).toBe("Bearer KEY"); expect(JSON.parse(seen.i.body)).toEqual({ from: "Lautolino <a@b.de>", to: ["x@y.de"], subject: "S", text: "T" });
      await expect(resendMailer("K", "f", async () => ({ ok: false, status: 422 }))({ to: "a", subject: "b", text: "c" })).rejects.toThrow();
    });
  });

  describe("Passwort vergessen", () => {
    const forgot = (email: string, ip = "9.9.9.9") => call("POST", "/auth/forgot-password", null, { email }, ip);
    beforeEach(() => { app = newApp(true); });
    it("Lehrkraft und Schulleitung bekommen einen Link, Antwort ist für bekannte und unbekannte Adressen gleich", async () => {
      const known = await forgot("t1@t.de"), unknown = await forgot("gibtsnicht@t.de"), lead2 = await forgot("l@t.de");
      expect(known.status).toBe(200); expect(unknown).toEqual(known); expect(lead2).toEqual(known);
      expect(mails.map((m) => m.to).sort()).toEqual(["l@t.de", "t1@t.de"]); expect(mails[0].text).toContain("60 Minuten");
      const tok = linkOf(mails[0], "passwort-neu");
      expect((await call("POST", "/auth/set-password", null, { token: tok, newPassword: "ein-neues-passwort-1" })).status).toBe(200);
      expect((await login("t1@t.de", "ein-neues-passwort-1")).status).toBe(200); expect((await call("GET", "/auth/me", teacher)).status).toBe(401);   // alte Anmeldungen enden
      expect((await call("POST", "/auth/set-password", null, { token: tok, newPassword: "ein-anderes-passwort" })).status).toBe(400);               // nur einmal
      expect(raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('password_reset_requested','password_reset_done')").get().n).toBe(3);
    });
    it("Link läuft nach 60 Minuten ab, ein neuer Link macht den alten ungültig, gesperrte Konten werden entsperrt", async () => {
      await forgot("t1@t.de"); const t1 = linkOf(mails[0], "passwort-neu"); clock += 61 * 60000; expect((await call("POST", "/auth/set-password", null, { token: t1, newPassword: "ein-neues-passwort-1" })).status).toBe(400);
      await forgot("t1@t.de"); await forgot("t1@t.de"); const a = linkOf(mails[1], "passwort-neu"), b = linkOf(mails[2], "passwort-neu");
      expect((await call("POST", "/auth/set-password", null, { token: a, newPassword: "ein-neues-passwort-1" })).status).toBe(400); expect((await call("POST", "/auth/set-password", null, { token: b, newPassword: "ein-neues-passwort-1" })).status).toBe(200);
      for (let i = 0; i < 5; i++) await login("t1@t.de", "falsch"); expect((await login("t1@t.de", "ein-neues-passwort-1")).status).toBe(429);
      await forgot("t1@t.de", "8.8.8.8"); expect((await call("POST", "/auth/set-password", null, { token: linkOf(mails[mails.length - 1], "passwort-neu"), newPassword: "ein-drittes-passwort" })).status).toBe(200); expect((await login("t1@t.de", "ein-drittes-passwort")).status).toBe(200);
    });
    it("Missbrauchsschutz: je Adresse höchstens 3 E-Mails pro Stunde (gleiche Antwort), je Netz höchstens 10 Anfragen (429)", async () => {
      for (let i = 0; i < 5; i++) expect((await forgot("t1@t.de", "7.7.7." + i)).status).toBe(200);
      expect(mails.length).toBe(3);
      for (let i = 0; i < 10; i++) expect((await forgot("x" + i + "@t.de", "6.6.6.6")).status).toBe(200);
      expect((await forgot("t2@t.de", "6.6.6.6")).status).toBe(429); expect(mails.length).toBe(3);
      clock += 61 * 60000; expect((await forgot("t1@t.de", "5.5.5.5")).status).toBe(200); expect(mails.length).toBe(4);
    });
    it("keine E-Mail für Administration, deaktivierte Zugänge und Kinder-/Elternzugänge; ungültige Links werden begrenzt", async () => {
      await forgot("admin@test.de"); expect(mails.length).toBe(0);
      const t2 = (await call("GET", `/schools/${sid}/staff`, lead)).json.find((u: any) => u.email === "t2@t.de"); await call("PATCH", `/schools/${sid}/staff/${t2.id}`, lead, { active: false }); await forgot("t2@t.de"); expect(mails.length).toBe(0);
      expect((await call("POST", "/auth/set-password", null, { token: "0".repeat(64), newPassword: "ein-neues-passwort-1" })).status).toBe(400);
      for (let i = 0; i < 31; i++) await call("POST", "/auth/set-password", null, { token: "1".repeat(64), newPassword: "ein-neues-passwort-1" }, "4.4.4.4");
      expect((await call("POST", "/auth/set-password", null, { token: "1".repeat(64), newPassword: "ein-neues-passwort-1" }, "4.4.4.4")).status).toBe(429);
    });
    it("Fehler des E-Mail-Anbieters verraten nichts (gleiche Antwort)", async () => { failMail = true; const r = await forgot("t1@t.de"); expect(r.status).toBe(200); expect(r.json.ok).toBe(true); });
  });

  // ---------------- 7: Codes ----------------
  describe("Schülercode", () => {
    it("Format: zwei Wörter ohne Umlaute und ohne Bindestrich plus ein- oder zweistellige Zahl (z. B. SonneWald7)", () => {
      const seen = new Set<number>();
      for (let i = 0; i < 3000; i++) { const c = generateStudentCode(); expect(c).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/); expect(c).toMatch(/^[A-Za-z0-9]+$/); seen.add(c.replace(/^\D+/, "").length); }
      expect(seen).toEqual(new Set([1, 2])); expect(CODE_WORDS.every((w) => /^[A-Z][a-z]+$/.test(w))).toBe(true); expect(new Set(CODE_WORDS).size).toBe(CODE_WORDS.length);
      expect(CODE_WORDS.join("")).not.toMatch(/[äöüßÄÖÜ]/);
    });
    it("Anmeldung mit beliebiger Schreibweise; neue Kinder bekommen das neue Format; alte Codes (Tiger-Sonne-47) funktionieren weiter", async () => {
      expect(codeA).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
      const words = /^([A-Z][a-z]+)([A-Z][a-z]+)(\d+)$/.exec(codeA)!;
      for (const v of [codeA, codeA.toLowerCase(), codeA.toUpperCase(), `${words[1]} ${words[2]} ${words[3]}`, ` ${words[1]}-${words[2]}-${words[3]} `]) expect((await call("POST", "/student/login", null, { code: v })).status, v).toBe(200);
      expect((await call("POST", "/student/login", null, { code: codeB })).json.student.displayName).toBe("Ben");
      const norm = normalizeCode("Tiger-Sonne-47"), at = new Date(clock).toISOString();
      raw.prepare("UPDATE student_codes SET revoked_at=? WHERE student_id=?").run(at, kB);
      raw.prepare("INSERT INTO student_codes(id,student_id,code_hash,code_lookup,created_at) VALUES('old',?,?,?,?)").run(kB, await hashPassword(norm, 1000), await hmacHex("p".repeat(40), norm), at);
      for (const v of ["Tiger-Sonne-47", "tiger sonne 47"]) expect((await call("POST", "/student/login", null, { code: v })).json.student.displayName, v).toBe("Ben");
    });
    it("neuer Schülercode ersetzt den alten; Fehlversuche bleiben begrenzt", async () => {
      const r = await call("POST", `/students/${kA}/code/regenerate`, teacher); expect(r.json.code).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
      expect((await call("POST", "/student/login", null, { code: codeA })).status).toBe(401); expect((await call("POST", "/student/login", null, { code: r.json.code })).status).toBe(200);
      for (let i = 0; i < 10; i++) await call("POST", "/student/login", null, { code: "FalschFalsch" + i }, "3.3.3.3"); expect((await call("POST", "/student/login", null, { code: r.json.code }, "3.3.3.3")).status).toBe(429);
    });
  });

  // ---------------- Oberflächen ----------------
  describe("Verwaltungsoberfläche", () => {
    const apiFor = (tok: string) => { const a = createApi({ base: "http://x", storage: mem(), fetchFn: fetchTo }); a.token = tok; return a; };
    const mkRoot = () => { const r = document.createElement("div"); document.body.appendChild(r); return r; };
    it("Anmeldung: Passwortfeld mit Augensymbol schaltet zwischen Punkten und Klartext", async () => {
      const root = mkRoot(); let forgotClicked = false; loginView(root, { api: apiFor(""), onLogin: () => {}, onForgot: () => { forgotClicked = true; } });
      const inp = root.querySelector('input[autocomplete="current-password"]') as HTMLInputElement, eye = root.querySelector(".pw .eye") as HTMLButtonElement;
      expect(inp.type).toBe("password"); expect(eye.querySelector("svg")).not.toBeNull(); expect(eye.getAttribute("aria-label")).toBe("Passwort anzeigen");
      eye.click(); expect(inp.type).toBe("text"); expect(eye.getAttribute("aria-label")).toBe("Passwort verbergen"); eye.click(); expect(inp.type).toBe("password");
      click(root, "Passwort vergessen?"); expect(forgotClicked).toBe(true);
    });
    it("Passwort vergessen: neutrale Meldung; Passwort festlegen mit zwei Feldern (je mit Augensymbol), Fehler bei Ungleichheit, Erfolg", async () => {
      app = newApp(true); const root = mkRoot(), api = apiFor("");
      forgotView(root, { api, onBack: () => {} }); (root.querySelector('input[type="email"]') as HTMLInputElement).value = "t1@t.de"; click(root, "Link senden"); await flush();
      expect(root.textContent).toContain("Falls diese E-Mail-Adresse"); expect(mails.length).toBe(1);
      const root2 = mkRoot(); let done = false; setPasswordView(root2, { api, token: linkOf(mails[0], "passwort-neu"), mode: "passwort-neu", onDone: () => { done = true; } });
      expect(root2.querySelectorAll(".pw .eye").length).toBe(2); const [p1, p2] = Array.from(root2.querySelectorAll("input")) as HTMLInputElement[];
      p1.value = "mein-neues-passwort"; p2.value = "anders-eingegeben"; click(root2, "Passwort speichern"); await flush(); expect(root2.textContent).toContain("nicht gleich");
      p2.value = "mein-neues-passwort"; click(root2, "Passwort speichern"); await flush(); expect(root2.textContent).toContain("Passwort gespeichert"); click(root2, "Zur Anmeldung"); expect(done).toBe(true);
      expect((await login("t1@t.de", "mein-neues-passwort")).status).toBe(200);
      const root3 = mkRoot(); setPasswordView(root3, { api, token: "f".repeat(64), mode: "einladung", onDone: () => {} }); (root3.querySelectorAll("input")[0] as HTMLInputElement).value = "mein-neues-passwort"; (root3.querySelectorAll("input")[1] as HTMLInputElement).value = "mein-neues-passwort";
      click(root3, "Passwort speichern"); await flush(); expect(root3.textContent).toContain("ungültig oder abgelaufen");
    });
    it("Auswertung: Lernstufen, Buchstaben je Stufe und Silbenstatistik mit Filter", async () => {
      const tok = await kidTok(codeA); await rounds(tok, KV, 10, 1, "kv"); await rounds(tok, ["mal"], 3, 6, "m3");
      const root = mkRoot(); await schoolView("auswertung", root, { api: apiFor(lead), user: { id: "x", role: "schulleitung", schoolId: sid } }); await flush();
      { const ks = root.querySelector('select[aria-label="Schüler"]') as HTMLSelectElement; ks.value = Array.from(ks.options).find((o) => o.text === "Mia")!.value; ks.dispatchEvent(new Event("change")); await flush(); }
      expect(root.textContent).toContain("Lernstufen"); expect(root.textContent).toContain("1. Einzelne offene Silben und Vokale"); expect(root.textContent).toContain("abgeschlossen"); expect(root.textContent).toContain("noch nicht dran");
      expect(root.textContent).toContain("Buchstaben und Lernstufen"); expect(root.textContent).toContain("Fortschritt");
      const rowsOf = () => Array.from(root.querySelectorAll("tr")).filter((tr) => tr.textContent!.includes("sicher beherrscht") || tr.textContent!.includes("noch nicht"));
      expect(root.textContent).toContain("MA"); expect(root.textContent).toContain("1.2 Konsonant-Vokal-Silben (KV)"); expect(root.textContent).toContain("noch nicht bewertet (3 von 10)");
      const sel = root.querySelector('select[aria-label="Silben filtern"]') as HTMLSelectElement; sel.value = "unrated"; sel.dispatchEvent(new Event("change")); await flush();
      expect(root.textContent).toContain("MAL"); expect(Array.from(root.querySelectorAll("tr")).some((tr) => tr.textContent!.startsWith("LA") && tr.textContent!.includes("sicher beherrscht"))).toBe(false);
      (root.querySelectorAll('button[title="Silben ansehen"]')[2] as HTMLElement).click(); await flush(); expect(root.textContent).toContain("Stufe 3:"); expect(rowsOf().length).toBeGreaterThan(0);
    });
    it("Klassenübersicht und Lernplan mit Silben je Stufe", async () => {
      const tok = await kidTok(codeA); await rounds(tok, KV, 10, 1, "kv");
      const root = mkRoot(); await schoolView("uebersicht", root, { api: apiFor(teacher), user: { id: "x", role: "lehrer", schoolId: sid } }); await flush();
      expect(root.textContent).toContain("Klassenübersicht"); expect(root.textContent).toContain("Aktive Kinder: 2"); expect(root.querySelectorAll(".klasse-card tbody tr").length).toBe(6); expect(root.textContent).toContain("Bronze");
      const root2 = mkRoot(); await schoolView("lernplan", root2, { api: apiFor(teacher), user: { id: "x", role: "lehrer", schoolId: sid } }); await flush();
      expect(root2.textContent).toContain("Übungswörter und Lernstufen"); expect(root2.textContent).toContain("VK und KVK"); const row = Array.from(root2.querySelectorAll("tr")).find((tr) => tr.textContent!.startsWith("3.VK und KVK"))!; (Array.from(row.querySelectorAll("button")).find((b) => b.title === "Silben ansehen") as HTMLElement).click(); await flush();
      expect(root2.textContent).toContain("3.1 Geschlossen mit Vokal-Anfang (VK)"); expect(root2.textContent).toContain("AM");
    });
  });

  describe("Kinder-App: Vorschau, Silbenbögen, Leistungsstatus", () => {
    const mountK = (code: string) => {
      const root = document.createElement("div"), storage = mem(); document.body.appendChild(root);
      const m = mountKids(root, { base: "http://x", storage, rng: mulberry32(11), now: () => clock, fetchFn: async (u, o) => { const r = await app.request(u.replace("http://x", ""), o); return { ok: r.ok, status: r.status, text: () => r.text() }; } });
      return { root, ready: m.ready, code };
    };
    const label = (root: HTMLElement) => { const t = (root.querySelector("#syl") as HTMLElement).getAttribute("aria-label")!, [cur, rest] = t.split(", danach "); return { cur, next: rest ? rest.split(", ") : [] }; };
    it("zeigt die Hauptsilbe mit Bögen und rechts daneben die tatsächlich nächsten zwei Silben (am Ende weniger)", async () => {
      const a = mountK(codeA); await a.ready; await flush(); (a.root.querySelector("#code") as HTMLInputElement).value = codeA; click(a.root, "Anmelden"); await flush(); click(a.root, "Übung starten");
      const seq: string[] = []; let prev = label(a.root);
      for (let i = 0; i < 20; i++) {
        const now = label(a.root); seq.push(now.cur);
        expect(now.next.length, "Aufgabe " + (i + 1)).toBe(Math.min(2, 19 - i));                                           // Vorschau passt zur Position
        expect(a.root.querySelectorAll("#syl .nxt .nx").length).toBe(now.next.length);
        expect(a.root.querySelectorAll("#syl .cur .arc").length).toBe(splitSyllables(now.cur).length);                    // Bögen = Sprechsilben
        a.root.querySelectorAll("#syl .nx").forEach((n, k) => expect(n.querySelectorAll(".arc").length).toBe(splitSyllables(now.next[k]).length));
        if (i > 0) { expect(now.cur).toBe(prev.next[0]); expect(now.next[0] ?? undefined).toBe(prev.next[1]); }              // die Vorschau war die Wahrheit
        if (i === 0) expect((a.root.querySelector("#syl .cur") as HTMLElement).previousElementSibling).toBeNull();
        prev = now; clock += 1200; if (i < 19) { click(a.root, "Weiter"); await new Promise((r) => setTimeout(r, 340)); }
      }
      expect(new Set(seq.map((x) => x.toLowerCase())).size).toBeGreaterThan(1);
      const r = a.root.querySelector("#syl"); expect(r).not.toBeNull();
    }, 20000);
    it("Mehrsilbige Wörter haben je Sprechsilbe einen eigenen Bogen (MAMA: zwei, WAR: einer)", async () => {
      await rounds(await kidTok(codeA), KV, 10, 1, "kv"); await rounds(await kidTok(codeA), [2, 3].flatMap((n) => buildSyllables(LETTERS, n)).filter((x) => classifySyllable(x).stage === 3), 10, 1, "vk");   // Stufen 1 und 3 sicher: das Training enthält nun auch Wörter aus zwei Sprechsilben
      const a = mountK(codeA); await a.ready; await flush(); (a.root.querySelector("#code") as HTMLInputElement).value = codeA; click(a.root, "Anmelden"); await flush(); click(a.root, "Übung starten");
      let found2 = false;
      for (let i = 0; i < 20 && !found2; i++) { const l = label(a.root).cur.toLowerCase(); if (l.length === 4 && /^[^aeiou][aeiou][^aeiou][aeiou]$/.test(l)) { found2 = true; expect(a.root.querySelectorAll("#syl .cur .arc").length).toBe(2); expect(a.root.querySelectorAll("#syl .cur .sy").length).toBe(2); } clock += 1200; click(a.root, "Weiter"); }
      expect(found2).toBe(true);
    });
    it("Buchstabenübersicht zeigt je freigegebenem Buchstaben den Status Bronze, Silber, Gold (Medaille)", async () => {
      const tok = await kidTok(codeA), all = groupScope(["o", "l"], scopeParams(DEFAULT_CONFIG));
      await call("POST", `/classes/${cid2}/releases`, other, { letters: ["o", "l"] }); const k2 = (await call("POST", `/classes/${cid2}/students`, other, { names: ["Eva"] })).json[0];
      const t2 = await kidTok(k2.code); await rounds(t2, all, 10, 1, "g", ["o", "l"]);
      const a = mountK(k2.code); await a.ready; await flush(); (a.root.querySelector("#code") as HTMLInputElement).value = k2.code; click(a.root, "Anmelden"); await flush();
      for (let i = 0; i < 2; i++) { const dlg = a.root.querySelector(".dlg"); if (!dlg) break; click(a.root, /Neue/.test(dlg.textContent || "") ? "Los geht's!" : "Toll!"); await flush(); }
      const on = Array.from(a.root.querySelectorAll("#lgrid .lt.on")); expect(on.length).toBe(2);
      for (const t of on) { expect(t.querySelectorAll(".medal").length).toBe(1); expect(t.getAttribute("title")).toBe("Gold"); }
      expect(a.root.querySelector("#lgrid")!.textContent).not.toContain("%");
      void tok;
      const b = mountK(codeA); await b.ready; await flush(); (b.root.querySelector("#code") as HTMLInputElement).value = codeA; click(b.root, "Anmelden"); await flush();   // Kind ohne Medaillen: leere Punkte als Ziel
      for (const t of Array.from(b.root.querySelectorAll("#lgrid .lt.on"))) { expect(t.querySelectorAll(".medal").length).toBe(0); }
    });
    it("Training folgt den Lernstufen: Runde besteht nur aus Silben des Fensters (plus Wiederholung)", async () => {
      const a = mountK(codeA); await a.ready; await flush(); (a.root.querySelector("#code") as HTMLInputElement).value = codeA; click(a.root, "Anmelden"); await flush(); click(a.root, "Übung starten");
      const first: string[] = []; for (let i = 0; i < 20; i++) { first.push(label(a.root).cur.toLowerCase()); clock += 1200; if (i < 19) click(a.root, "Weiter"); }
      expect(first.every((s) => KV.includes(s))).toBe(true);
    });
  });
  // ---------------- Silbensperre (Lernplan) ----------------
  describe("Gesperrte Silben der Klasse", () => {
    const apiFor = (tok: string) => { const a = createApi({ base: "http://x", storage: mem(), fetchFn: fetchTo }); a.token = tok; return a; };
    const mkRoot = () => { const r = document.createElement("div"); document.body.appendChild(r); return r; };
    const planSyl = async (tok: string) => (await call("GET", "/student/plan", tok)).json.syllables as string[];
    it("sperrt Silben für alle Kinder, zählt sie nicht mehr mit und gibt sie wieder frei", async () => {
      const tok = await kidTok(codeA), before = await planSyl(tok), r0 = (await call("GET", `/classes/${cid}/syllables`, teacher)).json;
      expect(before).toContain("la");
      expect((await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: "la", blocked: true })).status).toBe(200);
      expect((await call("GET", `/classes/${cid}/blocked-syllables`, teacher)).json.syllables).toEqual(["la"]);
      const after = await planSyl(tok); expect(after).not.toContain("la"); expect(after.length).toBe(before.length - 1);
      expect(Object.values((await call("GET", "/student/plan", tok)).json.scopes).flat()).not.toContain("la");
      expect(await planSyl(await kidTok(codeB))).not.toContain("la");   // gilt für alle Kinder der Klasse
      const r1 = (await call("GET", `/classes/${cid}/syllables`, teacher)).json; expect(r1.total).toBe(r0.total - 1); expect(r1.blocked).toBe(1);
      const st1 = (await call("GET", `/classes/${cid}/syllables?stage=1`, teacher)).json, la = st1.subs.flatMap((u: any) => u.syllables).find((x: any) => x.syllable === "la");
      expect(la && la.blocked).toBe(true);   // bleibt im Lernplan sichtbar, damit sie wieder freigegeben werden kann
      expect((await call("GET", `/classes/${cid}/plan`, teacher)).json.releases[0].syllable_count).toBe(before.length - 1);
      expect((await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: "la", blocked: false })).status).toBe(200);
      expect(await planSyl(tok)).toContain("la"); expect((await call("GET", `/classes/${cid}/syllables`, teacher)).json.blocked).toBe(0);
    });
    it("Lernplan: Klick auf eine Silbe sperrt sie (rot) und gibt sie per erneutem Klick wieder frei, in Buchstaben- und Stufenansicht", async () => {
      const root = mkRoot(); await schoolView("lernplan", root, { api: apiFor(teacher), user: { id: "x", role: "lehrer", schoolId: sid } }); await flush();
      (root.querySelectorAll("table.freigaben")[1].querySelector('button[title="Silben ansehen"]') as HTMLElement).click(); await flush();   // Stufenansicht
      const chips = (t: string) => Array.from(root.querySelectorAll(`.sperrbar`)).filter((e) => e.textContent === t) as HTMLElement[];
      expect(chips("LA").length).toBeGreaterThan(0); expect(chips("LA").every((e) => !e.classList.contains("gesperrt"))).toBe(true);
      chips("LA")[0].click(); await flush();
      expect((await call("GET", `/classes/${cid}/blocked-syllables`, teacher)).json.syllables).toEqual(["la"]);
      expect(chips("LA").every((e) => e.classList.contains("gesperrt"))).toBe(true);
      chips("LA")[0].click(); await flush();
      expect((await call("GET", `/classes/${cid}/blocked-syllables`, teacher)).json.syllables).toEqual([]); expect(chips("LA").every((e) => !e.classList.contains("gesperrt"))).toBe(true);
    });
    it("prüft Rechte und Eingaben", async () => {
      expect((await call("PUT", `/classes/${cid}/blocked-syllables`, other, { syllable: "la", blocked: true })).status).toBe(404);
      expect((await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: "xyz", blocked: true })).status).toBe(404);
      expect((await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: "la" })).status).toBe(400);
      expect((await call("GET", "/student/plan", await kidTok(codeA))).status).toBe(200);
      expect((await call("PUT", `/classes/${cid}/blocked-syllables`, await kidTok(codeA), { syllable: "la", blocked: true })).status).toBeGreaterThanOrEqual(403);
    });
    it("Fortschritt bleibt erhalten; gesperrte Silben müssen für Auszeichnungen nicht sicher sein; sind alle gesperrt, ist der Buchstabe erfüllt", async () => {
      const tok = await kidTok(codeA), all = await planSyl(tok);
      await rounds(tok, ["la", "lo"], 1, 1, "x");
      const times = async () => raw.prepare("SELECT COUNT(*) AS n FROM syllable_times WHERE student_id=? AND syllable='la'").get(kA).n;
      expect(await times()).toBeGreaterThan(0);
      await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: "la", blocked: true });
      expect(await times()).toBeGreaterThan(0);   // Zeiten bleiben gespeichert
      for (const s of all) await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: s, blocked: true });
      expect(await planSyl(tok)).toEqual([]);
      const pr = (await call("GET", `/students/${kA}/progress`, teacher)).json, rows = Array.isArray(pr) ? pr : pr.letters;
      expect(rows.every((x: any) => x.percent === 100)).toBe(true);
      await call("PUT", `/classes/${cid}/blocked-syllables`, teacher, { syllable: "la", blocked: false });
      expect(await planSyl(tok)).toEqual(["la"]);
    });
  });
});
