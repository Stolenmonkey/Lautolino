// Lernplan der Klasse: alle mit den freigegebenen Buchstaben möglichen Silben, geordnet nach Lernstufe und Unterkategorie.
// Die Zuordnung wird bei jedem Aufruf neu berechnet und passt sich deshalb von selbst an, wenn Buchstaben dazukommen.
import { h, clear, table, notice } from "../dom.js";

export async function silbenPanel(root, api, cid) {
  const r = await api.get(`/classes/${cid}/syllables`), detail = h("div");
  const open = async (n) => {
    try {
      const d = await api.get(`/classes/${cid}/syllables?stage=${n}`);
      clear(detail).append(h("div", { class: "card" }, h("strong", {}, `Stufe ${n}: ${d.name} (${d.total} Silben)`), d.truncated ? h("p", { class: "muted" }, "Es werden die ersten 1500 Silben gezeigt.") : null,
        ...d.subs.map((u) => h("div", {}, h("h4", {}, `${u.id} ${u.name} (${u.syllables.length})`), u.syllables.length ? h("div", { class: "tablewrap" }, table(["Silbe", "Buchstaben", "Neuester Buchstabe"], u.syllables.map((x) => [
          h("strong", { class: "mono" }, x.parts.join("-").toUpperCase()), x.letters.join(" ").toUpperCase(), x.newestLetter.toUpperCase() ]))) : h("p", { class: "muted" }, "Keine Silben.")))));
    } catch (e) { clear(detail).append(notice(e.message, "error")); }
  };
  root.append(h("h3", {}, "Übungswörter und Lernstufen"),
    h("p", { class: "muted" }, `Mit den freigegebenen Buchstaben (${r.letters.map((l) => l.toUpperCase()).join(" ")}) gibt es ${r.total} Übungswörter im festen Silbenumfang.`),
    h("div", { class: "tablewrap" }, table(["Stufe", "Aufbau", "Unterkategorien", "Silben", ""], r.stages.map((g) => [
      h("strong", {}, `${g.stage}. ${g.name}`), g.structure, g.subs.map((u) => `${u.id}: ${u.total}`).join(" · "), g.total, g.total ? h("button", { type: "button", onclick: () => open(g.stage) }, "Silben ansehen") : "" ]))),
    h("p", { class: "muted" }, "Stufe 2 zeigt dieselben Silben wie Stufe 1.2 in der Gegenüberstellung (gleicher Vokal, anderer Anlaut)."), detail);
}
