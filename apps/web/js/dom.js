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
export function table(head, rows) {
  return h("table", {}, h("thead", {}, h("tr", {}, head.map((x) => h("th", {}, x)))), h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, c))))));
}
// Meldungsfeld; kind: "", "ok", "error"
export function notice(text, kind = "") { return h("div", { class: "notice " + kind, role: kind === "error" ? "alert" : "status" }, text); }
// Führt eine Aktion aus, zeigt Fehler in `box` an und lädt danach neu
export async function act(box, fn, reload) {
  try { const r = await fn(); if (reload) await reload(); return r; } catch (e) { clear(box).append(notice(e.message || String(e), "error")); }
}
