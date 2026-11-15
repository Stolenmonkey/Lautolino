// Dünne Datenzugriffsschicht: gleiche Schnittstelle für Cloudflare D1 (Prototyp) und SQLite/PostgreSQL (später, lokal).
export type Param = string | number | null;
export interface Stmt { sql: string; params?: Param[] }
export interface Db {
  first<T = any>(sql: string, params?: Param[]): Promise<T | null>;
  all<T = any>(sql: string, params?: Param[]): Promise<T[]>;
  run(sql: string, params?: Param[]): Promise<{ changes: number }>;
  batch(stmts: Stmt[]): Promise<void>; // alles oder nichts
}
const clean = (p?: Param[]) => (p || []).map((x) => (x === undefined ? null : x));

export function d1Db(d1: any): Db {
  const prep = (s: Stmt) => d1.prepare(s.sql).bind(...clean(s.params));
  return {
    first: async (sql, p) => (await prep({ sql, params: p }).first()) ?? null,
    all: async (sql, p) => (await prep({ sql, params: p }).all()).results,
    run: async (sql, p) => ({ changes: (await prep({ sql, params: p }).run()).meta?.changes ?? 0 }),
    batch: async (stmts) => { await d1.batch(stmts.map(prep)); },
  };
}

// node:sqlite (lokale Entwicklung und Tests)
export function nodeSqliteDb(raw: any): Db {
  return {
    first: async (sql, p) => raw.prepare(sql).get(...clean(p)) ?? null,
    all: async (sql, p) => raw.prepare(sql).all(...clean(p)),
    run: async (sql, p) => ({ changes: Number(raw.prepare(sql).run(...clean(p)).changes) }),
    batch: async (stmts) => {
      raw.exec("BEGIN");
      try { for (const s of stmts) raw.prepare(s.sql).run(...clean(s.params)); raw.exec("COMMIT"); } catch (e) { raw.exec("ROLLBACK"); throw e; }
    },
  };
}
