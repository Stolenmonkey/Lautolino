import { isValid } from "./rules";

// Nur Buchstaben a-z, klein, ohne Duplikate (Reihenfolge der Eingabe bleibt erhalten).
export function parseLetters(str: string): string[] {
  const out: string[] = [], m = (str || "").toLowerCase().match(/[a-z]/g) || [];
  m.forEach((ch) => { if (out.indexOf(ch) < 0) out.push(ch); });
  return out;
}

// Alle gültigen Silben einer Länge. limit: optionaler Abbruch für schnelle Prüfungen.
export function buildSyllables(letters: string[], len: number, limit?: number): string[] {
  const res: string[] = [];
  (function rec(prefix: string): void {
    if (limit && res.length >= limit) return;
    if (prefix.length === len) { if (isValid(prefix)) res.push(prefix); return; }
    letters.forEach((l) => { if (prefix.length && prefix[prefix.length - 1] === l) return; rec(prefix + l); });
  })("");
  return res;
}

export function countSyllables(letters: string[], lens: number[], limit: number): number {
  let n = 0;
  lens.forEach((L) => { if (n < limit) n += buildSyllables(letters, L, limit - n).length; });
  return n;
}
