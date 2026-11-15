import { createApi } from "./api.js";
import { h, clear } from "./dom.js";
import { loginView } from "./views/login.js";
import { adminTabs, adminView } from "./views/admin.js";
import { schoolTabs, schoolView } from "./views/school.js";

const api = createApi({ base: window.SILBENFLUG_API || "http://localhost:8787", storage: window.localStorage });
const $ = (id) => document.getElementById(id), main = $("main"), tabs = $("tabs");
let user = null, tab = null;

function show() {
  const defs = user.role === "admin" ? adminTabs : schoolTabs(user.role);
  if (!defs[tab]) tab = Object.keys(defs)[0];
  clear(tabs).append(...Object.entries(defs).map(([k, v]) => h("button", { type: "button", "aria-current": k === tab, onclick: () => { tab = k; show(); } }, v)));
  tabs.classList.remove("hidden");
  const ctx = { api, user };
  (user.role === "admin" ? adminView : schoolView)(tab, clear(main), ctx).catch((e) => { if (e.status === 401) return signOut(); main.append(h("div", { class: "notice error" }, e.message)); });
}
function signedIn(u) {
  user = u; tab = null; $("who").textContent = `${u.email} (${{ admin: "Administration", schulleitung: "Schulleitung", lehrer: "Lehrkraft" }[u.role]})`; $("logout").classList.remove("hidden"); show();
}
function signOut() {
  user = null; api.token = null; $("who").textContent = ""; $("logout").classList.add("hidden"); tabs.classList.add("hidden"); loginView(clear(main), { api, onLogin: signedIn });
}
$("logout").addEventListener("click", async () => { await api.logout(); signOut(); });

(async () => {
  if (api.token) {
    try { const me = await api.get("/auth/me"); if (me.principal.kind === "staff") { const p = me.principal; return signedIn({ id: p.id, role: p.role, schoolId: p.schoolId, email: "angemeldet" }); } } catch { /* Anmeldung nötig */ }
  }
  signOut();
})();
