// Rundenaufbau nach Lernstufen (Auswahl je Silbe).
import type { Rng } from "@silbenflug/shared";
import { type RoundParams, SILBENZAUBER_ROUND_PARAMS } from "./round";
import { classifySyllable } from "./stages";

export interface SylGroups { fresh: string[]; building: string[]; weak: string[]; solid: string[] }
export interface SylInfo { count: Record<string, number>; ratio: Record<string, number>; minMeasure: number }
export interface SylMix { fresh: number; weak: number; review: number }   // Prozent (Summe beliebig > 0, wird normiert)

// Anzahl Aufgaben je Gruppe (A = neu/angefangen, B = schwach, C = Wiederholung sicherer Silben) aus den Prozentwerten (Rest nach größtem Bruchteil).
// Leere oder ausgeschöpfte Gruppen werden beim Ziehen aufgefüllt (siehe groupedTasks).
function quotas(n: number, mix: SylMix): [number, number, number] {
  const w = [mix.fresh, mix.weak, mix.review].map((x) => Math.max(0, x)), sum = w.reduce((a, b) => a + b, 0) || 1, raw = w.map((x) => (x * n) / sum), q = raw.map((r) => Math.floor(r + 1e-9));
  let left = n - q.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r + 1e-9), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { q[i]++; left--; } });
  return [q[0], q[1], q[2]];
}

// Höchstzahl je Silbe und Runde
const MAX_PER_SYLLABLE = 3;

// Gewichte einer Teilmenge: Faktor je Silbe, Summe = 1 (keine Längenverteilung, keine Silbenschwierigkeit)
function weigh(list: string[], f: (s: string) => number): Array<[string, number]> {
  let w = list.map((s) => f(s)), t = w.reduce((a, b) => a + b, 0);
  if (!(t > 0)) { w = list.map(() => 1); t = list.length; }
  return list.map((s, i) => [s, w[i] / t] as [string, number]);
}

// Runde aus den Gruppen: A (neu/angefangen: je zur Hälfte, neue nach niedriger Stufe, angefangene alle gleich), B (schwach: nach Ø/Zeitvorgabe), C (sicher, gleichverteilt).
// Plätze zufällig, Platz 1 nie aus C, solange es etwas anderes gibt; keine direkten Wiederholer, Wiederholungen werden gedämpft; jede Silbe höchstens MAX_PER_SYLLABLE-mal.
// Fehlt eine Silbe (Gruppe leer oder Limit erreicht), wird aufgefüllt: neu/angefangen, dann schwach, dann sicher (zuerst Stufe direkt unter der höchsten aktiven Stufe, dann weiter nach unten).
// Reicht auch das nicht, wird das Limit ausnahmsweise überschritten.
export function groupedTasks(n: number, g: SylGroups, mix: SylMix, info: SylInfo, rng: Rng, p: RoundParams = SILBENZAUBER_ROUND_PARAMS): string[] {
  const q = quotas(n, mix);
  const minStage = g.fresh.length ? Math.min(...g.fresh.map((s) => classifySyllable(s).stage)) : 1;
  const aw: Array<[string, number]> = [];
  const fw = weigh(g.fresh, (s) => 1 / (1 + classifySyllable(s).stage - minStage)), bw = weigh(g.building, () => 1);
  const fs = g.fresh.length && g.building.length ? 0.5 : 1;
  fw.forEach(([s, w]) => aw.push([s, w * fs])); bw.forEach(([s, w]) => aw.push([s, w * (g.fresh.length ? 0.5 : 1)]));
  const bwk = weigh(g.weak, (s) => Math.max(0.1, info.ratio[s] ?? 1)), cw = weigh(g.solid, () => 1);
  const pools = [aw, bwk, cw];
  // sichere Silben nach Nähe zur höchsten aktiven Stufe: direkt darunter, dann tiefer, zuletzt gleich/höher
  const stageOf = (s: string) => classifySyllable(s).stage;
  const active = [...g.fresh, ...g.building, ...g.weak].map(stageOf), top = active.length ? Math.max(...active) : Math.max(0, ...g.solid.map(stageOf)) + 1;
  const tierMap = new Map<number, Array<[string, number]>>();
  cw.forEach((e) => { const st = stageOf(e[0]), t = st < top ? top - 1 - st : 1000 + st; (tierMap.get(t) ?? tierMap.set(t, []).get(t)!).push(e); });
  const tiers = [...tierMap.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
  const labels: number[] = []; q.forEach((c, i) => { for (let k = 0; k < c; k++) labels.push(i); });
  for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
  if (labels[0] === 2) { const k = labels.findIndex((x) => x !== 2); if (k > 0) [labels[0], labels[k]] = [labels[k], labels[0]]; }
  const out: string[] = [], cnt: Record<string, number> = {};
  labels.forEach((gi, i) => {
    const prev = out[i - 1], free = (list: Array<[string, number]>) => list.filter(([s]) => s !== prev && (cnt[s] || 0) < MAX_PER_SYLLABLE);
    let cand = free(pools[gi]);
    if (!cand.length) for (const pl of [aw, bwk]) { cand = free(pl); if (cand.length) break; }
    if (!cand.length) for (const t of tiers) { cand = free(t); if (cand.length) break; }
    if (!cand.length) { cand = pools.flat().filter(([s]) => s !== prev); if (!cand.length) cand = pools.flat(); }
    const ws = cand.map(([s, w]) => w / (1 + p.repeatDamping * (cnt[s] || 0))), tot = ws.reduce((x, y) => x + y, 0);
    let r = rng() * tot, j = 0;
    while (j < cand.length - 1 && r >= ws[j]) { r -= ws[j]; j++; }
    out.push(cand[j][0]); cnt[cand[j][0]] = (cnt[cand[j][0]] || 0) + 1;
  });
  return out;
}
