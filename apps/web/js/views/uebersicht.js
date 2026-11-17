// Klassenübersicht: je Buchstabe, wie viel Prozent der Kinder den Buchstaben erreicht haben und wie viele Bronze, Silber, Gold erreicht haben.
import { h, table } from "../dom.js";

const pct = (v) => String(v).replace(".", ",") + " %";
const bar = (v) => h("span", { class: "barbox", title: pct(v) }, h("span", { class: "bar", style: `width:${Math.min(100, v)}%` }));

export async function uebersicht(root, api, cid) {
  const r = await api.get(`/classes/${cid}/overview`);
  root.append(h("h2", {}, "Klassenübersicht"),
    h("p", { class: "muted" }, `Aktive Kinder in der Klasse: ${r.students}. Bezug je Buchstabe sind die Kinder, die ihn üben (Ausnahmen einzelner Kinder zählen nicht mit).`),
    r.letters.length ? h("div", { class: "tablewrap" }, table(["Buchstabe", "Kinder", "Erreicht (geübt)", "Bronze oder besser", "Silber oder besser", "Gold (sicher beherrscht)"], r.letters.map((l) => [
      h("strong", {}, l.letter.toUpperCase()), l.students,
      [bar(l.reachedPercent), `${pct(l.reachedPercent)} (${l.reached})`], [bar(l.bronzePercent), `${pct(l.bronzePercent)} (${l.bronze})`], [bar(l.silberPercent), `${pct(l.silberPercent)} (${l.silber})`], [bar(l.goldPercent), `${pct(l.goldPercent)} (${l.gold})`],
    ]))) : h("p", { class: "muted" }, "Noch kein Buchstabe freigegeben."),
    h("p", { class: "muted" }, "Erreicht = das Kind hat den Buchstaben in einer Runde geübt. Bronze, Silber, Gold = vergebene Auszeichnung nach den unveränderten Prozentgrenzen der Konfiguration."));
}
