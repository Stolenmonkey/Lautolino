// Kontrastblöcke in der Runde: 2 bis 3 Silben mit gleichem Vokal und verschiedenem Anlaut direkt hintereinander (Stufe 2).
// Der Anteil der Blöcke ergibt sich aus den noch offenen Silben (Kontrast gegen normal), nicht aus einem Prozentwert.
import { classifySyllable } from "@silbenflug/core";
import type { Rng } from "@silbenflug/shared";
import type { SyllablePlan } from "./syllablePlan";

export const BLOCK_MAX = 3;
const vowelOf = (s: string): string => classifySyllable(s).parts[0].replace(/^[^aeiouäöüy]+/, "");
function shuffle<T>(a: T[], rng: Rng): T[] { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }

// Blöcke für eine Runde. Plätze für Blöcke = Aufgabenzahl x Anteil offener Kontrast-Silben an allen offenen Silben (Kontrast + normale).
export function planBlocks(sp: SyllablePlan, n: number, rng: Rng): { blocks: string[][]; used: number } {
  const k = sp.contrast, active = [...k.fresh, ...k.building, ...k.weak];
  if (!active.length) return { blocks: [], used: 0 };
  const normalActive = sp.fresh.length + sp.building.length + sp.weak.length, share = active.length / (active.length + normalActive), slots = Math.min(n, Math.round(n * share));
  const byVowel = new Map<string, { act: string[]; solid: string[] }>();
  const slot = (v: string) => byVowel.get(v) ?? byVowel.set(v, { act: [], solid: [] }).get(v)!;
  active.forEach((s) => slot(vowelOf(s)).act.push(s)); k.solid.forEach((s) => slot(vowelOf(s)).solid.push(s));
  const units = shuffle([...byVowel.values()].filter((u) => u.act.length > 0 && u.act.length + u.solid.length >= 2), rng);
  const blocks: string[][] = []; let used = 0;
  for (const u of units) {
    if (used >= slots) break;
    const b = shuffle(u.act, rng).slice(0, BLOCK_MAX);
    if (b.length < 2) b.push(...shuffle(u.solid, rng).slice(0, 2 - b.length));
    if (b.length < 2) continue;
    blocks.push(shuffle(b, rng)); used += b.length;
  }
  return { blocks, used };
}

// Mischt Blöcke an zufälligen Stellen in die normalen Aufgaben. kmark je Aufgabe: 0 normal, 1 erste Silbe eines Blocks, 2 weitere Silbe eines Blocks.
export function assembleRound(normal: string[], blocks: string[][], rng: Rng): { tasks: string[]; kmark: number[] } {
  let units: string[][] = normal.map((s) => [s]);
  blocks.forEach((b) => {
    let pos = 0;
    for (let t = 0; t < 6; t++) {
      pos = Math.floor(rng() * (units.length + 1));
      const prev = units[pos - 1], next = units[pos];
      if ((!prev || prev[prev.length - 1] !== b[0]) && (!next || next[0] !== b[b.length - 1])) break;
    }
    units = [...units.slice(0, pos), b, ...units.slice(pos)];
  });
  const tasks: string[] = [], kmark: number[] = [];
  units.forEach((u) => u.forEach((s, i) => { tasks.push(s); kmark.push(u.length > 1 ? (i === 0 ? 1 : 2) : 0); }));
  return { tasks, kmark };
}
