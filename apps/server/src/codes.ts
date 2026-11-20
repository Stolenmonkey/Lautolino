import type { Deps } from "./context";
import { generateParentCode, generateStudentCode, hashPassword, hmacHex, normalizeCode, normalizeParentCode } from "./crypto";
import { PBKDF2_ITERATIONS } from "./crypto";
import { newId, nowIso } from "./util";

// Neuer Schülercode: der alte wird sofort ungültig. code_lookup bleibt gesperrt (UNIQUE), ein Code wird nie erneut vergeben.
// Für den Login zählen nur Suchwert (HMAC mit geheimem Pfeffer) und langsamer Hash. Zusätzlich liegt der Klartext in code_plain, damit Lehrkräfte die Codes austeilen können (Migration 0009).
export async function issueStudentCode(d: Deps, studentId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateStudentCode(), lookup = await hmacHex(d.pepper, normalizeCode(code));
    if (await d.db.first("SELECT 1 AS x FROM student_codes WHERE code_lookup=?", [lookup])) continue;
    const hash = await hashPassword(normalizeCode(code), d.iterations ?? PBKDF2_ITERATIONS), at = nowIso(d);
    await d.db.batch([
      { sql: "UPDATE student_codes SET revoked_at=? WHERE student_id=? AND revoked_at IS NULL", params: [at, studentId] },
      { sql: "INSERT INTO student_codes(id,student_id,code_hash,code_lookup,created_at,code_plain) VALUES(?,?,?,?,?,?)", params: [newId(), studentId, hash, lookup, at, code] },
    ]);
    return code;
  }
  throw new Error("Kein freier Code gefunden");
}

// Elterncode: je Kind genau ein gültiger Code. Ein neuer Code widerruft den alten und beendet alle Anmeldungen der Eltern. Klartext wird nie gespeichert.
export async function issueParentCode(d: Deps, studentId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateParentCode(), norm = normalizeParentCode(code), lookup = await hmacHex(d.pepper, "eltern:" + norm);
    if (await d.db.first("SELECT 1 AS x FROM parent_codes WHERE code_lookup=?", [lookup])) continue;
    const hash = await hashPassword(norm, d.iterations ?? PBKDF2_ITERATIONS), at = nowIso(d);
    await d.db.batch([
      { sql: "UPDATE parent_codes SET revoked_at=? WHERE student_id=? AND revoked_at IS NULL", params: [at, studentId] },
      { sql: "INSERT INTO parent_codes(id,student_id,code_hash,code_lookup,created_at,code_plain) VALUES(?,?,?,?,?,?)", params: [newId(), studentId, hash, lookup, at, code] },
      { sql: "DELETE FROM parent_sessions WHERE student_id=?", params: [studentId] },
    ]);
    return code;
  }
  throw new Error("Kein freier Code gefunden");
}
