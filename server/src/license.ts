// Lizenzstatus und erlaubte Übergänge. Eine Schule wird erst nach bestätigtem Zahlungseingang aktiv.
export type LicenseStatus = "angelegt" | "zahlung_ausstehend" | "aktiv" | "verlaengerung_faellig" | "abgelaufen";
export type LicenseAction = "zahlung_ausstehend" | "zahlung_bestaetigt" | "verlaengerung_faellig" | "verlaengert" | "abgelaufen" | "deaktiviert";
export interface SchoolLicense { license_status: LicenseStatus; license_end: string | null; active: number; payment_confirmed_at: string | null }

// Wirksamer Status: ein überschrittenes Ablaufdatum zählt als abgelaufen, auch wenn niemand den Status gesetzt hat.
export function effectiveStatus(s: SchoolLicense, now: Date): LicenseStatus {
  if ((s.license_status === "aktiv" || s.license_status === "verlaengerung_faellig") && s.license_end && new Date(s.license_end) < now) return "abgelaufen";
  return s.license_status;
}
// Neue Lernaktivitäten und Änderungen sind nur bei aktiver Schule mit gültiger Lizenz erlaubt. Lesen bleibt immer möglich.
export function isWritable(s: SchoolLicense, now: Date): boolean {
  const e = effectiveStatus(s, now);
  return s.active === 1 && (e === "aktiv" || e === "verlaengerung_faellig");
}
const FROM: Record<LicenseAction, LicenseStatus[] | "any"> = {
  zahlung_ausstehend: ["angelegt"],
  zahlung_bestaetigt: ["angelegt", "zahlung_ausstehend"],
  verlaengerung_faellig: ["aktiv"],
  verlaengert: ["aktiv", "verlaengerung_faellig", "abgelaufen"],
  abgelaufen: ["aktiv", "verlaengerung_faellig"],
  deaktiviert: "any",
};
export type LicenseChange = { ok: true; status: LicenseStatus; active: number; paymentConfirmedAt: string | null; licenseEnd: string | null } | { ok: false; error: string };

export function applyLicenseAction(s: SchoolLicense, action: LicenseAction, now: Date, licenseEnd?: string | null): LicenseChange {
  const from = FROM[action];
  if (!from) return { ok: false, error: "unbekannte Aktion" };
  const cur = s.license_status;
  if (from !== "any" && from.indexOf(cur) < 0) return { ok: false, error: `Aktion ${action} ist im Status ${cur} nicht erlaubt` };
  const iso = now.toISOString();
  if (licenseEnd != null && isNaN(Date.parse(licenseEnd))) return { ok: false, error: "licenseEnd ist kein Datum" };
  if ((action === "zahlung_bestaetigt" || action === "verlaengert") && !(licenseEnd || s.license_end)) return { ok: false, error: "Für die Aktivierung wird ein Lizenzende (licenseEnd) benötigt" };
  const end = licenseEnd ?? s.license_end;
  if ((action === "zahlung_bestaetigt" || action === "verlaengert") && end && new Date(end) < now) return { ok: false, error: "Lizenzende liegt in der Vergangenheit" };
  switch (action) {
    case "zahlung_ausstehend": return { ok: true, status: "zahlung_ausstehend", active: 0, paymentConfirmedAt: s.payment_confirmed_at, licenseEnd: end };
    case "zahlung_bestaetigt": case "verlaengert": return { ok: true, status: "aktiv", active: 1, paymentConfirmedAt: iso, licenseEnd: end };
    case "verlaengerung_faellig": return { ok: true, status: "verlaengerung_faellig", active: s.active, paymentConfirmedAt: s.payment_confirmed_at, licenseEnd: end };
    case "abgelaufen": return { ok: true, status: "abgelaufen", active: s.active, paymentConfirmedAt: s.payment_confirmed_at, licenseEnd: end };
    case "deaktiviert": return { ok: true, status: s.license_status, active: 0, paymentConfirmedAt: s.payment_confirmed_at, licenseEnd: end };
  }
}
