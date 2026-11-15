// Schul- und Lehrerbereich: Klassen, Schüler, Lernplan, Zugänge (Schulleitung).
import { h, clear, table, notice, act, fmtDate } from "../dom.js";
import { auswertung } from "./auswertung.js";
import { elternPanel } from "./eltern.js";

export const schoolTabs = (role) => ({ schueler: "Schüler", auswertung: "Auswertung", lernplan: "Lernplan", ...(role === "schulleitung" ? { klassen: "Klassen und Schuljahre", zugaenge: "Lehrerzugänge" } : {}) });
const state = { classId: null };

export async function schoolView(tab, root, { api, user }) {
  const msg = h("div"), sid = user.schoolId; clear(root).append(msg);
  const classes = await api.get(`/schools/${sid}/classes`), reload = () => schoolView(tab, root, { api, user });
  if (tab === "klassen") return klassen(root, api, sid, classes, msg, reload);
  if (tab === "zugaenge") return zugaenge(root, api, sid, classes, msg, reload);
  if (!classes.length) { root.append(notice(user.role === "lehrer" ? "Dir ist noch keine Klasse zugewiesen. Bitte die Schulleitung bitten." : "Bitte zuerst unter „Klassen und Schuljahre“ eine Klasse anlegen.")); return; }
  if (!classes.some((c) => c.id === state.classId)) state.classId = classes[0].id;
  const sel = h("select", { "aria-label": "Klasse", onchange: () => { state.classId = sel.value; schoolView(tab, root, { api, user }); } }, classes.map((c) => h("option", { value: c.id, selected: c.id === state.classId }, c.name)));
  root.append(h("div", { class: "row" }, h("label", {}, "Klasse ", sel)));
  const body = h("div"); root.append(body);
  await (tab === "lernplan" ? lernplan : tab === "auswertung" ? auswertung : schueler)(body, api, state.classId, classes, msg);
}

async function schueler(root, api, cid, classes, msg) {
  const list = h("div"), codes = h("div"), parents = h("div"), load = async () => {
    const rows = await api.get(`/classes/${cid}/students`);
    clear(list).append(rows.length ? table(["Name", "Status", ""], rows.map((s) => [s.display_name, s.active ? "aktiv" : "deaktiviert", h("span", { class: "row" },
      h("button", { type: "button", onclick: () => elternPanel(clear(parents), api, s, msg) }, "Eltern"),
      h("button", { type: "button", onclick: () => act(msg, async () => { const r = await api.post(`/students/${s.id}/code/regenerate`); showCodes([{ displayName: s.display_name, code: r.code }], "Neuer Merkschlüssel – der alte ist ungültig."); }) }, "Neuer Merkschlüssel"),
      h("button", { type: "button", onclick: () => act(msg, () => api.patch(`/students/${s.id}`, { active: !s.active }), load) }, s.active ? "Deaktivieren" : "Aktivieren"),
      classes.length > 1 ? h("select", { "aria-label": "Verschieben", onchange: (e) => e.target.value && act(msg, () => api.post(`/students/${s.id}/move`, { classId: e.target.value }), load) },
        h("option", { value: "" }, "Verschieben …"), classes.filter((c) => c.id !== cid).map((c) => h("option", { value: c.id }, c.name))) : null)])) : h("p", { class: "muted" }, "Noch keine Kinder in dieser Klasse."));
  };
  const showCodes = (rows, text) => clear(codes).append(h("div", { class: "card" }, h("p", {}, text + " Die Schlüssel sind nur jetzt sichtbar und werden nicht im Klartext gespeichert."),
    table(["Name", "Merkschlüssel"], rows.map((r) => [r.displayName, h("span", { class: "code" }, r.code)])), h("button", { type: "button", class: "noprint", onclick: () => window.print() }, "Drucken")));
  const names = h("textarea", { placeholder: "Ein Name pro Zeile" });
  root.append(h("h2", {}, "Schüler"), list, codes, parents, h("h3", {}, "Kinder hinzufügen"), names, h("div", { class: "row" }, h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
    const list2 = names.value.split("\n").map((x) => x.trim()).filter(Boolean); if (!list2.length) return;
    const r = await api.post(`/classes/${cid}/students`, { names: list2 }); names.value = ""; showCodes(r, `${r.length} Kinder angelegt.`);
  }, load) }, "Anlegen")));
  await act(msg, load);
}

async function lernplan(root, api, cid, classes, msg) {
  const plan = await api.get(`/classes/${cid}/plan`), students = await api.get(`/classes/${cid}/students`), scopeBox = h("div"), reload = () => lernplan(clear(root), api, cid, classes, msg);
  const lens = [2, 3, 4].map((n) => h("input", { type: "checkbox", value: n, checked: plan.allowedLengths.includes(n) }));
  const start = h("input", { type: "text", size: "8", style: "text-transform:uppercase", "aria-label": "Startbuchstaben" }), letter = h("input", { type: "text", maxlength: "1", size: "2", style: "text-transform:uppercase", "aria-label": "Neuer Buchstabe" });
  root.append(h("h2", {}, "Lernplan der Klasse"),
    h("h3", {}, "Silbenlängen"), h("div", { class: "row" }, [2, 3, 4].map((n, i) => h("label", {}, lens[i], `${n} Buchstaben`)), h("button", { type: "button", onclick: () => act(msg, () => api.put(`/classes/${cid}/settings`, { allowedLengths: lens.filter((x) => x.checked).map((x) => Number(x.value)) }), reload) }, "Speichern")),
    h("p", { class: "muted" }, "Gilt für künftige Freigaben. Der Silbenumfang bereits freigegebener Buchstaben ändert sich nie."),
    h("h3", {}, "Buchstabenfreigabe"), plan.releases.length ? table(["Nr.", "Buchstabe", "Freigegeben", "Silben im festen Umfang", ""], plan.releases.map((r) => [r.release_order, h("strong", {}, r.letter.toUpperCase()), fmtDate(r.released_at), r.syllable_count,
      h("button", { type: "button", onclick: () => act(msg, async () => { const s = await api.get(`/classes/${cid}/releases/${r.letter}/scope`); clear(scopeBox).append(h("div", { class: "card" }, h("strong", {}, `Silben von ${r.letter.toUpperCase()} (${s.length})`), h("div", { class: "chips" }, s.map((x) => h("span", {}, x.toUpperCase()))))); }) }, "Silben ansehen")])) : h("p", { class: "muted" }, "Noch kein Buchstabe freigegeben."), scopeBox,
    plan.releases.length
      ? h("div", { class: "row" }, h("label", {}, "Nächsten Buchstaben freigeben ", letter), h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
          const r = await api.post(`/classes/${cid}/releases`, { letter: letter.value }), x = r.released[0]; clear(msg).append(notice(`${x.letter.toUpperCase()} freigegeben. Fester Silbenumfang: ${x.syllableCount} Silben.` + (x.syllableCount ? "" : " (Mit den bisherigen Buchstaben ergeben sich keine neuen Silben.)"), "ok"));
        }, reload) }, "Freigeben"))
      : h("div", { class: "card" }, h("p", {}, "Die Klasse startet mit mindestens 2 Buchstaben, darunter ein Vokal (z. B. O L)."), h("div", { class: "row" }, h("label", {}, "Startbuchstaben ", start), h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => {
          const r = await api.post(`/classes/${cid}/releases`, { letters: (start.value.toLowerCase().match(/[a-z]/g) || []) }); clear(msg).append(notice(`Freigegeben: ${r.released.map((x) => x.letter.toUpperCase() + " (" + x.syllableCount + " Silben)").join(", ")}.`, "ok"));
        }, reload) }, "Startbuchstaben freigeben"))),
    h("p", { class: "muted" }, "Eine Freigabe kann nicht zurückgenommen werden, weil der Silbenumfang dauerhaft festgelegt wird."));
  if (plan.releases.length && students.length) {
    root.append(h("h3", {}, "Ausnahmen einzelner Kinder"), h("p", { class: "muted" }, "Haken = dieses Kind übt den Buchstaben (noch) nicht. Gilt nur für die Freigabe, nicht für Zeitpläne."),
      table(["Kind", ...plan.releases.map((r) => r.letter.toUpperCase()), ""], students.map((s) => {
        const ex = plan.exclusions[s.id] || [], boxes = plan.releases.map((r) => h("input", { type: "checkbox", value: r.letter, checked: ex.includes(r.letter), "aria-label": `${s.display_name} ohne ${r.letter}` }));
        return [s.display_name, ...boxes, h("button", { type: "button", onclick: () => act(msg, async () => { await api.put(`/students/${s.id}/exclusions`, { letters: boxes.filter((b) => b.checked).map((b) => b.value) }); clear(msg).append(notice("Gespeichert.", "ok")); }) }, "Speichern")];
      })));
  }
}

async function klassen(root, api, sid, classes, msg, reload) {
  const years = await api.get(`/schools/${sid}/years`);
  const yl = h("input", { type: "text", placeholder: "z. B. 2026/27" }), cn = h("input", { type: "text", placeholder: "z. B. 1a" }), ys = h("select", {}, years.map((y) => h("option", { value: y.id }, y.label)));
  root.append(h("h2", {}, "Schuljahre"), years.length ? table(["Schuljahr"], years.map((y) => [y.label])) : h("p", { class: "muted" }, "Noch kein Schuljahr."),
    h("div", { class: "row" }, yl, h("button", { type: "button", onclick: () => act(msg, () => api.post(`/schools/${sid}/years`, { label: yl.value }), reload) }, "Schuljahr anlegen")),
    h("h2", {}, "Klassen"), classes.length ? table(["Klasse"], classes.map((c) => [c.name])) : h("p", { class: "muted" }, "Noch keine Klasse."),
    h("div", { class: "row" }, ys, cn, h("button", { type: "button", onclick: () => act(msg, () => api.post(`/schools/${sid}/classes`, { schoolYearId: ys.value, name: cn.value }), reload) }, "Klasse anlegen")));
}

async function zugaenge(root, api, sid, classes, msg, reload) {
  const staff = await api.get(`/schools/${sid}/staff`), mail = h("input", { type: "email", placeholder: "E-Mail der Lehrkraft" }), out = h("div");
  root.append(h("h2", {}, "Lehrerzugänge"), table(["E-Mail", "Rolle", "Klassen", "Status", ""], staff.map((u) => {
    const ids = (u.class_ids || "").split(",").filter(Boolean), boxes = classes.map((c) => h("label", {}, h("input", { type: "checkbox", value: c.id, checked: ids.includes(c.id) }), c.name));
    return [u.email, u.role === "lehrer" ? "Lehrkraft" : "Schulleitung", u.role === "lehrer" ? h("div", { class: "row" }, boxes, h("button", { type: "button", onclick: () => act(msg, async () => { await api.put(`/schools/${sid}/staff/${u.id}/classes`, { classIds: boxes.map((l) => l.firstChild).filter((b) => b.checked).map((b) => b.value) }); clear(msg).append(notice("Klassen gespeichert.", "ok")); }) }, "Speichern")) : "alle", u.active ? "aktiv" : "deaktiviert",
      u.role === "lehrer" ? h("button", { type: "button", onclick: () => act(msg, () => api.patch(`/schools/${sid}/staff/${u.id}`, { active: !u.active }), reload) }, u.active ? "Deaktivieren" : "Aktivieren") : ""];
  })), h("h3", {}, "Lehrkraft anlegen"), h("div", { class: "row" }, mail, h("button", { type: "button", class: "primary", onclick: () => act(msg, async () => { const r = await api.post(`/schools/${sid}/staff`, { email: mail.value.trim() }); clear(out).append(notice(`Zugang für ${r.email} angelegt. Startpasswort (nur jetzt sichtbar): ${r.initialPassword}`, "ok")); mail.value = ""; }) }, "Anlegen")), out);
}
