// Lernplan der Klasse: alle mit den freigegebenen Buchstaben möglichen Silben, geordnet nach Lernstufe und Unterkategorie.
// Die Zuordnung wird bei jedem Aufruf neu berechnet und passt sich deshalb von selbst an, wenn Buchstaben dazukommen.
// Kompakt: Klick auf "Silben ansehen" zeigt die Silben direkt unter der Stufe (Ein-/Ausblenden), Silben als Chips.
import { h, clear, act } from "../dom.js";

export async function silbenPanel(root, api, cid) {
  const r = await api.get(`/classes/${cid}/syllables`), msg = h("div"), head = ["Stufe", "Aufbau", "Silben", ""];
  const rows = r.stages.map((g) => {
    const cell = h("td", { colspan: String(head.length) }), detail = h("tr", { class: "scopedetail", hidden: "" }, cell), btn = h("button", { type: "button" }, "Silben ansehen");
    btn.onclick = () => act(msg, async () => {
      if (!detail.hidden) { detail.hidden = true; btn.textContent = "Silben ansehen"; return; }
      const d = await api.get(`/classes/${cid}/syllables?stage=${g.stage}`);
      clear(cell).append(h("strong", {}, `Stufe ${g.stage}: ${d.name} (${d.total} Silben)`), d.truncated ? h("p", { class: "muted" }, "Es werden die ersten 1500 Silben gezeigt.") : null,
        ...d.subs.map((u) => h("div", { class: "subline" }, h("div", { class: "muted" }, `${u.id} ${u.name} (${u.syllables.length})`),
          u.syllables.length ? h("span", { class: "chips" }, u.syllables.map((x) => h("span", { title: `Buchstaben: ${x.letters.join(" ").toUpperCase()} · neuester: ${x.newestLetter.toUpperCase()}` }, x.parts.join("-").toUpperCase()))) : h("span", { class: "muted" }, "Keine Silben."))));
      detail.hidden = false; btn.textContent = "Silben ausblenden";
    });
    return [h("tr", {}, [h("strong", {}, `${g.stage}.`), g.structure, g.total, g.total ? btn : ""].map((c) => h("td", {}, c))), detail];
  });
  root.append(h("h3", {}, "Übungswörter und Lernstufen"),
    h("p", { class: "muted" }, `Mit den freigegebenen Buchstaben (${r.letters.map((l) => l.toUpperCase()).join(" ")}) gibt es ${r.total} Übungswörter im festen Silbenumfang.`),
    h("div", { class: "tablewrap" }, h("table", { class: "wide compact" }, h("thead", {}, h("tr", {}, head.map((x) => h("th", {}, x)))), h("tbody", {}, rows.flat()))),
    h("p", { class: "muted" }, "Stufe 2 zeigt dieselben Silben wie Stufe 1.2 in der Gegenüberstellung (gleicher Vokal, anderer Anlaut)."), msg);
}
