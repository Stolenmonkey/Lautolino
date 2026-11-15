// Aufgabenverteilung einer Runde (Logik unverändert aus Silbenzauber). Zufall wird von außen übergeben (testbar).
import type { Rng } from "@silbenflug/shared";
import { buildSyllables } from "./syllables";

export interface RoundParams { repeatDamping: number; curveExponent: number; minPool: number }
export const SILBENZAUBER_ROUND_PARAMS: RoundParams = { repeatDamping: 2, curveExponent: 4, minPool: 3 };

interface Item { s: string; lw: number; has: boolean; w: number }
export type SylAvg = Record<string, number | null>;

// Gewichte je Silbenlänge. bal 0..100: 0 = nur die kürzeste Länge, 100 = nur die längste, 50 = alle gleich oft.
export function lenWeights(lens: number[], bal?: number | null): Record<number, number> {
  const ls = lens.slice().sort((a, b) => a - b), n = ls.length, t = Math.min(100, Math.max(0, bal == null ? 50 : bal)) / 100;
  const w: Record<number, number> = {};
  ls.forEach((L, i) => {
    const uni = 1 / n, ext = t < 0.5 ? (i === 0 ? 1 : 0) : (i === n - 1 ? 1 : 0);
    const u = t < 0.5 ? (0.5 - t) * 2 : (t - 0.5) * 2;
    w[L] = n === 1 ? 1 : (1 - u) * uni + u * ext;
  });
  return w;
}

// factor: Häufigkeit der hinteren Buchstaben (0..100). sbal: Silbenschwierigkeit nach Zeit (0 leicht, 100 schwer, 50 aus).
function buildItems(letters: string[], lens: number[], factor: number, bal: number | null | undefined, sylAvg: SylAvg | null | undefined,
  sbal: number | null | undefined, blocked: string[] | null | undefined, p: RoundParams): Item[] {
  const lw = lenWeights(lens, bal);
  let items: Item[] = [];
  const f = Math.min(100, Math.max(0, factor)) / 100, k = letters.length, last = letters[k - 1];
  lens.forEach((L) => {
    const list = buildSyllables(letters, L);
    list.forEach((sy) => {
      let q = 0;
      sy.split("").forEach((c) => { q = Math.max(q, k > 1 ? letters.indexOf(c) / (k - 1) : 1); });
      items.push({ s: sy, lw: lw[L], has: sy.indexOf(last) >= 0, w: (lw[L] / list.length) * ((1 - f) + f * Math.pow(q, 1 + 20 * f)) + 1e-9 });
    });
  });
  if (blocked && blocked.length) {
    const okI = items.filter((it) => blocked.indexOf(it.s) < 0);
    if (okI.length >= p.minPool) items = okI;
  }
  if (sylAvg && sbal != null && sbal !== 50) {
    const known = items.filter((it) => sylAvg[it.s] != null).sort((x, y) => (sylAvg[x.s] as number) - (sylAvg[y.s] as number));
    const rk: Record<string, number> = {};
    known.forEach((it, q) => { rk[it.s] = known.length > 1 ? q / (known.length - 1) : 0.5; });
    const tt = sbal / 100, uu = Math.abs(tt - 0.5) * 2;
    items.forEach((it) => {
      const r = rk[it.s] != null ? rk[it.s] : 0.5, e = tt > 0.5 ? r : 1 - r;
      it.w *= (1 - uu) + uu * Math.pow(e, p.curveExponent) + 1e-9;
    });
  }
  const act = items.filter((i) => i.lw > 0);
  if (act.length >= p.minPool) items = act;
  if (f >= 1) { const only = items.filter((i) => i.has); if (only.length >= p.minPool) items = only; }
  return items;
}

export function makeRound(letters: string[], lens: number[], factor: number, n: number, bal: number | null | undefined, sylAvg: SylAvg | null | undefined,
  sbal: number | null | undefined, blocked: string[] | null | undefined, rng: Rng, p: RoundParams = SILBENZAUBER_ROUND_PARAMS): string[] {
  const items = buildItems(letters, lens, factor, bal, sylAvg, sbal, blocked, p);
  const out: string[] = [], cnt: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const prev = out[i - 1], cand = items.filter((it) => items.length < 2 || it.s !== prev);
    let tot = 0;
    const ws = cand.map((it) => { const w = it.w / (1 + p.repeatDamping * (cnt[it.s] || 0)); tot += w; return w; }); // Wiederholungen dämpfen
    let r = rng() * tot, j = 0;
    while (j < cand.length - 1 && r >= ws[j]) { r -= ws[j]; j++; }
    out.push(cand[j].s); cnt[cand[j].s] = (cnt[cand[j].s] || 0) + 1;
  }
  return out;
}

// Wahrscheinlichkeit je Silbe pro Aufgabe (ohne die kleine Wiederholungsdämpfung).
export function sylProbs(letters: string[], lens: number[], factor: number, bal: number | null | undefined, sylAvg: SylAvg | null | undefined,
  sbal: number | null | undefined, blocked: string[] | null | undefined, p: RoundParams = SILBENZAUBER_ROUND_PARAMS): Record<string, number> {
  const items = buildItems(letters, lens, factor, bal, sylAvg, sbal, blocked, p), pr: Record<string, number> = {};
  let tot = 0;
  items.forEach((it) => { tot += it.w; });
  items.forEach((it) => { pr[it.s] = it.w / tot; });
  return pr;
}

// Nur der erste Buchstabe wird zufällig groß oder klein, alle weiteren sind immer klein.
export function randomCase(s: string, rng: Rng): string {
  return (rng() < 0.5 ? s[0].toUpperCase() : s[0].toLowerCase()) + s.slice(1).toLowerCase();
}
