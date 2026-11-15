// Regeln für deutsche Lesesilben (unverändert aus Silbenzauber, nur typisiert).
export const RULES = {
  vowels: "aeiouäöüy",
  diphthongs: ["au", "eu", "äu", "ei", "ie", "ai"],
  hiatus: ["ea", "eo", "ia", "io"],
  onsetClusters: ["bl", "br", "dr", "fl", "fr", "gl", "gr", "kl", "kr", "pl", "pr", "tr", "st", "sp", "qu"],
  codaClusters: ["ch", "ck", "st", "nt", "nd", "nk", "ng", "lt", "ld", "rt", "rn", "mp", "ft",
    "ls", "lm", "lk", "lb", "lp", "lf", "rs", "rb", "rd", "rg", "rk", "rm", "rl", "rf", "rp", "ms", "ns", "ps", "ts", "ks", "fs", "bs", "ds", "gs"],
  noOnset: "cqß",
  noCoda: "cq",
};
const isV = (c: string) => RULES.vowels.indexOf(c) >= 0;
const okOnset = (c: string) => !isV(c) && RULES.noOnset.indexOf(c) < 0;
const okCoda = (c: string) => !isV(c) && RULES.noCoda.indexOf(c) < 0;
const okVV = (p: string) => RULES.diphthongs.indexOf(p) >= 0 || RULES.hiatus.indexOf(p) >= 0;
const okDiph = (p: string) => RULES.diphthongs.indexOf(p) >= 0;

// Prüft, ob eine Silbe gültig ist (Groß-/Kleinschreibung egal).
export function isValid(input: string): boolean {
  const s = input.toLowerCase();
  const a = s[0], b = s[1], c = s[2];
  for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) return false; // keine Doppelungen wie EE, OO, LL
  if (s.length === 2) {
    if (isV(a) && isV(b)) return okDiph(s);
    if (isV(a) && !isV(b)) return okCoda(b);
    if (!isV(a) && isV(b)) return okOnset(a);
    return false;
  }
  if (s.length === 3) {
    const v = [isV(a), isV(b), isV(c)].map(Number).join("");
    if (v === "010") return okOnset(a) && okCoda(c);
    if (v === "101") return okCoda(b) || b === "ß";
    if (v === "011") return okOnset(a) && okVV(b + c);
    if (v === "110") return okDiph(a + b) && okCoda(c);
    if (v === "001") return RULES.onsetClusters.indexOf(a + b) >= 0;
    if (v === "100") return RULES.codaClusters.indexOf(b + c) >= 0;
  }
  if (s.length === 4) {
    const d = s[3], w = [isV(a), isV(b), isV(c), isV(d)].map(Number).join("");
    if (w === "0101") return okOnset(a) && okCoda(c);
    if (w === "1010") return okCoda(b) && okCoda(d);
    if (w === "0100") return okOnset(a) && RULES.codaClusters.indexOf(c + d) >= 0;
    if (w === "0010") return RULES.onsetClusters.indexOf(a + b) >= 0 && okCoda(d);
    if (w === "0011") return RULES.onsetClusters.indexOf(a + b) >= 0 && okVV(c + d);
    if (w === "0110") return okOnset(a) && okVV(b + c) && okCoda(d);
    if (w === "1001") return RULES.codaClusters.indexOf(b + c) >= 0;
  }
  return false;
}
