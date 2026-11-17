// Lautolino: Lernstufen (Zuordnung, Fortschritt, Rundenaufbau) und Silbenbögen. Reine Logik ohne Server.
import { describe, expect, it } from "vitest";
import { buildSyllables, classifySyllable, contrastSet, displayParts, renderWordWithArcs, splitSyllables, stagePlan, stagedTasks, STAGES } from "@silbenflug/core";
import { letterStages, trainingWindow } from "@silbenflug/engine";
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

describe("Lernstufen: Fortschritt, Fenster, Wiederholung", () => {
  const scope = pool(LETTERS), con = contrastSet(scope);
  it("am Anfang gelten Stufe 1 und 2 gemeinsam, höhere Stufen sind gesperrt", () => {
    const l = letterStages("l", scope, con, {}, cfg);
    expect(l.current).toBe(1); expect(l.window).toEqual([1, 2]); expect(l.stages.map((s) => s.status)).toEqual(["active", "active", "locked", "locked", "locked", "empty", "locked"]);
    expect(l.focus.sort()).toEqual("la le lo ma me mo pa pe po".split(" ").sort()); expect(l.review).toEqual([]);
  });
  it("Stufe 1 sicher beherrscht: Schwerpunkt wandert zu Stufe 3 und 4, Stufe 1/2 werden Wiederholung", () => {
    const kv = "la le lo ma me mo pa pe po".split(" "), l = letterStages("l", scope, con, fast(kv), cfg);
    expect(l.current).toBe(3); expect(l.window).toEqual([3, 4]); expect(l.stages.slice(0, 2).map((s) => s.status)).toEqual(["done", "done"]);
    expect(l.stages[4].status).toBe("locked"); expect(l.stages[6].status).toBe("locked");
    expect(l.focus).not.toContain("ma"); expect(l.focus).toContain("mal"); expect(l.focus).toContain("ama"); expect(l.review.sort()).toEqual(kv.sort());
  });
  it("nur mit 9 statt 10 Messungen oder zu langsam ist eine Silbe nicht sicher (Bewertung unverändert)", () => {
    const kv = "la le lo ma me mo pa pe po".split(" "), t = fast(kv); t.ma = Array(9).fill(1); t.la = Array(10).fill(9);
    const l = letterStages("l", scope, con, t, cfg); expect(l.current).toBe(1); expect(l.stages[0].mastered).toBe(7); expect(l.stages[0].processed).toBe(9);
  });
  it("zu kleine Fenster werden erweitert (sonst keine Runde möglich), Einschränkung entfällt wenn auch das nicht reicht", () => {
    const small = pool(["l", "o"]), w = trainingWindow({ l: small, o: small }, {}, cfg, 3);
    expect(w.restricted).toBe(true); expect(w.extended).toBeGreaterThan(0); expect(w.focus.length).toBeGreaterThanOrEqual(3);
    const tiny = trainingWindow({ a: ["ma"] }, {}, cfg, 3); expect(tiny.restricted).toBe(false); expect(tiny.focus).toEqual([]);
  });
  it("jeder Buchstabe hat seinen eigenen Stand: ein neuer Buchstabe beginnt wieder bei Stufe 1", () => {
    const kv = "la le lo ma me mo pa pe po".split(" "), nScope = ["na", "no", "ne", "an", "on", "nan", "ona"];
    const w = trainingWindow({ l: scope, n: nScope }, fast(kv), cfg, 3, [...new Set([...scope, ...nScope])]);
    expect(w.letters.find((x) => x.letter === "l")!.current).toBe(3); expect(w.letters.find((x) => x.letter === "n")!.current).toBe(1);
    expect(w.focus).toContain("na"); expect(w.focus).toContain("mal");
  });
});

describe("Rundenaufbau mit Lernstufen", () => {
  const letters = LETTERS, lens = [2, 3], focus = "la le lo ma me mo pa pe po".split(" "), review = ["al", "el", "ol", "am", "em"];
  const f = DEFAULT_CONFIG.round.letter_frequency_default;
  it("ohne Stufen-Angaben genau wie bisher; mit Stufen nur Silben des Fensters plus Wiederholungen", () => {
    const a = stagedTasks(letters, lens, f, 20, 50, null, 50, null, 15, mulberry32(3)), b = stagedTasks(letters, lens, f, 20, 50, null, 50, { focus: [], review }, 15, mulberry32(3));
    expect(b).toEqual(a); expect(new Set(a).size).toBeGreaterThan(10);
    const t = stagedTasks(letters, lens, f, 20, 50, null, 50, { focus, review }, 15, mulberry32(4));
    expect(t.length).toBe(20); expect(t.filter((s) => review.includes(s)).length).toBe(3); expect(t.filter((s) => focus.includes(s)).length).toBe(17);
    expect(t.every((s) => focus.includes(s) || review.includes(s))).toBe(true); expect(t[0] && focus.includes(t[0])).toBe(true);
    for (let i = 1; i < t.length; i++) expect(t[i]).not.toBe(t[i - 1]);
  });
  it("0 % Wiederholung: nur Silben des Fensters", () => {
    const t = stagedTasks(letters, lens, f, 20, 50, null, 50, { focus, review }, 0, mulberry32(5)); expect(t.every((s) => focus.includes(s))).toBe(true);
  });
});
