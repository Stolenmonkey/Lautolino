// Lernstufen-Fortschritt je Buchstabe. Baut auf der unveränderten Bewertung (isMastered: mindestens 10 Messungen, Durchschnitt <= Zeitvorgabe) auf
// und speichert nichts Eigenes: alles wird aus den vorhandenen Silbenzeiten berechnet.
import { classifySyllable, contrastSet, STAGE_COUNT } from "@silbenflug/core";
import type { SilbenflugConfig } from "@silbenflug/shared";
import { isMastered } from "./mastery";

export type StageStatus = "done" | "active" | "locked" | "empty";
export interface StageRow { stage: number; status: StageStatus; total: number; processed: number; mastered: number; open: number }
export interface LetterStages { letter: string; current: number | null; window: number[]; stages: StageRow[]; focus: string[]; review: string[] }
export interface TrainingWindow { restricted: boolean; focus: string[]; review: string[]; letters: LetterStages[]; extended: number }

// Silben eines Buchstaben-Umfangs je Stufe (Stufe 2 = KV-Silben mit Anlautwechsel, siehe core: contrastSet)
export function stageMembers(scope: string[], con: Set<string>): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (let s = 1; s <= STAGE_COUNT; s++) m.set(s, []);
  for (const syl of scope) {
    const c = classifySyllable(syl);
    m.get(c.stage)!.push(c.syllable);
    if (con.has(c.syllable)) m.get(2)!.push(c.syllable);
  }
  return m;
}

// Fenster: die niedrigste noch nicht sichere Stufe und die nächste Stufe gemeinsam (anfangs Stufe 1 und 2). Mit extra > 0 kommen weitere nicht leere Stufen dazu.
export function letterStages(letter: string, scope: string[], con: Set<string>, times: Record<string, number[]>, cfg: SilbenflugConfig, extra = 0): LetterStages {
  const members = stageMembers(scope, con), master = (s: string) => isMastered(times[s], cfg, s).status === "mastered";
  const nonEmpty = [...members.keys()].filter((k) => members.get(k)!.length > 0);
  const done = (k: number) => members.get(k)!.every(master);
  const current = nonEmpty.find((k) => !done(k)) ?? null;
  const window: number[] = [];
  if (current !== null) {
    nonEmpty.filter((k) => k === current || k === current + 1).forEach((k) => window.push(k));
    let left = extra;
    nonEmpty.filter((k) => k > current + 1).forEach((k) => { if (left > 0) { window.push(k); left--; } });
  }
  const stages: StageRow[] = [...members.keys()].map((k) => {
    const list = members.get(k)!, mastered = list.filter(master).length, processed = list.filter((s) => (times[s] || []).length > 0).length;
    const status: StageStatus = !list.length ? "empty" : done(k) ? "done" : window.indexOf(k) >= 0 ? "active" : "locked";
    return { stage: k, status, total: list.length, processed, mastered, open: list.length - mastered };
  });
  const focus = [...new Set(window.flatMap((k) => members.get(k)!))], fs = new Set(focus);
  const review = [...new Set(nonEmpty.filter((k) => window.indexOf(k) < 0 && done(k)).flatMap((k) => members.get(k)!))].filter((s) => !fs.has(s));
  return { letter, current, window, stages, focus, review };
}

// Gesamtfenster eines Kindes: Silben aller Buchstaben in ihren aktuellen Stufen. Hat das Fenster weniger als minPool Silben, wird es stufenweise erweitert,
// weil sonst keine Runde möglich wäre. restricted = false: es gibt keine sinnvolle Einschränkung (alles wie bisher).
export function trainingWindow(scopes: Record<string, string[]>, times: Record<string, number[]>, cfg: SilbenflugConfig, minPool: number, contrastFrom?: string[]): TrainingWindow {
  const letters = Object.keys(scopes), all = contrastFrom ?? [...new Set(letters.flatMap((l) => scopes[l]))], con = contrastSet(all);
  let best: LetterStages[] = [], extra = 0;
  for (; extra <= STAGE_COUNT; extra++) {
    best = letters.map((l) => letterStages(l, scopes[l], con, times, cfg, extra));
    if (new Set(best.flatMap((x) => x.focus)).size >= minPool) break;
  }
  const focus = [...new Set(best.flatMap((x) => x.focus))], fs = new Set(focus), review = [...new Set(best.flatMap((x) => x.review))].filter((s) => !fs.has(s));
  const ok = focus.length >= minPool;
  return { restricted: ok, focus: ok ? focus : [], review: ok ? review : [], letters: best, extended: Math.min(extra, STAGE_COUNT) };
}
