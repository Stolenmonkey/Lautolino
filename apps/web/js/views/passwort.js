// Passwort vergessen (Lehrkräfte und Schulleitung) und Passwort festlegen über den Link aus der E-Mail (Einladung oder Zurücksetzen).
import { h, clear, notice, passwordField } from "../dom.js";

export function forgotView(root, { api, onBack }) {
  const box = h("div"), mail = h("input", { type: "email", autocomplete: "username", required: true });
  const form = h("form", { class: "card", style: "max-width:360px;margin:40px auto", onsubmit: async (ev) => {
    ev.preventDefault(); clear(box);
    try { const r = await api.post("/auth/forgot-password", { email: mail.value.trim() }); clear(box).append(notice(r.message, "ok")); }
    catch (e) { clear(box).append(notice(e.message, "error")); }
  } }, h("h2", {}, "Passwort vergessen"), h("p", { class: "muted" }, "Gib die E-Mail-Adresse deines Zugangs ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst."),
    h("div", { class: "row" }, h("label", {}, "E-Mail ", mail)), box, h("button", { class: "primary", type: "submit" }, "Link senden"), h("p", {}, h("button", { type: "button", class: "link", onclick: onBack }, "Zurück zur Anmeldung")));
  clear(root).append(form);
}

// mode: "einladung" oder "passwort-neu"
export function setPasswordView(root, { api, token, mode, onDone }) {
  const box = h("div"), a = passwordField({ autocomplete: "new-password", required: true, minlength: "10" }), b = passwordField({ autocomplete: "new-password", required: true, minlength: "10" });
  const form = h("form", { class: "card", style: "max-width:360px;margin:40px auto", onsubmit: async (ev) => {
    ev.preventDefault();
    if (a.input.value !== b.input.value) { clear(box).append(notice("Die beiden Passwörter sind nicht gleich.", "error")); return; }
    try { await api.post("/auth/set-password", { token, newPassword: a.input.value }); clear(root).append(h("div", { class: "card", style: "max-width:360px;margin:40px auto" }, h("h2", {}, "Passwort gespeichert"), h("p", {}, "Du kannst dich jetzt mit deiner E-Mail-Adresse und dem neuen Passwort anmelden."), h("button", { type: "button", class: "primary", id: "toLogin", onclick: onDone }, "Zur Anmeldung"))); }
    catch (e) { clear(box).append(notice(e.message, "error")); }
  } }, h("h2", {}, mode === "einladung" ? "Willkommen bei Lautolino" : "Neues Passwort festlegen"), h("p", { class: "muted" }, "Das Passwort braucht mindestens 10 Zeichen."),
    h("div", { class: "row" }, h("label", {}, "Neues Passwort ", a.el)), h("div", { class: "row" }, h("label", {}, "Wiederholen ", b.el)), box, h("button", { class: "primary", type: "submit" }, "Passwort speichern"));
  clear(root).append(form);
}
