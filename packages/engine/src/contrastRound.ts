// Kontrastblöcke in der Runde: 2 bis 3 Silben mit gleichem Vokal und verschiedenem Anlaut direkt hintereinander (Stufe 2).
// Der Anteil der Blöcke ergibt sich aus den noch offenen Silben (Kontrast gegen normal), nicht aus einem Prozentwert.
import { classifySyllable } from "@silbenflug/core";
import type { Rng } from "@silbenflug/shared";
import type { SyllablePlan } from "./syllablePlan";
import { BLOCK_MAX } from "./blocks";


const vowelOf = (s: string): string => classifySyllable(s).parts[0].replace(/^[^aeiouäöüy]+/, "");
function shuffle<T>(a: T[], rng: Rng): T[] { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }

// Ohne gespeicherte Blöcke (älterer Stand): Blöcke aus den Kontrast-Silben ableiten (je Vokal Dreiergruppen).
export function deriveBlocks(con: Set<string>): string[][] {
  const byV = new Map<string, string[]>(); [...con].sort().forEach((s) => { const v = vowelOf(s); (byV.get(v) ?? byV.set(v, []).get(v)!).push(s); });
  const out: string[][] = [];
  byV.forEach((l) => { for (let i = 0; i < l.length; i += BLOCK_MAX) { const g = l.slice(i, i + BLOCK_MAX); out.push(g.length < 2 ? l.slice(-BLOCK_MAX) : g); } });
  return out.filter((b) => b.length >= 2);
}

// Blöcke für eine Runde: genau die Silbenzahl der Runde wird nie überschritten (ein Block zählt mit allen Silben). Plätze für Blöcke =
// Aufgabenzahl x Anteil offener Kontrast-Silben an allen offenen Silben (Kontrast + normale). Pro Runde kommt jeder Block höchstens einmal vor,
// die Reihenfolge der Silben im Block wird zufällig gezogen.
export function planBlocks(sp: SyllablePlan, n: number, rng: Rng): { blocks: string[][]; used: number } {
  const k = sp.contrast, active = new Set([...k.fresh, ...k.building, ...k.weak]);
  if (!active.size) return { blocks: [], used: 0 };
  const normalActive = sp.fresh.length + sp.building.length + sp.weak.length, share = active.size / (active.size + normalActive), slots = Math.min(n, Math.round(n * share));
  const blocks: string[][] = []; let used = 0;
  for (const b of shuffle(k.blocks.filter((x) => x.some((s) => active.has(s))), rng)) {
    if (used >= slots) break;
    if (used + b.length > n) continue;
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
