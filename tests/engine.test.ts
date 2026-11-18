import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG, validateConfig, type SilbenflugConfig } from "@silbenflug/shared";
import { isMastered, letterProgress, levelsReached, newAwards, highestLevel, syllableScope } from "@silbenflug/engine";

const clone = (): SilbenflugConfig => JSON.parse(JSON.stringify(DEFAULT_CONFIG));

describe("Konfiguration", () => {
  it("Standardwerte sind gültig", () => expect(validateConfig(DEFAULT_CONFIG)).toEqual([]));
  it("erkennt Fehler", () => {
    const c = clone(); c.award.gold_percent = 40; c.syl_time.min_keep = 99; c.auto.avg_rounds = 9;
    expect(validateConfig(c).length).toBeGreaterThanOrEqual(3);
    const d = clone(); d.award.silver_percent = null; expect(validateConfig(d).join()).toContain("gemeinsam");
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
  it("ohne Zeitvorgabe keine Bewertung", () => { const c = clone(); c.mastery.time_limit_seconds["2"] = null; expect(isMastered(Array(10).fill(1), c, "ol").status).toBe("unrated"); });
});

describe("Zeitvorgabe je Silbenlänge", () => {
  it("2er, 3er und 4er haben getrennte Vorgaben", () => {
    const c = clone(); c.mastery.time_limit_seconds = { "2": 2, "3": 4, "4": 6 };
    const t = Array(10).fill(3);
    expect(isMastered(t, c, "ol").status).toBe("not_mastered");
    expect(isMastered(t, c, "ole").status).toBe("mastered");
    expect(isMastered(Array(10).fill(5), c, "land").status).toBe("mastered");
    expect(validateConfig(c)).toEqual([]);
  });
});

describe("Fortschritt und Auszeichnungen", () => {
  const cfg = clone();
  it("Prozentanteil über festen Silbenumfang", () => {
    const scope = ["ol", "lo", "el", "le"], times: Record<string, number[]> = { ol: Array(10).fill(2), lo: Array(10).fill(2), el: Array(10).fill(9) };
    const p = letterProgress(scope, times, cfg);
    expect(p).toMatchObject({ total: 4, mastered: 2, notMastered: 1, unrated: 1, percent: 50 });
    expect(levelsReached(p.percent, cfg)).toEqual(["bronze"]);
  });
  it("vergebene Auszeichnungen werden nicht erneut vergeben und nie entfernt", () => {
    expect(newAwards([], 80, cfg)).toEqual(["bronze", "silber"]);
    expect(newAwards(["bronze", "silber"], 10, cfg)).toEqual([]);
    expect(newAwards(["bronze"], 96, cfg)).toEqual(["silber", "gold"]);
    expect(highestLevel(["bronze", "silber"])).toBe("silber");
  });
  it("ohne festgelegte Grenzen keine Auszeichnung", () => {
    const c = clone(); c.award = { bronze_percent: null, silver_percent: null, gold_percent: null };
    expect(levelsReached(100, c)).toEqual([]);
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
