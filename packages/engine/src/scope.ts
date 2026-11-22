// Fester Silbenumfang je Buchstabe. Wird bei der Freigabe EINMAL berechnet und dauerhaft gespeichert.
import { structureWords, classifySyllable, partWeight, wordScore, isRealWord } from "@silbenflug/core";
import { blockScope, groupBlocks } from "./blocks";

// Begrenzung des Umfangs (Konfiguration, Block scope): höchstens capStage14 Wörter je Lernstufe 1 bis 4 und capStage57 je Lernstufe 5 bis 7 für einen neuen Buchstaben.
// freqPercent: Anteil der Plätze, der nach Häufigkeit im Deutschen vergeben wird (100 = nur die häufigsten, der Rest wird fest ausgelost).
export interface ScopeParams { capStage14: number; capStage57: number; freqPercent: number; blocks?: boolean }   // blocks: Kontrastblöcke (Stufe 2) mit in den festen Umfang schreiben

const fnv = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Wählt je Lernstufe höchstens cap Wörter (cap mal mult). Die Plätze werden reihum auf die Unterkategorien der Stufe verteilt (z. B. 3.1 VK und 3.2 KVK);
// bleibt eine Unterkategorie leer, rücken die anderen nach. Ab Stufe 4 zählen nur echte Wörter (kein Auffüllen mit Pseudowörtern). Stufe 2 hat keine eigene Menge (Ableitung aus Stufe 1).
export function limitScope(cands: string[], p: ScopeParams, mult: number, seed: string): string[] {
  const out: string[] = [], bySub = new Map<string, string[]>();
  for (const w of [...new Set(cands)]) { const c = classifySyllable(w); if (c.stage >= 4 && !isRealWord(w)) continue;   // mehrsilbige Stufen: nur sinnvolle (echte) Wörter, sonst bleibt der Platz leer
    (bySub.get(c.sub) ?? bySub.set(c.sub, []).get(c.sub)!).push(w); }
  for (let stage = 1; stage <= 7; stage++) {
    const cap = Math.max(0, Math.round((stage <= 4 ? p.capStage14 : p.capStage57) * mult));
    const subs = [...bySub.keys()].filter((id) => id.startsWith(stage + ".")).sort();
    if (!subs.length || !cap) continue;
    const ranked = new Map(subs.map((id) => [id, bySub.get(id)!.map((w) => [w, wordScore(w)] as [string, number]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0])]));
    const quota = new Map(subs.map((id) => [id, 0])); let total = 0;
    for (let again = true; again && total < cap;) {
      again = false;
      for (const id of subs) { if (total < cap && quota.get(id)! < ranked.get(id)!.length) { quota.set(id, quota.get(id)! + 1); total++; again = true; } }
    }
    for (const id of subs) {
      const list = ranked.get(id)!, n = quota.get(id)!, nf = Math.min(n, Math.round(n * p.freqPercent / 100));
      const rest = list.slice(nf).sort((a, b) => fnv(a + seed) - fnv(b + seed) || (a < b ? -1 : 1));
      out.push(...list.slice(0, nf), ...rest.slice(0, n - nf));
    }
  }
  return out.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
}

// releasedBefore: bereits freigegebene Buchstaben (in Reihenfolge). Gehört zu newLetter: jedes strukturell gültige Übungswort (1 bis 3 Sprechsilben,
// siehe structureWords), das newLetter enthält und nur aus den bis einschließlich newLetter freigegebenen Buchstaben besteht.
// Mit p: begrenzt auf die häufigsten Wörter je Lernstufe (limitScope); ohne p: alle (alte Regel).
export function syllableScope(releasedBefore: string[], newLetter: string, p?: ScopeParams): string[] {
  const nl = newLetter.toLowerCase(), letters = releasedBefore.map((x) => x.toLowerCase()).filter((x) => x !== nl).concat([nl]);
  if (!p) return structureWords(letters, nl);
  const syl = limitScope(structureWords(letters, nl, { weight: partWeight, capPerSub: Infinity }), p, 1, nl);
  return p.blocks ? [...syl, ...blockScope(letters.slice(0, -1), nl)] : syl;
}

// Umfang der Startgruppe (alle Startbuchstaben teilen sich die Menge): Obergrenze mal Anzahl der Startbuchstaben.
export function groupScope(group: string[], p?: ScopeParams): string[] {
  const ls = group.map((x) => x.toLowerCase());
  if (!p) return structureWords(ls);
  const syl = limitScope(structureWords(ls, undefined, { weight: partWeight, capPerSub: Infinity }), p, ls.length, ls.join(""));
  return p.blocks ? [...syl, ...groupBlocks(ls)] : syl;
}

// Eine Freigabe einer Klasse für die Neuberechnung (Reihenfolge wie freigegeben).
export interface ReleaseRef { letter: string; start: boolean; paused: boolean }

// Neuer fester Umfang, nachdem ein Buchstabe gelöscht wurde (nur möglich, solange seit seiner Freigabe nicht gespielt wurde).
// order: alle Freigaben der Klasse in Reihenfolge (inklusive des gelöschten). Gibt den Umfang für alle Buchstaben zurück, die sich ändern:
// war es ein Startbuchstabe, werden alle neu berechnet (Startgruppe gemeinsam), sonst nur die später freigegebenen. Pausierte Buchstaben zählen nicht mit.
export function rebuildAfterDelete(order: ReleaseRef[], deleted: string, p?: ScopeParams): Record<string, string[]> {
  const d = deleted.toLowerCase(), idx = order.findIndex((x) => x.letter === d), out: Record<string, string[]> = {};
  if (idx < 0) return out;
  const rest = order.filter((x) => x.letter !== d);
  let known: string[];
  let from: number;
  if (order[idx].start) {
    const start = rest.filter((x) => x.start).map((x) => x.letter), group = groupScope(start, p);
    start.forEach((l) => { out[l] = group; });
    known = start; from = rest.findIndex((x) => !x.start);
    if (from < 0) return out;
  } else {
    from = idx; known = rest.slice(0, idx).filter((x) => !x.paused).map((x) => x.letter);
  }
  for (const x of rest.slice(from)) {
    if (x.start || x.paused) continue;
    out[x.letter] = syllableScope(known, x.letter, p);
    known = [...known, x.letter];
  }
  return out;
}

// Ergänzung des Umfangs beim Fortsetzen eines pausierten Buchstabens: neue Silben mit dem Buchstaben aus den jetzt aktiven Buchstaben,
// die mindestens einen nach ihm freigegebenen Buchstaben enthalten. Bestehende Silben (existing) bleiben unverändert; es wird nichts entfernt.
// Die Obergrenze je Lernstufe gilt wie bei einer Freigabe (limitScope).
export function resumeScope(active: string[], later: string[], letter: string, existing: string[], p?: ScopeParams): string[] {
  const nl = letter.toLowerCase(), act = active.map((x) => x.toLowerCase()).filter((x) => x !== nl).concat([nl]), lat = new Set(later.map((x) => x.toLowerCase())), have = new Set(existing);
  const cands = (p ? structureWords(act, nl, { weight: partWeight, capPerSub: Infinity }) : structureWords(act, nl)).filter((w) => !have.has(w) && [...w].some((ch) => lat.has(ch)));
  return p ? limitScope(cands, p, 1, nl + "+") : cands;
}

// Wie rebuildAfterDelete, aber nur die Kontrastblöcke (Stufe 2). Der Browser schickt den Umfang ohne Blöcke, der Server erzeugt sie selbst.
export function rebuildBlocksAfterDelete(order: ReleaseRef[], deleted: string): Record<string, string[]> {
  const d = deleted.toLowerCase(), idx = order.findIndex((x) => x.letter === d), out: Record<string, string[]> = {};
  if (idx < 0) return out;
  const rest = order.filter((x) => x.letter !== d);
  let known: string[], from: number;
  if (order[idx].start) {
    const start = rest.filter((x) => x.start).map((x) => x.letter), blocks = groupBlocks(start);
    start.forEach((l) => { out[l] = blocks; });
    known = start; from = rest.findIndex((x) => !x.start);
    if (from < 0) return out;
  } else { from = idx; known = rest.slice(0, idx).filter((x) => !x.paused).map((x) => x.letter); }
  for (const x of rest.slice(from)) {
    if (x.start || x.paused) continue;
    out[x.letter] = blockScope(known, x.letter);
    known = [...known, x.letter];
  }
  return out;
}
