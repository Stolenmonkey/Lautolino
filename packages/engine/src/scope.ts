// Fester Silbenumfang je Buchstabe. Wird bei der Freigabe EINMAL berechnet und dauerhaft gespeichert.
import { buildSyllables } from "@silbenflug/core";

// releasedBefore: bereits freigegebene Buchstaben (in Reihenfolge). Gehört zu newLetter: jede gültige Silbe der erlaubten Längen,
// die newLetter enthält und nur aus den bis einschließlich newLetter freigegebenen Buchstaben besteht.
export function syllableScope(releasedBefore: string[], newLetter: string, lens: number[]): string[] {
  const nl = newLetter.toLowerCase();
  const letters = releasedBefore.map((x) => x.toLowerCase()).filter((x) => x !== nl).concat([nl]);
  const out: string[] = [];
  lens.slice().sort((a, b) => a - b).forEach((L) => {
    buildSyllables(letters, L).forEach((s) => { if (s.indexOf(nl) >= 0) out.push(s); });
  });
  return out;
}
