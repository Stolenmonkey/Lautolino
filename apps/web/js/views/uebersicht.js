// Klassenübersicht: Kinder in drei Gruppen (über-/durchschnittlich/unterdurchschnittlich) nach Quote sicher beherrschter Silben; Mittelfeld = mittlere x % der Kinder nach Rang (Slider in 5er-Schritten).
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
  const slider = h("input", { type: "range", min: 10, max: 100, step: 5, value: r.band, "aria-label": "Mittelfeld in Prozent der Klasse" }), val = h("strong", {}, `${r.band} %`);
  const rated = r.children.filter((k) => k.group !== "nodata"), minDist = rated.length ? Math.min(...rated.map((k) => Math.abs(k.rank - 50))) : 0;
  const render = (share) => {
    const thr = Math.max(share / 2, minDist), grp = (k) => k.group === "nodata" ? "nodata" : Math.abs(k.rank - 50) <= thr + 1e-9 ? "average" : k.rank > 50 ? "over" : "under";
    const mid = rated.filter((k) => grp(k) === "average").map((k) => k.percent);
    info.textContent = r.median === null ? "Noch keine Daten: Mittelfeld und Median folgen, sobald Kinder geübt haben."
      : `Mittelfeld: ${pct(Math.min(...mid))} bis ${pct(Math.max(...mid))}. Median ${pct(r.median)}.`;
    clear(out).append(...GROUPS.map(([key, title]) => {
      const kids = r.children.filter((k) => grp(k) === key);
      return h("section", { class: "kidgroup " + key }, h("h3", {}, `${title} (${kids.length})`), kids.length ? h("ul", { class: "kidlist" }, kids.map(childCard)) : h("p", { class: "muted" }, "–"));
    }));
  };
  slider.addEventListener("input", () => { val.textContent = `${slider.value} %`; render(Number(slider.value)); });
  slider.addEventListener("change", () => act(msg, async () => { await api.put(`/classes/${cid}/band`, { band: Number(slider.value) }); clear(msg); }));
  root.append(h("h2", {}, "Klassenübersicht"),
    h("p", { class: "muted" }, `Aktive Kinder in der Klasse: ${r.students}. Einstufung nach dem Anteil sicher beherrschter Silben an allen freigegebenen Silben des Kindes, nach Rang in der Klasse.`),
    h("div", { class: "row" }, h("label", {}, "Mittelfeld ", slider, " ", val, " der Klasse")), info, out);
  render(r.band);
  root.append(h("details", {}, h("summary", {}, "Übersicht je Buchstabe"),
    r.letters.length ? h("div", { class: "tablewrap" }, table(["Buchstabe", "Kinder", "Erreicht (geübt)", "Bronze oder besser", "Silber oder besser", "Gold (sicher beherrscht)"], r.letters.map((l) => [
      h("strong", {}, l.letter.toUpperCase()), l.students,
      [bar(l.reachedPercent), `${pct(l.reachedPercent)} (${l.reached})`], [bar(l.bronzePercent), `${pct(l.bronzePercent)} (${l.bronze})`], [bar(l.silberPercent), `${pct(l.silberPercent)} (${l.silber})`], [bar(l.goldPercent), `${pct(l.goldPercent)} (${l.gold})`],
    ]))) : h("p", { class: "muted" }, "Noch kein Buchstabe freigegeben."),
    h("p", { class: "muted" }, "Erreicht = das Kind hat den Buchstaben in einer Runde geübt. Bronze, Silber, Gold = vergebene Auszeichnung nach den unveränderten Prozentgrenzen der Konfiguration.")));
}
