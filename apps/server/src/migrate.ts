// Lokale Migrationen (Tests und Entwicklung). Auf Cloudflare übernimmt das `wrangler d1 migrations apply`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function migrateLocal(raw: any, dir: string): string[] {
  raw.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set(raw.prepare("SELECT name FROM schema_migrations").all().map((r: any) => r.name));
  const applied: string[] = [];
  for (const f of readdirSync(dir).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) {
    if (done.has(f)) continue;
    raw.exec("BEGIN");
    try { raw.exec(readFileSync(join(dir, f), "utf8")); raw.prepare("INSERT INTO schema_migrations(name,applied_at) VALUES(?,?)").run(f, new Date().toISOString()); raw.exec("COMMIT"); }
    catch (e) { raw.exec("ROLLBACK"); throw e; }
    applied.push(f);
  }
  return applied;
}
