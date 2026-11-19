// Darstellung der Lernstufen und der Silbenstatistik (Lehrkräfte). Schlicht und sachlich; Zahlen kommen vom Server.
import { h, table } from "../dom.js";

export const STATUS_TXT = { done: "abgeschlossen", active: "wird geübt", locked: "noch nicht dran", skipped: "übersprungen (Silben bereits sicher)", empty: "keine Silben" };
export const SYL_STATUS = { mastered: "sicher beherrscht", not_mastered: "noch nicht sicher", unrated: "noch nicht bewertet" };
export const stageChip = (status, text) => h("span", { class: "stage st-" + (status === "skipped" ? "locked" : status), title: STATUS_TXT[status] }, text ?? STATUS_TXT[status]);
const up = (a) => a.map((x) => x.toUpperCase()).join(", ");
const gesamtStatus = (s) => s.status === "active" && s.unlocked ? stageChip("active", `aktiv (${s.unlocked} Silben freigeschaltet)`) : s.status === "active" && s.activeLetters?.length ? stageChip("active", "aktiv für: " + up(s.activeLetters)) : s.status === "locked" && s.mastered > 0 ? stageChip("skipped", `übersprungen (${s.mastered}/${s.total} sicher)`) : stageChip(s.status);
export const sylText = (parts) => parts.join("-").toUpperCase();
const sec = (v) => (v === null || v === undefined ? "–" : v.toFixed(1).replace(".", ",") + " s");

// Gesamtstand je Stufe. onDetail(stage) lädt die Silben der Stufe.
export function stufenTabelle(stages, onDetail) {
  return h("div", { class: "tablewrap" }, table(["Stufe", "Aufbau", "Status", "Bearbeitet", "Sicher beherrscht", ""], stages.map((s) => [
    h("strong", {}, `${s.stage}. ${s.name}`), s.structure, gesamtStatus(s),
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
    ...l.stages.map((s) => s.status === "empty" ? h("span", { class: "muted" }, "–") : s.status === "locked" ? (s.mastered > 0 ? stageChip("skipped", `übersprungen (${s.mastered}/${s.total})`) : stageChip("locked", "noch nicht dran")) : stageChip(s.status, s.status === "active" ? `aktiv ${s.mastered}/${s.total}` : `${s.mastered}/${s.total}`)),
  ]), { wide: true }));
}

// Silbenstatistik: Silbe, Stufe/Unterkategorie, Ø Lesezeit, Abfragen, erfolgreiche Messungen, Status. filter: "alle" | "mastered" | "not_mastered" | "unrated" | "schwierig"
export function silbenTabelle(rows, min) {
  if (!rows.length) return h("p", { class: "muted" }, "Keine Silben.");
  return h("div", { class: "tablewrap" }, table(["Silbe", "Stufe", "Ø Lesezeit", "Abfragen", "Innerhalb der Zeitvorgabe", "Status"], rows.map((r) => [
    h("strong", { class: "mono" }, sylText(r.parts)), `${r.sub} ${r.subName}${r.contrast ? " (auch Stufe 2)" : ""}`, sec(r.avg), r.count,
    r.limit === null || !r.stored ? "–" : `${r.successful} von ${r.stored} (Vorgabe ${String(r.limit).replace(".", ",")} s)`,
    h("span", { class: "stage st-" + (r.status === "mastered" ? "done" : r.status === "not_mastered" ? "active" : "locked") }, r.locked ? "noch nicht freigeschaltet" : r.status === "unrated" && r.stored ? `noch nicht bewertet (${r.stored} von ${min})` : SYL_STATUS[r.status]),
  ]), { wide: true }));
}
export function filterRows(rows, f) {
  if (f === "schwierig") return rows.filter((r) => r.status === "not_mastered").sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  return f === "alle" ? rows : rows.filter((r) => r.status === f);
}
