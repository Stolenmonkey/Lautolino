// Lernplan der Klasse: alle mit den freigegebenen Buchstaben möglichen Silben, geordnet nach Lernstufe und Unterkategorie.
// Die Zuordnung wird bei jedem Aufruf neu berechnet und passt sich deshalb von selbst an, wenn Buchstaben dazukommen.
// Darstellung und Bedienung wie die Tabelle "Freigegebene Buchstaben": Panel, Chevron-Button mit Silbenzahl (Ein-/Ausblenden), Sortierung per Klick auf die Überschrift.
import { h, clear, act } from "../dom.js";
import { sperre } from "./sperre.js";

export async function silbenPanel(root, api, cid, sp) {
  const r = await api.get(`/classes/${cid}/syllables`), msg = h("div"), head = ["Stufe", "Aufbau", "Silbenumfang"];
  sp = sp || (await sperre(api, cid, msg));
  const rows = r.stages.map((g) => {
    const cell = h("td", { colspan: String(head.length) }), detail = h("tr", { class: "scopedetail", hidden: "" }, cell), cnt = h("span", {}, String(g.total)), chev = h("span", { class: "chev" }, "▾");
    const btn = h("button", { type: "button", class: "chevbtn", title: "Silben ansehen", "aria-label": "Silben ansehen" }, cnt, chev);
    btn.onclick = () => act(msg, async () => {
      if (!detail.hidden) { detail.hidden = true; chev.textContent = "▾"; return; }
      const d = await api.get(`/classes/${cid}/syllables?stage=${g.stage}`);
      clear(cell).append(h("div", { class: "stufenliste" },
        d.truncated ? h("div", { class: "stufe" }, h("p", { class: "muted" }, "Es werden die ersten 1500 Silben gezeigt.")) : null,
        ...d.subs.map((u) => { const c = h("span", { class: "muted" }), setCnt = () => { c.textContent = `${u.id} ${u.name} (${u.syllables.filter((x) => !sp.has(x.syllable)).length})`; }; setCnt(); sp.onChange(setCnt);
          return h("div", { class: "stufe" }, h("div", { class: "stufenkopf" }, c),
            u.syllables.length ? h("div", { class: "chips" }, u.syllables.map((x) => sp.chip(x.syllable, x.parts.join(x.block ? " · " : "-").toUpperCase(), `${x.block ? "Kontrastblock (Reihenfolge wechselt) · " : ""}Buchstaben: ${x.letters.join(" ").toUpperCase()} · neuester: ${x.newestLetter.toUpperCase()}`))) : h("span", { class: "muted" }, "Keine Silben.")); })));
      detail.hidden = false; chev.textContent = "▴";
    });
    const tr = h("tr", {}, [h("strong", {}, `${g.stage}.`), g.structure, g.total || g.blocked ? btn : cnt].map((c) => h("td", {}, c)));
    return [tr, detail, { g, cnt }];
  });
  sp.onChange(async () => {
    const n = await api.get(`/classes/${cid}/syllables`);
    n.stages.forEach((g) => { const q = rows.find((x) => x[2].g.stage === g.stage); if (q) q[2].cnt.textContent = String(g.total); });
  });
  // Sortierung per Klick auf die Überschrift (Stufe, Aufbau A–Z, Silbenumfang aufsteigend); erneuter Klick dreht um.
  const tbody = h("tbody", {}), keys = [(x) => x.g.stage, (x) => x.g.structure, (x) => Number(x.cnt.textContent)];
  let sortCol = -1, dir = 1;
  const render = () => {
    const list = rows.slice();
    if (sortCol >= 0) list.sort((a, b) => { const x = keys[sortCol](a[2]), y = keys[sortCol](b[2]); return (x < y ? -1 : x > y ? 1 : a[2].g.stage - b[2].g.stage) * dir; });
    tbody.replaceChildren(...list.flatMap((q) => [q[0], q[1]]));
  };
  const ths = head.map((x, i) => { const th = h("th", {}, x); th.style.cursor = "pointer"; th.title = "Sortieren"; th.onclick = () => { dir = sortCol === i ? -dir : 1; sortCol = i; ths.forEach((t, j) => t.setAttribute("aria-sort", j === i ? (dir > 0 ? "ascending" : "descending") : "none")); render(); }; return th; });
  render();
  root.append(h("div", { class: "sechead" }, h("h2", { class: "small" }, "Übungswörter und Lernstufen")),
    h("div", { class: "panel flush tablewrap" }, h("table", { class: "plain freigaben" }, h("thead", {}, h("tr", {}, ths)), tbody)),
    msg);
}
