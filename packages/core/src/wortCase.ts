// Anzeige-Schreibweise einer Übungssilbe/eines Übungsworts: echte deutsche Wörter richtig (Substantive und Namen groß, alle anderen klein),
// alles andere (Pseudowörter, mehrdeutige Wörter wie essen/Essen) wie bisher zufällig am Wortanfang groß oder klein. Die Aufgabe selbst bleibt intern kleingeschrieben.
import { WORT_GROSS, WORT_KLEIN } from "./wortschreibung";
import type { Rng } from "@silbenflug/shared";

export function wortCase(s: string, rng: Rng): string {
  const low = s.toLowerCase(), r = rng();   // rng wird immer genau einmal verbraucht (gleiche Zufallsfolge wie randomCase)
  const gross = WORT_GROSS.has(low) ? true : WORT_KLEIN.has(low) ? false : r < 0.5;
  return (gross ? low[0].toUpperCase() : low[0]) + low.slice(1);
}
