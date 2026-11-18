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

// Fortschritt zum nächsten Medaillen-Schritt in `steps` Segmenten (Standard 4, 0 bis steps). Der Weg läuft von der Grenze der bisherigen Medaille (ohne Medaille: 0) bis zur Grenze der nächsten.
// Nach Gold oder bei ausgeschalteter Auszeichnung: null (keine Anzeige). Ändert keine Bewertung, nur Anzeige.
export function levelProgress(held: AwardLevel | null, percent: number, cfg: SilbenflugConfig, steps = 4): { next: AwardLevel; segments: number } | null {
  const a = cfg.award;
  if (a.bronze_percent === null || a.silver_percent === null || a.gold_percent === null) return null;
  const lim: Record<AwardLevel, number> = { bronze: a.bronze_percent, silber: a.silver_percent, gold: a.gold_percent };
  const i = held ? ORDER.indexOf(held) + 1 : 0;
  if (i >= ORDER.length) return null;
  const next = ORDER[i], lo = held ? lim[held] : 0, hi = lim[next];
  const seg = hi > lo ? Math.floor(((percent - lo) / (hi - lo)) * steps + 1e-9) : steps;
  return { next, segments: Math.max(0, Math.min(steps, seg)) };
}
