import { h, clear, notice } from "../dom.js";

export function loginView(root, { api, onLogin }) {
  const box = h("div"), mail = h("input", { type: "email", autocomplete: "username", required: true }), pw = h("input", { type: "password", autocomplete: "current-password", required: true });
  const form = h("form", { class: "card", style: "max-width:360px;margin:40px auto", onsubmit: async (ev) => {
    ev.preventDefault();
    try { onLogin(await api.login(mail.value.trim(), pw.value)); } catch (e) { clear(box).append(notice(e.message, "error")); }
  } }, h("h2", {}, "Anmelden"), h("div", { class: "row" }, h("label", {}, "E-Mail ", mail)), h("div", { class: "row" }, h("label", {}, "Passwort ", pw)), box, h("button", { class: "primary", type: "submit" }, "Anmelden"));
  clear(root).append(form);
}
