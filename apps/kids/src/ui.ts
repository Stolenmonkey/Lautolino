// Oberfläche der Kinder-App im Silbenzauber-Design: Anmeldung, Buchstabenübersicht, Übung, Rundenende, Glückwunsch-Popup.
import { renderWord, renderWordWithArcs } from "@silbenflug/core";
import type { AwardLevel, Rng, SilbenflugConfig } from "@silbenflug/shared";
import { ApiError, createKidsApi, flushQueue, newRoundId } from "./api";
import type { FetchFn, KV, QueuedRound } from "./api";
import { adoptServer, canPractice, emptyState, finishRound, prepareRound } from "./logic";
import type { LocalState, Plan, RoundSetup } from "./logic";

export interface Deps { base: string; storage: KV; fetchFn?: FetchFn; rng?: Rng; now?: () => number }
interface AwardsView { letters: Array<{ letter: string; released: boolean; level: AwardLevel | null; progress?: { next: AwardLevel; segments: number } | null }>; pending: Array<{ letter: string; level: AwardLevel }> }
interface Data { st: LocalState; queue: QueuedRound[]; plan: Plan | null; config: SilbenflugConfig | null; awards: AwardsView | null; seen?: string[] }
interface Session { token: string; studentId: string; name: string }

const SESSION_KEY = "silbenflug.kind.session", DATA_KEY = "silbenflug.kind.data.";
const LEVEL_NAME: Record<AwardLevel, string> = { bronze: "Bronze", silber: "Silber", gold: "Gold" };
const LEVEL_COLOR: Record<AwardLevel, string> = { bronze: "#cd7f32", silber: "#b9c3d1", gold: "#ffc928" };
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const OWL = '<g class="wingL"><ellipse cx="30" cy="92" rx="11" ry="20" fill="#f08a24" transform="rotate(18 30 92)"/></g><g class="wingR"><ellipse cx="90" cy="92" rx="11" ry="20" fill="#f08a24" transform="rotate(-18 90 92)"/></g>' +
  '<ellipse cx="60" cy="88" rx="38" ry="38" fill="#ffa63d"/><ellipse cx="60" cy="98" rx="24" ry="25" fill="#ffe3b8"/>' +
  '<g class="eyes"><circle cx="45" cy="72" r="13" fill="#fff"/><circle cx="75" cy="72" r="13" fill="#fff"/><circle cx="47" cy="74" r="6" fill="#1f2a44"/><circle cx="73" cy="74" r="6" fill="#1f2a44"/><circle cx="49" cy="72" r="2" fill="#fff"/><circle cx="75" cy="72" r="2" fill="#fff"/></g>' +
  '<path d="M53 83 L67 83 L60 95 Z" fill="#ff6b4a"/><circle cx="33" cy="88" r="6" fill="#ff9db5" opacity=".7"/><circle cx="87" cy="88" r="6" fill="#ff9db5" opacity=".7"/>' +
  '<ellipse cx="46" cy="125" rx="10" ry="4" fill="#ff6b4a"/><ellipse cx="74" cy="125" rx="10" ry="4" fill="#ff6b4a"/>' +
  '<path d="M26 56 L60 8 L94 56 Z" fill="#7b5fd6"/><ellipse cx="60" cy="56" rx="40" ry="8" fill="#6249c0"/>' +
  '<g class="star"><path d="M60 -2 l4 9 10 1 -8 7 3 10 -9 -6 -9 6 3 -10 -8 -7 10 -1z" fill="#ffd93d" transform="translate(0 6)"/></g>' +
  '<circle cx="50" cy="40" r="3" fill="#ffd93d"/><circle cx="68" cy="30" r="2.5" fill="#ffd93d"/><circle cx="72" cy="46" r="2.5" fill="#fff"/>';
const owl = (cls: string, id = ""): string => '<svg class="' + cls + '"' + (id ? ' id="' + id + '"' : "") + ' viewBox="0 0 120 130" aria-hidden="true">' + OWL + "</svg>";
const TITLE = "Silbenzauber".split("").map((c, i) => '<span style="color:' + ["#e8505b", "#f08a24", "#e2b400", "#2faa5a", "#2f7fd8", "#7b5fd6"][i % 6] + '">' + c + "</span>").join("");
const LAWN = '<div class="lawn" aria-hidden="true"><svg viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice"><path d="M0 58Q80 30 170 50T400 40V100H0Z" fill="#c4ecba"/><path d="M0 70Q110 45 220 66T400 58V100H0Z" fill="#a6dea0"/><path d="M0 82Q100 66 200 80T400 74V100H0Z" fill="#82d08a"/></svg></div>';

// Fortschritt zur nächsten Medaille: 4 Segmente übereinander, unten beginnt es; nach Gold bleibt der Platz leer
function ladder(p: { next: AwardLevel; segments: number } | null | undefined): string {
  if (!p) return '<span class="ladder none" aria-hidden="true"></span>';
  let b = "";
  for (let i = 0; i < 4; i++) b += "<i" + (i < p.segments ? ' class="f" style="background:' + LEVEL_COLOR[p.next] + '"' : "") + "></i>";
  return '<span class="ladder" role="img" aria-label="' + p.segments + " von 4 Teilen bis " + LEVEL_NAME[p.next] + '">' + b + "</span>";
}
function medal(level: AwardLevel | null, big = false): string {
  if (!level) return "";
  return '<svg class="medal' + (big ? " big" : "") + '" viewBox="0 0 40 44" role="img" aria-label="' + LEVEL_NAME[level] + '"><path d="M12 2L20 18L28 2Z" fill="#e8505b"/><circle cx="20" cy="27" r="14" fill="' + LEVEL_COLOR[level] + '" stroke="#1f2a44" stroke-width="2"/><path d="M20 19l2.6 5.4 5.9.8-4.3 4.1 1 5.9L20 32.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#fff" opacity=".85"/></svg>';
}
const pair = (l: string): string => renderWord(l.toUpperCase()) + renderWord(l.toLowerCase());
export function mountKids(root: HTMLElement, deps: Deps): { ready: Promise<void> } {
  const api = createKidsApi({ base: deps.base, fetchFn: deps.fetchFn }), rng: Rng = deps.rng || Math.random, now = deps.now || (() => Date.now());
  let session: Session | null = null, data: Data | null = null, view: "login" | "home" | "practice" | "end" = "login";
  let msg = "", setup: RoundSetup | null = null, idx = 0, roundStart = 0, sylStart = 0, shownAt = 0, times: Array<{ s: string; sec: number }> = [], lastSecs = 0, syncing: Promise<void> | null = null, popupOpen = false, pending: (() => void) | null = null, lastClick = 0;

  const cur = (): string => view;   // aktueller Stand der Ansicht (verhindert, dass TypeScript nach go() eine alte Ansicht annimmt)
  const blank = (): Data => ({ st: emptyState(), queue: [], plan: null, config: null, awards: null });
  const save = (): void => { if (session && data) { try { deps.storage.setItem(DATA_KEY + session.studentId, JSON.stringify(data)); } catch { /* Speicher voll oder gesperrt: App läuft weiter */ } } };
  function loadData(id: string): Data {
    try { const o = JSON.parse(deps.storage.getItem(DATA_KEY + id) || "null"); if (o && typeof o === "object") return { ...blank(), ...o, st: { ...emptyState(), ...(o.st || {}) }, queue: Array.isArray(o.queue) ? o.queue : [] }; } catch { /* kaputter Stand: neu beginnen */ }
    return blank();
  }
  function logout(message = ""): void { deps.storage.removeItem(SESSION_KEY); session = null; data = null; api.token = null; msg = message; go("login"); }

  // ---------- Abgleich mit dem Server ----------
  function sync(): Promise<void> {
    if (!session || !data) return Promise.resolve();
    if (syncing) return syncing;
    const s = session, d = data;
    syncing = (async () => {
      try {
        api.token = s.token;
        const f = await flushQueue(api, d.queue); d.queue = f.queue;
        if (f.result.authLost) { logout("Bitte melde dich noch einmal an."); return; }
        if (f.result.offline) return;
        d.config = (await api.get("/config")).config; d.plan = await api.get("/student/plan");
        const sd = await api.get("/student/sync-data");
        if (!d.queue.length) d.st = adoptServer(sd);   // gemerkte Runden offen: lokaler Stand gilt; sonst der des Servers
        d.awards = await api.get("/student/awards");
      } catch (e) { if (e instanceof ApiError && e.status === 401) logout("Bitte melde dich noch einmal an."); /* sonst: offline, es gilt der gemerkte Stand */ }
      finally { syncing = null; save(); }
    })();
    return syncing;
  }

  // ---------- Seiten ----------
  function go(v: typeof view): void { view = v; render(); }
  function render(): void {
    if (view === "login") renderLogin(); else if (view === "home") renderHome(); else if (view === "practice") renderPractice(); else renderEnd();
    popupOpen = false; if (view === "home" || view === "end") showPopup();
  }
  function head(): string { return '<header class="head">' + owl("mascot owl calm") + "<h1>" + TITLE + "</h1></header>"; }

  function renderLogin(): void {
    root.innerHTML = head() + '<section class="card enter"><label for="code">Dein Merkschlüssel</label><input id="code" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="z. B. SonneWald7"><div class="msg" id="msg" role="alert">' + esc(msg) + '</div><button class="btn" id="login" type="button" style="margin-top:12px">Anmelden</button></section>' + LAWN;
    const inp = root.querySelector("#code") as HTMLInputElement;
    const doLogin = async (): Promise<void> => {
      const code = inp.value.trim(); if (!code) { msg = "Bitte gib deinen Merkschlüssel ein."; render(); return; }
      try {
        api.token = null; const r = await api.post("/student/login", { code });
        session = { token: r.token, studentId: r.student.id, name: r.student.displayName }; deps.storage.setItem(SESSION_KEY, JSON.stringify(session)); api.token = session.token;
        data = loadData(session.studentId); msg = ""; go("home"); await sync(); if (cur() === "home") render();
      } catch (e) { msg = e instanceof ApiError && e.status === 0 ? "Keine Verbindung. Zum Anmelden brauchst du Internet." : (e as Error).message; render(); }
    };
    (root.querySelector("#login") as HTMLElement).onclick = doLogin;
    inp.onkeydown = (e) => { if (e.key === "Enter") void doLogin(); };
  }

  function renderHome(): void {
    const d = data as Data, aw = d.awards, rel = new Set(d.plan ? d.plan.letters : []);
    const lv: Record<string, AwardLevel | null> = {}, pg: Record<string, { next: AwardLevel; segments: number } | null | undefined> = {}; (aw ? aw.letters : []).forEach((x) => { lv[x.letter] = x.level; pg[x.letter] = x.progress; });
    const grid = "abcdefghijklmnopqrstuvwxyz".split("").map((l) => '<div class="lt ' + (rel.has(l) ? "on" : "off") + '" data-letter="' + l + '"' + (rel.has(l) ? ' title="' + (lv[l] ? LEVEL_NAME[lv[l] as AwardLevel] : "noch keine Medaille") + '"' : "") + '>' + (rel.has(l) ? ladder(pg[l]) : "") + pair(l) + medal(lv[l] || null) + "</div>").join("");
    const ok = !!(d.plan && d.config && canPractice(d.plan, d.config)), loading = !d.plan || !d.config;
    const info = loading ? "Einen Moment …" : !rel.size ? "Noch keine Buchstaben freigegeben. Frag deine Lehrerin oder deinen Lehrer." : !ok ? "Mit diesen Buchstaben gibt es noch zu wenige Silben." : "";
    root.innerHTML = head() + '<section class="card enter"><p class="hello">Hallo' + (session ? ", " + esc(session.name) : "") + '!</p><div class="lgrid" id="lgrid">' + grid + '</div>' + '<div class="msg" id="msg" role="alert">' + esc(msg || info) + '</div><button class="btn" id="start" type="button"' + (ok ? "" : " disabled") + '>Übung starten</button></section>' +
      '<p class="foot">' + (d.queue.length ? "Gemerkt, wird später gesendet: " + d.queue.length + " · " : "") + '<button type="button" class="link" id="logout">Abmelden</button></p>' + LAWN;
    (root.querySelector("#start") as HTMLElement).onclick = startPractice;
    (root.querySelector("#logout") as HTMLElement).onclick = () => logout();
  }

  function startPractice(): void {
    const d = data as Data; if (!d.plan || !d.config || !canPractice(d.plan, d.config)) return;
    setup = prepareRound(d.plan, d.config, d.st, rng); idx = 0; times = []; msg = ""; go("practice"); showTask();
  }
  function renderPractice(): void {
    root.innerHTML = '<section class="pbar"><button type="button" class="iconbtn" id="quit" aria-label="Runde beenden">&times;</button><div class="prog" id="prog"></div>' + owl("mascot owl2", "pbarOwl") + "</section>" +
      '<section class="card stage"><div class="sylwrap"><div class="big" id="syl" role="img"></div><div class="spark" id="spark" aria-hidden="true">' + "<i></i>".repeat(14) + '</div></div></section><button class="btn" id="next" type="button">Weiter</button>' + LAWN;
    (root.querySelector("#quit") as HTMLElement).onclick = () => { setup = null; go("home"); };
    (root.querySelector("#next") as HTMLElement).onclick = next;
    if (setup) paintTask();
  }
  function paintTask(slide = false): void {
    const s = setup as RoundSetup, n = s.tasks.length, syl = root.querySelector("#syl") as HTMLElement;
    const old = slide ? captureSlide(syl) : null;
    (root.querySelector("#prog") as HTMLElement).textContent = "Aufgabe " + (idx + 1) + " von " + n;
    // Hauptsilbe (etwas nach links) mit Silbenbögen, rechts daneben klein und hellgrau die tatsächlich nächsten zwei Silben (am Rundenende weniger)
    const nxt = s.shown.slice(idx + 1, idx + 3);
    syl.innerHTML = '<span class="cur">' + renderWordWithArcs(s.shown[idx]) + "</span>" + (nxt.length ? '<span class="nxt" aria-hidden="true">' + nxt.map((w) => '<span class="nx">' + renderWordWithArcs(w) + "</span>").join("") + "</span>" : "");
    syl.setAttribute("aria-label", s.shown[idx] + (nxt.length ? ", danach " + nxt.join(", ") : "")); if (!old) restart(syl.querySelector(".cur") as Element, "pop", 420);
    fit(syl); if (old) slideIn(syl, old);
  }
  type Slide = { cur: DOMRect; nx: DOMRect[]; clone: HTMLElement };
  const calm = (): boolean => !!(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function captureSlide(syl: HTMLElement): Slide | null {
    const cur = syl.querySelector(".cur") as HTMLElement | null; if (!cur || calm() || !cur.animate) return null;
    return { cur: cur.getBoundingClientRect(), nx: Array.prototype.map.call(syl.querySelectorAll(".nx"), (e: Element) => e.getBoundingClientRect()) as DOMRect[], clone: cur.cloneNode(true) as HTMLElement };
  }
  // Mittelpunkt der Hauptsilbe relativ zum Sternen-Feld (Ursprung der Sterne)
  function curCenter(syl: HTMLElement): void {
    const sp = root.querySelector("#spark") as HTMLElement | null, c = syl.querySelector(".cur") as HTMLElement | null; if (!sp || !c) return;
    const a = sp.getBoundingClientRect(), r = c.getBoundingClientRect();
    sp.style.setProperty("--ox", Math.round(r.left + r.width / 2 - a.left - 15) + "px"); sp.style.setProperty("--oy", Math.round(r.top + r.height / 2 - a.top - 15) + "px");
  }
  // Hauptsilbe fährt nach links raus, Vorschau-Silben rücken nach, neue Vorschau kommt von rechts
  function slideIn(syl: HTMLElement, old: Slide): void {
    const stage = (syl.closest(".stage") as HTMLElement).getBoundingClientRect(), box = syl.getBoundingClientRect(), D = 520, E = "cubic-bezier(.45,0,.2,1)", dist = old.cur.right - stage.left + 24;
    const c = old.clone; c.classList.remove("pop"); c.classList.add("out"); c.setAttribute("aria-hidden", "true");
    c.style.left = old.cur.left - box.left + "px"; c.style.top = old.cur.top - box.top + "px"; syl.appendChild(c);
    c.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(" + -dist + "px)", opacity: 0 }], { duration: D, easing: E }).onfinish = () => c.remove();
    const sp = root.querySelector("#spark") as HTMLElement | null;
    if (sp && sp.animate) sp.animate([{ transform: "translateX(0)" }, { transform: "translateX(" + -dist + "px)" }], { duration: D, easing: E, fill: "forwards" });
    const move = (el: Element | null, from: DOMRect | undefined, rightIn: boolean): void => {
      if (!el || !(el as HTMLElement).animate) return; const n = el.getBoundingClientRect();
      const f = from ? "translate(" + (from.left - n.left) + "px," + (from.top - n.top) + "px) scale(" + (n.width ? from.width / n.width : 1) + ")" : "translateX(" + (stage.right - n.left + 24) + "px)";
      (el as HTMLElement).style.transformOrigin = "0 0";
      (el as HTMLElement).animate([{ transform: f, opacity: from ? 1 : (rightIn ? 1 : 0) }, { transform: "none", opacity: 1 }], { duration: D, easing: E });
    };
    const nx = syl.querySelectorAll(".nx");
    move(syl.querySelector(".cur"), old.nx[0], false); move(nx[0] || null, old.nx[1], true); move(nx[1] || null, undefined, true);
  }
  // Passt die Schriftgröße an, falls Hauptsilbe und Vorschau breiter als der Rahmen sind (kleine Telefone)
  function fit(el: HTMLElement): void {
    el.style.removeProperty("--fit"); const stage = el.closest(".stage") as HTMLElement | null;
    if (!stage || !stage.clientWidth) return;
    const kids = Array.prototype.slice.call(el.children) as HTMLElement[], gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const need = kids.reduce((a, k) => a + k.offsetWidth, 0) + gap * Math.max(0, kids.length - 1), avail = stage.clientWidth - 52;
    if (need > avail && need > 0) el.style.setProperty("--fit", (Math.max(0.4, avail / need)).toFixed(3));
  }
  function showTask(slide = false): void { const t = now(); if (idx === 0) roundStart = t; sylStart = t; shownAt = t; paintTask(slide); }
  function restart(el: Element, cls: string, ms: number): void { el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }
  const syl = (): HTMLElement => root.querySelector("#syl") as HTMLElement;
  function burst(): void {
    const sp = root.querySelector("#spark") as HTMLElement | null; if (!sp) return;
    if (sp.getAnimations) sp.getAnimations().forEach((a) => a.cancel()); curCenter(syl());
    Array.prototype.forEach.call(sp.children, (el: HTMLElement) => {
      const a = rng() * 2 * Math.PI, r = 70 + rng() * 80; el.style.setProperty("--dx", Math.round(Math.cos(a) * r) + "px"); el.style.setProperty("--dy", Math.round(Math.sin(a) * r * .8) + "px");
      el.style.setProperty("--rot", Math.round((rng() - .5) * 500) + "deg"); el.style.animationDelay = (rng() * .08).toFixed(2) + "s";
    });
    restart(sp, "go", 1100); const o = root.querySelector("#pbarOwl"); if (o) restart(o, "act", 800);
  }
  function next(): void {
    if (!setup) return;
    if (pending) { if (now() - lastClick < 400) return; pending(); }   // Doppeltippen ignorieren, späterer Klick schließt den Übergang sofort ab
    else if (now() - shownAt < 400) return;
    lastClick = now();
    times.push({ s: setup.tasks[idx], sec: Math.round((now() - sylStart) / 100) / 10 });
    if (idx >= setup.tasks.length - 1) { finish(); return; }
    // Erst Sterne um die aktuelle Hauptsilbe, dann fährt die Silbe weiter
    burst(); const cur = setup;
    const step = (): void => { if (!pending) return; clearTimeout(timer); pending = null; if (setup !== cur) return; idx++; showTask(true); };
    const timer = setTimeout(step, 200); pending = step;
  }
  function finish(): void {
    const d = data as Data, s = setup as RoundSetup, cfg = d.config as SilbenflugConfig;
    lastSecs = Math.round((now() - roundStart) / 100) / 10;
    d.st = finishRound(d.st, { seconds: lastSecs, syllables: times }, cfg);
    d.queue.push({ clientRoundId: newRoundId(rng), seconds: lastSecs, syllables: times, letters: s.letters, playedAt: new Date(now()).toISOString() });
    save(); setup = null; go("end");
    void sync().then(() => { if (cur() === "end") showPopup(); });
  }
  function renderEnd(): void {
    const nm = session ? session.name : "", n = Math.round(lastSecs);
    root.innerHTML = '<section class="card end enter">' + owl("bigmascot owl") + "<h2>" + (nm ? "Herzlichen Glückwunsch, " + esc(nm) + "!" : "Geschafft!") + '</h2><p class="time"><span class="tl">Deine Zeit</span>' + (n === 1 ? "1 Sekunde" : n + " Sekunden") + '</p></section>' +
      '<div class="endbtns"><button class="btn" id="again" type="button">Noch mal?</button><button class="btn red" id="stop" type="button">Ende</button></div>' + LAWN;
    (root.querySelector("#again") as HTMLElement).onclick = startPractice; (root.querySelector("#stop") as HTMLElement).onclick = () => go("home");
  }

  // ---------- Glückwunsch-Popup: nur die höchste neu erreichte Stufe je Buchstabe ----------
  function showPopup(): void {
    const d = data; if (popupOpen || !d) return;
    const fresh = d.plan && d.config ? d.plan.letters.filter((l) => !(d.seen || []).includes(l)) : [];
    if (fresh.length && view === "home") {
      popupOpen = true;
      const nb = document.createElement("div"); nb.className = "dlg"; nb.setAttribute("role", "dialog"); nb.setAttribute("aria-modal", "true");
      nb.innerHTML = '<div class="card award">' + owl("bigmascot owl") + "<h2>" + (fresh.length > 1 ? "Neue Buchstaben!" : "Neuer Buchstabe!") + '</h2>' + fresh.map((l) => '<div class="arow nl">' + pair(l) + "</div>").join("") + '<button class="btn" id="nlOk" type="button" style="margin-top:14px">Los geht\'s!</button></div>';
      root.appendChild(nb);
      (nb.querySelector("#nlOk") as HTMLElement).onclick = () => { nb.remove(); popupOpen = false; d.seen = Array.from(new Set((d.seen || []).concat(fresh))); save(); showPopup(); };
      return;
    }
    const aw = d.awards; if (!aw || !aw.pending.length) return;
    popupOpen = true;
    const box = document.createElement("div"); box.className = "dlg"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = '<div class="card award">' + owl("bigmascot owl") + "<h2>Glückwunsch!</h2>" + aw.pending.map((p) => '<div class="arow">' + pair(p.letter) + medal(p.level, true) + "<span>" + LEVEL_NAME[p.level] + "</span></div>").join("") + '<button class="btn" id="awOk" type="button" style="margin-top:14px">Toll!</button></div>';
    root.appendChild(box);
    (box.querySelector("#awOk") as HTMLElement).onclick = () => {
      box.remove(); popupOpen = false; if (data && data.awards) data.awards.pending = []; save();
      void api.post("/student/awards/ack").catch(() => { /* offline: beim nächsten Abgleich kommt es noch einmal */ });
    };
  }

  // ---------- Start ----------
  const ready = (async () => {
    try { const o = JSON.parse(deps.storage.getItem(SESSION_KEY) || "null"); if (o && o.token && o.studentId) session = { token: String(o.token), studentId: String(o.studentId), name: String(o.name || "") }; } catch { /* keine Sitzung */ }
    if (!session) { go("login"); return; }
    api.token = session.token; data = loadData(session.studentId); go("home");
    await sync(); if (session && cur() === "home") render();
  })();
  const again = (): void => { if (session && view !== "practice") void sync().then(() => { if (session && cur() === "home") render(); }); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) again(); });
  if (typeof window !== "undefined") window.addEventListener("online", again);
  return { ready };
}
