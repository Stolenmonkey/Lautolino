// Bewertung sicher beherrschter Silben und Auszeichnungen. Keine eigenen Regeln: alles kommt aus der Konfiguration.
// Die Bewertung ist zeitbasiert und kein Nachweis der Lesekorrektheit.
import type { AwardLevel, SilbenflugConfig } from "@silbenflug/shared";
import { sylStat } from "./sylTime";

export type SylStatus = "unrated" | "mastered" | "not_mastered";

// syllable: die Silbe selbst; ihre Länge (2, 3 oder 4 Buchstaben) bestimmt die Zeitvorgabe.
export function isMastered(times: number[] | undefined, cfg: SilbenflugConfig, syllable: string): { status: SylStatus; avg: number | null } {
  const m = cfg.mastery, t = times || [];
  const limit = m.time_limit_seconds[String(syllable.length) as "2" | "3" | "4"];
  if (t.length < m.min_measurements || limit === undefined || limit === null) return { status: "unrated", avg: null };
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

// Alle Stufen, deren Grenze erreicht ist. Sind die Grenzen nicht festgelegt, ist die Auszeichnung aus.
export function levelsReached(percent: number, cfg: SilbenflugConfig): AwardLevel[] {
  const a = cfg.award;
  if (a.bronze_percent === null || a.silver_percent === null || a.gold_percent === null) return [];
  const lim: Record<AwardLevel, number> = { bronze: a.bronze_percent, silber: a.silver_percent, gold: a.gold_percent };
  return ORDER.filter((l) => percent >= lim[l]);
}

// Nur neue Stufen, die das Kind noch nicht besitzt. Bereits vergebene Auszeichnungen werden nie entfernt oder geändert.
export function newAwards(held: AwardLevel[], percent: number, cfg: SilbenflugConfig): AwardLevel[] {
  return levelsReached(percent, cfg).filter((l) => held.indexOf(l) < 0);
}
export function highestLevel(levels: AwardLevel[]): AwardLevel | null {
  let h: AwardLevel | null = null;
  ORDER.forEach((l) => { if (levels.indexOf(l) >= 0) h = l; });
  return h;
}
