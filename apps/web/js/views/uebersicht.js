// Klassenübersicht: Kinder in drei Gruppen (über-/durchschnittlich/unterdurchschnittlich) nach Quote sicher beherrschter Silben; Mittelfeld = mittlere x % der Kinder nach Rang (Slider in 5er-Schritten).
// Darunter: Tabelle je Buchstabe mit Prozent der aktiven Kinder, die mindestens Bronze, Silber bzw. Gold erreicht haben.
import { h, table, act, clear } from "../dom.js";
import { selectStudent } from "./auswertung.js";

const pct = (v) => String(v).replace(".", ",") + " %";

const GROUPS = [
  ["over", "Überdurchschnittlich"], ["average", "Durchschnittlich"], ["under", "Unterdurchschnittlich"], ["nodata", "Keine Daten"],
];

function childCard(k) {
  const go = (e) => { e.preventDefault(); selectStudent(k.id); document.dispatchEvent(new CustomEvent("silbenflug:tab", { detail: "auswertung" })); };
  const none = k.percent === null;
  return h("li", { class: "kidcard" },
    h("div", { class: "kidtop" }, h("strong", {}, h("a", { href: "#", class: "kidlink", title: "Auswertung öffnen", onclick: go }, k.name)), none ? h("span", { class: "muted" }, "noch nichts geübt") : h("span", { class: "pill" }, `${k.rounds} ${k.rounds === 1 ? "Runde" : "Runden"}`)),
    none ? null : h("div", { class: "kidbot" }, h("span", { class: "kidstats" }, h("strong", {}, pct(k.percent)), ` · ${k.mastered} von ${k.total}`), h("span", { class: "meter" }, h("span", { style: `width:${Math.min(100, k.percent)}%` }))));
}

export async function uebersicht(root, api, cid, classes, msg, slot) {
  const r = await api.get(`/classes/${cid}/overview`);
  const out = h("div");
  const slider = h("input", { type: "range", min: 10, max: 90, step: 5, value: Math.min(90, r.band), "aria-label": "Mittelfeld in Prozent der Klasse" }), val = h("span", { class: "pill blue" }, `${Math.min(90, r.band)} % der Klasse`);
  const rated = r.children.filter((k) => k.group !== "nodata"), minDist = rated.length ? Math.min(...rated.map((k) => Math.abs(k.rank - 50))) : 0;
  const total = Math.max(0, ...r.children.map((k) => k.total || 0));
  const seg = (c) => h("span", { class: "seg " + c }), segU = seg("under"), segM = seg("average"), segO = seg("over"), expl = h("p", { class: "muted" });
  const setBand = (share) => {
    segU.style.flex = segO.style.flex = String((100 - share) / 2); segM.style.flex = String(share);
    clear(expl).append("Die mittleren ", h("strong", {}, `${share} %`), " der geübten Kinder gelten als ", h("span", { class: "accent" }, "Durchschnittlich"), ` (jeweils ${(100 - share) / 2} % darüber bzw. darunter).`);
  };
  const render = (share) => {
    const thr = Math.max(share / 2, minDist), grp = (k) => k.group === "nodata" ? "nodata" : Math.abs(k.rank - 50) <= thr + 1e-9 ? "average" : k.rank > 50 ? "over" : "under";
    clear(out).append(...GROUPS.map(([key, title]) => {
      const kids = r.children.filter((k) => grp(k) === key);
      return h("section", { class: "kidgroup " + key }, h("h3", {}, title, " ", h("span", { class: "count" }, kids.length)), kids.length ? h("ul", { class: "kidlist" }, kids.map(childCard)) : h("p", { class: "muted" }, "–"));
    }));
  };
  slider.addEventListener("input", () => { val.textContent = `${slider.value} % der Klasse`; setBand(Number(slider.value)); render(Number(slider.value)); });
  slider.addEventListener("change", () => act(msg, async () => { await api.put(`/classes/${cid}/band`, { band: Number(slider.value) }); clear(msg); }));
  if (slot) slot.append(h("span", { class: "pill blue dot" }, `Aktive Kinder: ${r.students}`));
  const bandCard = h("div", { class: "panel" }, h("div", { class: "panelhead" }, h("div", {}, h("div", { class: "eyebrow" }, "Gruppierung"), h("strong", {}, "Mittelfeld-Bereich")), val),
    slider, h("div", { class: "scale muted" }, h("span", {}, "10 % (schmal)"), h("span", {}, "50 %"), h("span", {}, "90 % (breit)")), h("div", { class: "segbar" }, segU, segM, segO), expl);
  root.append(h("div", { class: "sechead" }, h("h2", {}, "Klassenübersicht"), total ? h("span", { class: "muted" }, `${total} Aufgaben gesamt`) : null), out);
  setBand(Math.min(90, r.band)); render(r.band);
  const medal = (v, c) => h("span", { class: "medal " + (v > 0 ? c : "zero") }, pct(v));
  root.append(h("div", { class: "sechead" }, h("h2", {}, "Übersicht je Buchstabe"), h("span", { class: "muted" }, `${r.letters.length} Buchstaben`)),
    r.letters.length ? h("div", { class: "panel flush tablewrap" }, table(["Buchstabe", "Bronze", "Silber", "Gold"], r.letters.map((l) => [
      h("strong", {}, l.letter.toUpperCase()), medal(l.bronzePercent, "bronze"), medal(l.silberPercent, "silber"), medal(l.goldPercent, "gold"),
    ]), { plain: true })) : h("p", { class: "muted" }, "Noch kein Buchstabe freigegeben."),
    h("div", { class: "infobox" }, h("span", { class: "i", "aria-hidden": "true" }, "i"), h("span", {}, "Anteil der aktiven Kinder, die mindestens diese Stufe erreicht haben (Gold zählt auch bei Silber und Bronze).")), bandCard);
}
