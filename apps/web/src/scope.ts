// Silbenumfang bei der Buchstabenfreigabe im Browser berechnen (der Worker im Free-Plan hat nur 10 ms CPU je Anfrage).
import { syllableScope, groupScope, scopeParams } from "@silbenflug/engine";
import { withDefaults } from "@silbenflug/shared";

export function computeScopes(known: string[], group: string[], config: unknown): Array<{ letter: string; syllables: string[] }> {
  const sp = scopeParams(withDefaults(config as any));
  if (!known.length) { const syl = groupScope(group, sp); return group.map((letter) => ({ letter, syllables: syl })); }
  return group.map((letter) => ({ letter, syllables: syllableScope(known, letter, sp) }));
}
