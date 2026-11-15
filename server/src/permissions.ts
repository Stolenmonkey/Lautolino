// Zentrale Rechteprüfung (serverseitig). Zugriff auf fremde Schulen/Klassen/Kinder wirkt wie "nicht vorhanden" (404).
import type { Db } from "./db";
import type { Principal } from "./context";

export const isAdmin = (p: Principal) => p.kind === "staff" && p.role === "admin";
export const canAccessSchool = (p: Principal, schoolId: string) => isAdmin(p) || p.schoolId === schoolId;
export const isSchoolManager = (p: Principal) => p.kind === "staff" && (p.role === "admin" || p.role === "schulleitung");

export async function canAccessClass(db: Db, p: Principal, classId: string): Promise<{ ok: boolean; schoolId?: string }> {
  const c = await db.first<{ school_id: string }>("SELECT school_id FROM classes WHERE id=?", [classId]);
  if (!c || p.kind !== "staff") return { ok: false };
  if (p.role === "admin") return { ok: true, schoolId: c.school_id };
  if (p.schoolId !== c.school_id) return { ok: false };
  if (p.role === "schulleitung") return { ok: true, schoolId: c.school_id };
  const t = await db.first("SELECT 1 AS x FROM teacher_classes WHERE staff_user_id=? AND class_id=?", [p.id, classId]);
  return { ok: !!t, schoolId: c.school_id };
}
// Kind: das Kind selbst, Admin, Schulleitung der Schule, Lehrer der aktuellen Klasse des Kindes
export async function canAccessStudent(db: Db, p: Principal, studentId: string): Promise<{ ok: boolean; schoolId?: string }> {
  const s = await db.first<{ school_id: string }>("SELECT school_id FROM students WHERE id=?", [studentId]);
  if (!s) return { ok: false };
  if (p.kind === "student") return { ok: p.id === studentId, schoolId: s.school_id };
  if (p.kind === "parent") return { ok: false };   // Elterngeräte nutzen nur ihre eigenen Lese-Schnittstellen (/parent/...)
  if (p.role === "admin") return { ok: true, schoolId: s.school_id };
  if (p.schoolId !== s.school_id) return { ok: false };
  if (p.role === "schulleitung") return { ok: true, schoolId: s.school_id };
  const t = await db.first("SELECT 1 AS x FROM student_class_history h JOIN teacher_classes tc ON tc.class_id=h.class_id WHERE h.student_id=? AND h.to_date IS NULL AND tc.staff_user_id=?", [studentId, p.id]);
  return { ok: !!t, schoolId: s.school_id };
}
