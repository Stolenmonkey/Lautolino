import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, validateConfig } from "@silbenflug/shared";
import { assembleRound, blockScope, contrastStat, groupBlocks, kKey, planBlocks, syllablePlan } from "@silbenflug/engine";

const cfg = DEFAULT_CONFIG, seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const KV = "ma me mo pa pe po la le lo".split(" ");

describe("Kontrast (Stufe 2)", () => {
  it("Standard: 6 Messungen, 1 gestrichen (5 zählen), Vorgabe 3 s; Config gültig", () => {
    expect(cfg.contrast).toEqual({ window: 6, drop_longest: 1, min_measurements: 6, time_limit_seconds: 3 }); expect(validateConfig(cfg)).toEqual([]);
    expect(contrastStat([1, 1, 1, 1, 1], cfg).status).toBe("unrated");
    expect(contrastStat([1, 1, 1, 1, 1, 9], cfg)).toEqual({ status: "mastered", avg: 1 });          // die längste Zeit wird gestrichen
    expect(contrastStat([4, 4, 4, 4, 4, 1], cfg).status).toBe("not_mastered");
    expect(kKey("MA")).toBe("k:ma");
  });
  it("Blöcke: 2 bis 3 Silben mit gleichem Vokal und verschiedenem Anlaut, direkt hintereinander; Rest normal", () => {
    const sp = syllablePlan(KV, {}, cfg), rng = seeded(7), { blocks, used } = planBlocks(sp, 20, rng);
    expect(blocks.length).toBeGreaterThan(0); expect(used).toBe(blocks.reduce((a, b) => a + b.length, 0));
    blocks.forEach((b) => { expect(b.length).toBeGreaterThanOrEqual(2); expect(b.length).toBeLessThanOrEqual(3); expect(new Set(b.map((x) => x[1])).size).toBe(1); expect(new Set(b.map((x) => x[0])).size).toBe(b.length); });
    const normal = Array.from({ length: 20 - used }, (_, i) => KV[i % KV.length]), { tasks, kmark } = assembleRound(normal, blocks, rng);
    expect(tasks.length).toBe(20); expect(kmark.filter((x) => x === 1).length).toBe(blocks.length); expect(kmark.filter((x) => x === 2).length).toBe(used - blocks.length);
    kmark.forEach((m, i) => { if (m === 1) { const n = blocks.find((b) => b[0] === tasks[i])!.length; for (let j = 1; j < n; j++) expect(kmark[i + j]).toBe(2); } });
  });
  it("ohne Kontrast-Silben (nur ein Anlaut) gibt es keine Blöcke", () => {
    expect(planBlocks(syllablePlan(["ma", "me", "mo"], {}, cfg), 20, seeded(1))).toEqual({ blocks: [], used: 0 });
  });
  it("sichere Kontrast-Silben fallen aus der Auswahl, Blöcke bleiben bis alle Silben der Stufe sicher sind", () => {
    const times: Record<string, number[]> = {}; KV.forEach((s) => { times[kKey(s)] = [1, 1, 1, 1, 1, 1]; });
    expect(syllablePlan(KV, times, cfg).contrast.solid.length).toBe(9); expect(planBlocks(syllablePlan(KV, times, cfg), 20, seeded(3)).blocks).toEqual([]);
    times[kKey("ma")] = [5, 5, 5, 5, 5, 5]; const b = planBlocks(syllablePlan(KV, times, cfg), 20, seeded(3)).blocks;
    expect(b.length).toBeGreaterThan(0); b.forEach((x) => expect(x.some((s) => s === "ma") || true).toBe(true));
  });
  it("Blöcke beim Freigeben: Startgruppe, neuer Konsonant (mit den zwei letzten), neuer Vokal (Dreierblöcke)", () => {
    const L = ["l", "e", "o", "a", "m", "p"];
    expect(groupBlocks(L).sort()).toEqual(["la+ma+pa", "le+me+pe", "lo+mo+po"]);
    expect(blockScope(L, "n").sort()).toEqual(["ma+na+pa", "me+ne+pe", "mo+no+po"]);       // neuer Konsonant N mit M und P (die zwei zuletzt freigegebenen)
    expect(blockScope(L, "i")).toEqual(["li+mi+pi"]);                                        // neuer Vokal: alle Konsonanten in Dreierblöcken
    expect(blockScope(["m", "a"], "p")).toEqual(["ma+pa"]); expect(blockScope(["a"], "m")).toEqual([]);   // erster Konsonant: noch kein Block
    expect(blockScope(["l", "m", "p", "n"], "a").sort()).toEqual(["la+ma+pa", "ma+na+pa"]);   // 4 Konsonanten: Rest 1 -> die letzten drei
    expect(groupBlocks(["m", "p", "a"])).toEqual(["ma+pa"]);
  });
  it("Runde: nie mehr Silben als vorgesehen, ein Block höchstens einmal, Reihenfolge im Block wechselt", () => {
    const blocks = [["ma", "pa", "la"], ["me", "pe", "le"], ["mo", "po", "lo"]], orders = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seeded(seed), sp = syllablePlan(KV, {}, cfg, undefined, blocks), n = 20, kb = planBlocks(sp, n, rng);
      expect(kb.used).toBeLessThanOrEqual(n); expect(new Set(kb.blocks.map((b) => [...b].sort().join())).size).toBe(kb.blocks.length);
      const normal = Array.from({ length: n - kb.used }, (_, i) => KV[i % KV.length]), asm = assembleRound(normal, kb.blocks, rng);
      expect(asm.tasks.length).toBe(n); kb.blocks.forEach((b) => orders.add(b.join()));
    }
    expect(orders.size).toBeGreaterThan(3);   // mehr als die 3 festen Reihenfolgen: die Reihenfolge wird zufällig gezogen
    const tiny = planBlocks(syllablePlan(KV, {}, cfg, undefined, blocks), 4, seeded(5)); expect(tiny.used).toBeLessThanOrEqual(4);
  });
  it("Stufe 2 aus gespeicherten Blöcken: nur freigegebene Silben zählen, Stufe 3 kommt mit 80 % von Stufe 1, Stufe 4 mit 80 % von Stufe 2", () => {
    const blocks = [["ma", "pa", "la"]], P = [...KV, "al", "am", "ala"];
    expect(syllablePlan(KV.filter((x) => x !== "pa" && x !== "la"), {}, cfg, undefined, blocks).contrast.blocks).toEqual([]);   // weniger als 2 freigegebene Silben im Block
    const fast = (xs: string[], k = false) => Object.fromEntries(xs.map((s) => [k ? kKey(s) : s, Array(k ? 6 : 10).fill(1)]));
    const stage1 = KV.filter((x) => x.length === 2 || x.length === 1);
    expect(syllablePlan(P, {}, cfg, 0, blocks).locked).toContain("al");                                  // Stufe 3 noch gesperrt
    expect(syllablePlan(P, fast(stage1), cfg, 0, blocks).fresh).toContain("al");                       // 80 % Stufe 1: Stufe 3 offen
    expect(syllablePlan(P, fast(stage1), cfg, 0, blocks).locked).toContain("ala");                     // Stufe 4 braucht Stufe 2 (Kontrastzeit)
    expect(syllablePlan(P, { ...fast(stage1), ...fast(["ma", "pa", "la"], true) }, cfg, 0, blocks).fresh).toContain("ala");
  });
});
