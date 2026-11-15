import type { Deps } from "./context";
import { generateStudentCode, hashPassword, hmacHex, normalizeCode } from "./crypto";
import { PBKDF2_ITERATIONS } from "./crypto";
import { newId, nowIso } from "./util";

// Neuer Schülercode: der alte wird sofort ungültig. code_lookup bleibt gesperrt (UNIQUE), ein Code wird nie erneut vergeben.
// Gespeichert werden nur der Suchwert (HMAC mit geheimem Pfeffer) und der langsame Hash, nie der Klartext.
export async function issueStudentCode(d: Deps, studentId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateStudentCode(), lookup = await hmacHex(d.pepper, normalizeCode(code));
    if (await d.db.first("SELECT 1 AS x FROM student_codes WHERE code_lookup=?", [lookup])) continue;
    const hash = await hashPassword(normalizeCode(code), d.iterations ?? PBKDF2_ITERATIONS), at = nowIso(d);
    await d.db.batch([
      { sql: "UPDATE student_codes SET revoked_at=? WHERE student_id=? AND revoked_at IS NULL", params: [at, studentId] },
      { sql: "INSERT INTO student_codes(id,student_id,code_hash,code_lookup,created_at) VALUES(?,?,?,?,?)", params: [newId(), studentId, hash, lookup, at] },
    ]);
    return code;
  }
  throw new Error("Kein freier Code gefunden");
}
