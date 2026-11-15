// Druckblatt „Silben-Zug“: 20 Silben, jede in einem Waggon, in 4 Zeilen zu je 5 Waggons mit Lok. DIN A4 quer, Vektor-PDF aus den Silbenzauber-Buchstabenformen.
import { GLYPHS } from "@silbenflug/core";
import { Page, buildPdf } from "./pdf";

export interface ZugSheet { name: string; letters: string[]; syllables: string[]; shown?: string[]; date: string }
type Cmd = [string, ...number[]];

// SVG-Bogen (nur ohne Drehung) in Bézierkurven umrechnen (Verfahren aus der SVG-Spezifikation)
function arc(x1: number, y1: number, rx: number, ry: number, large: number, sweep: number, x2: number, y2: number): Cmd[] {
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2; let r1 = Math.abs(rx), r2 = Math.abs(ry);
  const lam = (dx * dx) / (r1 * r1) + (dy * dy) / (r2 * r2); if (lam > 1) { r1 *= Math.sqrt(lam); r2 *= Math.sqrt(lam); }
  const num = r1 * r1 * r2 * r2 - r1 * r1 * dy * dy - r2 * r2 * dx * dx, den = r1 * r1 * dy * dy + r2 * r2 * dx * dx;
  let co = Math.sqrt(Math.max(0, num / den)); if (large === sweep) co = -co;
  const cxp = co * (r1 * dy) / r2, cyp = -co * (r2 * dx) / r1, cx = cxp + (x1 + x2) / 2, cy = cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  let t1 = ang(1, 0, (dx - cxp) / r1, (dy - cyp) / r2), dt = ang((dx - cxp) / r1, (dy - cyp) / r2, (-dx - cxp) / r1, (-dy - cyp) / r2);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), d = dt / segs, k = (4 / 3) * Math.tan(d / 4), out: Cmd[] = [];
  for (let i = 0; i < segs; i++) {
    const a = t1 + i * d, b = a + d, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    out.push(["C", cx + r1 * (ca - k * sa), cy + r2 * (sa + k * ca), cx + r1 * (cb + k * sb), cy + r2 * (sb - k * cb), cx + r1 * cb, cy + r2 * sb]);
  }
  return out;
}
// Pfadtext der Buchstabenformen (M L H V Q A Z) in Zeichenbefehle umwandeln; Q wird zu einer kubischen Kurve
export function parsePath(d: string): Cmd[] {
  const t = d.match(/[MLHVQAZ]|-?\d*\.?\d+/g) || [], out: Cmd[] = []; let i = 0, x = 0, y = 0, sx = 0, sy = 0;
  const num = (): number => parseFloat(t[i++]);
  while (i < t.length) {
    const c = t[i++];
    if (c === "M") { x = num(); y = num(); sx = x; sy = y; out.push(["M", x, y]); }
    else if (c === "L") { x = num(); y = num(); out.push(["L", x, y]); }
    else if (c === "H") { x = num(); out.push(["L", x, y]); }
    else if (c === "V") { y = num(); out.push(["L", x, y]); }
    else if (c === "Q") { const qx = num(), qy = num(), ex = num(), ey = num(); out.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]); x = ex; y = ey; }
    else if (c === "A") { const rx = num(), ry = num(); num(); const la = num(), sw = num(), ex = num(), ey = num(); out.push(...arc(x, y, rx, ry, la, sw, ex, ey)); x = ex; y = ey; }
    else if (c === "Z") { out.push(["Z"]); x = sx; y = sy; }
  }
  return out;
}
interface Shape { kind: "s" | "d"; cmds: Cmd[] }
function shapes(svg: string): Shape[] {
  const res: Shape[] = [], re = /<(path|circle) class="([sd])"([^>]*)\/>/g; let m: RegExpExecArray | null;
  const at = (a: string, k: string): number => parseFloat((new RegExp(k + '="([^"]+)"').exec(a) || [])[1]);
  while ((m = re.exec(svg))) {
    if (m[1] === "path") res.push({ kind: m[2] as "s", cmds: parsePath(/ d="([^"]+)"/.exec(m[3])![1]) });
    else { const cx = at(m[3], "cx"), cy = at(m[3], "cy"), r = at(m[3], "r"), k = 0.5523 * r; res.push({ kind: m[2] as "s" | "d", cmds: [["M", cx + r, cy], ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r], ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy], ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r], ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy], ["Z"]] }); }
  }
  return res;
}
// Breite eines Wortes in Zeichen-Einheiten (100 = 1 em)
export const wordUnits = (w: string): number => w.split("").reduce((a, ch) => a + (GLYPHS[ch] ? GLYPHS[ch][0] : 60), 0);
// Zeichnet ein Wort mit den Silbenzauber-Formen; (x, y) = linke obere Ecke des Zeichenkastens (Höhe 140 Einheiten), scale = mm je Einheit
export function drawWord(p: Page, word: string, x: number, y: number, scale: number, color = "#1f2a44"): void {
  let ox = x;
  word.split("").forEach((ch) => {
    const g = GLYPHS[ch]; if (!g) { ox += 0.6 * 100 * scale; return; }
    shapes(g[1]).forEach((s) => {
      const cmds = s.cmds.map((c) => { const [k, ...a] = c; return [k, ...a.map((v, i) => (i % 2 === 0 ? ox + v * scale : y + v * scale))] as Cmd; });
      if (s.kind === "s") p.stroke(color, 12 * scale).path(cmds, "S"); else p.fill(color).path(cmds, "f");
    });
    ox += g[0] * scale;
  });
}

const PASTEL = ["#ffe3e6", "#fff1d2", "#dff5e1", "#e6e0fa"], W = 297, H = 210, M = 10;
export function sheetPage(s: ZugSheet): Page {
  if (s.syllables.length !== 20) throw new Error("Ein Silben-Zug braucht genau 20 Silben.");
  const p = new Page(W, H);
  p.fill("#1f2a44").text("Silben-Zug" + (s.name ? " von " + s.name : ""), M, M + 7, 18, true);
  p.fill("#4b5b7a").text("Buchstaben: " + s.letters.map((l) => l.toUpperCase()).join(" ") + "      " + s.date, M, M + 14, 10);
  const top = 32, rowH = (H - M - top) / 4, locoW = 34, wagW = 44, gap = 4, bodyH = 28;
  for (let r = 0; r < 4; r++) {
    const y0 = top + r * rowH, base = y0 + bodyH + 7, bodyY = y0 + 3;
    p.stroke("#8a96ad", 0.8).solid().line(M, base + 4.2, W - M, base + 4.2);   // Schiene
    for (let t = M + 3; t < W - M; t += 8) p.stroke("#8a96ad", 0.5).line(t, base + 4.2, t + 3, base + 6.2);
    // Lok: Kessel, Schornstein, Fenster, Räder
    p.fill("#f08a24").stroke("#1f2a44", 0.8).rect(M, bodyY + 8, locoW - 12, bodyH - 8, 3, "B").fill("#7b5fd6").rect(M + locoW - 14, bodyY, 14, bodyH, 3, "B");
    p.fill("#ffffff").rect(M + locoW - 11, bodyY + 4, 8, 8, 1.5, "B").fill("#1f2a44").rect(M + 3, bodyY + 1, 5, 8, 1, "f").fill("#ffd93d").circle(M + 5.5, bodyY - 1.5, 2.2, "f");
    [M + 8, M + 22].forEach((cx) => p.fill("#ffffff").stroke("#1f2a44", 0.9).circle(cx, base, 4.2, "B"));
    for (let c = 0; c < 5; c++) {
      const i = r * 5 + c, x0 = M + locoW + gap + c * (wagW + gap), word = (s.shown && s.shown[i]) || s.syllables[i];
      p.stroke("#1f2a44", 1).line(x0 - gap, base - 3, x0, base - 3);   // Kupplung
      p.fill(PASTEL[i % 4]).stroke("#1f2a44", 0.8).rect(x0, bodyY, wagW, bodyH + 4, 3, "B");
      const units = wordUnits(word) / 100, em = Math.min(15, (wagW - 8) / units), sc = em / 100, gw = units * em;
      drawWord(p, word, x0 + (wagW - gw) / 2, bodyY + 2 + (bodyH - 1.4 * em) / 2 - 1, sc);
      [x0 + 9, x0 + wagW - 9].forEach((cx) => p.fill("#ffffff").stroke("#1f2a44", 0.9).circle(cx, base, 4.2, "B"));
      p.fill("#4b5b7a").text(String(i + 1), x0 + wagW / 2 - (i + 1 > 9 ? 2.3 : 1.2), bodyY + bodyH + 2.6, 7);
    }
  }
  return p;
}
export function buildZugPdf(sheets: ZugSheet[]): Uint8Array {
  if (!sheets.length) throw new Error("Kein Blatt zum Drucken.");
  return buildPdf(sheets.map(sheetPage), "Silben-Zug");
}
// Datei im Browser speichern
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" })), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
