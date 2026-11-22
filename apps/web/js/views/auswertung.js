// Lehrer-Auswertung: Stufenbalken je Buchstabe, aktive Silben, Silbenstatistik; Druckblatt „Silben-Zug“.
import { h, clear, notice, act } from "../dom.js";
import { buchstabenStufen, silbenTabelle, filterRows } from "./stufen.js";

const state = { studentId: null };
export const selectStudent = (id) => { state.studentId = id; };   // z. B. aus der Klassenübersicht
const today = () => new Date().toLocaleDateString("de-DE");
// Speichern der PDF-Datei; in Tests austauschbar
export const hooks = { save: null };
async function savePdf(bytes, name) { const m = await import("../zug.bundle.js"); (hooks.save || m.downloadPdf)(bytes, name); }
async function pdfFor(api, kids) {
  const m = await import("../zug.bundle.js"), sheets = [], skipped = [];
  for (const k of kids) {
    try { const t = await api.get(`/students/${k.id}/syllable-train`); sheets.push({ name: t.student.name, letters: t.letters, syllables: t.syllables, shown: t.shown, date: today() }); }
    catch (e) { if (e.status === 409) skipped.push(k.display_name); else throw e; }
  }
  return { sheets, skipped, bytes: sheets.length ? m.buildZugPdf(sheets) : null };
}

// Karte im Stil des Buchstaben-Tabs: Überschrift mit Symbol, darunter Tabellen im Rahmen.
const karte = (titel, ...inhalt) => h("section", { class: "card freigaben-card" }, h("div", { class: "sechead" }, h("h2", { class: "small" }, titel)), ...inhalt);
// Aktionskarte (wie „Nächster Buchstabe“): Text links, Schaltfläche rechts.
const druckKarte = (titel, text, hinweis, button) => h("section", { class: "card nextcard druckcard" }, h("h2", {}, titel), h("div", { class: "nextbody" }, h("div", { class: "nexttext" }, h("strong", {}, text), h("span", {}, hinweis)), button));

export async function auswertung(root, api, cid, classes, msg, slot) {
  const kids = (await api.get(`/classes/${cid}/students`)).filter((k) => k.active), detail = h("div");
  if (!kids.some((k) => k.id === state.studentId)) state.studentId = null;
  const sel = h("select", { "aria-label": "Schüler", onchange: () => { state.studentId = sel.value || null; clear(detail); const k = kids.find((x) => x.id === state.studentId); if (k) kind(detail, api, k, msg); } },
    [h("option", { value: "" }, "– Kind wählen –"), ...kids.map((k) => h("option", { value: k.id, selected: k.id === state.studentId }, k.display_name))]);
  const picker = h("label", {}, "Schüler ", sel);
  if (slot) clear(slot).append(picker); else root.append(picker);
  root.append(...(kids.length ? [] : [karte("Statistik", h("p", { class: "muted" }, "Noch keine aktiven Kinder in dieser Klasse."))]), detail);
  const kid = kids.find((k) => k.id === state.studentId);
  if (kid) await kind(detail, api, kid, msg);
}

async function kind(root, api, kid, msg) {
  const ev = await api.get(`/students/${kid.id}/evaluation`);
  const print = h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
    const r = await pdfFor(api, [kid]); if (!r.bytes) { clear(msg).append(notice("Mit den freigegebenen Buchstaben gibt es noch zu wenige Silben.", "error")); return; }
    await savePdf(r.bytes, "silben-zug-" + (kid.display_name || "kind").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf");
  }) }, "Silben-Zug drucken (PDF)");
  root.append(
    karte("Buchstaben und Lernstufen", buchstabenStufen(ev.letters)),
    druckKarte(kid.display_name, "Silben-Zug dieses Kindes", "Persönliches Übungsblatt als PDF.", print),
    ...stufenBereich(ev));
}

// Silbenstatistik eines Kindes
function stufenBereich(ev) {
  const list = h("div"), filt = h("select", { "aria-label": "Silben filtern" }, [["alle", "Alle trainierten Silben"], ["mastered", "Sicher beherrscht"], ["not_mastered", "Noch nicht sicher beherrscht"], ["unrated", "Noch nicht bewertet"], ["schwierig", "Schwierigkeiten (langsamste zuerst)"]].map(([v, t]) => h("option", { value: v }, t)));
  const draw = () => { clear(list).append(silbenTabelle(filterRows(ev.syllables, filt.value), ev.minMeasurements, ev.letters.map((l) => l.letter))); };
  filt.addEventListener("change", draw); draw();
  return [
    karte("Silben", h("p", { class: "muted" }, `Sicher beherrscht heißt: mindestens ${ev.minMeasurements} Messungen und Durchschnitt innerhalb der Zeitvorgabe (unverändert). Abfragen = alle bisherigen Messungen.`),
      h("div", { class: "row" }, filt), list),
  ];
}
