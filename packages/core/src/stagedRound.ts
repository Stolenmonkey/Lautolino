// Aufgaben einer Runde mit Lernstufen: Hauptteil aus den Silben der aktuellen Lernstufen (mit der unveränderten Aufgabenverteilung makeRound),
// dazu gelegentlich Wiederholungen früherer Stufen. Ohne Stufen-Angaben verhält sich alles wie bisher.
import type { Rng } from "@silbenflug/shared";
import { buildSyllables } from "./syllables";
import { makeRound, SILBENZAUBER_ROUND_PARAMS, type RoundParams, type SylAvg } from "./round";

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
