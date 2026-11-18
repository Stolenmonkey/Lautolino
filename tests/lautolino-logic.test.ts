// Lautolino: Lernstufen (Zuordnung, Fortschritt, Rundenaufbau) und Silbenbögen. Reine Logik ohne Server.
import { describe, expect, it } from "vitest";
import { buildSyllables, classifySyllable, contrastSet, displayParts, renderWordWithArcs, splitSyllables, stagePlan, STAGES } from "@silbenflug/core";
import { DEFAULT_CONFIG } from "@silbenflug/shared";
import { mulberry32 } from "./helpers";

const LETTERS = ["l", "e", "o", "a", "m", "p"];
const pool = (letters: string[], lens = [2, 3, 4]) => lens.flatMap((n) => buildSyllables(letters, n));
const cfg = DEFAULT_CONFIG;
const fast = (s: string[]) => Object.fromEntries(s.map((x) => [x, Array(10).fill(1)]));   // 10 Messungen, 1 s: sicher beherrscht

describe("Lernstufen: Zuordnung nach dem PDF-Lernplan", () => {
  it("Beispiele aus dem PDF landen in der richtigen Stufe und Unterkategorie", () => {
    const want: Record<string, string> = {
      ma: "1.2", pa: "1.2", lo: "1.2", au: "1.1", ei: "1.1",
      am: "3.1", al: "3.1", ol: "3.1", mal: "3.2", pal: "3.2", pop: "3.2", lam: "3.2", lol: "3.2",
      oma: "4.1", opa: "4.1", ama: "4.1", ele: "4.1", mama: "4.2", lama: "4.2", pala: "4.2", leo: "4.2",
      palme: "5.1", lampe: "5.1", malma: "5.1", alma: "5.2", elma: "5.2", mamal: "5.2", lapam: "5.2", malpal: "5.3", lampol: "5.3",
      malala: "6.1", papalo: "6.1", aloe: "6.1", mamalpa: "6.2", palmalo: "6.2",
      plam: "7.1", plem: "7.1", plom: "7.1", palm: "7.2", lamp: "7.2", plampe: "7.1", plolma: "7.1",
    };
    for (const [w, sub] of Object.entries(want)) expect(classifySyllable(w).sub, w).toBe(sub);
  });
  it("jede Silbe gehört genau einer Stufe, alle sieben Stufen und ihre Unterkategorien sind vorhanden", () => {
    expect(STAGES.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(STAGES.flatMap((s) => s.subs.map((u) => u.id))).toEqual(["1.1", "1.2", "2.1", "3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "5.3", "6.1", "6.2", "7.1", "7.2"]);
    const all = pool(LETTERS), plan = stagePlan(all), seen = new Map<string, number>();
    for (const g of plan) { if (g.stage === 2) continue; for (const s of g.syllables) seen.set(s, (seen.get(s) || 0) + 1); }
    expect(seen.size).toBe(all.length); expect([...seen.values()].every((n) => n === 1)).toBe(true);          // alle erfasst, keine doppelt
    for (const g of plan) for (const u of g.subs) expect(new Set(u.syllables).size).toBe(u.syllables.length);   // keine Doppelten je Unterkategorie
    const valid = new Set(all); for (const g of plan) g.syllables.forEach((s) => expect(valid.has(s)).toBe(true));   // nur gültige Silben
  });
  it("PDF-Stufen 1.2, 3.1 und 4.1 für L E O A M P ergeben genau die dort genannten Silben", () => {
    const plan = stagePlan(pool(LETTERS)), sub = (id: string) => plan.flatMap((g) => g.subs).find((u) => u.id === id)!.syllables;
    expect(sub("1.2").sort()).toEqual("MA ME MO LA LE LO PA PE PO".toLowerCase().split(" ").sort());
    expect(sub("3.1").sort()).toEqual("AM EM OM AL EL OL AP EP OP".toLowerCase().split(" ").sort());
    for (const w of "o-ma o-pa a-lo e-ma e-mo a-ma a-pa a-mo a-la e-lo e-la e-pa o-la".replace(/-/g, "").split(" ")) expect(sub("4.1")).toContain(w);
    for (const w of "mal pal lam pop mel mol pel pol pam lal lel lol lap lop lom".split(" ")) expect(sub("3.2")).toContain(w);
    for (const w of "plan palm lamp plam plem plom".split(" ").filter((x) => x !== "plan")) expect(plan[6].syllables).toContain(w);
  });
  it("Stufe 2 (Anlautwechsel): KV-Silben mit gleichem Vokal und anderem Anlaut; ein einzelner Anlaut hat keinen Kontrast", () => {
    expect(stagePlan(pool(LETTERS))[1].syllables.length).toBe(9);
    expect([...contrastSet(pool(["m", "a"]))]).toEqual([]);                      // nur MA: kein Partner
    expect([...contrastSet(pool(["m", "p", "a"]))].sort()).toEqual(["ma", "pa"]);
  });
  it("neue Buchstaben: die Zuordnung passt sich an (kein fester Katalog)", () => {
    const before = stagePlan(pool(["l", "o"])), after = stagePlan(pool(["l", "o", "n"]));
    expect(before[0].syllables).toEqual(["lo"]); expect(after[0].syllables.sort()).toEqual(["lo", "no"]); expect(after[2].syllables).toContain("on"); expect(after[2].syllables).toContain("nol");
  });
});

describe("Silbenbögen", () => {
  it("Sprechsilben: WAR eine, MAMA zwei, PALME zwei, LEO zwei, ALOE drei", () => {
    expect(splitSyllables("war")).toEqual(["war"]); expect(splitSyllables("mama")).toEqual(["ma", "ma"]); expect(splitSyllables("palme")).toEqual(["pal", "me"]);
    expect(splitSyllables("leo")).toEqual(["le", "o"]); expect(splitSyllables("aloe")).toEqual(["a", "lo", "e"]); expect(splitSyllables("plampe")).toEqual(["plam", "pe"]);
  });
  it("jede Sprechsilbe bekommt genau einen Bogen unter ihren Buchstaben; Groß-/Kleinschreibung bleibt", () => {
    const arcs = (w: string) => (renderWordWithArcs(w).match(/class="arc"/g) || []).length, groups = (w: string) => (renderWordWithArcs(w).match(/class="sy"/g) || []).length;
    expect(arcs("WAR")).toBe(1); expect(arcs("MAMA")).toBe(2); expect(arcs("Ma")).toBe(1); expect(arcs("Palme")).toBe(2); expect(groups("MAMA")).toBe(2);
    expect(displayParts("MaMa")).toEqual(["Ma", "Ma"]); expect(displayParts("War")).toEqual(["War"]);
    // WAR: alle drei Buchstaben in einer Gruppe
    expect((renderWordWithArcs("WAR").match(/<svg class="glyph|<svg/g) || []).length).toBeGreaterThan(3);
  });
  it("Bögen passen für alle möglichen Silben: Anzahl der Gruppen = Anzahl der Sprechsilben, Buchstaben vollständig", () => {
    for (const w of pool(["l", "e", "o", "a", "m", "p"]).slice(0, 400)) {
      const parts = displayParts(w); expect(parts.join("")).toBe(w); expect((renderWordWithArcs(w).match(/class="arc"/g) || []).length).toBe(parts.length);
    }
  });
});
