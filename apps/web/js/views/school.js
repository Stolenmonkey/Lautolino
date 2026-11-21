// Schul- und Lehrerbereich: Klassen, Schüler, Lernplan, Zugänge (Schulleitung).
import { h, clear, table, notice, act } from "../dom.js";
import { auswertung } from "./auswertung.js";
import { elternPanel } from "./eltern.js";
import { uebersicht } from "./uebersicht.js";
import { silbenPanel } from "./silben.js";
import { sperre } from "./sperre.js";

export const schoolTabs = (role) => ({ lernplan: "Buchstaben", uebersicht: "Klasse", auswertung: "Statistik", schueler: "Einstellungen", ...(role === "schulleitung" ? { klassen: "Klassen und Schuljahre", zugaenge: "Lehrerzugänge" } : {}) });
const state = { classId: null };

export async function schoolView(tab, root, { api, user }) {
  const msg = h("div"), sid = user.schoolId; clear(root).append(msg);
  const classes = await api.get(`/schools/${sid}/classes`), reload = () => schoolView(tab, root, { api, user });
  if (tab === "klassen") return klassen(root, api, sid, classes, msg, reload);
  if (tab === "zugaenge") return zugaenge(root, api, sid, classes, msg, reload);
  if (!classes.length) { root.append(notice(user.role === "lehrer" ? "Dir ist noch keine Klasse zugewiesen. Bitte die Schulleitung bitten." : "Bitte zuerst unter „Klassen und Schuljahre“ eine Klasse anlegen.")); return; }
  if (!classes.some((c) => c.id === state.classId)) state.classId = classes[0].id;
  const sel = h("select", { "aria-label": "Klasse", onchange: () => { state.classId = sel.value; schoolView(tab, root, { api, user }); } }, classes.map((c) => h("option", { value: c.id, selected: c.id === state.classId }, c.name)));
  const slot = h("span");   // Platz neben der Klassenauswahl (Auswertung: Schüler-Dropdown)
  root.append(h("div", { class: "toprow" }, classes.length > 1 ? h("label", { class: "klasse" }, "Klasse ", sel) : h("span"), slot));
  const body = h("div"); root.append(body);
  await (tab === "lernplan" ? lernplan : tab === "auswertung" ? auswertung : tab === "uebersicht" ? uebersicht : schueler)(body, api, state.classId, classes, msg, slot);
}

async function schueler(root, api, cid, classes, msg) {
  const kidsUrl = window.SILBENFLUG_KIDS_URL || "https://stolenmonkey.github.io/Lautolino/apps/kids/";
  const list = h("div"), codes = h("div"), parents = h("div"), load = async () => {
    const rows = await api.get(`/classes/${cid}/students`);
    const missing = rows.some((s) => s.active && (!s.code || !s.parent_code));
    clear(list).append(rows.length ? table(["Name", "Status", "", "Passwort Kind", "Passwort Eltern", ""], rows.map((s) => [s.code ? h("a", { href: kidsUrl + "#code=" + encodeURIComponent(s.code), target: "_blank", rel: "noopener", title: "Kinder-App mit Passwort öffnen (Test)" }, s.display_name) : s.display_name, s.active ? "aktiv" : "deaktiviert",
      h("button", { type: "button", onclick: () => act(msg, () => api.patch(`/students/${s.id}`, { active: !s.active }), load) }, s.active ? "Deaktivieren" : "Aktivieren"),
      h("span", { class: "code" }, s.code || "—"), h("span", { class: "code" }, s.parent_code || "—"),
      h("details", { class: "more" }, h("summary", { "aria-label": "Weitere Aktionen" }, "⋯"), h("span", { class: "row" },
        h("button", { type: "button", onclick: () => elternPanel(clear(parents), api, s, msg, load) }, "Eltern"),
        h("button", { type: "button", onclick: () => act(msg, () => api.post(`/students/${s.id}/code/regenerate`), load) }, "Neues Kinderpasswort"),
        classes.length > 1 ? h("select", { "aria-label": "Verschieben", onchange: (e) => e.target.value && act(msg, () => api.post(`/students/${s.id}/move`, { classId: e.target.value }), load) },
          h("option", { value: "" }, "Verschieben …"), classes.filter((c) => c.id !== cid).map((c) => h("option", { value: c.id }, c.name))) : null))]), { wide: true }) : h("p", { class: "muted" }, "Noch keine Kinder in dieser Klasse."),
      missing ? h("div", { class: "row noprint" }, h("button", { type: "button", id: "missingCodes", onclick: () => confirm("Für Kinder ohne sichtbares Passwort werden neue Passwörter erzeugt. Die alten werden ungültig. Fortfahren?") && act(msg, async () => { const r = await api.post(`/classes/${cid}/codes/missing`); clear(msg).append(notice(`${r.created} Passwörter erzeugt.`, "ok")); }, load) }, "Fehlende Passwörter erzeugen")) : null,
      rows.length ? h("button", { type: "button", class: "noprint", onclick: () => window.print() }, "Drucken") : null);
  };
  const showCodes = (rows, text) => { const withParent = rows.some((r) => r.parentCode); clear(codes).append(h("div", { class: "card" }, h("p", {}, text + ""),
    table(["Name", ...(rows.some((r) => r.code) ? ["Schülercode (Merkschlüssel)"] : []), ...(withParent ? ["Elterncode"] : [])], rows.map((r) => [r.displayName, ...(rows.some((x) => x.code) ? [h("span", { class: "code" }, r.code || "")] : []), ...(withParent ? [h("span", { class: "code" }, r.parentCode || "")] : [])])), h("button", { type: "button", class: "noprint", onclick: () => window.print() }, "Drucken"))); };
  const names = h("textarea", { placeholder: "Ein Name pro Zeile" });
  root.append(h("h2", {}, "Einstellungen"), list, codes, parents,
    h("div", { class: "row" }, h("button", { type: "button", id: "missingParent", onclick: () => act(msg, async () => { const r = await api.post(`/classes/${cid}/parent-codes/missing`); if (!r.length) clear(msg).append(notice("Alle aktiven Kinder haben schon einen Elterncode.", "ok")); else showCodes(r.map((x) => ({ displayName: x.displayName, parentCode: x.code })), `${r.length} Elterncodes erzeugt.`); }) }, "Elterncodes für Kinder ohne Code erzeugen")), h("h3", {}, "Kinder hinzufügen"), names, h("div", { class: "row" }, h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
    const list2 = names.value.split("\n").map((x) => x.trim()).filter(Boolean); if (!list2.length) return;
    const r = await api.post(`/classes/${cid}/students`, { names: list2 }); names.value = ""; showCodes(r, `${r.length} Kinder angelegt.`);
  }, load) }, "Anlegen")));
  await act(msg, load);
}

// Einfarbige SVG-Icons (Emoji-Zeichen wie ⏸ werden auf manchen Geräten gelb gezeichnet und ignorieren die Textfarbe).
function svgIcon(d) {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
  svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("width", "16"); svg.setAttribute("height", "16"); svg.setAttribute("aria-hidden", "true"); svg.style.verticalAlign = "middle";
  path.setAttribute("d", d); path.setAttribute("fill", "currentColor"); svg.append(path); return svg;
}

// Freigaben: Klick auf "Silben ansehen" zeigt die Silben direkt unter dem Buchstaben, geordnet nach den 7 Lernstufen (bleibt stehen, kein Ein-/Ausklappen).
function freigabeTabelle(api, cid, releases, msg, sp, reload) {
  const head = ["Buchstabe", "Datum", "Silbenumfang", "Aktion"];
  const rows = releases.map((r) => {
    const cell = h("td", { colspan: String(head.length) }), detail = h("tr", { class: "scopedetail", hidden: "" }, cell), cnt = h("span", {}, String(r.syllable_count)), chev = h("span", { class: "chev" }, "▾"), btn = h("button", { type: "button", class: "chevbtn", title: "Silben ansehen", "aria-label": "Silben ansehen" }, cnt, chev);
    let all = null, title = null;   // all: alle Silben des Buchstabens inkl. gesperrter
    const setTitle = () => { if (title) { title.textContent = `Silben von ${r.letter.toUpperCase()}`; } };
    sp.onChange(async () => { const p = await api.get(`/classes/${cid}/plan`), x = p.releases.find((q) => q.letter === r.letter); if (x) cnt.textContent = String(x.syllable_count); setTitle(); });
    btn.onclick = () => act(msg, async () => {
      if (!detail.hidden) { detail.hidden = true; chev.textContent = "▾"; return; }
      const [s, m] = await Promise.all([api.get(`/classes/${cid}/releases/${r.letter}/scope`), import("../scope.bundle.js")]);
      all = s; title = h("strong"); setTitle();
      clear(cell).append(title, h("div", { class: "panel flush tablewrap" }, h("table", { class: "plain freigaben" }, h("thead", {}, h("tr", {}, ["Stufe", "Info", "Silben"].map((x) => h("th", {}, x)))), h("tbody", {}, m.stageRows(s).map((g) => h("tr", {}, [
        h("strong", {}, `${g.stage}.`), g.structure, g.syllables.length ? h("div", { class: "chips" }, g.syllables.map((x) => sp.chip(x, x.toUpperCase()))) : h("span", { class: "muted" }, "–") ].map((c) => h("td", {}, c))))))));
      detail.hidden = false; chev.textContent = "▴";
    });
    // Vor der ersten gespielten Runde: Löschen (Tippfehler zurücknehmen). Danach nur Pausieren und Fortsetzen.
    const aktion = !r.played
      ? h("button", { type: "button", class: "iconbtn", title: "Löschen", "aria-label": "Löschen", onclick: () => confirm(`Buchstabe ${r.letter.toUpperCase()} wirklich löschen? Es wurde noch nicht gespielt.`) && act(msg, async () => {
          const plan = await api.get(`/classes/${cid}/plan`), m = await import("../scope.bundle.js"), cfg = (await api.get("/config")).config;
          const order = plan.releases.map((x) => ({ letter: x.letter, start: !!x.start_group, paused: !!x.paused_at }));
          await api.del(`/classes/${cid}/releases/${r.letter}`, { scopes: m.computeDeleteScopes(order, r.letter, cfg) });
          clear(msg).append(notice(`${r.letter.toUpperCase()} gelöscht.`, "ok"));
        }, reload) }, "✕")
      : r.paused_at
        ? h("button", { type: "button", class: "iconbtn", title: "Fortsetzen", "aria-label": "Fortsetzen", onclick: () => act(msg, async () => {
            const plan = await api.get(`/classes/${cid}/plan`), m = await import("../scope.bundle.js"), cfg = (await api.get("/config")).config, me = plan.releases.find((x) => x.letter === r.letter);
            const active = plan.releases.filter((x) => !x.paused_at).map((x) => x.letter), later = plan.releases.filter((x) => !x.paused_at && x.release_order > me.release_order).map((x) => x.letter);
            const existing = await api.get(`/classes/${cid}/releases/${r.letter}/scope`);
            const res = await api.put(`/classes/${cid}/releases/${r.letter}/pause`, { paused: false, scope: m.computeResume(active, later, r.letter, existing, cfg) });
            clear(msg).append(notice(`${r.letter.toUpperCase()} wird wieder geübt.` + (res.added ? ` ${res.added} neue Silben ergänzt.` : ""), "ok"));
          }, reload) }, svgIcon("M4 2l10 6-10 6z"))
        : h("button", { type: "button", class: "iconbtn", title: "Pausieren", "aria-label": "Pausieren", onclick: () => confirm(`Buchstabe ${r.letter.toUpperCase()} pausieren? Zeiten und Auszeichnungen bleiben, der Buchstabe kommt in keiner Übung mehr vor.`) && act(msg, async () => {
            await api.put(`/classes/${cid}/releases/${r.letter}/pause`, { paused: true });
            clear(msg).append(notice(`${r.letter.toUpperCase()} pausiert.`, "ok"));
          }, reload) }, svgIcon("M3 2h3v12H3zM10 2h3v12h-3z"));
    return [h("tr", {}, [h("strong", {}, r.letter.toUpperCase() + (r.paused_at ? " (pausiert)" : "")), r.released_at ? new Date(r.released_at).toLocaleDateString("de-DE") : "–", btn, h("div", { class: "row" }, aktion)].map((c) => h("td", {}, c))), detail, { r, cnt }];
  });
  // Sortierung per Klick auf die Überschrift (Buchstabe A–Z, Datum älteste zuerst, Silbenumfang aufsteigend); erneuter Klick dreht um.
  const tbody = h("tbody", {}), keys = [(x) => x.r.letter, (x) => x.r.release_order, (x) => Number(x.cnt.textContent)];
  let sortCol = -1, dir = 1;
  const render = () => {
    const list = rows.slice();
    if (sortCol >= 0) list.sort((a, b) => { const x = keys[sortCol](a[2]), y = keys[sortCol](b[2]); return (x < y ? -1 : x > y ? 1 : a[2].r.release_order - b[2].r.release_order) * dir; });
    tbody.replaceChildren(...list.flatMap((q) => [q[0], q[1]]));
  };
  const ths = head.map((x, i) => { const th = h("th", {}, x); if (i < 3) { th.style.cursor = "pointer"; th.title = "Sortieren"; th.onclick = () => { dir = sortCol === i ? -dir : 1; sortCol = i; ths.forEach((t, j) => j < 3 && t.setAttribute("aria-sort", j === i ? (dir > 0 ? "ascending" : "descending") : "none")); render(); }; } return th; });
  render();
  return h("div", { class: "panel flush tablewrap" }, h("table", { class: "plain freigaben" }, h("thead", {}, h("tr", {}, ths)), tbody));
}

// Ausnahmen je Kind: Funktion bleibt erhalten, Abschnitt ist vorerst ausgeblendet (auf true setzen zum Anzeigen).
const SHOW_AUSNAHMEN = false;

async function lernplan(root, api, cid, classes, msg) {
  const plan = await api.get(`/classes/${cid}/plan`), students = await api.get(`/classes/${cid}/students`), reload = () => lernplan(clear(root), api, cid, classes, msg), sp = plan.releases.length ? await sperre(api, cid, msg) : null;
  const start = h("input", { type: "text", size: "8", style: "text-transform:uppercase", "aria-label": "Startbuchstaben" }), letter = h("input", { type: "text", maxlength: "1", size: "2", class: "freigabe-input", style: "text-transform:uppercase", "aria-label": "Neuer Buchstabe" });
  root.append(
    plan.releases.length
      ? h("div", { class: "row freigabe-row" }, h("label", {}, "Nächster Buchstabe:"), letter, h("button", { type: "button", class: "primary muted-blue", onclick: () => act(msg, async () => {
          const r = await api.post(`/classes/${cid}/releases`, await mitUmfang(api, plan, [letter.value.trim().toLowerCase()])), x = r.released[0]; clear(msg).append(notice(`${x.letter.toUpperCase()} freigegeben. Fester Silbenumfang: ${x.syllableCount} Silben.` + (x.syllableCount ? "" : " (Mit den bisherigen Buchstaben ergeben sich keine neuen Silben.)"), "ok"));
        }, reload) }, "Freigeben"))
      : h("div", { class: "card" }, h("p", {}, "Die Klasse startet mit mindestens 2 Buchstaben, darunter ein Vokal (z. B. O L)."), h("div", { class: "row" }, h("label", {}, "Startbuchstaben ", start), h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
          const r = await api.post(`/classes/${cid}/releases`, await mitUmfang(api, plan, [...new Set(start.value.toLowerCase().match(/[a-z]/g) || [])])); clear(msg).append(notice(`Freigegeben: ${r.released.map((x) => x.letter.toUpperCase() + " (" + x.syllableCount + " Silben)").join(", ")}.`, "ok"));
        }, reload) }, "Startbuchstaben freigeben"))),
    h("div", { class: "sechead" }, h("h2", { class: "small" }, "Freigegebene Buchstaben")), plan.releases.length ? freigabeTabelle(api, cid, plan.releases, msg, sp, reload) : h("p", { class: "muted" }, "Noch kein Buchstabe freigegeben."));
  if (plan.releases.length) { const box = h("div"); root.append(box); await klassenSilben(box, api, cid, sp); }
  if (SHOW_AUSNAHMEN && plan.releases.length && students.length) {
    root.append(h("h3", {}, "Ausnahmen einzelner Kinder"), h("p", { class: "muted" }, "Haken = dieses Kind übt den Buchstaben (noch) nicht. Gilt nur für die Freigabe, nicht für Zeitpläne."),
      table(["Kind", ...plan.releases.map((r) => r.letter.toUpperCase()), ""], students.map((s) => {
        const ex = plan.exclusions[s.id] || [], boxes = plan.releases.map((r) => h("input", { type: "checkbox", value: r.letter, checked: ex.includes(r.letter), "aria-label": `${s.display_name} ohne ${r.letter}` }));
        return [s.display_name, ...boxes, h("button", { type: "button", onclick: () => act(msg, async () => { await api.put(`/students/${s.id}/exclusions`, { letters: boxes.filter((b) => b.checked).map((b) => b.value) }); clear(msg).append(notice("Gespeichert.", "ok")); }) }, "Speichern")];
      }), { wide: true }));
  }
}

async function klassenSilben(root, api, cid, sp) { await silbenPanel(root, api, cid, sp); }

async function klassen(root, api, sid, classes, msg, reload) {
  const years = await api.get(`/schools/${sid}/years`);
  const yl = h("input", { type: "text", placeholder: "z. B. 2026/27" }), cn = h("input", { type: "text", placeholder: "z. B. 1a" }), ys = h("select", {}, years.map((y) => h("option", { value: y.id }, y.label)));
  root.append(h("h2", {}, "Schuljahre"), years.length ? table(["Schuljahr"], years.map((y) => [y.label])) : h("p", { class: "muted" }, "Noch kein Schuljahr."),
    h("div", { class: "row" }, yl, h("button", { type: "button", onclick: () => act(msg, () => api.post(`/schools/${sid}/years`, { label: yl.value }), reload) }, "Schuljahr anlegen")),
    h("h2", {}, "Klassen"), classes.length ? table(["Klasse"], classes.map((c) => [c.name])) : h("p", { class: "muted" }, "Noch keine Klasse."),
    h("div", { class: "row" }, ys, cn, h("button", { type: "button", onclick: () => act(msg, () => api.post(`/schools/${sid}/classes`, { schoolYearId: ys.value, name: cn.value }), reload) }, "Klasse anlegen")));
}

// Berechnet den Silbenumfang im Browser und liefert den Body für POST /releases (Server prüft und speichert nur).
async function mitUmfang(api, plan, group) {
  const first = !plan.releases.length, known = plan.releases.filter((r) => !r.paused_at).map((r) => r.letter);   // pausierte Buchstaben kommen in neuen Silben nicht vor
  if (!first && !/^[a-z]$/.test(group[0] || "")) throw new Error("Bitte einen Buchstaben von A bis Z eingeben");
  if (first && group.length < 2) return { letters: group };
  const [{ config }, m] = await Promise.all([api.get("/config"), import("../scope.bundle.js")]);
  const scopes = m.computeScopes(known, group, config);
  return first ? { letters: group, scopes } : { letter: group[0], scopes };
}

async function zugaenge(root, api, sid, classes, msg, reload) {
  const staff = await api.get(`/schools/${sid}/staff`), mail = h("input", { type: "email", placeholder: "E-Mail der Lehrkraft" }), out = h("div");
  root.append(h("h2", {}, "Lehrerzugänge"), table(["E-Mail", "Rolle", "Klassen", "Status", ""], staff.map((u) => {
    const ids = (u.class_ids || "").split(",").filter(Boolean), boxes = classes.map((c) => h("label", {}, h("input", { type: "checkbox", value: c.id, checked: ids.includes(c.id) }), c.name));
    return [u.email, u.role === "lehrer" ? "Lehrkraft" : "Schulleitung", u.role === "lehrer" ? h("div", { class: "row" }, boxes, h("button", { type: "button", onclick: () => act(msg, async () => { await api.put(`/schools/${sid}/staff/${u.id}/classes`, { classIds: boxes.map((l) => l.firstChild).filter((b) => b.checked).map((b) => b.value) }); clear(msg).append(notice("Klassen gespeichert.", "ok")); }) }, "Speichern")) : "alle", u.active ? "aktiv" : "deaktiviert",
      u.role === "lehrer" ? h("button", { type: "button", onclick: () => act(msg, () => api.patch(`/schools/${sid}/staff/${u.id}`, { active: !u.active }), reload) }, u.active ? "Deaktivieren" : "Aktivieren") : ""];
  })), h("h3", {}, "Lehrkraft anlegen"), h("div", { class: "row" }, mail, h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => { const r = await api.post(`/schools/${sid}/staff`, { email: mail.value.trim() }); clear(out).append(notice(r.emailSent ? `Zugang für ${r.email} angelegt. Eine E-Mail mit dem Einladungslink zur Passwortvergabe wurde gesendet.` : `Zugang für ${r.email} angelegt. Der E-Mail-Versand ist nicht eingerichtet oder fehlgeschlagen. Startpasswort (nur jetzt sichtbar): ${r.initialPassword}`, "ok")); mail.value = ""; }) }, "Anlegen")), out);
}
