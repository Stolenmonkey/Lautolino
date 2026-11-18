// Fester Silbenumfang je Buchstabe. Wird bei der Freigabe EINMAL berechnet und dauerhaft gespeichert.
import { structureWords } from "@silbenflug/core";

// releasedBefore: bereits freigegebene Buchstaben (in Reihenfolge). Gehört zu newLetter: jedes strukturell gültige Übungswort (1 bis 3 Sprechsilben,
// siehe structureWords), das newLetter enthält und nur aus den bis einschließlich newLetter freigegebenen Buchstaben besteht.
export function syllableScope(releasedBefore: string[], newLetter: string): string[] {
  const nl = newLetter.toLowerCase();
  return structureWords(releasedBefore.map((x) => x.toLowerCase()).filter((x) => x !== nl).concat([nl]), nl);
}
