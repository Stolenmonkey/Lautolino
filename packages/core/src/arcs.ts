// Silbenbögen: Jede Sprechsilbe eines Übungsworts bekommt einen Bogen unter ihren Buchstaben (WAR: ein Bogen, MAMA: zwei Bögen).
// Baut auf renderWord/GLYPHS aus glyphs.ts auf (unverändert). Die Silbentrennung kommt aus syllabify.ts, also aus der tatsächlichen Silbenstruktur.
import { renderWord } from "./glyphs";
import { splitSyllables } from "./syllabify";

const ARC = '<svg class="arc" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 2 Q50 22 97 2" vector-effect="non-scaling-stroke"/></svg>';

// Gibt die Sprechsilben so zurück, wie sie angezeigt werden (Groß-/Kleinschreibung des Eingabeworts bleibt erhalten).
export function displayParts(shown: string): string[] {
  const parts = splitSyllables(shown), out: string[] = []; let i = 0;
  for (const p of parts) { out.push(shown.slice(i, i + p.length)); i += p.length; }
  return out;
}
export function renderWordWithArcs(shown: string): string {
  return displayParts(shown).map((p) => '<span class="sy">' + renderWord(p) + ARC + "</span>").join("");
}
