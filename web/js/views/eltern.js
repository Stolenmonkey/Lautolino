// Elternzugang für ein Kind: Aktivierungscode erzeugen, gekoppelte Geräte ansehen und widerrufen.
import { h, clear, table, notice, act, fmtDate, fmtDay } from "../dom.js";

export async function elternPanel(box, api, kid, msg) {
  let armed = null, shown = null;
  const render = async () => {
    const { devices, openCodes } = await api.get(`/students/${kid.id}/parent-devices`);
    clear(box).append(h("div", { class: "card" }, h("h3", {}, `Eltern von ${kid.display_name}`),
      h("p", { class: "muted" }, "Eltern koppeln ihr Gerät einmal mit einem Aktivierungscode und sehen dann nur Buchstaben mit Bronze, Silber, Gold und die Rundenzeiten ihres Kindes. Ein Code gilt für ein Gerät und nur einmal."),
      h("div", { class: "row" }, h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => { shown = await api.post(`/students/${kid.id}/parent-codes`); }, render) }, "Neuen Elterncode erzeugen")),
      shown ? h("div", { class: "notice ok", role: "status" }, h("p", {}, "Code (nur jetzt sichtbar, wird nicht im Klartext gespeichert): ", h("span", { class: "code" }, shown.code)), h("p", {}, `Gültig bis ${fmtDay(shown.expiresAt)}, wenn er nicht benutzt wird.`), h("button", { type: "button", class: "noprint", onclick: () => window.print() }, "Drucken")) : null,
      h("p", { class: "muted" }, `Offene Codes: ${openCodes}`),
      h("h4", {}, "Gekoppelte Geräte"),
      devices.length ? table(["Gekoppelt am", "Status", ""], devices.map((dv) => [fmtDate(dv.linked_at), dv.revoked_at ? "widerrufen " + fmtDay(dv.revoked_at) : "gekoppelt",
        dv.revoked_at ? "" : h("button", { type: "button", onclick: () => { if (armed !== dv.id) { armed = dv.id; render(); return; } armed = null; act(msg, () => api.post(`/students/${kid.id}/parent-devices/${dv.id}/revoke`), render); } }, armed === dv.id ? "Wirklich widerrufen?" : "Widerrufen")])) : h("p", { class: "muted" }, "Noch kein Gerät gekoppelt.")));
  };
  await act(msg, render);
}
