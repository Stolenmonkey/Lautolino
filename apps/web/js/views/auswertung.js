// Lehrer-Auswertung: Buchstabenstand, Zeitverlauf mit Markierung neuer Buchstaben und Auszeichnungen; Druckblatt „Silben-Zug“.
import { h, clear, table, notice, act, fmtDate } from "../dom.js";
import { zeitverlaufSvg, svgNode, levelName } from "../chart.js";
import { stufenTabelle, buchstabenStufen, silbenTabelle, filterRows } from "./stufen.js";

const state = { studentId: null };
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

export async function auswertung(root, api, cid, classes, msg) {
  const kids = await api.get(`/classes/${cid}/students`), detail = h("div");
  const printAll = h("button", { type: "button", onclick: () => act(msg, async () => {
    const r = await pdfFor(api, kids.filter((k) => k.active));
    if (!r.bytes) { clear(msg).append(notice("Für diese Klasse gibt es noch nichts zu drucken (Buchstaben freigeben).", "error")); return; }
    await savePdf(r.bytes, "silben-zug-klasse.pdf");
    clear(msg).append(notice(`${r.sheets.length} Blätter erzeugt.` + (r.skipped.length ? ` Ohne Blatt (zu wenige Silben): ${r.skipped.join(", ")}.` : ""), "ok"));
  }) }, "Silben-Züge für alle Kinder (PDF)");
  root.append(h("h2", {}, "Auswertung"), kids.length ? h("div", { class: "row" }, kids.map((k) => h("button", { type: "button", class: "kid", "aria-pressed": k.id === state.studentId, onclick: () => { state.studentId = k.id; auswertung(clear(root), api, cid, classes, msg); } }, k.display_name)), printAll) : h("p", { class: "muted" }, "Noch keine Kinder in dieser Klasse."), detail);
  const kid = kids.find((k) => k.id === state.studentId);
  if (kid) await kind(detail, api, kid, msg);
}

async function kind(root, api, kid, msg) {
  const [progress, rr, conf, ev] = await Promise.all([api.get(`/students/${kid.id}/progress`), api.get(`/students/${kid.id}/rounds`), api.get("/config"), api.get(`/students/${kid.id}/evaluation`)]);
  const target = conf && conf.config && conf.config.auto ? conf.config.auto.target_seconds : null, rounds = rr.rounds.slice(-100);
  root.append(h("h3", {}, kid.display_name),
    h("div", { class: "row" }, h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
      const r = await pdfFor(api, [kid]); if (!r.bytes) { clear(msg).append(notice("Mit den freigegebenen Buchstaben gibt es noch zu wenige Silben.", "error")); return; }
      await savePdf(r.bytes, "silben-zug-" + (kid.display_name || "kind").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf");
    }) }, "Silben-Zug drucken (PDF)")),
    h("h4", {}, "Buchstaben"),
    progress.length ? table(["Buchstabe", "Stufe", "Sicher beherrscht", "Noch ohne Bewertung"], progress.map((p) => [h("strong", {}, p.letter.toUpperCase()), levelName(p.level), `${p.mastered} von ${p.total} (${Math.round(p.percent)} %)`, p.unrated])) : h("p", { class: "muted" }, "Noch keine Buchstaben freigegeben."),
    h("p", { class: "muted" }, "Die Einstufung ist zeitbasiert und kein Nachweis der Lesekorrektheit."),
    ...stufenBereich(api, kid, ev),
    h("h4", {}, "Zeitverlauf"));
  if (!rounds.length) { root.append(h("p", { class: "muted" }, "Noch keine Runde gespielt.")); return; }
  root.append(h("div", { class: "chartbox" }, svgNode(zeitverlaufSvg(rounds, rr.markers, rr.awards, target))),
    h("p", { class: "muted" }, `Sekunden je Runde (letzte ${rounds.length}). Gestrichelte Linie mit „neu“: erste Runde mit einem neu freigegebenen Buchstaben. Punkte unter der Achse: neue Auszeichnungen.`),
    h("h4", {}, "Runden"), table(["Nr.", "Datum", "Zeit", "Buchstaben"], rounds.slice().reverse().map((r, i) => [rounds.length - i, fmtDate(r.played_at), `${Math.round(r.seconds)} s`, (r.letters || "").toString().toUpperCase().replace(/[^A-Z]/g, " ").trim()])));
}

// Lernstufen, Buchstaben je Stufe und Silbenstatistik eines Kindes
function stufenBereich(api, kid, ev) {
  const detail = h("div"), list = h("div"), filt = h("select", { "aria-label": "Silben filtern" }, [["alle", "Alle trainierten Silben"], ["mastered", "Sicher beherrscht"], ["not_mastered", "Noch nicht sicher beherrscht"], ["unrated", "Noch nicht bewertet"], ["schwierig", "Schwierigkeiten (langsamste zuerst)"]].map(([v, t]) => h("option", { value: v }, t)));
  const draw = () => { clear(list).append(silbenTabelle(filterRows(ev.syllables, filt.value), ev.minMeasurements)); };
  filt.addEventListener("change", draw); draw();
  const open = async (n) => {
    try {
      const r = await api.get(`/students/${kid.id}/stages/${n}`);
      clear(detail).append(h("div", { class: "card" }, h("strong", {}, `Stufe ${n}: ${r.name} (${r.total} Silben)`), r.truncated ? h("p", { class: "muted" }, "Es werden die ersten 1500 Silben gezeigt.") : null, silbenTabelle(r.syllables, ev.minMeasurements)));
    } catch (e) { clear(detail).append(notice(e.message, "error")); }
  };
  return [
    h("h4", {}, "Lernstufen"),
    stufenTabelle(ev.stages, open),
    ev.enabled ? h("p", { class: "muted" }, `Jede Silbe wird einzeln freigeschaltet: sobald mindestens ${ev.gatePercent} % der leichteren Silben aus ihren Buchstaben sicher sind. Pro Runde: ${ev.mix.fresh} % neue und angefangene, ${ev.mix.weak} % noch nicht sichere und ${ev.mix.review} % sicher beherrschte Silben (Wiederholung).`) : h("p", { class: "muted" }, "Die Silbenauswahl nach Lernstufen ist derzeit nicht aktiv (Konfiguration)."),
    detail,
    h("h4", {}, "Buchstaben und Lernstufen"), buchstabenStufen(ev.letters),
    h("h4", {}, "Silben"), h("p", { class: "muted" }, `Sicher beherrscht heißt: mindestens ${ev.minMeasurements} Messungen und Durchschnitt innerhalb der Zeitvorgabe (unverändert). Abfragen = alle bisherigen Messungen; „innerhalb der Zeitvorgabe“ zählt nur die noch gespeicherten letzten Messwerte.`),
    h("div", { class: "row" }, filt), list,
  ];
}
