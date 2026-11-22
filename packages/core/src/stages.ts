// Lernstufen nach dem Silbentrainings-Lernplan (PDF „Vollständiger Silbentrainings-Lernplan“). Die Zuordnung ist reine Strukturlogik:
// jede Silbe wird anhand ihrer Sprechsilben und deren Aufbau (V, KV, VK, KVK ...) einer Stufe und Unterkategorie zugeordnet. Es gibt keine feste Wortliste.
import { clusterPlace, partPattern, splitSyllables } from "./syllabify";

export interface SubDef { id: string; name: string }
export interface StageDef { stage: number; name: string; structure: string; subs: SubDef[] }
export const STAGES: StageDef[] = [
  { stage: 1, name: "Einzelne offene Silben und Vokale", structure: "V und KV", subs: [{ id: "1.1", name: "Reine Vokal-Silben (V)" }, { id: "1.2", name: "Konsonant-Vokal-Silben (KV)" }] },
  { stage: 2, name: "Offene Silben mit Anlautwechsel", structure: "Gegenüberstellung", subs: [{ id: "2.1", name: "Gleicher Vokal, anderer Anlaut (z. B. MA PA LA)" }] },
  { stage: 3, name: "Einfache geschlossene Silben", structure: "VK und KVK", subs: [{ id: "3.1", name: "Geschlossen mit Vokal-Anfang (VK)" }, { id: "3.2", name: "Geschlossen mit Konsonanten-Anfang (KVK)" }] },
  { stage: 4, name: "Zwei offene Silben verbinden", structure: "V-KV und KV-KV", subs: [{ id: "4.1", name: "Vokal-Anfang + offene Silbe (V-KV)" }, { id: "4.2", name: "Konsonant-Vokal + Konsonant-Vokal (KV-KV)" }] },
  { stage: 5, name: "Offene und geschlossene Silben kombinieren", structure: "gemischte Wortarten", subs: [{ id: "5.1", name: "Geschlossen + offen (KVK-KV)" }, { id: "5.2", name: "Offen + geschlossen (KV-KVK) und VK-KV" }, { id: "5.3", name: "Geschlossen + geschlossen (KVK-KVK)" }] },
  { stage: 6, name: "Dreisilbige Wörter", structure: "rein offen und gemischt", subs: [{ id: "6.1", name: "Rein offene Dreisilber (KV-KV-KV, V-KV-KV)" }, { id: "6.2", name: "Gemischte Dreisilber (mit geschlossenen Teilen)" }] },
  { stage: 7, name: "Komplexe Strukturen und Konsonantenhäufungen", structure: "CCV, CCVK usw.", subs: [{ id: "7.1", name: "Häufung am Silbenanfang (z. B. PLAM)" }, { id: "7.2", name: "Häufung am Silbenende (z. B. LAMP, PALM)" }] },
];
export const STAGE_COUNT = STAGES.length;
export const subName = (id: string): string => { for (const s of STAGES) for (const u of s.subs) if (u.id === id) return u.name; return id; };

export interface SylClass { syllable: string; parts: string[]; patterns: string[]; structure: string; stage: number; sub: string }
const cache = new Map<string, SylClass>();

// Ordnet ein Übungswort genau einer Stufe und Unterkategorie zu (Stufe 2 siehe contrastSet: dort sind es dieselben KV-Silben in der Gegenüberstellung).
export function classifySyllable(word: string): SylClass {
  const w = word.toLowerCase(), hit = cache.get(w);
  if (hit) return hit;
  const parts = splitSyllables(w), patterns = parts.map(partPattern), structure = patterns.join("-");
  const open = (p: string) => p.endsWith("V");
  let stage: number, sub: string;
  const cl = parts.map(clusterPlace).filter(Boolean);
  if (cl.length) { stage = 7; sub = parts.some((p) => clusterPlace(p) === "anfang") ? "7.1" : "7.2"; }
  else if (parts.length === 1) {
    const p = patterns[0];
    if (p === "V") { stage = 1; sub = "1.1"; } else if (p === "KV") { stage = 1; sub = "1.2"; } else if (p === "VK") { stage = 3; sub = "3.1"; } else { stage = 3; sub = "3.2"; }   // KVK
  } else if (parts.length === 2) {
    const [a, b] = patterns;
    if (open(a) && open(b)) { stage = 4; sub = a === "V" ? "4.1" : "4.2"; }
    else if (!open(a) && open(b)) { stage = 5; sub = a === "KVK" ? "5.1" : "5.2"; }
    else if (open(a) && !open(b)) { stage = 5; sub = "5.2"; }
    else { stage = 5; sub = "5.3"; }
  } else if (parts.length === 3) { stage = 6; sub = patterns.every(open) ? "6.1" : "6.2"; }
  else { stage = 7; sub = "7.1"; }
  const r: SylClass = { syllable: w, parts, patterns, structure, stage, sub };
  if (cache.size > 20000) cache.clear();
  cache.set(w, r);
  return r;
}

// Stufe 2 (Anlautwechsel): KV-Silben, zu denen es in der Silbenmenge eine KV-Silbe mit gleichem Vokal und anderem Anlaut gibt.
export function contrastSet(syllables: string[]): Set<string> {
  const byVowel = new Map<string, string[]>();
  for (const s of syllables) {
    const c = classifySyllable(s);
    if (c.stage !== 1 || c.sub !== "1.2") continue;
    const v = c.parts[0].replace(/^[^aeiouäöüy]+/, "");
    (byVowel.get(v) ?? byVowel.set(v, []).get(v)!).push(c.syllable);
  }
  const out = new Set<string>();
  byVowel.forEach((list) => { if (new Set(list.map((x) => x[0])).size >= 2) list.forEach((x) => out.add(x)); });
  return out;
}

export interface StageSub { id: string; name: string; syllables: string[] }
export interface StageGroup { stage: number; name: string; structure: string; subs: StageSub[]; syllables: string[] }
const byLenAlpha = (a: string, b: string): number => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// Verteilt eine Silbenmenge auf alle sieben Stufen. contrastFrom: Menge, in der Kontrastpartner gesucht werden (Standard: dieselbe Menge).
export function stagePlan(syllables: string[], contrastFrom?: string[], conSet?: Set<string>): StageGroup[] {   // conSet: Silben der gespeicherten Kontrastblöcke (ersetzt die Ableitung)
  const uniq = [...new Set(syllables.map((s) => s.toLowerCase()))].sort(byLenAlpha), con = conSet ?? contrastSet(contrastFrom ?? uniq);
  return STAGES.map((def) => {
    const subs: StageSub[] = def.subs.map((u) => ({ id: u.id, name: u.name, syllables: [] as string[] }));
    for (const s of uniq) {
      const c = classifySyllable(s);
      if (def.stage === 2) { if (con.has(s)) subs[0].syllables.push(s); continue; }
      if (c.stage === def.stage) subs.find((u) => u.id === c.sub)!.syllables.push(s);
    }
    return { stage: def.stage, name: def.name, structure: def.structure, subs, syllables: [...new Set(subs.flatMap((u) => u.syllables))].sort(byLenAlpha) };
  });
}
