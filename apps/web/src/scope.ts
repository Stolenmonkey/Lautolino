// Silbenumfang bei der Buchstabenfreigabe im Browser berechnen (der Worker im Free-Plan hat nur 10 ms CPU je Anfrage).
import { syllableScope, groupScope, scopeParams, rebuildAfterDelete, resumeScope } from "@silbenflug/engine";
import { withDefaults } from "@silbenflug/shared";
import { stagePlan } from "@silbenflug/core";

// Der Browser schickt nur Silben; die Kontrastblöcke (Stufe 2) erzeugt der Server beim Speichern.
const noBlocks = (p: ReturnType<typeof scopeParams>) => ({ ...p, blocks: false });

export function computeScopes(known: string[], group: string[], config: unknown): Array<{ letter: string; syllables: string[] }> {
  const sp = noBlocks(scopeParams(withDefaults(config as any)));
  if (!known.length) { const syl = groupScope(group, sp); return group.map((letter) => ({ letter, syllables: syl })); }
  return group.map((letter) => ({ letter, syllables: syllableScope(known, letter, sp) }));
}

// Silben eines Buchstabens auf die sieben Lernstufen verteilt (für die Anzeige im Lernplan).
export function stageRows(syllables: string[]): Array<{ stage: number; structure: string; syllables: string[] }> {
  return stagePlan(syllables).map((g) => ({ stage: g.stage, structure: g.structure, syllables: g.syllables }));
}

// Neuer Umfang nach dem Löschen eines Buchstabens (nur die Buchstaben, deren Umfang sich ändert).
export function computeDeleteScopes(order: Array<{ letter: string; start: boolean; paused: boolean }>, deleted: string, config: unknown): Array<{ letter: string; syllables: string[] }> {
  const r = rebuildAfterDelete(order, deleted, noBlocks(scopeParams(withDefaults(config as any))));
  return Object.keys(r).map((letter) => ({ letter, syllables: r[letter] }));
}

// Ergänzung des Umfangs beim Fortsetzen eines pausierten Buchstabens.
export function computeResume(active: string[], later: string[], letter: string, existing: string[], config: unknown): string[] {
  return resumeScope(active, later, letter, existing, noBlocks(scopeParams(withDefaults(config as any))));
}
