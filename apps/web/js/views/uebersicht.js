// Klassenübersicht: Kinder in drei Gruppen (über-/durchschnittlich/unterdurchschnittlich) nach Quote sicher beherrschter Silben, relativ zum Klassenmedian ± einstellbares Band.
// Darunter (eingeklappt): je Buchstabe, wie viel Prozent der Kinder den Buchstaben erreicht haben und wie viele Bronze, Silber, Gold erreicht haben.
import { h, table, act, clear } from "../dom.js";

const pct = (v) => String(v).replace(".", ",") + " %";
const bar = (v) => h("span", { class: "barbox", title: pct(v) }, h("span", { class: "bar", style: `width:${Math.min(100, v)}%` }));

const GROUPS = [
  ["over", "Überdurchschnittlich"], ["average", "Durchschnittlich"], ["under", "Unterdurchschnittlich"], ["nodata", "Keine Daten"],
];

function childCard(k) {
  return h("li", { class: "kidcard" }, h("strong", {}, k.name), " ", k.percent === null ? h("span", { class: "muted" }, "noch nichts geübt") : [bar(k.percent), `${pct(k.percent)} (${k.mastered} von ${k.total})`]);
}

export async function uebersicht(root, api, cid, classes, msg) {
  const r = await api.get(`/classes/${cid}/overview`);
  const out = h("div"), info = h("p", { class: "muted" });
  const slider = h("input", { type: "range", min: 5, max: 50, step: 1, value: r.band, "aria-label": "Band in Prozentpunkten" }), val = h("strong", {}, `±${r.band}`);
  const render = (band) => {
    const med = r.median, lo = med === null ? null : med - band, hi = med === null ? null : med + band;
    info.textContent = med === null ? "Noch keine Daten: Median und Grenzen folgen, sobald Kinder geübt haben."
      : `Median ${pct(med)}. Durchschnittlich: ${pct(Math.round(Math.max(0, lo) * 10) / 10)} bis ${pct(Math.round(Math.min(100, hi) * 10) / 10)}.`;
    clear(out).append(...GROUPS.map(([key, title]) => {
      const kids = r.children.filter((k) => (k.group === "nodata" ? "nodata" : bandOf(k, med, band)) === key);
      return h("section", { class: "kidgroup " + key }, h("h3", {}, `${title} (${kids.length})`), kids.length ? h("ul", { class: "kidlist" }, kids.map(childCard)) : h("p", { class: "muted" }, "–"));
    }));
  };
  slider.addEventListener("input", () => { val.textContent = `±${slider.value}`; render(Number(slider.value)); });
  slider.addEventListener("change", () => act(msg, async () => { await api.put(`/classes/${cid}/band`, { band: Number(slider.value) }); clear(msg); }));
  root.append(h("h2", {}, "Klassenübersicht"),
    h("p", { class: "muted" }, `Aktive Kinder in der Klasse: ${r.students}. Einstufung nach dem Anteil sicher beherrschter Silben an allen freigegebenen Silben des Kindes, im Vergleich zum Klassenmedian.`),
    h("div", { class: "row" }, h("label", {}, "Band ", slider, " ", val, " Prozentpunkte")), info, out);
  render(r.band);
  root.append(h("details", {}, h("summary", {}, "Übersicht je Buchstabe"),
    r.letters.length ? h("div", { class: "tablewrap" }, table(["Buchstabe", "Kinder", "Erreicht (geübt)", "Bronze oder besser", "Silber oder besser", "Gold (sicher beherrscht)"], r.letters.map((l) => [
      h("strong", {}, l.letter.toUpperCase()), l.students,
      [bar(l.reachedPercent), `${pct(l.reachedPercent)} (${l.reached})`], [bar(l.bronzePercent), `${pct(l.bronzePercent)} (${l.bronze})`], [bar(l.silberPercent), `${pct(l.silberPercent)} (${l.silber})`], [bar(l.goldPercent), `${pct(l.goldPercent)} (${l.gold})`],
    ]))) : h("p", { class: "muted" }, "Noch kein Buchstabe freigegeben."),
    h("p", { class: "muted" }, "Erreicht = das Kind hat den Buchstaben in einer Runde geübt. Bronze, Silber, Gold = vergebene Auszeichnung nach den unveränderten Prozentgrenzen der Konfiguration.")));
}

// Gleiche Regel wie auf dem Server (Grenzen zählen als durchschnittlich), damit der Slider sofort wirkt.
function bandOf(k, med, band) { const eps = 1e-9; return k.percent > med + band + eps ? "over" : k.percent < med - band - eps ? "under" : "average"; }
