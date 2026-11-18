// Silbenumfang je neuem Buchstaben: Obergrenze je Lernstufe, Häufigkeit, Konfiguration.
import { describe, expect, it } from "vitest";
import { classifySyllable, partWeight, wordScore, isRealWord } from "@silbenflug/core";
import { syllableScope, groupScope, scopeParams, limitScope } from "@silbenflug/engine";
import { DEFAULT_CONFIG, validateConfig, withDefaults } from "@silbenflug/shared";

const sp = scopeParams(DEFAULT_CONFIG), known = ["l", "o", "e", "a", "m"];
const byStage = (w: string[]) => { const m = new Map<number, string[]>(); w.forEach((x) => { const s = classifySyllable(x).stage; (m.get(s) ?? m.set(s, []).get(s)!).push(x); }); return m; };

describe("Silbenumfang mit Obergrenze und Häufigkeit", () => {
  it("Standardwerte: 10 je Stufe 1 bis 4, 8 je Stufe 5 bis 7, Häufigkeit 100 Prozent", () => {
    expect(DEFAULT_CONFIG.scope).toEqual({ cap_stage_1_4: 10, cap_stage_5_7: 8, freq_percent: 100 }); expect(sp).toEqual({ capStage14: 10, capStage57: 8, freqPercent: 100 });
  });
  it("neuer Buchstabe: höchstens 10 Wörter in Stufe 1 bis 4, höchstens 8 in Stufe 5 bis 7, alle enthalten den Buchstaben", () => {
    const w = syllableScope(known, "p", sp); expect(w.length).toBeGreaterThan(20);
    byStage(w).forEach((l, s) => expect(l.length).toBeLessThanOrEqual(s <= 4 ? 10 : 8));
    w.forEach((x) => expect(x).toContain("p")); expect(new Set(w).size).toBe(w.length);
    expect(syllableScope(known, "p", sp)).toEqual(w);   // deterministisch
  });
  it("Plätze einer Stufe werden reihum auf die Unterkategorien verteilt (3.1 und 3.2)", () => {
    const w = syllableScope(known, "p", sp), subs = w.map((x) => classifySyllable(x).sub);
    expect(subs.filter((s) => s === "3.1").length).toBeGreaterThanOrEqual(3); expect(subs.filter((s) => s === "3.2").length).toBeGreaterThanOrEqual(3);
  });
  it("bei 100 Prozent Häufigkeit sind es die häufigsten Wörter je Unterkategorie", () => {
    const w = syllableScope(known, "p", sp), all = syllableScope(known, "p");
    all.filter((x) => classifySyllable(x).sub === "3.2" && !w.includes(x)).forEach((x) => {
      const worst = Math.min(...w.filter((y) => classifySyllable(y).sub === "3.2").map(wordScore)); expect(wordScore(x)).toBeLessThanOrEqual(worst + 1e-9);
    });
    expect(w).toContain("pa");   // sehr häufige Silbe
  });
  it("Häufigkeitswert: echtes Wort liegt über Übungswort mit gleich häufigen Silben; unbekannte Silben sehr niedrig", () => {
    expect(wordScore("mama")).toBeGreaterThan(wordScore("mapa")); expect(partWeight("qxz")).toBe(20); expect(partWeight("die")).toBeGreaterThan(60);
  });
  it("freq_percent 0 lost fest aus (gleiches Ergebnis bei jedem Aufruf, anderes als bei 100)", () => {
    const r = { ...sp, freqPercent: 0 }, a = syllableScope(known, "p", r); expect(syllableScope(known, "p", r)).toEqual(a); expect(a).not.toEqual(syllableScope(known, "p", sp));
    byStage(a).forEach((l, s) => expect(l.length).toBeLessThanOrEqual(s <= 4 ? 10 : 8));
  });
  it("Obergrenze 0 in der Konfiguration = keine Begrenzung", () => {
    const c = withDefaults({ scope: { cap_stage_1_4: 0, cap_stage_5_7: 0, freq_percent: 100 } }), w = syllableScope(known, "p", scopeParams(c));
    expect(w.length).toBeGreaterThan(syllableScope(known, "p", sp).length);
  });
  it("Startgruppe: Obergrenze mal Anzahl der Startbuchstaben", () => {
    const g = groupScope(["l", "o"], sp); byStage(g).forEach((l, s) => expect(l.length).toBeLessThanOrEqual((s <= 4 ? 10 : 8) * 2)); expect(g).toEqual(expect.arrayContaining(["o", "lo", "ol"]));
  });
  it("ohne Parameter bleibt die alte Regel (alle Wörter)", () => {
    expect(syllableScope(known, "p").length).toBeGreaterThan(syllableScope(known, "p", sp).length);
  });
  it("limitScope: bleibt eine Unterkategorie leer, rücken die anderen nach", () => {
    const w = limitScope(["ma", "mo", "me", "mi", "mu", "am", "em"], { capStage14: 4, capStage57: 4, freqPercent: 100 }, 1, "x");
    expect(w.filter((x) => classifySyllable(x).stage === 1).length).toBe(4); expect(w.filter((x) => classifySyllable(x).stage === 3).length).toBe(2);
  });
  it("ab Stufe 4 nur echte Wörter, sonst bleibt die Stufe kleiner", () => {
    const w = syllableScope(known, "p", sp); w.filter((x) => classifySyllable(x).stage >= 4).forEach((x) => expect(isRealWord(x)).toBe(true));
    expect(limitScope(["almlale", "lala"], { capStage14: 10, capStage57: 8, freqPercent: 100 }, 1, "x")).not.toContain("almlale");
  });
  it("Konfiguration: Prüfung der Werte und Ergänzung älterer Versionen", () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
    expect(validateConfig({ ...DEFAULT_CONFIG, scope: { ...DEFAULT_CONFIG.scope, freq_percent: 120 } }).join()).toContain("scope.freq_percent");
    expect(validateConfig({ ...DEFAULT_CONFIG, scope: { ...DEFAULT_CONFIG.scope, cap_stage_1_4: 2.5 } }).join()).toContain("scope.cap_stage_1_4");
    const old: any = { ...DEFAULT_CONFIG }; delete old.scope; expect(withDefaults(old).scope).toEqual(DEFAULT_CONFIG.scope);
  });
});
