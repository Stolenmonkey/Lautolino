import type { Db } from "./db";
import type { Mailer } from "./mail";
export interface Deps { db: Db; origins?: string[]; pepper: string; iterations?: number; now?: () => Date; staffSessionHours?: number; studentSessionDays?: number; mailer?: Mailer; appUrl?: string }
export type Principal =
  | { kind: "staff"; id: string; role: "admin" | "schulleitung" | "lehrer"; schoolId: string | null }
  | { kind: "student"; id: string; schoolId: string }
  | { kind: "parent"; id: string; schoolId: string; sessionId: string };   // Eltern: id = Kind, nur Lesezugriff auf dieses Kind
export type Env = { Variables: { deps: Deps; p: Principal } };
