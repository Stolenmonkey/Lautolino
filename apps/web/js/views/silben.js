// Lernplan der Klasse: alle mit den freigegebenen Buchstaben möglichen Silben, geordnet nach Lernstufe und Unterkategorie.
// Die Zuordnung wird bei jedem Aufruf neu berechnet und passt sich deshalb von selbst an, wenn Buchstaben dazukommen.
// Kompakt: Klick auf "Silben ansehen" zeigt die Silben direkt unter der Stufe (Ein-/Ausblenden), Silben als Chips.
import { h, clear, act } from "../dom.js";
import { sperre } from "./sperre.js";

export async function silbenPanel(root, api, cid, sp) {
  const r = await api.get(`/classes/${cid}/syllables`), msg = h("div"), head = ["Stufe", "Aufbau", "Silben", ""], totals = new Map(), info = h("p", { class: "muted" }), heads = new Map();
  sp = sp || (await sperre(api, cid, msg));
  const infoText = (x) => `Mit den freigegebenen Buchstaben (${x.letters.map((l) => l.toUpperCase()).join(" ")}) gibt es ${x.total} Übungswörter im festen Silbenumfang.` + (x.blocked ? ` ${x.blocked} Silben sind gesperrt.` : "");
  info.textContent = infoText(r);
  sp.onChange(async () => {
    const n = await api.get(`/classes/${cid}/syllables`); info.textContent = infoText(n);
    n.stages.forEach((g) => { const t = totals.get(g.stage); if (t) t.textContent = String(g.total); const hd = heads.get(g.stage); if (hd) hd.update(g); });
  });
  const rows = r.stages.map((g) => {
    const cell = h("td", { colspan: String(head.length) }), detail = h("tr", { class: "scopedetail", hidden: "" }, cell), btn = h("button", { type: "button" }, "Silben ansehen");
    btn.onclick = () => act(msg, async () => {
      if (!detail.hidden) { detail.hidden = true; btn.textContent = "Silben ansehen"; return; }
      const d = await api.get(`/classes/${cid}/syllables?stage=${g.stage}`);
      const title = h("strong"), setTitle = (n, b) => { title.textContent = `Stufe ${g.stage}: ${d.name} (${n} Silben${b ? `, ${b} gesperrt` : ""})`; }; setTitle(d.total, d.blocked);
      heads.set(g.stage, { update: (x) => setTitle(x.total, x.blocked) });
      clear(cell).append(title, d.truncated ? h("p", { class: "muted" }, "Es werden die ersten 1500 Silben gezeigt.") : null, h("p", { class: "muted" }, "Silbe anklicken = für die ganze Klasse sperren (rot), erneut anklicken = wieder freigeben. Gesperrte Silben kommen bei den Kindern nicht mehr vor und müssen für Auszeichnungen nicht beherrscht sein."),
        ...d.subs.map((u) => { const cnt = h("span", {}), setCnt = () => { cnt.textContent = `${u.id} ${u.name} (${u.syllables.filter((x) => !sp.has(x.syllable)).length})`; }; setCnt(); sp.onChange(setCnt);
          return h("div", { class: "subline" }, h("div", { class: "muted" }, cnt),
          u.syllables.length ? h("span", { class: "chips" }, u.syllables.map((x) => sp.chip(x.syllable, x.parts.join("-").toUpperCase(), `Buchstaben: ${x.letters.join(" ").toUpperCase()} · neuester: ${x.newestLetter.toUpperCase()}`))) : h("span", { class: "muted" }, "Keine Silben.")); }));
      detail.hidden = false; btn.textContent = "Silben ausblenden";
    });
    const tot = h("span", {}, String(g.total)); totals.set(g.stage, tot);
    return [h("tr", {}, [h("strong", {}, `${g.stage}.`), g.structure, tot, g.total || g.blocked ? btn : ""].map((c) => h("td", {}, c))), detail];
  });
  root.append(h("h3", {}, "Übungswörter und Lernstufen"),
    info,
    h("div", { class: "tablewrap" }, h("table", { class: "wide compact" }, h("thead", {}, h("tr", {}, head.map((x) => h("th", {}, x)))), h("tbody", {}, rows.flat()))),
    h("p", { class: "muted" }, "Stufe 2 zeigt dieselben Silben wie Stufe 1.2 in der Gegenüberstellung (gleicher Vokal, anderer Anlaut)."), msg);
}
