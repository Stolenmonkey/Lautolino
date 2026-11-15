import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import worker from "../apps/server/src/worker";
import { createApp } from "../apps/server/src/app";
import { nodeSqliteDb } from "../apps/server/src/db";
import { migrateLocal } from "../apps/server/src/migrate";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const ROOT = new URL("..", import.meta.url).pathname;
function freshApp() {
  const raw = new DatabaseSync(":memory:"); raw.exec("PRAGMA foreign_keys=ON");
  migrateLocal(raw, join(ROOT, "db/migrations"));
  return createApp({ db: nodeSqliteDb(raw), pepper: "test-pepper-test-pepper-test-pepper-1234", iterations: 1000 });
}

describe("Phase 7: Sicherheit der Schnittstelle", () => {
  it("jede Antwort trägt Schutz-Kopfzeilen, auch Fehler und unbekannte Adressen", async () => {
    const app = freshApp();
    for (const path of ["/health", "/gibt-es-nicht", "/config"]) {
      const res = await app.request(path);
      expect(res.headers.get("cache-control"), path).toBe("no-store");
      expect(res.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(res.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(res.headers.get("x-frame-options"), path).toBe("DENY");
    }
  });
  it("zu große Anfragen werden mit 413 abgelehnt, normale gehen durch", async () => {
    const app = freshApp();
    const big = JSON.stringify({ email: "a@b.de", password: "x".repeat(1024 * 1024 + 10) });
    const r1 = await app.request("/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: big });
    expect(r1.status).toBe(413);
    expect((await r1.json()).error).toBe("Anfrage zu groß");
    const r2 = await app.request("/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.de", password: "falsch" }) });
    expect(r2.status).toBe(401);
  });
  it("ohne Anmeldung ist jede geschützte Adresse zu (401), auch mit falsch geformtem Token", async () => {
    const app = freshApp();
    const paths = ["/config", "/auth/me", "/student/me", "/student/plan", "/parent/me", "/admin/schools", "/admin/config", "/admin/audit"];
    for (const p of paths) {
      expect((await app.request(p)).status, p).toBe(401);
      expect((await app.request(p, { headers: { authorization: "Bearer zzz" } })).status, p + " Token").toBe(401);
      expect((await app.request(p, { headers: { authorization: "Bearer " + "a".repeat(64) } })).status, p + " unbekannt").toBe(401);
    }
  });
});

describe("Phase 7: Umzug auf PostgreSQL (Wächter)", () => {
  // Bekannte, dokumentierte SQLite-Eigenheiten (siehe docs/umzug.md). Kommt etwas Neues dazu, schlägt der Test an und die Liste samt Dokument muss bewusst ergänzt werden.
  const KNOWN = ["AUTOINCREMENT", "RAISE(ABORT", "GROUP_CONCAT"];
  const SUSPECT = /AUTOINCREMENT|RAISE\(|GROUP_CONCAT|INSERT OR |IFNULL\(|DATETIME\(|STRFTIME\(|PRAGMA|\bGLOB\b|\bROWID\b|JSON_\w+\(|SUBSTR\(/gi;
  function sources(): Array<{ file: string; text: string }> {
    const out: Array<{ file: string; text: string }> = [];
    const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const f = join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.(sql|ts)$/.test(e.name)) out.push({ file: f.replace(ROOT, ""), text: readFileSync(f, "utf8") }); } };
    walk(join(ROOT, "db/migrations")); walk(join(ROOT, "apps/server/src"));
    return out;
  }
  it("im Server und in den Migrationen steckt nur bekannte SQLite-Eigenheit", () => {
    const found = new Set<string>();
    for (const s of sources()) for (const m of s.text.match(SUSPECT) || []) found.add(m.toUpperCase().replace(/\(.*/, m.toUpperCase().startsWith("RAISE") ? "(ABORT" : ""));
    const unknown = [...found].filter((f) => !KNOWN.some((k) => k.startsWith(f.replace(/\($/, "")) || f.startsWith(k)));
    expect(unknown).toEqual([]);
  });
  it("alle Datenbankzugriffe laufen über db.ts (kein direkter Zugriff auf D1 oder SQLite in Routen)", () => {
    for (const s of sources()) {
      if (/src\/(db|worker|migrate)\.ts$/.test(s.file) || /scripts\//.test(s.file)) continue;
      expect(/node:sqlite|\.prepare\(|DatabaseSync|env\.DB/.test(s.text), s.file).toBe(false);
    }
  });
});

describe("Phase 7: Start des Workers", () => {
  const PEPPER = "x".repeat(32);
  it("ohne ALLOWED_ORIGINS startet der Worker nicht (500), mit Liste läuft er", async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: {} }) }) }), batch: async () => [] };
    for (const origins of [undefined, "", " , "]) {
      const r = await worker.fetch(new Request("https://x.test/health"), { DB: db, PEPPER, ALLOWED_ORIGINS: origins });
      expect(r.status, String(origins)).toBe(500);
      expect((await r.json()).error).toBe("ALLOWED_ORIGINS ist nicht gesetzt");
    }
    const ok = await worker.fetch(new Request("https://x.test/health"), { DB: db, PEPPER, ALLOWED_ORIGINS: "https://silbenflug.pages.dev" });
    expect(ok.status).toBe(200);
  });
  it("ohne gültiges PEPPER startet der Worker ebenfalls nicht", async () => {
    const r = await worker.fetch(new Request("https://x.test/health"), { DB: {}, PEPPER: "kurz", ALLOWED_ORIGINS: "https://a.test" });
    expect(r.status).toBe(500);
  });
});
