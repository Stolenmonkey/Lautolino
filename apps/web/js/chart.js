// Zeitverlauf einer Lernenden/eines Lernenden als Liniendiagramm (SVG-Text). Es kommen nur Zahlen und Buchstaben a–z in den Text; Namen u. Ä. werden nie eingesetzt.
const LEVEL_COLOR = { bronze: "#cd7f32", silber: "#b9c3d1", gold: "#ffc928" };
const LEVEL_NAME = { bronze: "Bronze", silber: "Silber", gold: "Gold" };
const az = (s) => String(s).replace(/[^a-z]/g, "");

// rounds: [{ id, played_at, seconds }] nach Zeit sortiert; markers: [{ letter, round_id }] (neuer Buchstabe); awards: [{ letter, level, round_id }]; target: Zielzeit oder null
export function zeitverlaufSvg(rounds, markers, awards, target) {
  const n = rounds.length, W = Math.max(360, 56 + n * 16), H = 240, L = 44, R = 14, T = 34, B = 40, pw = W - L - R, ph = H - T - B;
  const mx = Math.max(1, ...rounds.map((r) => r.seconds), target || 0), steps = [10, 20, 30, 40, 60, 90, 120, 180, 240, 300, 600, 1200, 1800, 3600];
  const top = steps.find((s) => s >= mx * 1.05) || Math.ceil(mx * 1.05 / 600) * 600;
  const xAt = (i) => (n === 1 ? L + pw / 2 : L + (pw * i) / (n - 1)), yAt = (v) => T + ph - (ph * v) / top, idx = {};
  rounds.forEach((r, i) => { idx[r.id] = i; });
  const f = (v) => Math.round(v * 10) / 10;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" class="zeitverlauf" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Zeit pro Runde in Sekunden">`;
  [0, 0.5, 1].forEach((fr) => { const y = f(T + ph - ph * fr); o += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#d6e3f3"/><text x="${L - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#4b5b7a">${Math.round(top * fr)}</text>`; });
  if (target > 0 && target <= top) o += `<line class="ziel" x1="${L}" x2="${W - R}" y1="${f(yAt(target))}" y2="${f(yAt(target))}" stroke="#2faa5a" stroke-dasharray="5 4"/><text x="${W - R}" y="${f(yAt(target)) - 3}" text-anchor="end" font-size="9" fill="#23864a">Ziel ${Math.round(target)} s</text>`;
  // Markierung „neuer Buchstabe“: senkrechte Linie in der Runde, in der der Buchstabe zum ersten Mal geübt wurde
  const byRound = {};
  markers.forEach((m) => { if (idx[m.round_id] !== undefined) (byRound[m.round_id] ||= []).push(az(m.letter).toUpperCase()); });
  Object.keys(byRound).forEach((rid) => {
    const x = f(xAt(idx[rid]));
    o += `<g class="neu"><line x1="${x}" x2="${x}" y1="${T - 6}" y2="${T + ph}" stroke="#7b5fd6" stroke-dasharray="3 3"/><text x="${x}" y="${T - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#7b5fd6">neu: ${byRound[rid].join(" ")}</text></g>`;
  });
  if (n > 1) o += `<polyline fill="none" stroke="#2f7fd8" stroke-width="2" points="${rounds.map((r, i) => f(xAt(i)) + "," + f(yAt(r.seconds))).join(" ")}"/>`;
  rounds.forEach((r, i) => { o += `<circle class="pt" cx="${f(xAt(i))}" cy="${f(yAt(r.seconds))}" r="3.5" fill="#2f7fd8"><title>Runde ${i + 1}: ${Math.round(r.seconds)} s</title></circle>`; });
  // Auszeichnungen: farbiger Punkt unter der Achse
  awards.forEach((a, k) => { if (idx[a.round_id] === undefined || !LEVEL_COLOR[a.level]) return; o += `<circle class="aw" cx="${f(xAt(idx[a.round_id]))}" cy="${T + ph + 12 + (k % 2) * 8}" r="4" fill="${LEVEL_COLOR[a.level]}" stroke="#1f2a44"><title>${az(a.letter).toUpperCase()}: ${LEVEL_NAME[a.level]}</title></circle>`; });
  const lab = Math.max(1, Math.ceil(n / 12));
  for (let i = 0; i < n; i += lab) o += `<text x="${f(xAt(i))}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#4b5b7a">${i + 1}</text>`;
  return o + `<text x="${L + pw / 2}" y="${H - 18}" text-anchor="middle" font-size="9" fill="#4b5b7a"></text></svg>`;
}
// SVG-Text in ein Element umwandeln (ohne HTML-Einfügen)
export function svgNode(text) { return document.importNode(new DOMParser().parseFromString(text, "image/svg+xml").documentElement, true); }
export const levelName = (l) => LEVEL_NAME[l] || "–";
