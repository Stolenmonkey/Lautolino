// Rundenaufbau nach Lernstufen (Auswahl je Silbe).
import type { Rng } from "@silbenflug/shared";
import { type RoundParams, SILBENZAUBER_ROUND_PARAMS } from "./round";
import { classifySyllable } from "./stages";

export interface SylGroups { fresh: string[]; building: string[]; weak: string[]; solid: string[] }
export interface SylInfo { count: Record<string, number>; ratio: Record<string, number>; minMeasure: number }
export interface SylMix { fresh: number; weak: number; review: number }   // Prozent (Summe beliebig > 0, wird normiert)

// Anzahl Aufgaben je Gruppe (A = neu/angefangen, B = schwach, C = Wiederholung sicherer Silben). Leere Gruppen geben ihren Anteil zuerst an A/B (Vorrang vor der Wiederholung) ab.
function quotas(n: number, mix: SylMix, has: [boolean, boolean, boolean]): [number, number, number] {
  const base = [mix.fresh, mix.weak, mix.review].map((x, i) => (has[i] ? Math.max(0, x) : 0)), total = mix.fresh + mix.weak + mix.review;
  let w = base.slice();
  const freed = total - base.reduce((a, b) => a + b, 0);
  if (freed > 0 || base.every((x) => !x)) {
    const prio = [0, 1].filter((i) => has[i] && base[i] > 0), tg = prio.length ? prio : [0, 1, 2].filter((i) => has[i]);
    const ts = tg.reduce((a, i) => a + base[i], 0);
    tg.forEach((i) => { w[i] += ts > 0 ? (freed * base[i]) / ts : (freed || 1) / tg.length; });
  }
  const sum = w.reduce((a, b) => a + b, 0) || 1, raw = w.map((x) => (x * n) / sum), q = raw.map(Math.floor);
  let left = n - q.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0 && has[i]) { q[i]++; left--; } });
  return [q[0], q[1], q[2]];
}

// Gewichte einer Teilmenge: Faktor je Silbe, Summe = 1 (keine Längenverteilung, keine Silbenschwierigkeit)
function weigh(list: string[], f: (s: string) => number): Array<[string, number]> {
  let w = list.map((s) => f(s)), t = w.reduce((a, b) => a + b, 0);
  if (!(t > 0)) { w = list.map(() => 1); t = list.length; }
  return list.map((s, i) => [s, w[i] / t] as [string, number]);
}

// Runde aus den Gruppen: A (neu/angefangen: je zur Hälfte, neue nach niedriger Stufe, angefangene nach fehlenden Messungen), B (schwach: nach Ø/Zeitvorgabe), C (sicher, gleichverteilt).
// Plätze zufällig, Platz 1 nie aus C, solange es etwas anderes gibt; keine direkten Wiederholer, Wiederholungen werden gedämpft.
export function groupedTasks(n: number, g: SylGroups, mix: SylMix, info: SylInfo, rng: Rng, p: RoundParams = SILBENZAUBER_ROUND_PARAMS): string[] {
  const a = [...g.fresh, ...g.building];
  const q = quotas(n, mix, [a.length > 0, g.weak.length > 0, g.solid.length > 0]);
  const minStage = g.fresh.length ? Math.min(...g.fresh.map((s) => classifySyllable(s).stage)) : 1;
  const aw: Array<[string, number]> = [];
  const fw = weigh(g.fresh, (s) => 1 / (1 + classifySyllable(s).stage - minStage)), bw = weigh(g.building, (s) => Math.max(1, info.minMeasure - (info.count[s] || 0)) + 1);
  const fs = g.fresh.length && g.building.length ? 0.5 : 1;
  fw.forEach(([s, w]) => aw.push([s, w * fs])); bw.forEach(([s, w]) => aw.push([s, w * (g.fresh.length ? 0.5 : 1)]));
  const bwk = weigh(g.weak, (s) => Math.max(0.1, info.ratio[s] ?? 1)), cw = weigh(g.solid, () => 1);
  const pools = [aw, bwk, cw];
  const labels: number[] = []; q.forEach((c, i) => { for (let k = 0; k < c; k++) labels.push(i); });
  for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
  if (labels[0] === 2) { const k = labels.findIndex((x) => x !== 2); if (k > 0) [labels[0], labels[k]] = [labels[k], labels[0]]; }
  const out: string[] = [], cnt: Record<string, number> = {};
  labels.forEach((gi, i) => {
    const prev = out[i - 1], all = pools[gi]; let cand = all.filter(([s]) => s !== prev);
    if (!cand.length) cand = pools.flat().filter(([s]) => s !== prev);   // Gruppe hat nur die eben gezeigte Silbe: ausnahmsweise aus einer anderen Gruppe
    if (!cand.length) cand = all;
    const ws = cand.map(([s, w]) => w / (1 + p.repeatDamping * (cnt[s] || 0))), tot = ws.reduce((x, y) => x + y, 0);
    let r = rng() * tot, j = 0;
    while (j < cand.length - 1 && r >= ws[j]) { r -= ws[j]; j++; }
    out.push(cand[j][0]); cnt[cand[j][0]] = (cnt[cand[j][0]] || 0) + 1;
  });
  return out;
}
