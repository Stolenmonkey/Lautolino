// Lernlogik der Kinder-App: reine Funktionen auf core und engine (unverändert). Kein Zugriff auf Oberfläche oder Netz.
import { makeRound, randomCase, countSyllables } from "@silbenflug/core";
import { autoAdjust, autoParams, comboKey, recordSyl, roundParams, sdFromLen, startVal, sylStat, sylTimeParams } from "@silbenflug/engine";
import type { AutoState } from "@silbenflug/engine";
import type { Rng, SilbenflugConfig } from "@silbenflug/shared";

export interface Plan { classId: string | null; letters: string[]; lengths: number[] }
export interface AutoValue { bal: number | null; sd: number | null }
// Alles, was das Gerät für ein Kind merkt (Silbenzeiten und Automatik-Stand; der Server hat die maßgebliche Kopie der Auszeichnungen).
export interface LocalState {
  sylTimes: Record<string, number[]>;     // je Silbe die letzten Zeiten (Sekunden bis „Weiter“)
  comboTimes: Record<string, number[]>;   // je Buchstabenkombination die letzten Rundenzeiten
  auto: Record<string, AutoValue>;        // Automatik-Stand je Kombination (Schlüssel wie comboKey)
}
export const emptyState = (): LocalState => ({ sylTimes: {}, comboTimes: {}, auto: {} });

export interface RoundSetup { key: string; letters: string[]; lens: number[]; bal: number; sd: number; tasks: string[]; shown: string[] }
export interface RoundResult { seconds: number; syllables: Array<{ s: string; sec: number }> }

function autoList(auto: Record<string, AutoValue>): AutoState[] {
  return Object.keys(auto).map((key) => {
    const [le, ln] = key.split("|"), v = auto[key];
    return { key, letters: le || "", lens: (ln || "").split(",").map(Number).filter((x) => x >= 2 && x <= 4), bal: v.bal ?? undefined, sd: v.sd ?? undefined };
  });
}
// Ob mit den freigegebenen Buchstaben und Längen genug Silben für eine Runde entstehen (wie in Silbenzauber mindestens 3).
export function canPractice(plan: Plan, cfg: SilbenflugConfig): boolean {
  return plan.letters.length > 0 && countSyllables(plan.letters, plan.lengths, cfg.round.min_pool) >= cfg.round.min_pool;
}
// Bereitet eine Runde vor: Schwierigkeit aus dem Automatik-Stand (neue Kombination: ähnlichste bekannte minus Abschlag), Aufgaben mit der Aufgabenverteilung aus core.
export function prepareRound(plan: Plan, cfg: SilbenflugConfig, st: LocalState, rng: Rng): RoundSetup {
  const letters = plan.letters.slice(), lens = plan.lengths.slice().sort((a, b) => a - b), ap = autoParams(cfg), list = autoList(st.auto);
  const bal = startVal(list, letters, lens, "bal", cfg.auto.default_len_balance, ap.newComboDiscount);
  const sd = lens.length > 1 ? sdFromLen(bal, ap) : startVal(list, letters, lens, "sd", cfg.auto.default_syl_difficulty, ap.newComboDiscount);
  const sylAvg: Record<string, number | null> = {};
  Object.keys(st.sylTimes).forEach((s) => { sylAvg[s] = sylStat(st.sylTimes[s], sylTimeParams(cfg)).avg; });
  const tasks = makeRound(letters, lens, cfg.round.letter_frequency_default, cfg.round.task_count, bal, sylAvg, sd, null, rng, roundParams(cfg));
  return { key: comboKey(letters, lens), letters, lens, bal, sd, tasks, shown: tasks.map((s) => randomCase(s, rng)) };
}
// Rundenende: Silbenzeiten und Rundenzeit merken, Automatik anpassen. Ergebnis: neuer Stand und der Automatik-Wert, der zum Server geschickt wird.
export function finishRound(st: LocalState, setup: RoundSetup, res: RoundResult, cfg: SilbenflugConfig): { state: LocalState; autoState: { key: string; bal: number; sd: number } } {
  const next: LocalState = JSON.parse(JSON.stringify(st)), ap = autoParams(cfg);
  res.syllables.forEach((x) => recordSyl(next.sylTimes, x.s, x.sec, cfg.syl_time.max_seconds, cfg.syl_time.retention));
  const times = (next.comboTimes[setup.key] || []).concat([res.seconds]).slice(-cfg.auto.stats_rounds);
  next.comboTimes[setup.key] = times;
  let bal = setup.bal, sd = setup.sd;
  if (setup.lens.length > 1) { bal = autoAdjust(bal, times, cfg.auto.target_seconds, cfg.auto.avg_rounds, ap); sd = sdFromLen(bal, ap); }
  else sd = autoAdjust(sd, times, cfg.auto.target_seconds, cfg.auto.avg_rounds, ap);   // nur eine Länge: nur die Silbenschwierigkeit bewegt sich
  next.auto[setup.key] = { bal, sd };
  return { state: next, autoState: { key: setup.key, bal, sd } };
}
// Automatik-Stände vom Server (Zeilen der Schnittstelle /student/auto-state) mit dem lokalen Stand zusammenführen. Der lokale Stand gewinnt (er ist neuer).
export function mergeAuto(st: LocalState, rows: Array<{ combo_key: string; len_balance: number | null; syl_difficulty: number | null }>): LocalState {
  const next: LocalState = JSON.parse(JSON.stringify(st));
  (rows || []).forEach((r) => { if (!next.auto[r.combo_key]) next.auto[r.combo_key] = { bal: r.len_balance, sd: r.syl_difficulty }; });
  return next;
}
// Nach erfolgreichem Senden aller gemerkten Runden ist der Server maßgeblich: Silbenzeiten, Rundenzeiten und Automatik-Stand kommen von dort,
// damit jedes Gerät eines Kindes denselben Stand hat.
export function adoptServer(st: LocalState, data: { sylTimes?: Record<string, number[]>; comboTimes?: Record<string, number[]> } | null, rows: Array<{ combo_key: string; len_balance: number | null; syl_difficulty: number | null }>): LocalState {
  const next: LocalState = { sylTimes: (data && data.sylTimes) || {}, comboTimes: (data && data.comboTimes) || {}, auto: {} };
  (rows || []).forEach((r) => { next.auto[r.combo_key] = { bal: r.len_balance, sd: r.syl_difficulty }; });
  return next;
}
