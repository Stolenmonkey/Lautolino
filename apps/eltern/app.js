// Elternansicht (nur lesen): Kopplung mit Aktivierungscode, dann Buchstaben mit Bronze/Silber/Gold und Rundenzeiten des eigenen Kindes.
const TOKEN_KEY = "silbenflug.eltern.token", NAME_KEY = "silbenflug.eltern.name";
const COLORS = { bronze: "#cd7f32", silber: "#b9c3d1", gold: "#ffc928" }, NAMES = { bronze: "Bronze", silber: "Silber", gold: "Gold" };
const SVG = "http://www.w3.org/2000/svg";

function h(tag, attrs, ...kids) {   // Text wird nie als HTML eingefügt
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const fmt = (s) => new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

// Säulendiagramm: Sekunden je Runde (die letzten Runden)
export function rundenDiagramm(rounds) {
  const n = rounds.length, W = Math.max(320, 40 + n * 14), H = 160, T = 14, B = 22, L = 34, mx = Math.max(1, ...rounds.map((r) => r.seconds)), top = Math.ceil(mx * 1.05 / 10) * 10, ph = H - T - B, bw = Math.max(6, (W - L - 8) / Math.max(n, 1) - 4);
  const svg = document.createElementNS(SVG, "svg"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Sekunden je Runde");
  const el = (name, a, t) => { const e = document.createElementNS(SVG, name); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; svg.append(e); return e; };
  [0, 0.5, 1].forEach((f) => { const y = T + ph - ph * f; el("line", { x1: L, x2: W - 6, y1: y, y2: y, stroke: "#d6e3f3" }); el("text", { x: L - 4, y: y + 3, "text-anchor": "end", "font-size": 10, fill: "#4b5b7a" }, Math.round(top * f)); });
  rounds.forEach((r, i) => { const hh = Math.max(1, ph * r.seconds / top), x = L + 4 + i * (bw + 4); const b = el("rect", { class: "bar", x, y: T + ph - hh, width: bw, height: hh, rx: 2, fill: "#2f7fd8" }); const t = document.createElementNS(SVG, "title"); t.textContent = `Runde ${i + 1}: ${Math.round(r.seconds)} s`; b.append(t); });
  return svg;
}

export function mount(root, deps) {
  const base = (deps.base || "").replace(/\/+$/, ""), fetchFn = deps.fetchFn || ((u, o) => fetch(u, o));
  let token = deps.storage.getItem(TOKEN_KEY), msg = "";
  async function call(method, path, body) {
    let res; try { res = await fetchFn(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { const e = new Error("Keine Verbindung zum Server."); e.status = 0; throw e; }
    const text = await res.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* keine JSON-Antwort */ }
    if (!res.ok) { const e = new Error((j && j.error) || "Fehler " + res.status); e.status = res.status; throw e; }
    return j;
  }
  function frame(...kids) { root.replaceChildren(h("h1", {}, "Silbenzauber für Eltern"), ...kids); }

  function activation() {
    const inp = h("input", { type: "text", id: "code", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", placeholder: "z. B. K7QM-4TXD-9HRP", "aria-label": "Aktivierungscode" });
    const go = async () => {
      const code = inp.value.trim(); if (!code) { msg = "Bitte den Aktivierungscode eingeben."; activation(); return; }
      try { const r = await call("POST", "/parent/activate", { code }); token = r.token; deps.storage.setItem(TOKEN_KEY, token); deps.storage.setItem(NAME_KEY, r.student.displayName); msg = ""; await view(); }
      catch (e) { msg = e.message; activation(); }
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    frame(h("div", { class: "card" }, h("p", {}, "Mit dem Aktivierungscode der Schule koppelst du dieses Gerät einmalig mit deinem Kind. Danach siehst du hier den Lernstand (nur lesen)."), inp, h("div", { class: "msg", role: "alert" }, msg), h("button", { type: "button", class: "primary", onclick: go }, "Koppeln")));
    msg = "";
  }

  async function view() {
    try {
      const [me, lt, rr] = await Promise.all([call("GET", "/parent/me"), call("GET", "/parent/letters"), call("GET", "/parent/rounds")]), rounds = rr.rounds;
      frame(h("h2", {}, me.displayName),
        h("div", { class: "card" }, h("h3", {}, "Buchstaben"), h("div", { class: "lgrid", id: "lgrid" }, lt.letters.map((x) => h("div", { class: "lt " + (x.released ? "on" : "off"), "data-letter": x.letter }, h("div", { class: "l" }, x.letter.toUpperCase() + x.letter), x.level ? h("div", { class: "st" }, h("span", { class: "dot", style: "background:" + COLORS[x.level] }), NAMES[x.level]) : h("div", { class: "st muted" }, x.released ? "geübt wird" : "")))),
          h("p", { class: "muted" }, "Bronze, Silber und Gold zeigen, wie sicher und schnell die Silben eines Buchstabens gelesen werden. Das ist zeitbasiert und kein Nachweis der Lesekorrektheit.")),
        h("div", { class: "card" }, h("h3", {}, "Rundenzeiten"), rounds.length ? [h("div", { class: "chartbox" }, rundenDiagramm(rounds)), h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Nr."), h("th", {}, "Datum"), h("th", {}, "Zeit"))), h("tbody", {}, rounds.slice(-20).reverse().map((r, i) => h("tr", {}, h("td", {}, rounds.length - i), h("td", {}, fmt(r.played_at)), h("td", {}, Math.round(r.seconds) + " s")))))] : h("p", { class: "muted" }, "Noch keine Runde gespielt.")),
        h("p", {}, h("button", { type: "button", id: "unlink", onclick: () => { deps.storage.removeItem(TOKEN_KEY); deps.storage.removeItem(NAME_KEY); token = null; msg = ""; activation(); } }, "Dieses Gerät trennen")));
    } catch (e) {
      if (e.status === 401 || e.status === 403) { deps.storage.removeItem(TOKEN_KEY); token = null; msg = "Dieses Gerät ist nicht mehr gekoppelt. Bitte bei der Schule einen neuen Code holen."; activation(); }
      else frame(h("div", { class: "card" }, h("div", { class: "msg", role: "alert" }, e.message), h("button", { type: "button", class: "primary", onclick: () => view() }, "Noch einmal versuchen")));
    }
  }
  return { ready: token ? view() : Promise.resolve(activation()) };
}
