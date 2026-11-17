// Aufgaben einer Runde mit Lernstufen: Hauptteil aus den Silben der aktuellen Lernstufen (mit der unveränderten Aufgabenverteilung makeRound),
// dazu gelegentlich Wiederholungen früherer Stufen. Ohne Stufen-Angaben verhält sich alles wie bisher.
import type { Rng } from "@silbenflug/shared";
import { buildSyllables } from "./syllables";
import { lenWeights, makeRound, SILBENZAUBER_ROUND_PARAMS, type RoundParams, type SylAvg } from "./round";
import { classifySyllable } from "./stages";

export interface Training { focus: string[]; review: string[] }

export function stagedTasks(letters: string[], lens: number[], factor: number, n: number, bal: number | null | undefined, sylAvg: SylAvg | null | undefined,
  sbal: number | null | undefined, training: Training | null | undefined, reviewPercent: number, rng: Rng, p: RoundParams = SILBENZAUBER_ROUND_PARAMS): string[] {
  const focus = training ? training.focus : [];
  if (!focus.length) return makeRound(letters, lens, factor, n, bal, sylAvg, sbal, null, rng, p);
  const fs = new Set(focus.map((x) => x.toLowerCase()));
  const pool = lens.slice().sort((a, b) => a - b).flatMap((L) => buildSyllables(letters, L));
  const blocked = pool.filter((s) => !fs.has(s));
  if (pool.length - blocked.length < p.minPool) return makeRound(letters, lens, factor, n, bal, sylAvg, sbal, null, rng, p);   // zu klein: wie bisher
  const rv = (training!.review || []).filter((s) => !fs.has(s.toLowerCase()) && pool.indexOf(s.toLowerCase()) >= 0);
  const nRev = rv.length && reviewPercent > 0 ? Math.min(Math.floor(n / 2), Math.round((n * reviewPercent) / 100)) : 0;
  const main = makeRound(letters, lens, factor, n - nRev, bal, sylAvg, sbal, blocked, rng, p);
  if (!nRev) return main;
  const pos = new Set<number>();   // zufällige Plätze für die Wiederholungen (nicht am Anfang, damit eine Runde immer mit neuem Stoff beginnt)
  while (pos.size < nRev) pos.add(1 + Math.floor(rng() * (n - 1)));
  const out: string[] = []; let m = 0;
  for (let i = 0; i < n; i++) {
    if (pos.has(i)) {
      const cand = rv.filter((s) => s !== out[i - 1]), list = cand.length ? cand : rv;
      out.push(list[Math.min(list.length - 1, Math.floor(rng() * list.length))]);
    } else out.push(main[m++]);
  }
  return out;
}

// ---------- Auswahl je Silbe (stages.mode 2) ----------
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

// Gewichte einer Teilmenge: Längenverteilung (bal) und Faktor je Silbe; Summe = 1
function weigh(list: string[], lw: Record<number, number>, f: (s: string) => number): Array<[string, number]> {
  const nL: Record<number, number> = {};
  list.forEach((s) => { nL[s.length] = (nL[s.length] || 0) + 1; });
  let w = list.map((s) => ((lw[s.length] ?? 1) / nL[s.length]) * f(s));
  let t = w.reduce((a, b) => a + b, 0);
  if (!(t > 0)) { w = list.map(() => 1); t = list.length; }
  return list.map((s, i) => [s, w[i] / t] as [string, number]);
}

// Runde aus den Gruppen: A (neu/angefangen: je zur Hälfte, neue nach niedriger Stufe, angefangene nach fehlenden Messungen), B (schwach: nach Ø/Zeitvorgabe), C (sicher, gleichverteilt).
// Plätze zufällig, Platz 1 nie aus C, solange es etwas anderes gibt; keine direkten Wiederholer, Wiederholungen werden gedämpft.
export function groupedTasks(lens: number[], n: number, bal: number | null | undefined, g: SylGroups, mix: SylMix, info: SylInfo, rng: Rng, p: RoundParams = SILBENZAUBER_ROUND_PARAMS): string[] {
  const lw = lenWeights(lens, bal), a = [...g.fresh, ...g.building];
  const q = quotas(n, mix, [a.length > 0, g.weak.length > 0, g.solid.length > 0]);
  const minStage = g.fresh.length ? Math.min(...g.fresh.map((s) => classifySyllable(s).stage)) : 1;
  const aw: Array<[string, number]> = [];
  const fw = weigh(g.fresh, lw, (s) => 1 / (1 + classifySyllable(s).stage - minStage)), bw = weigh(g.building, lw, (s) => Math.max(1, info.minMeasure - (info.count[s] || 0)) + 1);
  const fs = g.fresh.length && g.building.length ? 0.5 : 1;
  fw.forEach(([s, w]) => aw.push([s, w * fs])); bw.forEach(([s, w]) => aw.push([s, w * (g.fresh.length ? 0.5 : 1)]));
  const bwk = weigh(g.weak, lw, (s) => Math.max(0.1, info.ratio[s] ?? 1)), cw = weigh(g.solid, lw, () => 1);
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
