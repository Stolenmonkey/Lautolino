import type { Db } from "./db";
export interface Deps { db: Db; origins?: string[]; pepper: string; iterations?: number; now?: () => Date; staffSessionHours?: number; studentSessionDays?: number }
export type Principal =
  | { kind: "staff"; id: string; role: "admin" | "schulleitung" | "lehrer"; schoolId: string | null }
  | { kind: "student"; id: string; schoolId: string }
  | { kind: "parent"; id: string; schoolId: string; deviceId: string };   // Elterngerät: id = Kind, nur Lesezugriff auf dieses Kind
export type Env = { Variables: { deps: Deps; p: Principal } };
