import { createApi } from "./api.js";
import { h, clear } from "./dom.js";
import { loginView } from "./views/login.js";
import { forgotView, setPasswordView } from "./views/passwort.js";
import { adminTabs, adminView } from "./views/admin.js";
import { schoolTabs, schoolView } from "./views/school.js";

const api = createApi({ base: window.SILBENFLUG_API || "http://localhost:8787", storage: window.localStorage });
const $ = (id) => document.getElementById(id), main = $("main"), tabs = $("tabs");
let user = null, tab = null;
document.addEventListener("silbenflug:tab", (e) => { if (user) { tab = e.detail; show(); } });   // Tab-Wechsel aus Ansichten (Klassenübersicht → Auswertung)

function show() {
  const defs = user.role === "admin" ? adminTabs : schoolTabs(user.role);
  if (!defs[tab]) tab = Object.keys(defs)[0];
  clear(tabs).append(...Object.entries(defs).map(([k, v]) => h("button", { type: "button", "aria-current": k === tab ? "true" : false, onclick: () => { tab = k; show(); } }, v)));
  tabs.classList.remove("hidden");
  const ctx = { api, user };
  (user.role === "admin" ? adminView : schoolView)(tab, clear(main), ctx).catch((e) => { if (e.status === 401) return signOut(); main.append(h("div", { class: "notice error" }, e.message)); });
}
function signedIn(u) {
  user = u; tab = null; $("mail").textContent = u.email || ""; $("who").textContent = { admin: "Administration", schulleitung: "Schulleitung", lehrer: "Lehrkraft" }[u.role]; $("who").classList.remove("hidden"); $("logout").classList.remove("hidden"); show();
}
function signOut() {
  user = null; api.token = null; $("mail").textContent = ""; $("who").textContent = ""; $("who").classList.add("hidden"); $("logout").classList.add("hidden"); tabs.classList.add("hidden"); loginView(clear(main), { api, onLogin: signedIn, onForgot: () => forgotView(clear(main), { api, onBack: signOut }) });
}
$("logout").addEventListener("click", async () => { await api.logout(); signOut(); });

(async () => {
  // Link aus der E-Mail: #einladung=... oder #passwort-neu=... (der Token steht nur im Fragment und wird nicht an den Webserver gesendet)
  const m = /^#(einladung|passwort-neu)=([0-9a-f]{32,128})$/.exec(location.hash || "");
  if (m) { history.replaceState(null, "", location.pathname + location.search); return setPasswordView(clear(main), { api, token: m[2], mode: m[1], onDone: signOut }); }
  if (api.token) {
    try { const me = await api.get("/auth/me"); if (me.principal.kind === "staff") { const p = me.principal; return signedIn({ id: p.id, role: p.role, schoolId: p.schoolId, email: p.email }); } } catch { /* Anmeldung nötig */ }
  }
  signOut();
})();
