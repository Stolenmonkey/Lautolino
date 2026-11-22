// Kontrastzeit (Stufe 2): getrennte Zeiten für Silben in Kontrastblöcken (gleicher Vokal, anderer Anlaut). Gespeichert unter dem Schlüssel "k:<silbe>"
// im selben Zeitspeicher wie die normalen Silbenzeiten. Die normale Bewertung (isMastered) bleibt unverändert.
import type { SilbenflugConfig } from "@silbenflug/shared";
import { sylStat } from "./sylTime";
import type { SylStatus } from "./mastery";

export const CONTRAST_PREFIX = "k:";
export const kKey = (s: string): string => CONTRAST_PREFIX + s.toLowerCase();
export const isKKey = (k: string): boolean => k.startsWith(CONTRAST_PREFIX);

export function contrastLimit(cfg: SilbenflugConfig): number { return cfg.contrast.time_limit_seconds; }

// Kontrastzeit einer Silbe: letzte window Zeiten, die drop_longest längsten gestrichen (also window - drop_longest zählen), Vergleich mit der Kontrast-Zeitvorgabe.
export function contrastStat(times: number[] | undefined, cfg: SilbenflugConfig): { status: SylStatus; avg: number | null } {
  const c = cfg.contrast, t = times || [];
  if (t.length < c.min_measurements) return { status: "unrated", avg: null };
  const st = sylStat(t, { window: c.window, dropLongest: c.drop_longest, minKeep: Math.max(1, c.window - c.drop_longest) });
  if (st.avg === null) return { status: "unrated", avg: null };
  return { status: st.avg <= c.time_limit_seconds ? "mastered" : "not_mastered", avg: st.avg };
}
