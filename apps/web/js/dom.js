// Kleine DOM-Helfer. Text wird immer als Text eingefügt (nie als HTML).
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "value") e.value = v; else if (k === "checked") e.checked = !!v; else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export const clear = (e) => { while (e.firstChild) e.firstChild.remove(); return e; };
export const fmtDate = (s) => (s ? new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");
export const fmtDay = (s) => (s ? new Date(s).toLocaleDateString("de-DE") : "–");
// opts.wide: echte Tabelle mit Querscrollen (Matrizen); sonst werden Zeilen auf schmalen Displays zu Karten (data-label je Zelle).
export function table(head, rows, opts) {
  return h("table", { class: opts && opts.wide ? "wide" : "stack" }, h("thead", {}, h("tr", {}, head.map((x) => h("th", {}, x)))), h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c, i) => h("td", { "data-label": head[i] || false }, h("span", { class: "v" }, c)))))));
}
// Meldungsfeld; kind: "", "ok", "error"
export function notice(text, kind = "") { return h("div", { class: "notice " + kind, role: kind === "error" ? "alert" : "status" }, text); }
// Führt eine Aktion aus, zeigt Fehler in `box` an und lädt danach neu
export async function act(box, fn, reload) {
  try { const r = await fn(); if (reload) await reload(); return r; } catch (e) { clear(box).append(notice(e.message || String(e), "error")); }
}

// Passwortfeld mit Augensymbol rechts: Antippen wechselt zwischen verborgen (Punkte) und sichtbar (Klartext). Gibt { el, input } zurück.
const EYE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
export const icon = (svgText) => document.importNode(new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement, true);
export function passwordField(attrs) {
  const input = h("input", { type: "password", ...(attrs || {}) }), btn = h("button", { type: "button", class: "eye" });
  const set = (show) => { input.type = show ? "text" : "password"; btn.setAttribute("aria-pressed", String(show)); btn.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen"); btn.title = show ? "Passwort verbergen" : "Passwort anzeigen"; clear(btn).append(icon(show ? EYE_OFF : EYE)); };
  btn.addEventListener("click", () => { set(input.type === "password"); input.focus(); }); set(false);
  return { el: h("span", { class: "pw" }, input, btn), input };
}
