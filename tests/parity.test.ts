// Vergleich mit der alten Silbenzauber-Logik: gleiche Eingaben müssen gleiche Ergebnisse liefern.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isValid, parseLetters, buildSyllables, lenWeights, makeRound, sylProbs, randomCase, renderWord } from "@silbenflug/core";
import { sylStat, recordSyl, autoAdjust, sdFromLen, startVal, comboKey, avgLast } from "@silbenflug/engine";
import { mulberry32 } from "./helpers";

function loadOld(seed: number): any {
  const ctx: any = { Math: Object.assign(Object.create(Math), { random: mulberry32(seed) }), console };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./fixtures/silbenzauber-logic.js", import.meta.url), "utf8"), ctx);
  return ctx;
}
const OLD_SYL = { window: 12, dropLongest: 2, minKeep: 3 };
const OLD_AUTO = { tolerancePercent: 5, stepMax: 15, stepFactor: 40, stepGrid: 5, sylToLenRatio: 2, sylCap: 100, newComboDiscount: 25 };

describe("Parität mit Silbenzauber", () => {
  const old = loadOld(1);
  it("isValid für alle Zeichenfolgen der Längen 2 bis 4", () => {
    const al = "aeiolmnrtbcsß".split(""); let n = 0;
    const rec = (p: string) => { if (p.length >= 2) { expect(isValid(p), p).toBe(old.isValid(p)); n++; } if (p.length < 4) al.forEach((c) => rec(p + c)); };
    rec(""); expect(n).toBeGreaterThan(20000);
  });
  it("parseLetters und buildSyllables", () => {
    expect(parseLetters("O, L, e, o ä ß")).toEqual(Array.from(old.parseLetters("O, L, e, o ä ß")));
    for (const set of ["ole", "olem", "lmatu", "bsrae"]) for (const L of [2, 3, 4]) expect(buildSyllables(set.split(""), L)).toEqual(Array.from(old.buildSyllables(set.split(""), L)));
  });
  it("lenWeights", () => {
    for (const lens of [[2], [2, 3], [2, 3, 4]]) for (const b of [0, 5, 30, 50, 65, 100]) expect(lenWeights(lens, b)).toEqual({ ...old.lenWeights(lens, b) });
  });
  it("makeRound (gleicher Zufall) und sylProbs", () => {
    const sets = [["o", "l", "e"], ["l", "o", "e", "m"], ["a", "m", "i", "s", "t"]];
    const avg: Record<string, number> = {}; buildSyllables(sets[1], 2).concat(buildSyllables(sets[1], 3)).forEach((s, i) => { avg[s] = i + 1; });
    let c = 0;
    for (const L of sets) for (const lens of [[2, 3], [2, 3, 4], [3]]) for (const [f, bal, sb] of [[0, 50, 50], [80, 30, 100], [100, 70, 0], [40, 50, 25]]) {
      const bl = c++ % 2 ? ["ol"] : [];
      const o = loadOld(100 + c), seed = 100 + c;
      expect(makeRound(L, lens, f, 20, bal, avg, sb, bl, mulberry32(seed))).toEqual(Array.from(o.makeRound(L, lens, f, 20, bal, avg, sb, bl)));
      expect({ ...sylProbs(L, lens, f, bal, avg, sb, bl) }).toEqual({ ...o.sylProbs(L, lens, f, bal, avg, sb, bl) });
    }
  });
  it("randomCase und renderWord", () => {
    const o = loadOld(5), r = mulberry32(5);
    for (const w of ["elo", "blau", "ole"]) expect(randomCase(w, r)).toBe(o.randomCase(w));
    expect(renderWord("Elo")).toBe(old.renderWord("Elo"));
  });
  it("sylStat und recordSyl mit alten Zahlen (12 Zeiten, 2 streichen, mind. 3, max 30 s)", () => {
    const r = mulberry32(9);
    for (let n = 0; n <= 16; n++) {
      const t = Array.from({ length: n }, () => Math.round(r() * 200) / 10);
      const a = sylStat(t, OLD_SYL), b = old.sylStat(t);
      expect(a.avg).toEqual(b.avg); expect(a.dropped).toEqual(Array.from(b.dropped)); expect(a.times).toEqual(Array.from(b.times));
    }
    const sa: Record<string, number[]> = {}, sb: any = {}; for (let y = 0; y < 15; y++) { recordSyl(sa, "Ola", y * 3, 30, 12); old.recordSyl(sb, "Ola", y * 3); }
    expect(sa.ola).toEqual(Array.from(sb.ola));
  });
  it("autoAdjust, sdFromLen, avgLast", () => {
    for (const bal of [0, 20, 50, 95, 100]) for (const t of [[80, 80, 80], [40, 40], [60, 61, 59], [200, 200, 40, 40, 40], [10], [58], [62]]) for (const n of [1, 3, 7])
      expect(autoAdjust(bal, t, 60, n, OLD_AUTO)).toBe(old.autoAdjust(bal, t, 60, n));
    for (const l of [0, 20, 45, 50, 80, 100]) expect(sdFromLen(l, OLD_AUTO)).toBe(old.sdFromLen(l));
    expect(avgLast([10, 20, 30, 40], 3)).toBe(old.avgLast([10, 20, 30, 40], 3));
  });
  it("startVal und comboKey", () => {
    const combos = [{ key: comboKey(["o", "l", "e"], [2, 3]), letters: "elo", lens: [2, 3], bal: 60, sd: 40 }, { key: comboKey(["a", "m"], [2]), letters: "am", lens: [2], bal: 30, sd: 70 }];
    const st = { total: 1, combos };
    for (const [le, lens] of [[["o", "l", "e"], [2, 3]], [["o", "l", "e", "m"], [2, 3]], [["a", "b"], [2, 3]], [["a", "m", "t"], [2]]] as [string[], number[]][])
      for (const f of ["bal", "sd"] as const) expect(startVal(combos, le, lens, f, 50, 25)).toBe(old.startVal(st, le, lens, f, 50));
  });
});
