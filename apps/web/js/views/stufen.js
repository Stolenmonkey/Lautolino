// Darstellung der Lernstufen und der Silbenstatistik (Lehrkräfte). Schlicht und sachlich; Zahlen kommen vom Server.
import { h, clear, notice } from "../dom.js";

export const STATUS_TXT = { done: "abgeschlossen", active: "wird geübt", locked: "noch nicht dran", skipped: "übersprungen (Silben bereits sicher)", empty: "keine Silben" };
export const SYL_STATUS = { mastered: "sicher beherrscht", not_mastered: "noch nicht sicher", unrated: "noch nicht bewertet" };
export const stageChip = (status, text) => h("span", { class: "stage st-" + (status === "skipped" ? "locked" : status), title: STATUS_TXT[status] }, text ?? STATUS_TXT[status]);
const up = (a) => a.map((x) => x.toUpperCase()).join(", ");
const gesamtStatus = (s) => s.status === "active" && s.unlocked ? stageChip("active", `aktiv (${s.unlocked} Silben freigeschaltet)`) : s.status === "active" && s.activeLetters?.length ? stageChip("active", "aktiv für: " + up(s.activeLetters)) : s.status === "locked" && s.mastered > 0 ? stageChip("skipped", `übersprungen (${s.mastered}/${s.total} sicher)`) : stageChip(s.status);
export const sylText = (parts) => parts.join("-").toUpperCase();
const sec = (v) => (v === null || v === undefined ? "–" : v.toFixed(1).replace(".", ",") + " s");

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
  return h("div", { class: "tablewrap tableframe" + (opts.breit ? " breit" : "") }, h("table", { class: "plain freigaben kompakt" + (opts.badge ? " badge" : "") + (opts.kompakt ? " klein" : "") + (opts.breit ? " breit" : "") }, h("thead", {}, h("tr", {}, ths)), tbody));
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
  // Kompakt: Spaltenkopf nur die Stufenzahl, Zellen nur „sicher/gesamt“ (Farbe = Status, Tooltip = Klartext)
  const cell = (s) => s.status === "empty" ? h("span", { class: "muted", title: STATUS_TXT.empty }, "–")
    : s.status === "locked" && !s.mastered ? h("span", { class: "muted", title: STATUS_TXT.locked }, "○")
    : stageChip(s.status, `${s.mastered}/${s.total}`);
  return h("div", {}, rahmenTabelle(["Buchstabe", "Aktuell", ...[1, 2, 3, 4, 5, 6, 7].map((n) => "St. " + n)], letters.map((l) => ({
    cells: [h("strong", {}, l.letter.toUpperCase()), l.current === null ? "fertig" : `St. ${l.current}`, ...l.stages.map(cell)],
    keys: [l.letter, l.current === null ? 99 : l.current],
  })), { badge: true, kompakt: true }),
  h("p", { class: "muted" }, "Zahlen = sicher beherrschte von allen Silben der Stufe. Blau: wird geübt, grün: abgeschlossen, grau: übersprungen, ○ noch nicht dran, – keine Silben."));
}

// Silbenstatistik: Silbe, Stufe/Unterkategorie, Ø Lesezeit, Abfragen, erfolgreiche Messungen, Status. filter: "alle" | "mastered" | "not_mastered" | "unrated" | "schwierig"
export function silbenTabelle(rows, min) {
  if (!rows.length) return h("p", { class: "muted" }, "Keine Silben.");
  return rahmenTabelle(["Silbe", "Stufe", "Ø Lesezeit", "Abfragen", "Innerhalb der Zeitvorgabe", "Status"], rows.map((r) => ({
    cells: [
      h("strong", { class: "mono" }, sylText(r.parts)), `${r.sub} ${r.subName}${r.contrast ? " (auch Stufe 2)" : ""}`, sec(r.avg), r.count,
      r.limit === null || !r.stored ? "–" : `${r.successful} von ${r.stored} (Vorgabe ${String(r.limit).replace(".", ",")} s)`,
      h("span", { class: "stage st-" + (r.status === "mastered" ? "done" : r.status === "not_mastered" ? "active" : "locked") }, r.locked ? "noch nicht freigeschaltet" : r.status === "unrated" && r.stored ? `noch nicht bewertet (${r.stored} von ${min})` : SYL_STATUS[r.status]),
    ],
    keys: [sylText(r.parts), r.sub, r.avg ?? Infinity, r.count, r.successful ?? -1, r.status],
  })), { badge: true, breit: true });
}
export function filterRows(rows, f) {
  if (f === "schwierig") return rows.filter((r) => r.status === "not_mastered").sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  return f === "alle" ? rows : rows.filter((r) => r.status === f);
}
