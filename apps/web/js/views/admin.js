// Zentrale Verwaltung: Schulen und Lizenzen, globale Konfiguration, Protokoll.
import { h, clear, table, notice, act, fmtDate, fmtDay } from "../dom.js";

const STATUS = { angelegt: "Angelegt", zahlung_ausstehend: "Zahlung ausstehend", aktiv: "Aktiv", verlaengerung_faellig: "Verlängerung fällig", abgelaufen: "Abgelaufen" };
const ACTIONS = { zahlung_ausstehend: "Zahlung ausstehend setzen", zahlung_bestaetigt: "Zahlung bestätigen (aktivieren)", verlaengerung_faellig: "Verlängerung fällig setzen", verlaengert: "Verlängerung bestätigen", abgelaufen: "Als abgelaufen setzen", deaktiviert: "Schule deaktivieren" };

export const adminTabs = { schulen: "Schulen", konfiguration: "Konfiguration", protokoll: "Protokoll" };

export async function adminView(tab, root, { api }) {
  const msg = h("div"); clear(root).append(msg);
  if (tab === "schulen") return schulen(root, api, msg);
  if (tab === "konfiguration") return konfiguration(root, api, msg);
  return protokoll(root, api, msg);
}

async function schulen(root, api, msg) {
  const list = h("div"), load = async () => {
    const rows = await api.get("/admin/schools");
    clear(list).append(table(["Schule", "Status", "Lizenzende", "Zahlung bestätigt", "Aktiv", ""], rows.map((s) => [
      s.name, STATUS[s.effective_status] + (s.effective_status !== s.license_status ? " (Ablaufdatum überschritten)" : ""), fmtDay(s.license_end), fmtDay(s.payment_confirmed_at), s.active ? "ja" : "nein",
      h("button", { type: "button", onclick: () => detail(s) }, "Verwalten")])));
  };
  const detail = (s) => {
    const sel = h("select", {}, Object.entries(ACTIONS).map(([k, v]) => h("option", { value: k }, v))), end = h("input", { type: "date" }), note = h("input", { type: "text", placeholder: "Notiz (optional)" }), mail = h("input", { type: "email", placeholder: "E-Mail der Schulleitung" }), out = h("div");
    const card = h("div", { class: "card" }, h("h3", {}, s.name),
      h("div", { class: "row" }, sel, h("label", {}, "Lizenzende ", end), note, h("button", { type: "button", class: "primary", onclick: () => act(out, async () => {
        const r = await api.post(`/admin/schools/${s.id}/license`, { action: sel.value, licenseEnd: end.value ? new Date(end.value + "T23:59:59Z").toISOString() : undefined, note: note.value || undefined });
        clear(out).append(notice("Gespeichert: " + STATUS[r.licenseStatus] + (r.active ? ", aktiv" : ", nicht aktiv"), "ok"));
      }, load) }, "Ausführen")),
      h("div", { class: "row" }, mail, h("button", { type: "button", onclick: () => act(out, async () => {
        const r = await api.post("/admin/staff", { role: "schulleitung", schoolId: s.id, email: mail.value.trim() });
        clear(out).append(notice(`Zugang angelegt für ${r.email}. Startpasswort (nur jetzt sichtbar): ${r.initialPassword}`, "ok"));
      }) }, "Schulleitung anlegen")), out);
    clear(detailBox).append(card);
  };
  const detailBox = h("div"), name = h("input", { type: "text", placeholder: "Schulname" }), fee = h("input", { type: "number", placeholder: "Gebühr (€)", step: "0.01" }), bill = h("textarea", { placeholder: "Rechnungsdaten" });
  root.append(h("h2", {}, "Schulen"), list, detailBox, h("h3", {}, "Neue Schule"), h("div", { class: "row" }, name, fee), bill,
    h("div", { class: "row" }, h("button", { class: "primary", type: "button", onclick: () => act(msg, async () => {
      await api.post("/admin/schools", { name: name.value, fee: fee.value ? Number(fee.value) : undefined, billingData: bill.value || undefined }); name.value = ""; fee.value = ""; bill.value = "";
    }, load) }, "Schule anlegen")));
  await act(msg, load);
}

// Konfiguration: aus der aktiven Konfiguration wird automatisch ein Formular erzeugt. Speichern erzeugt eine neue Version.
const LABELS = { syl_time: "Silbenzeit", auto: "Automatik", round: "Aufgabenverteilung", mastery: "Bewertung sicher beherrschter Silben", award: "Auszeichnungen (Prozentgrenzen)", unlock: "Freischaltung", retention: "Löschfristen (Tage)", security: "Sicherheit" };
async function konfiguration(root, api, msg) {
  const cur = await api.get("/config"), inputs = [], form = h("div");
  const walk = (o, path, into) => {
    for (const [k, v] of Object.entries(o)) {
      const p = [...path, k];
      if (v !== null && typeof v === "object") { walk(v, p, into); continue; }
      if (p[0] === "unlock") { into.append(h("div", { class: "row muted" }, "unlock.rules: noch nicht festgelegt")); continue; }
      const inp = h("input", { type: "number", step: "any", value: v === null ? "" : String(v), "aria-label": p.join(".") });
      inputs.push({ path: p, inp, nullable: v === null });
      into.append(h("div", { class: "row" }, h("label", {}, h("span", { class: "mono", style: "min-width:260px" }, p.slice(1).join(".")), inp, v === null ? h("span", { class: "muted" }, "(leer = nicht festgelegt)") : null)));
    }
  };
  for (const sec of Object.keys(cur.config)) { const box = h("div", { class: "card" }, h("h3", {}, LABELS[sec] || sec)); walk({ [sec]: cur.config[sec] }, [], box); form.append(box); }
  const note = h("input", { type: "text", placeholder: "Notiz zur Änderung", style: "min-width:300px" }), versions = h("div");
  const loadVersions = async () => { const v = await api.get("/admin/config/versions"); clear(versions).append(table(["Version", "gültig ab", "Notiz", "aktiv"], v.map((x) => [x.version, fmtDate(x.valid_from), x.change_note || "", x.is_active ? "ja" : ""]))); };
  root.append(h("h2", {}, `Globale Konfiguration (aktive Version ${cur.version})`), h("p", { class: "muted" }, "Gilt einheitlich für alle Schulen. Änderungen wirken nur auf künftige Messungen; bereits vergebene Auszeichnungen bleiben unverändert."), form,
    h("div", { class: "row" }, note, h("button", { class: "primary", type: "button", onclick: () => act(msg, async () => {
      const next = JSON.parse(JSON.stringify(cur.config));
      for (const { path, inp, nullable } of inputs) {
        let o = next; for (const k of path.slice(0, -1)) o = o[k];
        const raw = inp.value.trim(); o[path[path.length - 1]] = raw === "" ? (nullable ? null : NaN) : Number(raw);
      }
      const r = await api.post("/admin/config", { config: next, note: note.value || undefined });
      clear(msg).append(notice(`Neue Version ${r.version} ist aktiv. Seite neu laden, um sie zu sehen.`, "ok"));
    }, loadVersions) }, "Als neue Version speichern")), h("h3", {}, "Versionen"), versions);
  await act(msg, loadVersions);
}

async function protokoll(root, api, msg) {
  await act(msg, async () => { const rows = await api.get("/admin/audit"); root.append(h("h2", {}, "Protokoll (letzte 200)"), table(["Zeit", "Aktion", "Ziel", "Von"], rows.map((r) => [fmtDate(r.at), r.action, h("span", { class: "mono" }, r.target || ""), h("span", { class: "mono" }, r.actor || "")]))); });
}
