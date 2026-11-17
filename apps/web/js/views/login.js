import { h, clear, notice, passwordField } from "../dom.js";

export function loginView(root, { api, onLogin, onForgot }) {
  const box = h("div"), mail = h("input", { type: "email", autocomplete: "username", required: true }), pw = passwordField({ autocomplete: "current-password", required: true });
  const form = h("form", { class: "card", style: "max-width:360px;margin:40px auto", onsubmit: async (ev) => {
    ev.preventDefault();
    try { onLogin(await api.login(mail.value.trim(), pw.input.value)); } catch (e) { clear(box).append(notice(e.message, "error")); }
  } }, h("h2", {}, "Anmelden"), h("div", { class: "row" }, h("label", {}, "E-Mail ", mail)), h("div", { class: "row" }, h("label", {}, "Passwort ", pw.el)), box, h("button", { class: "primary", type: "submit" }, "Anmelden"),
    h("p", {}, h("button", { type: "button", class: "link", id: "forgot", onclick: () => onForgot && onForgot() }, "Passwort vergessen?")));
  clear(root).append(form);
}
