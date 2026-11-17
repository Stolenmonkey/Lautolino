// Passwörter, Codes, Tokens. Nur WebCrypto (läuft auf Cloudflare Workers und Node).
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer), (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const PBKDF2_ITERATIONS = 100000; // Obergrenze auf Cloudflare Workers

async function pbkdf2(pw: string, salt: Uint8Array, iters: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iters }, key, 256));
}
export async function hashPassword(pw: string, iters = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$sha256$${iters}$${b64(salt)}$${b64(await pbkdf2(pw, salt, iters))}`;
}
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const p = stored.split("$");
  if (p.length !== 5 || p[0] !== "pbkdf2") return false;
  return safeEqual(await pbkdf2(pw, unb64(p[3]), Number(p[2])), unb64(p[4]));
}
export async function sha256Hex(s: string): Promise<string> { return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
export async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
export const randomToken = (bytes = 32): string => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
export function randomInt(max: number): number { // gleichverteilt (Rejection Sampling)
  const lim = Math.floor(0x100000000 / max) * max, a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % max;
}
const PW_ALPHA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomPassword(len = 12): string { let s = ""; for (let i = 0; i < len; i++) s += PW_ALPHA[randomInt(PW_ALPHA.length)]; return s; }

// Schülercode: zwei kurze, kindgerechte Wörter ohne Umlaute, ohne Bindestrich, dazu eine ein- oder zweistellige Zahl, z. B. SonneWald7
export const CODE_WORDS = ["Tiger","Sonne","Mond","Stern","Wolke","Regen","Blume","Baum","Wiese","Bach","Fisch","Vogel","Eule","Fuchs","Hase","Igel","Reh","Maus","Katze","Hund",
  "Pferd","Kuh","Schaf","Ente","Frosch","Biene","Apfel","Birne","Nuss","Brot","Kuchen","Honig","Milch","Ball","Boot","Zug","Auto","Haus","Turm","Berg",
  "See","Wind","Schnee","Eis","Feuer","Gold","Silber","Rot","Blau","Gelb","Lustig","Mutig","Schnell","Leise","Bunt","Klein","Hoch","Froh","Wolf","Dachs"];
export function generateStudentCode(): string {
  const a = randomInt(CODE_WORDS.length); let b = randomInt(CODE_WORDS.length - 1); if (b >= a) b++;
  return `${CODE_WORDS[a]}${CODE_WORDS[b]}${1 + randomInt(99)}`;
}
// Aktivierungscode für Eltern: 12 Zeichen ohne verwechselbare Zeichen, in Dreiergruppen zu je 4, z. B. K7QM-4TXD-9HRP
const PARENT_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateParentCode(): string {
  let s = ""; for (let i = 0; i < 12; i++) { if (i && i % 4 === 0) s += "-"; s += PARENT_ALPHABET[randomInt(PARENT_ALPHABET.length)]; }
  return s;
}
export function normalizeCode(s: string): string {
  return s.normalize("NFC").trim().toLowerCase().replace(/[\s\-_.]+/g, "-");
}

// Schreibweisen-Toleranz: ohne Trennzeichen (neue Schülercodes wie SonneWald7, auch bei Eingabe "Sonne Wald 7") und mit Trennzeichen (ältere Codes wie Tiger-Sonne-47).
export function compactCode(s: string): string { return s.normalize("NFC").trim().toLowerCase().replace(/[\s\-_.]+/g, ""); }
export function studentCodeCandidates(s: string): string[] { return [...new Set([normalizeCode(s), compactCode(s)])]; }
// Elterncode: 12 Zeichen in Dreiergruppen; auch ohne Bindestriche und in Kleinbuchstaben eingebbar.
export function normalizeParentCode(s: string): string {
  const c = compactCode(s);
  return c.length === 12 ? c.replace(/(.{4})(?=.)/g, "$1-") : normalizeCode(s);
}
