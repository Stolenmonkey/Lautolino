// Kontrastblöcke (Stufe 2): 2 bis 3 offene Silben (KV) mit gleichem Vokal und verschiedenem Anlaut, z. B. "la+ma+pa" (Schlüssel alphabetisch sortiert).
// Beim Freigeben eines Buchstabens werden seine Blöcke einmal erzeugt und im festen Silbenumfang gespeichert (Schlüssel mit "+"); sie ändern sich danach nie.
// Die Reihenfolge der Silben im Block wird erst beim Üben zufällig gezogen und gehört nicht zum Block.
import { classifySyllable } from "@silbenflug/core";

export const BLOCK_SEP = "+", BLOCK_MAX = 3;
const VOWELS = "aeiouäöüy";
export const isBlockKey = (s: string): boolean => s.includes(BLOCK_SEP);
export const blockSyllables = (key: string): string[] => key.split(BLOCK_SEP);
const isVowel = (ch: string): boolean => VOWELS.includes(ch);
const isKV = (c: string, v: string): boolean => { const x = classifySyllable(c + v); return x.stage === 1 && x.sub === "1.2"; };
const mk = (v: string, cs: string[]): string => cs.map((c) => c + v).sort().join(BLOCK_SEP);
const uniq = (xs: string[]): string[] => [...new Set(xs.map((x) => x.toLowerCase()))];

// Dreierblöcke aus den Konsonanten (in Freigabe-Reihenfolge); Rest 2: ein Zweierblock, Rest 1: die letzten drei Konsonanten.
function chunked(v: string, cs: string[]): string[] {
  if (cs.length < 2) return [];
  const out: string[] = [], full = Math.floor(cs.length / BLOCK_MAX) * BLOCK_MAX, rem = cs.length - full;
  for (let i = 0; i < full; i += BLOCK_MAX) out.push(mk(v, cs.slice(i, i + BLOCK_MAX)));
  if (rem === 2) out.push(mk(v, cs.slice(full)));
  else if (rem === 1 && cs.length >= BLOCK_MAX) out.push(mk(v, cs.slice(-BLOCK_MAX)));
  return [...new Set(out)];
}

// Blöcke eines neu freigegebenen Buchstabens. releasedBefore: schon freigegebene Buchstaben in Reihenfolge.
// Neuer Konsonant: je Vokal mit den zwei zuletzt freigegebenen passenden Konsonanten. Neuer Vokal: alle Konsonanten in Dreierblöcken.
export function blockScope(releasedBefore: string[], newLetter: string): string[] {
  const nl = newLetter.toLowerCase(), before = uniq(releasedBefore).filter((x) => x !== nl), vowels = before.filter(isVowel), cons = before.filter((x) => !isVowel(x));
  if (isVowel(nl)) return chunked(nl, cons.filter((c) => isKV(c, nl)));
  const out: string[] = [];
  for (const v of vowels) { const partners = cons.filter((c) => isKV(c, v)); if (partners.length) out.push(mk(v, [nl, ...partners.slice(-2)])); }
  return [...new Set(out)];
}

// Blöcke der Startgruppe (alle Startbuchstaben zusammen): je Vokal alle Konsonanten in Dreierblöcken.
export function groupBlocks(group: string[]): string[] {
  const ls = uniq(group), vowels = ls.filter(isVowel), cons = ls.filter((x) => !isVowel(x));
  return [...new Set(vowels.flatMap((v) => chunked(v, cons.filter((c) => isKV(c, v)))))];
}
