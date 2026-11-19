// Silbenumfang bei der Buchstabenfreigabe im Browser berechnen (der Worker im Free-Plan hat nur 10 ms CPU je Anfrage).
import { syllableScope, groupScope, scopeParams } from "@silbenflug/engine";
import { withDefaults } from "@silbenflug/shared";
import { stagePlan } from "@silbenflug/core";

export function computeScopes(known: string[], group: string[], config: unknown): Array<{ letter: string; syllables: string[] }> {
  const sp = scopeParams(withDefaults(config as any));
  if (!known.length) { const syl = groupScope(group, sp); return group.map((letter) => ({ letter, syllables: syl })); }
  return group.map((letter) => ({ letter, syllables: syllableScope(known, letter, sp) }));
}

// Silben eines Buchstabens auf die sieben Lernstufen verteilt (für die Anzeige im Lernplan).
export function stageRows(syllables: string[]): Array<{ stage: number; structure: string; syllables: string[] }> {
  return stagePlan(syllables).map((g) => ({ stage: g.stage, structure: g.structure, syllables: g.syllables }));
}
