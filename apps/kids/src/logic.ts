// Lernlogik der Kinder-App: reine Funktionen auf core und engine (unverändert). Kein Zugriff auf Oberfläche oder Netz.
import { groupedTasks, wortCase } from "@silbenflug/core";
import { secureTasks, recordSyl, roundParams, syllablePlan, levelProgress, levelsReached, highestLevel } from "@silbenflug/engine";
import type { AwardLevel, Rng, SilbenflugConfig } from "@silbenflug/shared";

export interface Plan { classId: string | null; letters: string[]; syllables: string[]; scopes?: Record<string, string[]> }   // syllables: fester Silbenumfang der freigegebenen Buchstaben (vom Server)
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
  return { letters: plan.letters.slice(), tasks, shown: tasks.map((s) => wortCase(s, rng)) };
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

// Stand eines Buchstabens in der Übersicht (wie /student/awards): höchste Stufe und Fortschritt zur nächsten in 5 Segmenten.
export interface LetterAward { letter: string; released: boolean; level: AwardLevel | null; progress?: { next: AwardLevel; segments: number } | null }
const ORDER: AwardLevel[] = ["bronze", "silber", "gold"];
// Rechnet den Stand nach einer Runde lokal aus (gleiche Funktionen und Regeln wie der Server in POST /student/rounds):
// nur Buchstaben, deren fester Silbenumfang in der Runde vorkam; Stufen werden nie entfernt. Der Server bleibt maßgeblich.
export function localAwards(prev: LetterAward[], scopes: Record<string, string[]>, sylTimes: Record<string, number[]>, played: string[], cfg: SilbenflugConfig): LetterAward[] {
  const pl = new Set(played.map((x) => x.toLowerCase()));
  return prev.map((x) => {
    const sc = scopes[x.letter];
    if (!x.released || !sc || !sc.some((s) => pl.has(s))) return x;
    const reached = highestLevel(levelsReached(sc, sylTimes, cfg));
    const level = reached && (!x.level || ORDER.indexOf(reached) > ORDER.indexOf(x.level)) ? reached : x.level;
    return { ...x, level, progress: levelProgress(level, sc, sylTimes, cfg, 5) };
  });
}
