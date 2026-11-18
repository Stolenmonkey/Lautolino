// Schritt 2: Aus words.tsv (Wort, relative Häufigkeit) die Tabelle packages/core/src/silbenfreq.ts erzeugen.
// Aufruf: npx tsx tools/silbenfreq/build.ts /tmp/words.tsv
// Silbenwert = Zipf-Wert (log10 der Häufigkeit je Milliarde Wörter) der Summe aller Wortvorkommen, in denen die Sprechsilbe vorkommt, mal 10 als ganze Zahl.
import { readFileSync, writeFileSync } from "node:fs";
import { splitSyllables } from "../../packages/core/src/syllabify";

const rows = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((l) => { const [w, f] = l.split("\t"); return [w, Number(f)] as [string, number]; });
const syl = new Map<string, number>(), words: Array<[string, number]> = [];
for (const [w, f] of rows) {
  const parts = splitSyllables(w);
  for (const p of parts) if (p.length <= 4) syl.set(p, (syl.get(p) ?? 0) + f);
  if (parts.length <= 3 && w.length <= 9) words.push([w, f]);
}
const zipf = (f: number) => Math.round(Math.log10(f * 1e9) * 10);
const sylStr = [...syl].map(([s, f]) => [s, zipf(f)] as [string, number]).filter(([, z]) => z >= 30).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([s, z]) => `${s}:${z}`).join(",");
const wordStr = words.map(([w, f]) => [w, zipf(f)] as [string, number]).filter(([, z]) => z >= 35).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([w, z]) => `${w}:${z}`).join(",");
const head = `// GENERIERT von tools/silbenfreq/build.ts – nicht von Hand ändern.
// Quelle: Python-Paket wordfreq (deutsche Wortlisten; Daten unter CC BY-SA 4.0, https://github.com/rspeer/wordfreq). Werte = Zipf-Wert mal 10 (ganze Zahl).
// SILBEN_ZIPF: Sprechsilbe (bis 4 Buchstaben) -> Häufigkeit; WOERTER_ZIPF: echte deutsche Wörter (bis 3 Sprechsilben, bis 9 Buchstaben) -> Häufigkeit.
`;
const body = `const parse = (s: string): Record<string, number> => { const o: Record<string, number> = {}; for (const e of s.split(",")) { const i = e.indexOf(":"); o[e.slice(0, i)] = Number(e.slice(i + 1)); } return o; };
export const SILBEN_ZIPF: Record<string, number> = /* @__PURE__ */ parse("${sylStr}");
export const WOERTER_ZIPF: Record<string, number> = /* @__PURE__ */ parse("${wordStr}");
`;
writeFileSync(new URL("../../packages/core/src/silbenfreq.ts", import.meta.url), head + body);
console.log("Silben", syl.size, "-> gespeichert", sylStr.split(",").length, "Wörter", wordStr.split(",").length);
