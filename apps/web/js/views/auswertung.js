// Lehrer-Auswertung: Buchstabenstand, Zeitverlauf mit Markierung neuer Buchstaben und Auszeichnungen; Druckblatt „Silben-Zug“.
import { h, clear, notice, act, fmtDate } from "../dom.js";
import { zeitverlaufSvg, svgNode, levelName } from "../chart.js";
import { rahmenTabelle, stufenTabelle, buchstabenStufen, silbenTabelle, filterRows } from "./stufen.js";

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
  const [progress, rr, conf, ev] = await Promise.all([api.get(`/students/${kid.id}/progress`), api.get(`/students/${kid.id}/rounds`), api.get("/config"), api.get(`/students/${kid.id}/evaluation`)]);
  const target = conf && conf.config && conf.config.auto ? conf.config.auto.target_seconds : null, rounds = rr.rounds.slice(-100);
  const print = h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
    const r = await pdfFor(api, [kid]); if (!r.bytes) { clear(msg).append(notice("Mit den freigegebenen Buchstaben gibt es noch zu wenige Silben.", "error")); return; }
    await savePdf(r.bytes, "silben-zug-" + (kid.display_name || "kind").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf");
  }) }, "Silben-Zug drucken (PDF)");
  root.append(
    karte("Buchstaben und Lernstufen", buchstabenStufen(ev.letters)),
    druckKarte(kid.display_name, "Silben-Zug dieses Kindes", "Persönliches Übungsblatt als PDF.", print),
    karte(`Aktive Silben (${ev.active.length})`, h("p", { class: "muted" }, "Freigeschaltete, noch nicht sicher beherrschte Silben – diese übt das Kind gerade."),
      ev.enabled ? silbenTabelle(ev.active, ev.minMeasurements) : h("p", { class: "muted" }, "Die Silbenauswahl nach Lernstufen ist derzeit nicht aktiv.")),
    karte("Buchstaben", progress.length ? rahmenTabelle(["Buchstabe", "Stufe", "Sicher beherrscht", "Noch ohne Bewertung"], progress.map((p) => ({
      cells: [h("strong", {}, p.letter.toUpperCase()), levelName(p.level), `${p.mastered} von ${p.total} (${Math.round(p.percent)} %)`, p.unrated],
      keys: [p.letter, p.level, p.percent, p.unrated],
    })), { badge: true }) : h("p", { class: "muted" }, "Noch keine Buchstaben freigegeben."),
      h("p", { class: "muted" }, "Die Einstufung ist zeitbasiert und kein Nachweis der Lesekorrektheit.")),
    ...stufenBereich(api, kid, ev));
  const verlauf = rounds.length
    ? [h("div", { class: "chartbox" }, svgNode(zeitverlaufSvg(rounds, rr.markers, rr.awards, target))),
      h("p", { class: "muted" }, `Sekunden je Runde (letzte ${rounds.length}). Gestrichelte Linie mit „neu“: erste Runde mit einem neu freigegebenen Buchstaben. Punkte unter der Achse: neue Auszeichnungen.`),
      h("h3", { class: "unter" }, "Runden"),
      rahmenTabelle(["Nr.", "Datum", "Zeit", "Buchstaben"], rounds.slice().reverse().map((r, i) => ({
        cells: [rounds.length - i, fmtDate(r.played_at), `${Math.round(r.seconds)} s`, (r.letters || "").toString().toUpperCase().replace(/[^A-Z]/g, " ").trim()],
        keys: [rounds.length - i, r.played_at || "", r.seconds, (r.letters || "").toString()],
      })), { badge: true })]
    : [h("p", { class: "muted" }, "Noch keine Runde gespielt.")];
  root.append(karte("Zeitverlauf", ...verlauf));
}

// Lernstufen, Buchstaben je Stufe und Silbenstatistik eines Kindes
function stufenBereich(api, kid, ev) {
  const list = h("div"), filt = h("select", { "aria-label": "Silben filtern" }, [["alle", "Alle trainierten Silben"], ["mastered", "Sicher beherrscht"], ["not_mastered", "Noch nicht sicher beherrscht"], ["unrated", "Noch nicht bewertet"], ["schwierig", "Schwierigkeiten (langsamste zuerst)"]].map(([v, t]) => h("option", { value: v }, t)));
  const draw = () => { clear(list).append(silbenTabelle(filterRows(ev.syllables, filt.value), ev.minMeasurements)); };
  filt.addEventListener("change", draw); draw();
  const open = async (n) => {
    const r = await api.get(`/students/${kid.id}/stages/${n}`);
    return h("div", { class: "stufenliste" }, h("div", { class: "stufe" }, h("strong", {}, `Stufe ${n}: ${r.name} (${r.total} Silben)`), r.truncated ? h("p", { class: "muted" }, "Es werden die ersten 1500 Silben gezeigt.") : null, silbenTabelle(r.syllables, ev.minMeasurements)));
  };
  return [
    karte("Lernstufen", stufenTabelle(ev.stages, open),
      ev.enabled ? h("p", { class: "muted" }, `Jede Silbe wird einzeln freigeschaltet: sobald mindestens ${ev.gatePercent} % der leichteren Silben aus ihren Buchstaben sicher sind. Pro Runde: ${ev.mix.fresh} % neue und angefangene, ${ev.mix.weak} % noch nicht sichere und ${ev.mix.review} % sicher beherrschte Silben (Wiederholung).`) : h("p", { class: "muted" }, "Die Silbenauswahl nach Lernstufen ist derzeit nicht aktiv (Konfiguration).")),
    karte("Silben", h("p", { class: "muted" }, `Sicher beherrscht heißt: mindestens ${ev.minMeasurements} Messungen und Durchschnitt innerhalb der Zeitvorgabe (unverändert). Abfragen = alle bisherigen Messungen; „innerhalb der Zeitvorgabe“ zählt nur die noch gespeicherten letzten Messwerte.`),
      h("div", { class: "row" }, filt), list),
  ];
}
