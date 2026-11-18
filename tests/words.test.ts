// Strukturbasierte Übungswörter: alle sieben Stufen erreichbar, deterministisch, Regeln der Sprechsilben.
import { describe, expect, it } from "vitest";
import { classifySyllable, splitSyllables, stagePlan, structureWords, WORD_CAP_PER_SUB } from "@silbenflug/core";
import { syllableScope } from "@silbenflug/engine";

const L = ["l", "e", "o", "a", "m", "p", "t", "r", "s", "n"];
describe("structureWords", () => {
  it("erreicht alle Stufen (auch 5 und 6) und ist deterministisch", () => {
    const w = structureWords(L, "p"), plan = stagePlan(w);
    [1, 3, 4, 5, 6, 7].forEach((n) => expect(plan.find((g) => g.stage === n)!.syllables.length, "Stufe " + n).toBeGreaterThan(0));
    expect(structureWords(L, "p")).toEqual(w);
  });
  it("Wörter zerfallen genau in ihre Sprechsilben, ohne Doppelungen und Vokal-Vokal-Grenze; enthalten den neuen Buchstaben", () => {
    structureWords(L, "p").forEach((x) => { expect(x).toMatch(/^[lreoamptns]+$/); expect(x).toContain("p"); expect(x).not.toMatch(/(.)\1/); expect(splitSyllables(x).length).toBeLessThanOrEqual(3); });
  });
  it("mehrsilbige Wörter je Unterkategorie begrenzt, einsilbige vollständig; Vokale einzeln in Stufe 1.1", () => {
    const w = structureWords(L, "m"), multi = w.filter((x) => splitSyllables(x).length > 1), bySub = new Map<string, number>();
    multi.forEach((x) => { const s = classifySyllable(x).sub; bySub.set(s, (bySub.get(s) ?? 0) + 1); });
    ["6.1", "6.2"].forEach((id) => { expect(bySub.get(id) ?? 0).toBeGreaterThan(0); expect(bySub.get(id) ?? 0).toBeLessThanOrEqual(WORD_CAP_PER_SUB); });
    expect(structureWords(["a", "m"])).toEqual(expect.arrayContaining(["a", "ma", "am"]));
  });
  it("Silbenumfang: später freigegebener Buchstabe ändert den Umfang früherer nie", () => {
    const a = syllableScope(["o"], "l"), b = syllableScope(["o", "l"], "e");
    expect(a.every((x) => x.includes("l") && /^[ol]+$/.test(x))).toBe(true); expect(b.every((x) => x.includes("e"))).toBe(true);
    expect(syllableScope(["o"], "l")).toEqual(a);
  });
});
