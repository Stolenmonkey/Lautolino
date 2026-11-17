// Darstellung der Lernstufen und der Silbenstatistik (Lehrkräfte). Schlicht und sachlich; Zahlen kommen vom Server.
import { h, table } from "../dom.js";

export const STATUS_TXT = { done: "abgeschlossen", active: "wird geübt", locked: "noch gesperrt", empty: "keine Silben" };
export const SYL_STATUS = { mastered: "sicher beherrscht", not_mastered: "noch nicht sicher", unrated: "noch nicht bewertet" };
export const stageChip = (status, text) => h("span", { class: "stage st-" + status, title: STATUS_TXT[status] }, text ?? STATUS_TXT[status]);
export const sylText = (parts) => parts.join("-").toUpperCase();
const sec = (v) => (v === null || v === undefined ? "–" : v.toFixed(1).replace(".", ",") + " s");

// Gesamtstand je Stufe. onDetail(stage) lädt die Silben der Stufe.
export function stufenTabelle(stages, onDetail) {
  return h("div", { class: "tablewrap" }, table(["Stufe", "Aufbau", "Status", "Bearbeitet", "Sicher beherrscht", ""], stages.map((s) => [
    h("strong", {}, `${s.stage}. ${s.name}`), s.structure, stageChip(s.status),
    s.total ? `${s.processed} von ${s.total}` : "–",
    s.total ? [h("span", { class: "barbox" }, h("span", { class: "bar", style: `width:${Math.round((s.mastered / s.total) * 100)}%` })), `${s.mastered} von ${s.total}`] : "–",
    s.total ? h("button", { type: "button", onclick: () => onDetail(s.stage) }, "Silben ansehen") : "",
  ])));
}

// Je Buchstabe: aktuelle Stufe und Stand in allen sieben Stufen
export function buchstabenStufen(letters) {
  if (!letters.length) return h("p", { class: "muted" }, "Noch keine Buchstaben freigegeben.");
  return h("div", { class: "tablewrap" }, table(["Buchstabe", "Aktuelle Stufe", ...[1, 2, 3, 4, 5, 6, 7].map((n) => "Stufe " + n)], letters.map((l) => [
    h("strong", {}, l.letter.toUpperCase()), l.current === null ? "alle abgeschlossen" : `Stufe ${l.current}`,
    ...l.stages.map((s) => s.status === "empty" ? h("span", { class: "muted" }, "–") : stageChip(s.status, s.status === "locked" ? "gesperrt" : `${s.mastered}/${s.total}`)),
  ])));
}

// Silbenstatistik: Silbe, Stufe/Unterkategorie, Ø Lesezeit, Abfragen, erfolgreiche Messungen, Status. filter: "alle" | "mastered" | "not_mastered" | "unrated" | "schwierig"
export function silbenTabelle(rows, min) {
  if (!rows.length) return h("p", { class: "muted" }, "Keine Silben.");
  return h("div", { class: "tablewrap" }, table(["Silbe", "Stufe", "Ø Lesezeit", "Abfragen", "Innerhalb der Zeitvorgabe", "Status"], rows.map((r) => [
    h("strong", { class: "mono" }, sylText(r.parts)), `${r.sub} ${r.subName}${r.contrast ? " (auch Stufe 2)" : ""}`, sec(r.avg), r.count,
    r.limit === null || !r.stored ? "–" : `${r.successful} von ${r.stored} (Vorgabe ${String(r.limit).replace(".", ",")} s)`,
    h("span", { class: "stage st-" + (r.status === "mastered" ? "done" : r.status === "not_mastered" ? "active" : "locked") }, r.status === "unrated" && r.stored ? `noch nicht bewertet (${r.stored} von ${min})` : SYL_STATUS[r.status]),
  ])));
}
export function filterRows(rows, f) {
  if (f === "schwierig") return rows.filter((r) => r.status === "not_mastered").sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  return f === "alle" ? rows : rows.filter((r) => r.status === f);
}
