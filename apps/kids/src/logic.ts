// Lernlogik der Kinder-App: reine Funktionen auf core und engine (unverändert). Kein Zugriff auf Oberfläche oder Netz.
import { groupedTasks, randomCase } from "@silbenflug/core";
import { secureTasks, recordSyl, roundParams, syllablePlan } from "@silbenflug/engine";
import type { Rng, SilbenflugConfig } from "@silbenflug/shared";

export interface Plan { classId: string | null; letters: string[]; syllables: string[] }   // syllables: fester Silbenumfang der freigegebenen Buchstaben (vom Server)
// Alles, was das Gerät für ein Kind merkt (Silbenzeiten; der Server hat die maßgebliche Kopie der Auszeichnungen).
export interface LocalState {
  sylTimes: Record<string, number[]>;     // je Silbe die letzten Zeiten (Sekunden bis „Weiter“)
}
export const emptyState = (): LocalState => ({ sylTimes: {} });

export interface RoundSetup { letters: string[]; tasks: string[]; shown: string[] }
export interface RoundResult { seconds: number; syllables: Array<{ s: string; sec: number }> }

// Ob der Silbenumfang genug Übungswörter für eine Runde hat (wie in Silbenzauber mindestens 3).
export function canPractice(plan: Plan, cfg: SilbenflugConfig): boolean {
  return plan.letters.length > 0 && plan.syllables.length >= cfg.round.min_pool;
}
// Bereitet eine Runde vor: Aufgaben nach Lernstufen (Gruppen und Mix) aus den lokalen Silbenzeiten.
export function prepareRound(plan: Plan, cfg: SilbenflugConfig, st: LocalState, rng: Rng): RoundSetup {
  const st2 = cfg.stages;
  // Auswahl je Silbe: Freischaltung und Gruppen aus den lokalen Silbenzeiten, Mix aus der Konfiguration (ohne Lernstufen oder zu wenige offene Silben: sichere Silben der höchsten Stufe)
  let tasks: string[] | null = null;
  if (st2 && st2.enabled !== 0) {
    const sp = syllablePlan(plan.syllables, st.sylTimes, cfg);
    if (sp.fresh.length + sp.building.length + sp.weak.length + sp.solid.length >= cfg.round.min_pool)
      tasks = groupedTasks(cfg.round.task_count, sp, { fresh: st2.mix_new_percent, weak: st2.mix_weak_percent, review: st2.mix_review_percent }, { count: sp.count, ratio: sp.ratio, minMeasure: cfg.mastery.min_measurements }, rng, roundParams(cfg));
  }
  if (!tasks) tasks = secureTasks(plan.syllables, st.sylTimes, cfg, cfg.round.task_count, rng, roundParams(cfg));
  return { letters: plan.letters.slice(), tasks, shown: tasks.map((s) => randomCase(s, rng)) };
}
// Rundenende: Silbenzeiten merken.
export function finishRound(st: LocalState, res: RoundResult, cfg: SilbenflugConfig): LocalState {
  const next: LocalState = JSON.parse(JSON.stringify(st));
  res.syllables.forEach((x) => recordSyl(next.sylTimes, x.s, x.sec, cfg.syl_time.max_seconds, cfg.syl_time.retention));
  return next;
}
// Nach erfolgreichem Senden aller gemerkten Runden ist der Server maßgeblich: die Silbenzeiten kommen von dort, damit jedes Gerät eines Kindes denselben Stand hat.
export function adoptServer(data: { sylTimes?: Record<string, number[]> } | null): LocalState {
  return { sylTimes: (data && data.sylTimes) || {} };
}
