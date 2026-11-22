// Darstellung der Lernstufen und der Silbenstatistik (Lehrkräfte). Schlicht und sachlich; Zahlen kommen vom Server.
import { h, clear, notice } from "../dom.js";

export const STATUS_TXT = { done: "abgeschlossen", active: "wird geübt", locked: "noch nicht dran", skipped: "übersprungen (Silben bereits sicher)", empty: "keine Silben" };
export const SYL_STATUS = { mastered: "sicher beherrscht", not_mastered: "noch nicht sicher", unrated: "noch nicht bewertet" };
export const stageChip = (status, text) => h("span", { class: "stage st-" + (status === "skipped" ? "locked" : status), title: STATUS_TXT[status] }, text ?? STATUS_TXT[status]);
const up = (a) => a.map((x) => x.toUpperCase()).join(", ");
const gesamtStatus = (s) => s.status === "active" && s.unlocked ? stageChip("active", `aktiv (${s.unlocked} Silben freigeschaltet)`) : s.status === "active" && s.activeLetters?.length ? stageChip("active", "aktiv für: " + up(s.activeLetters)) : s.status === "locked" && s.mastered > 0 ? stageChip("skipped", `übersprungen (${s.mastered}/${s.total} sicher)`) : stageChip(s.status);
export const sylText = (parts) => parts.join("-").toUpperCase();
const sec = (v) => (v === null || v === undefined ? "–" : v.toFixed(1).replace(".", ",") + "\u00A0s");

// Tabelle im Stil der Buchstaben-Tabelle: Rahmen, sortierbare Überschriften, Chevron-Button öffnet eine Detailzeile direkt unter der Zeile.
// rows: [{ cells: [Knoten|Text|{ chev: { text, open: async (zelle) => Knoten } }], keys: [Sortierwert je Spalte] }]; opts.badge: erste Spalte als Plakette, opts.breit: Querscrollen.
export function rahmenTabelle(head, rows, opts = {}) {
  const items = rows.map((r, i) => {
    let detail = null;
    const cells = r.cells.map((c) => {
      if (!c || !c.chev) return h("td", {}, c);
      const chev = h("span", { class: "chev" }, "▾"), cell = h("td", { colspan: String(head.length) });
      detail = h("tr", { class: "scopedetail", hidden: "" }, cell);
      return h("td", {}, h("button", { type: "button", class: "chevbtn", title: "Silben ansehen", "aria-label": "Silben ansehen", onclick: async () => {
        if (!detail.hidden) { detail.hidden = true; chev.textContent = "▾"; return; }
        try { clear(cell).append(await c.chev.open()); } catch (e) { clear(cell).append(notice(e.message || String(e), "error")); }
        detail.hidden = false; chev.textContent = "▴";
      } }, h("span", {}, String(c.chev.text)), chev));
    });
    return { tr: h("tr", {}, cells), detail, keys: r.keys || [], i };
  });
  const tbody = h("tbody", {});
  let sortCol = -1, dir = 1;
  const render = () => {
    const list = items.slice();
    if (sortCol >= 0) list.sort((a, b) => { const x = a.keys[sortCol], y = b.keys[sortCol]; return (x < y ? -1 : x > y ? 1 : a.i - b.i) * dir; });
    tbody.replaceChildren(...list.flatMap((q) => (q.detail ? [q.tr, q.detail] : [q.tr])));
  };
  const sortable = (i) => items.some((q) => q.keys[i] !== undefined);
  const ths = head.map((x, i) => { const th = h("th", {}, x); if (sortable(i)) { th.style.cursor = "pointer"; th.title = "Sortieren"; th.onclick = () => { dir = sortCol === i ? -dir : 1; sortCol = i; ths.forEach((t, j) => sortable(j) && t.setAttribute("aria-sort", j === i ? (dir > 0 ? "ascending" : "descending") : "none")); render(); }; } return th; });
  render();
  return h("div", { class: "tablewrap tableframe" + (opts.breit ? " breit" : "") }, h("table", { class: "plain freigaben kompakt" + (opts.badge ? " badge" : "") + (opts.kompakt ? " klein" : "") + (opts.passend ? " passend" : "") + (opts.breit ? " breit" : "") }, h("thead", {}, h("tr", {}, ths)), tbody));
}

// Gesamtstand je Stufe. onDetail(stage) lädt die Silben der Stufe und liefert den Knoten für die Detailzeile.
export function stufenTabelle(stages, onDetail) {
  return rahmenTabelle(["Stufe", "Aufbau", "Status", "Bearbeitet", "Sicher beherrscht", "Silben"], stages.map((s) => ({
    cells: [
      h("strong", {}, `${s.stage}. ${s.name}`), s.structure, gesamtStatus(s),
      s.total ? `${s.processed} von ${s.total}` : "–",
      s.total ? [h("span", { class: "barbox" }, h("span", { class: "bar", style: `width:${Math.round((s.mastered / s.total) * 100)}%` })), `${s.mastered} von ${s.total}`] : "–",
      s.total ? { chev: { text: s.total, open: () => onDetail(s.stage) } } : "–",
    ],
    keys: [s.stage, s.structure, s.status, s.processed, s.mastered, s.total],
  })), { breit: true });
}

// Je Buchstabe: aktuelle Stufe und Stand in allen sieben Stufen
export function buchstabenStufen(letters) {
  if (!letters.length) return h("p", { class: "muted" }, "Noch keine Buchstaben freigegeben.");
  // Ein zusammenhängender Balken je Buchstabe, jede Stufe gleich breit (1/7). Der Balken endet bei der letzten Stufe mit Silben, dahinter bleibt der Hintergrund sichtbar.
  // Grün = Stufe abgeschlossen; in der Stufe aktiv: dunkelblau = sicher, hellblau = Rest; weiß = noch nicht freigeschaltet. Die Stufenzahlen stehen einmalig in der Spaltenüberschrift.
  const N = 7;
  const balken = (l) => {
    let last = -1; l.stages.forEach((s, i) => { if (s.status !== "empty") last = i; });
    const fill = (s) => {   // grün = abgeschlossen; aktiv: von links sicher (dunkelblau), Rest der Stufe hellblau; noch nicht freigeschaltet: weiß
      if (s.status === "done") return "#7FB59A";
      const m = Math.round((s.mastered / (s.total || 1)) * 100), rest = s.status === "active" ? "#BFD1EC" : "#fff";
      return `linear-gradient(90deg,#4C72B0 0 ${m}%,${rest} ${m}% 100%)`;
    };
    const segs = l.stages.slice(0, last + 1).map((s, i) => h("span", { title: `Stufe ${i + 1}: ${s.status === "empty" ? STATUS_TXT.empty : `${s.mastered}/${s.total} sicher`}`, style: `flex:1 1 0;min-width:0;height:100%;background:${s.status === "empty" ? "#fff" : fill(s)};box-shadow:inset -1px 0 0 rgba(75,97,138,.18)` }));
    return h("div", { style: "width:100%;height:22px;border-radius:999px;background:#EEF2F9" },
      segs.length ? h("div", { style: `display:flex;width:${(segs.length / N) * 100}%;height:100%;overflow:hidden;border-radius:999px;border:1.5px solid #B9C9E2;box-sizing:border-box;background:#fff` }, segs) : null);
  };
  const kopf = h("div", {}, h("div", {}, "Fortschritt je Stufe"), h("div", { style: "display:flex;font-weight:400;font-size:.9em;margin-top:2px" }, Array.from({ length: N }, (_, i) => h("span", { style: "flex:1 1 0;text-align:center" }, String(i + 1)))));
  return h("div", {}, rahmenTabelle(["Buchstabe", kopf], letters.map((l) => ({
    cells: [h("strong", {}, l.letter.toUpperCase()), balken(l)],
    keys: [l.letter, l.current === null ? 99 : l.current],
  })), { badge: true, kompakt: true }));
}

// Buchstabe, mit dem die Silbe aktiv geschaltet wurde: der zuletzt freigegebene Buchstabe, der in der Silbe vorkommt (order = Buchstaben in Freigabereihenfolge).
const newest = (r, order) => { const ls = (r.letters || []).map((x) => x.toLowerCase()), idx = (x) => order.indexOf(x); const best = ls.filter((x) => idx(x) >= 0).sort((a, b) => idx(b) - idx(a))[0] ?? ls[ls.length - 1]; return best ? best.toUpperCase() : "–"; };
// Silbenstatistik: Silbe, Stufe/Unterkategorie, Ø Lesezeit, Abfragen, erfolgreiche Messungen, Status. filter: "alle" | "mastered" | "not_mastered" | "unrated" | "schwierig"
export function silbenTabelle(rows, min, order = []) {
  if (!rows.length) return h("p", { class: "muted" }, "Keine Silben.");
  return rahmenTabelle(["Silbe", "Stufe", "Buchstabe", "Ø-Zeit", "Abfra\u00ADgen", "Status"], rows.map((r) => ({
    cells: [
      h("strong", { class: "mono" }, sylText(r.parts)), `${r.stage}.`, newest(r, order), sec(r.avg), `${r.count}\u00A0x`,
      h("span", { class: "stage st-" + (r.status === "mastered" ? "done" : r.status === "not_mastered" ? "active" : "locked") }, r.locked ? "noch nicht freigeschaltet" : r.status === "unrated" && r.stored ? `unbewertet (${r.stored} von ${min})` : SYL_STATUS[r.status]),
    ],
    keys: [sylText(r.parts), r.stage, newest(r, order), r.avg ?? Infinity, r.count, r.status],
  })), { badge: true, passend: true });
}
export function filterRows(rows, f) {
  if (f === "schwierig") return rows.filter((r) => r.status === "not_mastered").sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  return f === "alle" ? rows : rows.filter((r) => r.status === f);
}
