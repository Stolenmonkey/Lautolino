// Minimaler PDF-Schreiber (nur Vektorgrafik und etwas Text), läuft im Browser und in Node. Maße in Millimetern, Ursprung oben links.
const MM = 72 / 25.4;
const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const hex = (c: string): string => [1, 3, 5].map((i) => n(parseInt(c.slice(i, i + 2), 16) / 255)).join(" ");
// Text im PDF: Latin-1 (deutsche Umlaute), Klammern und Rückstrich maskiert
const esc = (t: string): string => t.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, (ch) => { const c = ch.charCodeAt(0); return c < 256 ? "\\" + c.toString(8).padStart(3, "0") : "?"; });

export class Page {
  ops: string[] = [];
  constructor(public w: number, public h: number) {}
  X(x: number): number { return x * MM; }
  Y(y: number): number { return (this.h - y) * MM; }
  fill(c: string): this { this.ops.push(hex(c) + " rg"); return this; }
  stroke(c: string, width: number, round = true): this { this.ops.push(hex(c) + " RG " + n(width * MM) + " w " + (round ? "1 J 1 j" : "0 J 0 j")); return this; }
  dash(on: number, off: number): this { this.ops.push("[" + n(on * MM) + " " + n(off * MM) + "] 0 d"); return this; }
  solid(): this { this.ops.push("[] 0 d"); return this; }
  // Pfad aus fertigen Befehlen in Seitenkoordinaten (mm); mode: S Linie, f Fläche, B beides
  path(cmds: Array<[string, ...number[]]>, mode: "S" | "f" | "B"): this {
    const out = cmds.map(([c, ...a]) => {
      if (c === "M" || c === "L") return n(this.X(a[0])) + " " + n(this.Y(a[1])) + (c === "M" ? " m" : " l");
      if (c === "C") return n(this.X(a[0])) + " " + n(this.Y(a[1])) + " " + n(this.X(a[2])) + " " + n(this.Y(a[3])) + " " + n(this.X(a[4])) + " " + n(this.Y(a[5])) + " c";
      return "h";
    });
    this.ops.push(out.join(" ") + " " + mode); return this;
  }
  rect(x: number, y: number, w: number, h: number, r: number, mode: "S" | "f" | "B"): this {
    const k = 0.5523 * r, c: Array<[string, ...number[]]> = [["M", x + r, y], ["L", x + w - r, y], ["C", x + w - r + k, y, x + w, y + r - k, x + w, y + r], ["L", x + w, y + h - r], ["C", x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h], ["L", x + r, y + h], ["C", x + r - k, y + h, x, y + h - r + k, x, y + h - r], ["L", x, y + r], ["C", x, y + r - k, x + r - k, y, x + r, y], ["Z"]];
    return this.path(c, mode);
  }
  circle(cx: number, cy: number, r: number, mode: "S" | "f" | "B"): this {
    const k = 0.5523 * r;
    return this.path([["M", cx + r, cy], ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r], ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy], ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r], ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy], ["Z"]], mode);
  }
  line(x1: number, y1: number, x2: number, y2: number): this { return this.path([["M", x1, y1], ["L", x2, y2]], "S"); }
  // Text mit eingebauter Schrift (F1 normal, F2 fett); x, y = Grundlinie links
  text(t: string, x: number, y: number, size: number, bold = false): this {
    this.ops.push("BT /" + (bold ? "F2" : "F1") + " " + n(size) + " Tf " + n(this.X(x)) + " " + n(this.Y(y)) + " Td (" + esc(t) + ") Tj ET"); return this;
  }
}

export function buildPdf(pages: Page[], title: string): Uint8Array {
  const objs: string[] = [];
  const add = (s: string): number => { objs.push(s); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [" + pages.map((_, i) => 5 + i * 2 + " 0 R").join(" ") + "] /Count " + pages.length + " >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((p, i) => {
    add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + n(p.w * MM) + " " + n(p.h * MM) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (6 + i * 2) + " 0 R >>");
    const body = p.ops.join("\n"); add("<< /Length " + body.length + " >>\nstream\n" + body + "\nendstream");
  });
  const info = add("<< /Title (" + esc(title) + ") /Producer (silbenflug) >>");
  let out = "%PDF-1.4\n"; const off: number[] = [];
  objs.forEach((o, i) => { off.push(out.length); out += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
  const xref = out.length;
  out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R /Info " + info + " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;   // alles Latin-1
  return bytes;
}
