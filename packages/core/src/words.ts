// Strukturbasierte Erzeugung der Übungswörter: Sprechsilben (V, KV, VK, KVK, Häufungen) werden zu Wörtern mit 1 bis 3 Sprechsilben
// zusammengesetzt. Damit sind alle sieben Lernstufen erreichbar (PAL-ME, MA-LA-MA, PLAM ...), unabhängig von der Buchstabenzahl.
// Rein deterministisch (kein Zufall): gleiche Buchstaben ergeben immer dieselbe Menge.
import { RULES } from "./rules";
import { buildSyllables } from "./syllables";
import { partPattern, splitSyllables } from "./syllabify";
import { classifySyllable } from "./stages";

// Höchstzahl mehrsilbiger Wörter je Unterkategorie (1.1 bis 7.2) und neuem Buchstaben; einsilbige Wörter werden nie gekürzt.
export const WORD_CAP_PER_SUB = 30;
// Nur noch Schlüsselteil der Automatik-Stände (comboKey, "lo|2,3"); Silben werden nicht mehr nach Länge gewählt.
export const FALLBACK_LENS = [2, 3];
const ENUM_LIMIT = 400, SAMPLES = 40;

const fnv = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const isV = (c: string): boolean => RULES.vowels.indexOf(c) >= 0;

// Alle gültigen einzelnen Sprechsilben aus den Buchstaben (ein Vokal, 2 bis 4 Buchstaben nach den Silbenregeln).
export function partsOf(letters: string[]): string[] {
  const out = letters.filter(isV);
  for (let L = 2; L <= 4; L++) out.push(...buildSyllables(letters, L));
  return out;
}

const joinOk = (parts: string[]): boolean => {
  for (let i = 1; i < parts.length; i++) {
    const x = parts[i - 1][parts[i - 1].length - 1], y = parts[i][0];
    if (x === y || (isV(x) && isV(y))) return false;   // keine Doppelungen wie LL, keine Vokal-Vokal-Grenze (A-E)
  }
  const w = parts.join("");
  const sp = splitSyllables(w);
  return sp.length === parts.length && sp.every((x, i) => x === parts[i]);   // muss genau so in Sprechsilben zerfallen
};

// required: nur Wörter mit diesem Buchstaben (Umfang eines neu freigegebenen Buchstabens). Ohne required: alle Wörter der Gruppe.
export function structureWords(letters: string[], required?: string): string[] {
  const ls = [...new Set(letters.map((x) => x.toLowerCase()))], req = required?.toLowerCase();
  const parts = partsOf(ls), byPat = new Map<string, string[]>(), reqByPat = new Map<string, string[]>();
  parts.forEach((p) => {
    const k = partPattern(p);
    (byPat.get(k) ?? byPat.set(k, []).get(k)!).push(p);
    if (req && p.indexOf(req) >= 0) (reqByPat.get(k) ?? reqByPat.set(k, []).get(k)!).push(p);
  });
  const pats = [...byPat.keys()].sort(), singles = new Set<string>(), multi = new Map<string, Set<string>>();
  parts.forEach((p) => { if (!req || p.indexOf(req) >= 0) singles.add(p); });
  const add = (seq: string[]) => {
    if (!joinOk(seq)) return;
    const w = seq.join(""); if (req && w.indexOf(req) < 0) return;
    const sub = classifySyllable(w).sub;
    (multi.get(sub) ?? multi.set(sub, new Set()).get(sub)!).add(w);
  };
  const sigs: string[][] = [];
  pats.forEach((a) => { pats.forEach((b) => { sigs.push([a, b]); pats.forEach((c) => sigs.push([a, b, c])); }); });
  sigs.forEach((sig) => {
    const lists = sig.map((k) => byPat.get(k)!), size = lists.reduce((a, l) => a * l.length, 1);
    if (size <= ENUM_LIMIT) {
      const rec = (i: number, acc: string[]) => { if (i === lists.length) { add(acc); return; } lists[i].forEach((p) => rec(i + 1, acc.concat(p))); };
      rec(0, []); return;
    }
    let seed = fnv(sig.join("-") + "|" + (req ?? "") + "|" + ls.join("")) || 1;
    const next = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor((seed / 4294967296) * n); };
    for (let t = 0; t < SAMPLES; t++) {
      const seq = lists.map((l) => l[next(l.length)]);
      if (req && !seq.some((p) => p.indexOf(req) >= 0)) {
        const at = next(sig.length), r = reqByPat.get(sig[at]);
        if (!r || !r.length) continue;
        seq[at] = r[next(r.length)];
      }
      add(seq);
    }
  });
  const out = new Set(singles);
  multi.forEach((set) => { [...set].sort((a, b) => fnv(a) - fnv(b) || (a < b ? -1 : 1)).slice(0, WORD_CAP_PER_SUB).forEach((w) => out.add(w)); });
  return [...out].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
}
