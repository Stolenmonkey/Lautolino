import { describe, expect, it } from "vitest";
import { applyLicenseAction, effectiveStatus, isWritable, type SchoolLicense } from "../apps/server/src/license";

const base: SchoolLicense = { license_status: "angelegt", license_end: null, active: 0, payment_confirmed_at: null };
const now = new Date("2026-11-01T00:00:00Z");
describe("Lizenzlogik", () => {
  it("nur bestätigte Zahlung aktiviert", () => {
    expect(applyLicenseAction(base, "zahlung_bestaetigt", now, undefined).ok).toBe(false);
    const r = applyLicenseAction(base, "zahlung_bestaetigt", now, "2027-07-31T00:00:00Z");
    expect(r).toMatchObject({ ok: true, status: "aktiv", active: 1 });
  });
  it("überschrittenes Lizenzende zählt als abgelaufen und sperrt Schreiben", () => {
    const s: SchoolLicense = { license_status: "aktiv", license_end: "2026-10-31T00:00:00Z", active: 1, payment_confirmed_at: "x" };
    expect(effectiveStatus(s, now)).toBe("abgelaufen"); expect(isWritable(s, now)).toBe(false);
    expect(isWritable({ ...s, license_end: "2027-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isWritable({ ...s, license_status: "verlaengerung_faellig", license_end: "2027-01-01T00:00:00Z" }, now)).toBe(true);
  });
  it("Verlängerung stellt wieder her, Lizenzende in der Vergangenheit wird abgelehnt", () => {
    const s: SchoolLicense = { license_status: "abgelaufen", license_end: "2026-10-31T00:00:00Z", active: 1, payment_confirmed_at: "x" };
    expect(applyLicenseAction(s, "verlaengert", now, "2026-01-01T00:00:00Z").ok).toBe(false);
    expect(applyLicenseAction(s, "verlaengert", now, "2027-10-31T00:00:00Z")).toMatchObject({ ok: true, status: "aktiv" });
  });
  it("inaktive Schule ist nie beschreibbar", () => expect(isWritable({ ...base, license_status: "aktiv", active: 0 }, now)).toBe(false));
});
