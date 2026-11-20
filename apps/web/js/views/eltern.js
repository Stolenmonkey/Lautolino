// Elterncode eines Kindes: neu erzeugen (der alte endet sofort) und Stand ansehen. Es gibt keine Geräte-Kopplung mehr.
import { h, clear, notice, act, fmtDate } from "../dom.js";

export async function elternPanel(box, api, kid, msg, onChange) {
  let armed = false, shown = null;
  const render = async () => {
    const st = await api.get(`/students/${kid.id}/parent-access`);
    clear(box).append(h("div", { class: "card" }, h("h3", {}, `Eltern von ${kid.display_name}`),
      h("p", { class: "muted" }, "Die Eltern geben den Elterncode auf der Elternseite ein und sehen dann nur lesend Buchstaben mit Bronze, Silber, Gold und die Rundenzeiten ihres Kindes. Der Code gilt dauerhaft, bis er neu erzeugt wird."),
      h("p", {}, st.hasCode ? `Elterncode vorhanden (erzeugt ${fmtDate(st.createdAt)}). Aktive Anmeldungen der Eltern: ${st.activeLogins}.` : "Noch kein Elterncode."),
      h("div", { class: "row" }, h("button", { type: "button", class: "primary", onclick: () => { if (st.hasCode && !armed) { armed = true; render(); return; } armed = false; act(msg, async () => { shown = await api.post(`/students/${kid.id}/parent-code/regenerate`); if (onChange) onChange(); }, render); } },
        st.hasCode ? (armed ? "Wirklich? Der alte Code und alle Anmeldungen enden" : "Neuen Elterncode erzeugen") : "Elterncode erzeugen")),
      shown ? h("div", { class: "notice ok", role: "status" }, h("p", {}, "Elterncode (nur jetzt sichtbar, wird nicht im Klartext gespeichert): ", h("span", { class: "code" }, shown.code)), h("button", { type: "button", class: "noprint", onclick: () => window.print() }, "Drucken")) : null));
  };
  await act(msg, render);
}
