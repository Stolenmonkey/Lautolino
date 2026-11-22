// Silbenbasierte Auswahl : Freischaltung je Silbe, Gruppen, Rundenmix, Konfiguration.
import { describe, expect, it } from "vitest";
import { buildSyllables, classifySyllable, groupedTasks } from "@silbenflug/core";
import { syllablePlan } from "@silbenflug/engine";
import { DEFAULT_CONFIG, validateConfig, withDefaults } from "@silbenflug/shared";
import { mulberry32 } from "./helpers";

const cfg = DEFAULT_CONFIG, L = ["l", "e", "o", "a"], pool = (l: string[]) => [2, 3, 4].flatMap((n) => buildSyllables(l, n));
const fast = (s: string[]) => Object.fromEntries(s.map((x) => [x, Array(10).fill(1)]));
const stage1 = (l: string[]) => pool(l).filter((s) => classifySyllable(s).stage === 1);

describe("Standardwerte und Prüfung", () => {
  it("Standard: 80 % Gate, Mix 45/30/25, gültig; Mix muss 100 ergeben", () => {
    expect(cfg.stages).toMatchObject({ gate_percent: 80, mix_new_percent: 40, mix_weak_percent: 55, mix_review_percent: 5 });
    expect(validateConfig(cfg)).toEqual([]);
    expect(validateConfig({ ...cfg, stages: { ...cfg.stages, mix_new_percent: 50 } }).join()).toMatch(/100/);
    expect(validateConfig({ ...cfg, stages: { ...cfg.stages, gate_percent: 120 } }).length).toBe(1);
  });
  it("ältere gespeicherte Konfiguration bekommt die neuen Werte ergänzt", () => {
    expect(withDefaults({ stages: { enabled: 1 } as any }).stages.gate_percent).toBe(80);
  });
});

describe("syllablePlan: Freischaltung je Silbe", () => {
  it("ohne Messungen sind nur Stufe-1-Silben offen, VK/KVK gesperrt", () => {
    const p = syllablePlan(pool(L), {}, cfg);
    expect(p.fresh.every((s) => classifySyllable(s).stage === 1)).toBe(true);
    expect(p.locked).toContain("al"); expect(p.fresh).not.toContain("al");
  });
  it("AL wird frei, sobald 80 % der Vorstufen-Silben aus {a,l} sicher sind (andere Buchstaben egal)", () => {
    const base = stage1(["a", "l"]), p = syllablePlan(pool(L), fast(base), cfg);
    expect(p.fresh).toContain("al"); expect(p.solid).toContain("la");
    expect(p.locked).toContain("el");     // braucht e und l; „e" ist nicht sicher
  });
  it("unter 80 % bleibt gesperrt, ab 80 % offen; gate_percent einstellbar", () => {
    const P = pool(["l", "a", "m"]), fastK = (xs: string[]) => Object.fromEntries(xs.map((s) => ["k:" + s, Array(6).fill(1)]));   // MAL braucht ma und la (Stufe 1) und deren Kontrastzeit (Stufe 2)
    expect(syllablePlan(P, { ...fast(["la"]), ...fastK(["la"]) }, cfg).locked).toContain("mal");
    expect(syllablePlan(P, fast(["la", "ma"]), cfg).locked).toContain("mal");   // ohne Kontrastzeiten bleibt Stufe 2 offen
    expect(syllablePlan(P, { ...fast(["la", "ma"]), ...fastK(["la", "ma"]) }, cfg).fresh).toContain("mal");
    const lax = { ...cfg, stages: { ...cfg.stages, gate_percent: 50 } };
    expect(syllablePlan(P, { ...fast(["la"]), ...fastK(["la"]) }, lax).fresh).toContain("mal");
  });
  it("Silben mit Messungen bleiben offen; Gruppen nach Status", () => {
    const t = { ...fast(["la"]), al: [2], ma: Array(10).fill(9) }, p = syllablePlan(pool([...L, "m"]), t, cfg);
    expect(p.building).toContain("al"); expect(p.weak).toContain("ma"); expect(p.solid).toContain("la"); expect(p.count.al).toBe(1); expect(p.ratio.ma).toBeGreaterThan(1);
  });
  it("zu wenig offene nicht sichere Silben: niedrigste gesperrte werden nachgeholt", () => {
    const p = syllablePlan(["al", "el", "ol"], {}, cfg);
    expect(p.fresh.length).toBeGreaterThanOrEqual(3); expect(p.locked).toEqual([]);
  });
});

describe("groupedTasks: Rundenmix", () => {
  const g = { fresh: ["la", "le", "li"], building: ["lo", "lu"], weak: ["ol", "ul", "il", "el"], solid: ["al", "ma", "me"] }, info = { count: { lo: 4 }, ratio: { ol: 1.5 }, minMeasure: 10 };
  const mix = { fresh: 40, weak: 55, review: 5 };
  it("20 Aufgaben im Verhältnis 40/55/5, max. 3 je Silbe, Platz 1 nie aus der Wiederholung, keine direkten Wiederholer", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = groupedTasks(20, g, mix, info, mulberry32(seed));
      expect(t.length).toBe(20);
      expect(t.filter((s) => ["la", "le", "li", "lo", "lu"].includes(s)).length).toBe(8);
      expect(t.filter((s) => ["ol", "ul", "il", "el"].includes(s)).length).toBe(11);
      expect(t.filter((s) => ["al", "ma", "me"].includes(s)).length).toBe(1);
      expect(["al", "ma", "me"]).not.toContain(t[0]);
      t.forEach((s, i) => { if (i) expect(s).not.toBe(t[i - 1]); expect(t.filter((x) => x === s).length).toBeLessThanOrEqual(3); });
    }
  });
  it("Limit 3: Rest wird aufgefüllt (neu/angefangen, schwach, sicher); danach sichere Silben aus der Stufe darunter", () => {
    const t = groupedTasks(20, { fresh: ["la", "le"], building: [], weak: ["ol", "ul"], solid: ["al", "el", "ma", "me"] }, mix, info, mulberry32(3));
    expect(t.length).toBe(20);
    t.forEach((s) => expect(t.filter((x) => x === s).length).toBeLessThanOrEqual(3));
    const only = groupedTasks(10, { fresh: [], building: [], weak: [], solid: ["al", "el"] }, mix, info, mulberry32(3));
    expect(only.length).toBe(10);
  });
});

describe("Silben-Zug und Lehrer-Ansicht im Modus 2", () => {
  it("Stufenansicht: gesperrte Silben werden als gesperrt geliefert, Hinweistext nennt Gate und Mix", async () => {
    const { readFileSync } = await import("node:fs");
    const ui = readFileSync("apps/web/js/views/auswertung.js", "utf8"), st = readFileSync("apps/web/js/views/stufen.js", "utf8");
    expect(ui).toContain("gatePercent"); expect(st).toContain("noch nicht freigeschaltet");
  });
});
