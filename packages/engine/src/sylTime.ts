// Silbenzeit: letzte N Zeiten, die M längsten gestrichen, Durchschnitt (Logik aus Silbenzauber, Zahlen einstellbar).
export interface SylTimeParams { window: number; dropLongest: number; minKeep: number }
export interface SylStat { avg: number | null; times: number[]; dropped: number[] }

export function sylStat(times: number[] | undefined, p: SylTimeParams): SylStat {
  const a = (times || []).slice(-p.window), n = a.length;
  if (!n) return { avg: null, times: a, dropped: [] };
  const drop = Math.min(p.dropLongest, Math.max(0, n - p.minKeep));
  const order = a.map((_, i) => i).sort((x, y) => a[y] - a[x] || y - x);
  const dr = order.slice(0, drop);
  let sum = 0, c = 0;
  a.forEach((v, i) => { if (dr.indexOf(i) < 0) { sum += v; c++; } });
  return { avg: sum / c, times: a, dropped: dr };
}

// Neue Zeit anhängen: auf 0..maxSeconds begrenzen, nur die letzten `retention` Zeiten behalten.
export function recordSyl(syl: Record<string, number[]>, s: string, sec: number, maxSeconds: number, retention: number): Record<string, number[]> {
  const k = s.toLowerCase();
  syl[k] = (syl[k] || []).concat([Math.max(0, Math.min(maxSeconds, sec))]).slice(-retention);
  return syl;
}
