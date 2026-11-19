// Bewertung sicher beherrschter Silben und Auszeichnungen. Keine eigenen Regeln: alles kommt aus der Konfiguration.
// Die Bewertung ist zeitbasiert und kein Nachweis der Lesekorrektheit.
import type { AwardLevel, SilbenflugConfig } from "@silbenflug/shared";
import { classifySyllable } from "@silbenflug/core";
import { sylStat } from "./sylTime";

export type SylStatus = "unrated" | "mastered" | "not_mastered";

// Zeitvorgabe nach Lernstufe der Silbe (1 bis 7, Stufe 2 teilt sich die Vorgabe mit Stufe 1; classifySyllable ordnet jedes Wort genau einer Stufe zu).
export function timeLimitFor(limits: SilbenflugConfig["mastery"]["time_limit_seconds"], syllable: string): number | null {
  return limits[String(classifySyllable(syllable).stage) as keyof typeof limits] ?? null;
}

// syllable: die Silbe selbst; ihre Lernstufe bestimmt die Zeitvorgabe (siehe timeLimitFor).
export function isMastered(times: number[] | undefined, cfg: SilbenflugConfig, syllable: string): { status: SylStatus; avg: number | null } {
  const m = cfg.mastery, t = times || [];
  const limit = timeLimitFor(m.time_limit_seconds, syllable);
  if (t.length < m.min_measurements || limit === null) return { status: "unrated", avg: null };
  const st = sylStat(t, { window: m.window, dropLongest: m.drop_longest, minKeep: cfg.syl_time.min_keep });
  if (st.avg === null) return { status: "unrated", avg: null };
  return { status: st.avg <= limit ? "mastered" : "not_mastered", avg: st.avg };
}

export interface LetterProgress { total: number; mastered: number; notMastered: number; unrated: number; percent: number }

// scope: der feste Silbenumfang des Buchstabens (aus letter_syllable_scope). Unbewertete Silben zählen als noch nicht sicher.
export function letterProgress(scope: string[], timesBySyl: Record<string, number[]>, cfg: SilbenflugConfig): LetterProgress {
  let mastered = 0, notMastered = 0, unrated = 0;
  scope.forEach((s) => {
    const r = isMastered(timesBySyl[s], cfg, s).status;
    if (r === "mastered") mastered++; else if (r === "not_mastered") notMastered++; else unrated++;
  });
  const total = scope.length;
  return { total, mastered, notMastered, unrated, percent: total ? (mastered / total) * 100 : 0 };
}

const ORDER: AwardLevel[] = ["bronze", "silber", "gold"];

// Auszeichnungen je Buchstabe nach Lernstufen (nicht nach Prozent des Silbenumfangs).
// Betrachtet werden nur die Lernstufen, in denen der Buchstabe Silben hat (aktive Stufen, nach Stufennummer sortiert).
// Letzte aktive Stufe von Bronze, Silber, Gold je nach Zahl n der aktiven Stufen; Gold endet immer bei der letzten aktiven Stufe.
const TIER_ENDS: Record<number, [number, number, number]> = { 4: [2, 3, 4], 5: [2, 4, 5], 6: [3, 5, 6], 7: [3, 5, 7] };
export function tierEnds(n: number): [number, number, number] {
  if (n >= 7) return TIER_ENDS[7];
  return TIER_ENDS[n] ?? [Math.max(1, n - 2), Math.max(1, n - 1), n];   // unter 4 aktiven Stufen (kommt praktisch nicht vor): Stufen einzeln, Auszeichnungen ggf. gleichzeitig
}

export interface AwardStatus {
  levels: AwardLevel[];                                    // alle Stufen, die erreicht sind (setzt jeweils die vorherige voraus)
  ranges: Array<{ total: number; mastered: number }>;      // je Auszeichnung der zugehörige Stufenbereich (Bronze, Silber, Gold)
  fractions: number[];                                     // je Bereich: Anteil sicherer Silben geteilt durch die Schwelle, höchstens 1
}

// Eine Auszeichnung ist erreicht, wenn in ihrem Stufenbereich und in allen früheren Bereichen mindestens share_percent der Silben sicher beherrscht sind.
// Unbewertete Silben zählen als noch nicht sicher. Ist share_percent nicht festgelegt (null), ist die Auszeichnung aus.
export function awardStatus(scope: string[], timesBySyl: Record<string, number[]>, cfg: SilbenflugConfig): AwardStatus {
  const share = cfg.award.share_percent;
  const byStage = new Map<number, string[]>();
  [...new Set(scope)].forEach((s) => { const k = classifySyllable(s).stage; (byStage.get(k) ?? byStage.set(k, []).get(k)!).push(s); });
  const stages = [...byStage.keys()].sort((a, b) => a - b), ends = tierEnds(stages.length);
  const ranges = ends.map((end, i) => {
    const from = i === 0 ? 0 : ends[i - 1], syl = stages.slice(from, end).flatMap((k) => byStage.get(k)!);
    return { total: syl.length, mastered: syl.filter((s) => isMastered(timesBySyl[s], cfg, s).status === "mastered").length };
  });
  const fractions = ranges.map((r) => (share === null ? 0 : r.total === 0 || share <= 0 ? 1 : Math.min(1, (r.mastered / r.total) / (share / 100) + 1e-9)));
  const levels: AwardLevel[] = [];
  if (share !== null) for (let i = 0; i < ORDER.length; i++) { if (fractions.slice(0, i + 1).every((f) => f >= 1 - 1e-9)) levels.push(ORDER[i]); else break; }
  return { levels, ranges, fractions };
}

export function levelsReached(scope: string[], timesBySyl: Record<string, number[]>, cfg: SilbenflugConfig): AwardLevel[] {
  return awardStatus(scope, timesBySyl, cfg).levels;
}

// Nur neue Stufen, die das Kind noch nicht besitzt. Bereits vergebene Auszeichnungen werden nie entfernt oder geändert.
export function newAwards(held: AwardLevel[], scope: string[], timesBySyl: Record<string, number[]>, cfg: SilbenflugConfig): AwardLevel[] {
  return levelsReached(scope, timesBySyl, cfg).filter((l) => held.indexOf(l) < 0);
}
export function highestLevel(levels: AwardLevel[]): AwardLevel | null {
  let h: AwardLevel | null = null;
  ORDER.forEach((l) => { if (levels.indexOf(l) >= 0) h = l; });
  return h;
}

// Fortschritt zur nächsten Medaille in `steps` Segmenten (Standard 4, 0 bis steps): schwächster Bereich bis zur nächsten Medaille, bezogen auf die Schwelle.
// Nach Gold oder bei ausgeschalteter Auszeichnung: null (keine Anzeige). Ändert keine Bewertung, nur Anzeige.
export function levelProgress(held: AwardLevel | null, scope: string[], timesBySyl: Record<string, number[]>, cfg: SilbenflugConfig, steps = 4): { next: AwardLevel; segments: number } | null {
  if (cfg.award.share_percent === null) return null;
  const i = held ? ORDER.indexOf(held) + 1 : 0;
  if (i >= ORDER.length) return null;
  const f = Math.min(...awardStatus(scope, timesBySyl, cfg).fractions.slice(0, i + 1));
  return { next: ORDER[i], segments: f >= 1 - 1e-9 ? steps : Math.max(0, Math.floor(f * steps)) };
}
