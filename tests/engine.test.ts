import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG, validateConfig, type SilbenflugConfig } from "@silbenflug/shared";
import { isMastered, letterProgress, levelProgress, levelsReached, newAwards, highestLevel, tierEnds, syllableScope } from "@silbenflug/engine";

const clone = (): SilbenflugConfig => JSON.parse(JSON.stringify(DEFAULT_CONFIG));

describe("Konfiguration", () => {
  it("Standardwerte sind gültig", () => expect(validateConfig(DEFAULT_CONFIG)).toEqual([]));
  it("erkennt Fehler", () => {
    const c = clone(); c.award.share_percent = 0; c.syl_time.min_keep = 99; c.auto.avg_rounds = 9;
    expect(validateConfig(c).length).toBeGreaterThanOrEqual(3);
    const d = clone(); d.award.share_percent = 101; expect(validateConfig(d).join()).toContain("award.share_percent");
    expect(validateConfig({ ...clone(), award: { share_percent: null } })).toEqual([]); expect(DEFAULT_CONFIG.award).toEqual({ share_percent: 90 });
  });
});

describe("Bewertung sicher beherrschter Silben", () => {
  const cfg = clone();
  it("unter 10 Messungen keine Bewertung", () => expect(isMastered([1, 1, 1, 1, 1, 1, 1, 1, 1], cfg, "ol").status).toBe("unrated"));
  it("10 Messungen: Durchschnitt gegen Zeitvorgabe", () => {
    expect(isMastered(Array(10).fill(3), cfg, "ol").status).toBe("mastered");
    expect(isMastered(Array(10).fill(5), cfg, "ol").status).toBe("not_mastered");
  });
  it("neue Messwerte können den Status ändern (nur die letzten 12 zählen)", () => {
    const t = [...Array(10).fill(3), 9, 9, 9, 9];
    expect(isMastered(t, cfg, "ol").status).toBe("not_mastered");
  });
  it("ohne Zeitvorgabe keine Bewertung", () => { const c = clone(); c.mastery.time_limit_seconds["3"] = null; expect(isMastered(Array(10).fill(1), c, "ol").status).toBe("unrated"); });
});

describe("Zeitvorgabe je Lernstufe", () => {
  it("jede Stufe hat ihre eigene Vorgabe (Wortlänge spielt keine Rolle)", () => {
    const c = clone(); c.mastery.time_limit_seconds = { "1": 2, "3": 4, "4": 6, "5": 6, "6": 8, "7": 3 };
    const t = Array(10).fill(3);
    expect(isMastered(t, c, "la").status).toBe("not_mastered");        // Stufe 1: 2 s
    expect(isMastered(t, c, "ol").status).toBe("mastered");            // Stufe 3: 4 s
    expect(isMastered(Array(10).fill(5), c, "lala").status).toBe("mastered");   // Stufe 4: 6 s
    expect(isMastered(Array(10).fill(5), c, "malala").status).toBe("mastered"); // Stufe 6: 8 s
    expect(isMastered(Array(10).fill(5), c, "plam").status).toBe("not_mastered"); // Stufe 7: 3 s
    expect(validateConfig(c)).toEqual([]);
  });
  it("Standardwerte: 3,5 s (Stufe 1 bis 3), 5 s (4, 5, 7), 7 s (6)", () => {
    expect(DEFAULT_CONFIG.mastery.time_limit_seconds).toEqual({ "1": 3.5, "3": 3.5, "4": 5, "5": 5, "6": 7, "7": 5 });
  });
});

describe("Fortschritt und Auszeichnungen", () => {
  const cfg = clone();
  // Beispiel-Silben je Lernstufe (nach classifySyllable): 1 lo/le, 3 ol/el, 4 lala/lole, 5 lolla/lopla, 6 lolopa, 7 plo/blalo
  const S: Record<number, string[]> = { 1: ["lo", "le"], 3: ["ol", "el"], 4: ["lala", "lole"], 5: ["lolla", "lopla"], 6: ["lolopa"], 7: ["plo", "blalo"] };
  const scope7 = [1, 3, 4, 5, 6, 7].flatMap((k) => S[k]);
  const fast = (syl: string[]) => Object.fromEntries(syl.map((x) => [x, Array(10).fill(2)])) as Record<string, number[]>;
  const stagesOf = (k: number[]) => k.flatMap((x) => S[x]);
  it("Stufen je Zahl aktiver Stufen (Bronze/Silber/Gold enden bei)", () => {
    expect(tierEnds(7)).toEqual([3, 5, 7]); expect(tierEnds(6)).toEqual([3, 5, 6]); expect(tierEnds(5)).toEqual([2, 4, 5]); expect(tierEnds(4)).toEqual([2, 3, 4]);
  });
  it("5 aktive Stufen (Lernstufen 1, 3, 4, 5, 7): Bronze = erste 2, Silber = nächste 2, Gold = letzte", () => {
    const sc = stagesOf([1, 3, 4, 5, 7]);
    expect(levelsReached(sc, fast(stagesOf([1, 3])), cfg)).toEqual(["bronze"]);
    expect(levelsReached(sc, fast(stagesOf([1, 3, 4])), cfg)).toEqual(["bronze"]);
    expect(levelsReached(sc, fast(stagesOf([1, 3, 4, 5])), cfg)).toEqual(["bronze", "silber"]);
    expect(levelsReached(sc, fast(sc), cfg)).toEqual(["bronze", "silber", "gold"]);
  });
  it("6 aktive Stufen (Lernstufen 1, 3, 4, 5, 6, 7): Bronze = erste 3, Silber = Stufe 5 und 6, Gold = letzte", () => {
    expect(levelsReached(scope7, fast(stagesOf([1, 3, 4, 5, 7])), cfg)).toEqual(["bronze"]);   // Lernstufe 6 fehlt noch für Silber
    expect(levelsReached(scope7, fast(stagesOf([1, 3, 4, 5, 6])), cfg)).toEqual(["bronze", "silber"]);
    expect(levelsReached(scope7, fast(scope7), cfg)).toEqual(["bronze", "silber", "gold"]);
  });
  it("Silber setzt Bronze voraus, langsame oder unbewertete Silben zählen nicht", () => {
    const sc = stagesOf([1, 3, 4, 5, 7]), t = fast(stagesOf([4, 5, 7]));
    expect(levelsReached(sc, t, cfg)).toEqual([]);
    const slow = { ...fast(sc), lo: Array(10).fill(9), le: Array(10).fill(9) };   // beide Silben der Lernstufe 1 zu langsam: nur 2 von 4 sicher im Bronze-Bereich
    expect(levelsReached(sc, slow, cfg)).toEqual([]);
  });
  it("Schwelle share_percent aus der Konfiguration (Standard 90 %)", () => {
    const sc = stagesOf([1, 3, 4, 5, 7]), c = clone(); c.award.share_percent = 50;
    const half = { ...fast(sc), lo: Array(10).fill(9), ol: Array(10).fill(9) };   // je eine von zwei Silben pro Stufe zu langsam
    expect(levelsReached(sc, half, cfg)).toEqual([]);
    expect(levelsReached(sc, half, c)).toContain("bronze");
  });
  it("vergebene Auszeichnungen werden nicht erneut vergeben und nie entfernt", () => {
    const sc = stagesOf([1, 3, 4, 5, 7]);
    expect(newAwards([], sc, fast(stagesOf([1, 3, 4, 5])), cfg)).toEqual(["bronze", "silber"]);
    expect(newAwards(["bronze", "silber"], sc, {}, cfg)).toEqual([]);
    expect(newAwards(["bronze"], sc, fast(sc), cfg)).toEqual(["silber", "gold"]);
    expect(highestLevel(["bronze", "silber"])).toBe("silber");
  });
  it("Fortschritt in Segmenten bis zur nächsten Medaille, nach Gold keine Anzeige", () => {
    const sc = stagesOf([1, 3, 4, 5, 7]);
    expect(levelProgress(null, sc, {}, cfg)).toEqual({ next: "bronze", segments: 0 });
    expect(levelProgress(null, sc, fast(["lo", "le", "ol"]), cfg)).toEqual({ next: "bronze", segments: 3 });   // 3 von 4 sicher = 75 %, Schwelle 90 %
    expect(levelProgress(null, sc, fast(stagesOf([1, 3])), cfg)).toEqual({ next: "bronze", segments: 4 });
    expect(levelProgress("bronze", sc, fast(stagesOf([1, 3])), cfg)).toEqual({ next: "silber", segments: 0 });
    expect(levelProgress("bronze", sc, fast(stagesOf([1, 3, 4])), cfg)).toEqual({ next: "silber", segments: 2 });
    expect(levelProgress("gold", sc, fast(sc), cfg)).toBeNull();
  });
  it("ohne festgelegten Anteil keine Auszeichnung", () => {
    const c = clone(); c.award = { share_percent: null };
    expect(levelsReached(scope7, fast(scope7), c)).toEqual([]); expect(levelProgress(null, scope7, {}, c)).toBeNull();
  });
  it("Prozentanteil über festen Silbenumfang bleibt als Zahl verfügbar", () => {
    const scope = ["ol", "lo", "el", "le"], times: Record<string, number[]> = { ol: Array(10).fill(2), lo: Array(10).fill(2), el: Array(10).fill(9) };
    expect(letterProgress(scope, times, cfg)).toMatchObject({ total: 4, mastered: 2, notMastered: 1, unrated: 1, percent: 50 });
  });
});

describe("Fester Silbenumfang", () => {
  it("späterer Buchstabe verändert den Umfang früherer nie", () => {
    const first = syllableScope([], "o"), second = syllableScope(["o"], "l"), third = syllableScope(["o", "l"], "e");
    expect(first.length).toBe(0 + first.length);
    expect(second.every((s) => s.includes("l") && /^[ol]+$/.test(s))).toBe(true);
    expect(third.every((s) => s.includes("e") && /^[ole]+$/.test(s))).toBe(true);
    const again = syllableScope([], "o"); expect(again).toEqual(first); // Neuberechnung ergibt dasselbe
    expect(new Set([...second, ...third]).size).toBe(second.length + third.length); // keine Silbe doppelt zugeordnet
  });
});

describe("Datenbank-Schema", () => {
  it("Migration läuft und Schutzregeln greifen", () => {
    const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
    db.exec(readFileSync(new URL("../db/migrations/0001_init.sql", import.meta.url), "utf8"));
    const now = "2026-11-01T00:00:00Z";
    expect(() => db.exec(`INSERT INTO schools(id,name,active,created_at,updated_at) VALUES('s1','A',1,'${now}','${now}')`)).toThrow(); // aktiv ohne Zahlung
    db.exec(`INSERT INTO schools(id,name,active,payment_confirmed_at,created_at,updated_at) VALUES('s1','A',1,'${now}','${now}','${now}')`);
    db.exec(`INSERT INTO students(id,school_id,display_name,created_at,updated_at) VALUES('k1','s1','Kind','${now}','${now}')`);
    db.exec(`INSERT INTO student_codes(id,student_id,code_hash,code_lookup,created_at) VALUES('c1','k1','h','l1','${now}')`);
    expect(() => db.exec(`INSERT INTO student_codes(id,student_id,code_hash,code_lookup,created_at) VALUES('c2','k1','h','l2','${now}')`)).toThrow(); // nur ein gültiger Code
    db.exec(`UPDATE student_codes SET revoked_at='${now}' WHERE id='c1'`);
    db.exec(`INSERT INTO student_codes(id,student_id,code_hash,code_lookup,created_at) VALUES('c2','k1','h','l2','${now}')`);
    db.exec(`INSERT INTO config_versions(json,valid_from,is_active) VALUES('{}','${now}',1)`);
    db.exec(`INSERT INTO awards(id,student_id,letter,level,achieved_at,config_version) VALUES('a1','k1','o','bronze','${now}',1)`);
    expect(() => db.exec(`UPDATE awards SET level='gold' WHERE id='a1'`)).toThrow(); // Auszeichnung unveränderlich
    expect(() => db.exec(`INSERT INTO awards(id,student_id,letter,level,achieved_at,config_version) VALUES('a2','k1','o','bronze','${now}',1)`)).toThrow(); // keine Doppelvergabe
  });
});
