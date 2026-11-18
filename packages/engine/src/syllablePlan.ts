// Silbenbasierte Auswahl: jede Silbe wird einzeln freigeschaltet und einer Gruppe zugeordnet. Alles wird aus den Silbenzeiten berechnet,
// gespeichert wird nichts. Bewertung (isMastered) bleibt unverändert.
import { classifySyllable, contrastSet } from "@silbenflug/core";
import type { SilbenflugConfig } from "@silbenflug/shared";
import { isMastered } from "./mastery";

export type StageStatus = "done" | "active" | "locked" | "empty";
export interface StageRow { stage: number; status: StageStatus; total: number; processed: number; mastered: number; open: number }

export interface SyllablePlan {
  fresh: string[];      // offen, noch keine Messung
  building: string[];   // offen, angefangen (weniger Messungen als für die Bewertung nötig)
  weak: string[];       // bewertet, aber Durchschnitt über der Zeitvorgabe
  solid: string[];      // sicher beherrscht (Wiederholung)
  locked: string[];     // noch nicht freigeschaltet
  count: Record<string, number>;   // Anzahl Messungen je Silbe
  ratio: Record<string, number>;   // Ø-Zeit / Zeitvorgabe (nur bewertete Silben)
}

const key = (letters: Iterable<string>): string => [...new Set(letters)].sort().join("");
function subsets(k: string): string[] {
  const out: string[] = [];
  for (let m = 1; m < 1 << k.length; m++) { let t = ""; for (let i = 0; i < k.length; i++) if (m & (1 << i)) t += k[i]; out.push(t); }
  return out;
}

// pool: alle Silben der freigegebenen Buchstaben und Längen. Freischaltung einer Silbe der Stufe k: In jeder Vorstufe j < k müssen mindestens gate_percent der Silben,
// die nur aus Buchstaben dieser Silbe bestehen, sicher beherrscht sein (Stufe 2 = Anlautwechsel, siehe contrastSet; leere Vorstufen zählen als erfüllt).
// Silben mit Messungen bleiben immer offen. Bleiben weniger als minPool nicht sichere offene Silben, werden die niedrigsten gesperrten nachgeholt.
export function syllablePlan(pool: string[], times: Record<string, number[]>, cfg: SilbenflugConfig, minPool: number = cfg.round.min_pool): SyllablePlan {
  const syls = [...new Set(pool.map((x) => x.toLowerCase()))], con = contrastSet(syls), gate = (cfg.stages?.gate_percent ?? 80) / 100;
  const cls = new Map(syls.map((s) => [s, classifySyllable(s).stage] as const));
  const done = new Map(syls.map((s) => [s, isMastered(times[s], cfg, s)] as const));
  const bucket = new Map<string, number[][]>();   // Buchstabenmenge -> je Stufe [gesamt, sicher]
  const add = (k: string, st: number, m: boolean) => { const b = bucket.get(k) ?? bucket.set(k, []).get(k)!; (b[st] ||= [0, 0]); b[st][0]++; if (m) b[st][1]++; };
  syls.forEach((s) => { const k = key(s), m = done.get(s)!.status === "mastered"; add(k, cls.get(s)!, m); if (con.has(s)) add(k, 2, m); });
  const memo = new Map<string, boolean>();
  const open = (s: string): boolean => {
    const k = key(s), st = cls.get(s)!, id = k + "|" + st, hit = memo.get(id);
    if (hit !== undefined) return hit;
    const subs = subsets(k);
    let ok = true;
    for (let j = 1; j < st && ok; j++) {
      let tot = 0, mas = 0;
      subs.forEach((t) => { const c = bucket.get(t)?.[j]; if (c) { tot += c[0]; mas += c[1]; } });
      if (tot > 0 && mas / tot < gate - 1e-9) ok = false;
    }
    memo.set(id, ok); return ok;
  };
  const plan: SyllablePlan = { fresh: [], building: [], weak: [], solid: [], locked: [], count: {}, ratio: {} };
  syls.forEach((s) => {
    const n = (times[s] || []).length, r = done.get(s)!;
    plan.count[s] = n;
    const limit = cfg.mastery.time_limit_seconds[String(s.length) as "2" | "3" | "4"];
    if (r.avg !== null && limit) plan.ratio[s] = r.avg / limit;
    if (r.status === "mastered") plan.solid.push(s);
    else if (r.status === "not_mastered") plan.weak.push(s);
    else if (n > 0) plan.building.push(s);
    else if (open(s)) plan.fresh.push(s);
    else plan.locked.push(s);
  });
  if (plan.fresh.length + plan.building.length + plan.weak.length < minPool && plan.locked.length) {
    const need = minPool - (plan.fresh.length + plan.building.length + plan.weak.length);
    const order = plan.locked.slice().sort((a, b) => cls.get(a)! - cls.get(b)! || syls.indexOf(a) - syls.indexOf(b));
    const take = new Set(order.slice(0, need));
    plan.fresh.push(...order.slice(0, need)); plan.locked = plan.locked.filter((s) => !take.has(s));
  }
  return plan;
}
