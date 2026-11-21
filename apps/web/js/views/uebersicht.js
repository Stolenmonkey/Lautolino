// Klassenübersicht: Kinder in drei Gruppen (über-/durchschnittlich/unterdurchschnittlich) nach Quote sicher beherrschter Silben; Mittelfeld = mittlere x % der Kinder nach Rang (Slider in 5er-Schritten).
// Darunter: Tabelle je Buchstabe mit Prozent der aktiven Kinder, die mindestens Bronze, Silber bzw. Gold erreicht haben.
import { h, table, act, clear } from "../dom.js";
import { selectStudent } from "./auswertung.js";

const pct = (v) => String(v).replace(".", ",") + " %";

const GROUPS = [
  ["over", "Überdurchschnittlich"], ["average", "Durchschnittlich"], ["under", "Unterdurchschnittlich"], ["nodata", "Keine Daten"],
];

function childCard(k) {
  return h("li", { class: "kidcard" }, h("strong", {}, h("a", { href: "#", class: "kidlink", title: "Auswertung öffnen", onclick: (e) => { e.preventDefault(); selectStudent(k.id); document.dispatchEvent(new CustomEvent("silbenflug:tab", { detail: "auswertung" })); } }, k.name)), h("span", { class: "kidstats" + (k.percent === null ? " muted" : "") }, k.percent === null ? "noch nichts geübt" : `${pct(k.percent)} (${k.mastered} von ${k.total}) · ${k.rounds} ${k.rounds === 1 ? "Runde" : "Runden"}`));
}

export async function uebersicht(root, api, cid, classes, msg, slot) {
  const r = await api.get(`/classes/${cid}/overview`);
  const out = h("div");
  const slider = h("input", { type: "range", min: 10, max: 100, step: 5, value: r.band, "aria-label": "Mittelfeld in Prozent der Klasse" }), val = h("strong", {}, `${r.band} %`);
  const rated = r.children.filter((k) => k.group !== "nodata"), minDist = rated.length ? Math.min(...rated.map((k) => Math.abs(k.rank - 50))) : 0;
  const render = (share) => {
    const thr = Math.max(share / 2, minDist), grp = (k) => k.group === "nodata" ? "nodata" : Math.abs(k.rank - 50) <= thr + 1e-9 ? "average" : k.rank > 50 ? "over" : "under";
    clear(out).append(...GROUPS.map(([key, title]) => {
      const kids = r.children.filter((k) => grp(k) === key);
      return h("section", { class: "kidgroup " + key }, h("h3", {}, `${title} (${kids.length})`), kids.length ? h("ul", { class: "kidlist" }, kids.map(childCard)) : h("p", { class: "muted" }, "–"));
    }));
  };
  slider.addEventListener("input", () => { val.textContent = `${slider.value} %`; render(Number(slider.value)); });
  slider.addEventListener("change", () => act(msg, async () => { await api.put(`/classes/${cid}/band`, { band: Number(slider.value) }); clear(msg); }));
  if (slot) slot.append(h("span", { class: "muted" }, ` Aktive Kinder: ${r.students}`));
  root.append(h("h2", {}, "Klassenübersicht"), out);
  render(r.band);
  root.append(h("h3", {}, "Übersicht je Buchstabe"),
    r.letters.length ? h("div", { class: "tablewrap" }, table(["Buchstabe", "Bronze", "Silber", "Gold"], r.letters.map((l) => [
      h("strong", {}, l.letter.toUpperCase()), pct(l.bronzePercent), pct(l.silberPercent), pct(l.goldPercent),
    ]), { plain: true })) : h("p", { class: "muted" }, "Noch kein Buchstabe freigegeben."),
    h("p", { class: "muted" }, "Anteil der aktiven Kinder, die mindestens diese Stufe erreicht haben (Gold zählt auch bei Silber und Bronze)."));
  root.append(h("div", { class: "row" }, h("label", {}, "Mittelfeld ", slider, " ", val, " der Klasse")));
}
