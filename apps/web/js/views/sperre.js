// Gesperrte Silben der Klasse (Lernplan). Klick auf eine Silbe sperrt sie für alle Kinder der Klasse (rot), erneuter Klick gibt sie wieder frei.
// Dieselbe Silbe wird überall gleichzeitig umgeschaltet (Buchstaben- und Stufenansicht); Zähler laden die Ansichten über onChange neu.
import { h, act } from "../dom.js";

export async function sperre(api, cid, msg) {
  const set = new Set((await api.get(`/classes/${cid}/blocked-syllables`)).syllables), listeners = [];
  const paint = (syl) => document.querySelectorAll(`[data-syl="${syl}"]`).forEach((e) => { const b = set.has(syl); e.classList.toggle("gesperrt", b); e.setAttribute("aria-pressed", String(b)); });
  async function toggle(syl) {
    const blocked = !set.has(syl);
    await api.put(`/classes/${cid}/blocked-syllables`, { syllable: syl, blocked });
    if (blocked) set.add(syl); else set.delete(syl);
    paint(syl);
    for (const f of listeners) await f();
  }
  return {
    has: (syl) => set.has(syl),
    onChange: (f) => { listeners.push(f); },
    // Silbe als Schaltfläche; syl klein geschrieben, text wie angezeigt
    chip(syl, text, title) {
      const go = () => act(msg, () => toggle(syl));
      return h("span", { class: "sperrbar" + (set.has(syl) ? " gesperrt" : ""), role: "button", tabindex: "0", "data-syl": syl, "aria-pressed": String(set.has(syl)),
        title: (title ? title + " · " : "") + "Klick: für die Klasse sperren bzw. wieder freigeben",
        onclick: go, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } } }, text);
    },
  };
}
