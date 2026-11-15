// Silben-Zug: Auswahl mit Bevorzugung. Grundlage sind die Wahrscheinlichkeiten der Übung (core: sylProbs, Länge und Schwierigkeit wie in der Automatik);
// jede Silbe zählt zusätzlich mit ihrem Gewicht. Gezogen wird wie in der Übung: nie zweimal dieselbe Silbe hintereinander, Wiederholungen werden gedämpft.
export function pickWeighted(probs: Record<string, number>, n: number, weightOf: (s: string) => number, rng: () => number): string[] {
  const keys = Object.keys(probs).sort(), out: string[] = [], cnt: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const prev = out[i - 1], cand = keys.length < 2 ? keys : keys.filter((s) => s !== prev);
    const ws = cand.map((s) => (probs[s] * weightOf(s)) / (1 + 2 * (cnt[s] || 0)) + 1e-12), tot = ws.reduce((a, b) => a + b, 0);
    let r = rng() * tot, j = 0; while (j < cand.length - 1 && r >= ws[j]) { r -= ws[j]; j++; }
    out.push(cand[j]); cnt[cand[j]] = (cnt[cand[j]] || 0) + 1;
  }
  return out;
}
