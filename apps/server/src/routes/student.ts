import { Hono } from "hono";
import type { Env } from "../context";
import { hmacHex, randomToken, sha256Hex, studentCodeCandidates, verifyPassword } from "../crypto";
import { authenticate } from "../middleware";
import { studentLetters } from "./plan";
import { loadScopesEx } from "./progress";
import { activeConfig, body, fail, newId, nowDate, nowIso, str } from "../util";

export function studentRoutes() {
  const r = new Hono<Env>();

  // Anmeldung mit dem Merkschlüssel (z. B. Tiger-Sonne-47). Fehlversuche je Gerät/Netz werden begrenzt.
  r.post("/login", async (c) => {
    const d = c.get("deps"), b = await body(c), raw = str(b.code, "code", 60);
    const sec = (await activeConfig(d)).config.security, now = nowDate(d);
    const ip = await hmacHex(d.pepper, c.req.header("cf-connecting-ip") || "local"), since = new Date(now.getTime() - 3600000).toISOString();
    const n = await d.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM login_attempts WHERE scope='code' AND ip_hash=? AND success=0 AND at>?", [ip, since]);
    if ((n?.n ?? 0) >= sec.code_max_attempts_per_hour) throw fail(429, "Zu viele Versuche. Bitte später noch einmal probieren.");
    // Neue Codes (SonneWald7) haben keine Trennzeichen, ältere (Tiger-Sonne-47) schon: beide Schreibweisen werden probiert.
    let lookup = "", code = "", row: any = null;
    for (const cand of studentCodeCandidates(raw)) {
      lookup = await hmacHex(d.pepper, cand); code = cand;
      row = await d.db.first<any>("SELECT c.code_hash, k.id, k.display_name, k.school_id, k.active AS kactive, s.active AS sactive FROM student_codes c JOIN students k ON k.id=c.student_id JOIN schools s ON s.id=k.school_id WHERE c.code_lookup=? AND c.revoked_at IS NULL", [lookup]);
      if (row) break;
    }
    const ok = !!row && (await verifyPassword(code, row.code_hash)) && row.kactive === 1 && row.sactive === 1;
    await d.db.run("INSERT INTO login_attempts(id,scope,key_hash,ip_hash,at,success) VALUES(?,?,?,?,?,?)", [newId(), "code", lookup, ip, now.toISOString(), ok ? 1 : 0]);
    if (!ok) throw fail(401, "Dieser Merkschlüssel ist leider nicht richtig");
    const token = randomToken(), exp = new Date(now.getTime() + (d.studentSessionDays ?? 30) * 86400000).toISOString();
    await d.db.run("INSERT INTO student_sessions(id,student_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)", [newId(), row.id, await sha256Hex(token), exp, nowIso(d)]);
    return c.json({ token, expiresAt: exp, student: { id: row.id, displayName: row.display_name } });
  });

  r.get("/me", authenticate, async (c) => {
    const d = c.get("deps"), p = c.get("p");
    if (p.kind !== "student") throw fail(403, "Keine Berechtigung");
    const k = await d.db.first<any>("SELECT k.id, k.display_name, h.class_id FROM students k LEFT JOIN student_class_history h ON h.student_id=k.id AND h.to_date IS NULL WHERE k.id=?", [p.id]);
    return c.json({ id: k.id, displayName: k.display_name, classId: k.class_id });
  });
  // Freigegebene Buchstaben (Klassenplan minus Ausnahmen) und Übungswörter (fester Silbenumfang dieser Buchstaben) für die Kinder-App
  r.get("/plan", authenticate, async (c) => {
    const p = c.get("p");
    if (p.kind !== "student") throw fail(403, "Keine Berechtigung");
    const d = c.get("deps"), st = await studentLetters(d.db, p.id), ex = st.classId ? await loadScopesEx(d, st.classId, st.letters) : { scopes: {} as Record<string, string[]>, blocks: [] as string[][] }, scopes = ex.scopes;
    return c.json({ ...st, syllables: [...new Set(Object.values(scopes).flat())].sort((a, b) => a.length - b.length || (a < b ? -1 : 1)), scopes, blocks: ex.blocks });   // blocks: freigegebene Kontrastblöcke (Stufe 2)   // scopes: fester Silbenumfang je Buchstabe (die App rechnet damit die Verbesserung am Rundenende)
  });
  return r;
}
