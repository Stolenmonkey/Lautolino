// Automatik (Logik aus Silbenzauber, Zahlen einstellbar).
export interface AutoParams { tolerancePercent: number; stepMax: number; stepFactor: number; stepGrid: number; sylToLenRatio: number; sylCap: number; newComboDiscount: number }

export function avgLast(times: number[], n: number): number | null {
  const a = times.slice(-Math.max(1, n));
  if (!a.length) return null;
  return a.reduce((x, y) => x + y, 0) / a.length;
}

// Neuer Wert für den Längen-Regler (0..100): langsamer als Ziel -> leichter, schneller -> schwerer.
export function autoAdjust(bal: number, times: number[], target: number, n: number, p: AutoParams): number {
  const avg = avgLast(times, n);
  if (avg === null || !(target > 0)) return bal;
  const rel = (target - avg) / target;
  if (Math.abs(rel) < p.tolerancePercent / 100) return bal;
  let d = Math.round(Math.max(-p.stepMax, Math.min(p.stepMax, rel * p.stepFactor)) / p.stepGrid) * p.stepGrid;
  if (d === 0) d = rel > 0 ? p.stepGrid : -p.stepGrid;
  return Math.max(0, Math.min(100, bal + d));
}

// Silbenschwierigkeit aus der Länge abgeleitet (Verhältnis, Obergrenze).
export function sdFromLen(len: number, p: Pick<AutoParams, "sylToLenRatio" | "sylCap">): number {
  return Math.min(p.sylCap, Math.max(0, Math.round(len * p.sylToLenRatio)));
}

export interface AutoState { key: string; letters: string; lens: number[]; bal?: number; sd?: number }
export function comboKey(letters: string[], lens: number[]): string {
  return letters.slice().sort().join("") + "|" + lens.slice().sort().join(",");
}

// Startwert für eine Kombination: eigener Wert, sonst ähnlichste bekannte Kombination minus Abschlag, sonst Fallback.
export function startVal(states: AutoState[], letters: string[], lens: number[], field: "bal" | "sd", fallback: number, discount: number): number {
  const key = comboKey(letters, lens), lk = lens.slice().sort().join();
  let best = -1, bv: number | null = null, own: AutoState | null = null;
  states.forEach((c) => {
    if (c.key === key) { own = c; return; }
    const v = c[field];
    if (typeof v !== "number" || c.lens.slice().sort().join() !== lk) return;
    const cl = c.letters.split(""), inter = cl.filter((x) => letters.indexOf(x) >= 0).length, sim = inter / (cl.length + letters.length - inter);
    if (inter > 0 && sim > best) { best = sim; bv = v; }
  });
  if (own) { const v = (own as AutoState)[field]; return typeof v === "number" ? v : fallback; }
  return bv === null ? fallback : Math.max(0, bv - discount);
}
