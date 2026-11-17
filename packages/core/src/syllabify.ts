// Silbentrennung und Strukturmuster der Übungswörter (neu in Lautolino, ergänzt die Silbenregeln aus rules.ts, ohne sie zu ändern).
// Ein Übungswort besteht aus 1 bis 3 Sprechsilben, z. B. WAR = 1, MAMA = 2 (MA-MA), PALME = 2 (PAL-ME).
import { RULES } from "./rules";

const isVowel = (c: string): boolean => RULES.vowels.indexOf(c) >= 0;
// Diese Buchstabenpaare klingen wie ein einziger Konsonant und zählen nicht als Häufung.
const CONSONANT_UNITS = ["ch", "ck", "qu"];

interface Tok { t: string; v: boolean }

function tokenize(word: string): Tok[] {
  const s = word.toLowerCase(), out: Tok[] = [];
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (CONSONANT_UNITS.indexOf(two) >= 0) { out.push({ t: two, v: false }); i++; continue; }
    const c = s[i];
    if (isVowel(c)) {
      if (i + 1 < s.length && isVowel(s[i + 1]) && RULES.diphthongs.indexOf(two) >= 0) { out.push({ t: two, v: true }); i++; } else out.push({ t: c, v: true });
    } else out.push({ t: c, v: false });
  }
  return out;
}

// Teilt ein Wort in Sprechsilben: Zwischen zwei Vokalkernen beginnt die neue Silbe mit dem letzten Konsonanten (PA-LME wird PAL-ME, A-MA bleibt A-MA, LE-O wird getrennt).
export function splitSyllables(word: string): string[] {
  const toks = tokenize(word), nuclei: number[] = [];
  toks.forEach((k, i) => { if (k.v) nuclei.push(i); });
  if (nuclei.length < 2) return [word.toLowerCase()];
  const cuts: number[] = [];   // Index des ersten Tokens der neuen Silbe
  for (let n = 0; n + 1 < nuclei.length; n++) {
    const a = nuclei[n], b = nuclei[n + 1], cons = b - a - 1;
    if (cons === 0) cuts.push(b);
    else if (cons === 1) cuts.push(toks[a + 1].t === "ck" ? b : a + 1);   // ck gehört immer zur vorigen Silbe
    else cuts.push(toks[b - 1].t === "ck" ? b : b - 1);
  }
  const parts: string[] = []; let from = 0;
  for (const c of cuts) { parts.push(toks.slice(from, c).map((k) => k.t).join("")); from = c; }
  parts.push(toks.slice(from).map((k) => k.t).join(""));
  return parts;
}

// Muster einer Sprechsilbe aus K (Konsonant) und V (Vokal oder Doppelvokal), z. B. "KVK".
export function partPattern(part: string): string { return tokenize(part).map((k) => (k.v ? "V" : "K")).join(""); }
// Konsonantenhäufung innerhalb einer Silbe: mindestens zwei Konsonanten hintereinander (PLAM, LAMP, ALP). ch und ck zählen als einer.
export function clusterPlace(part: string): "anfang" | "ende" | null {
  const p = partPattern(part), m = /K{2,}/g; let r: RegExpExecArray | null, place: "anfang" | "ende" | null = null;
  while ((r = m.exec(p))) { if (r.index === 0) return "anfang"; place = "ende"; }
  return place;
}
