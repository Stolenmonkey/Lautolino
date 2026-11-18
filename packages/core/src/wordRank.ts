// Häufigkeits-Bewertung der Übungswörter (Tabelle siehe silbenfreq.ts, erzeugt von tools/silbenfreq).
import { SILBEN_ZIPF, WOERTER_ZIPF } from "./silbenfreq";
import { splitSyllables } from "./syllabify";

const UNKNOWN = 20;      // Silbe nicht in der Tabelle: Zipf 2,0 (sehr selten)
const REAL_WORD_BONUS = 2;   // echtes deutsches Wort: +2 Zipf-Stufen gegenüber einem reinen Übungswort

// Echtes deutsches Wort (steht in der Wortliste)?
export const isRealWord = (word: string): boolean => WOERTER_ZIPF[word] !== undefined;
// Gewicht einer Sprechsilbe (Zipf mal 10).
export const partWeight = (part: string): number => SILBEN_ZIPF[part] ?? UNKNOWN;
// Häufigkeitswert eines Übungsworts: Mittelwert der Silbenwerte (Zipf) plus Bonus, wenn es ein echtes Wort ist. Höher = häufiger.
export function wordScore(word: string): number {
  const parts = splitSyllables(word), mean = parts.reduce((a, p) => a + partWeight(p), 0) / parts.length / 10, real = WOERTER_ZIPF[word];
  return mean + (real !== undefined ? REAL_WORD_BONUS + real / 1000 : 0);
}
