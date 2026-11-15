// Versionierte Konfiguration (Datenbank: config_versions.json). Alle Regelzahlen stehen hier, nicht im Code.
// null = noch nicht festgelegt (OFFEN). Eine nicht festgelegte Auszeichnungsgrenze schaltet die Auszeichnung aus.
export interface SilbenflugConfig {
  syl_time: { window: number; drop_longest: number; min_keep: number; max_seconds: number; retention: number };
  auto: {
    target_seconds: number; avg_rounds: number; tolerance_percent: number; step_max: number; step_factor: number;
    step_grid: number; syl_to_len_ratio: number; syl_cap: number; new_combo_discount: number; stats_rounds: number;
    default_len_balance: number; default_syl_difficulty: number;
  };
  round: { task_count: number; repeat_damping: number; letter_frequency_default: number; difficulty_curve_exponent: number; min_pool: number };
  mastery: { window: number; drop_longest: number; min_measurements: number; time_limit_seconds: Record<"2" | "3" | "4", number | null> };
  award: { bronze_percent: number | null; silver_percent: number | null; gold_percent: number | null };
  unlock: { rules: unknown | null };
  retention: { after_use_days: number | null; after_leaving_days: number | null };
  security: { max_failed_logins: number; lock_minutes: number; code_max_attempts_per_hour: number; parent_code_days: number };
  train: { unmastered_weight: number };   // Silben-Zug: Wie viel häufiger noch nicht sicher beherrschte Silben vorkommen (1 = nicht bevorzugt)
}

// Startwerte laut geprüftem Entwurf (Abschnitt 5). Das alte Silbenzauber-Verhalten entspricht window 12, drop_longest 2, min_keep 3, max_seconds 30.
export const DEFAULT_CONFIG: SilbenflugConfig = {
  syl_time: { window: 12, drop_longest: 2, min_keep: 10, max_seconds: 60, retention: 12 },
  auto: {
    target_seconds: 75, avg_rounds: 3, tolerance_percent: 5, step_max: 15, step_factor: 40, step_grid: 5,
    syl_to_len_ratio: 2, syl_cap: 100, new_combo_discount: 25, stats_rounds: 7, default_len_balance: 50, default_syl_difficulty: 50,
  },
  round: { task_count: 20, repeat_damping: 2, letter_frequency_default: 0, difficulty_curve_exponent: 4, min_pool: 3 },
  mastery: { window: 12, drop_longest: 2, min_measurements: 10, time_limit_seconds: { "2": 3.5, "3": 3.5, "4": 3.5 } },
  award: { bronze_percent: 50, silver_percent: 75, gold_percent: 95 },
  unlock: { rules: null },
  retention: { after_use_days: null, after_leaving_days: null },
  security: { max_failed_logins: 5, lock_minutes: 15, code_max_attempts_per_hour: 10, parent_code_days: 30 },
  train: { unmastered_weight: 2 },
};

// Prüft eine Konfiguration. Leere Liste = gültig. Der Server speichert nur gültige Versionen.
export function validateConfig(c: SilbenflugConfig): string[] {
  const e: string[] = [];
  const int = (n: unknown, lo: number, hi: number, name: string) => {
    if (typeof n !== "number" || !Number.isInteger(n) || n < lo || n > hi) e.push(`${name}: ganze Zahl ${lo} bis ${hi} erwartet`);
  };
  const num = (n: unknown, lo: number, hi: number, name: string) => {
    if (typeof n !== "number" || !isFinite(n) || n < lo || n > hi) e.push(`${name}: Zahl ${lo} bis ${hi} erwartet`);
  };
  const opt = (n: number | null, lo: number, hi: number, name: string) => { if (n !== null) num(n, lo, hi, name); };
  const s = c.syl_time, a = c.auto, r = c.round, m = c.mastery, w = c.award;
  int(s.window, 1, 100, "syl_time.window"); int(s.drop_longest, 0, 50, "syl_time.drop_longest"); int(s.min_keep, 1, 100, "syl_time.min_keep");
  num(s.max_seconds, 1, 3600, "syl_time.max_seconds"); int(s.retention, 1, 200, "syl_time.retention");
  if (s.min_keep > s.window) e.push("syl_time.min_keep darf nicht größer als window sein");
  if (s.retention < s.window) e.push("syl_time.retention muss mindestens so groß wie window sein");
  num(a.target_seconds, 10, 600, "auto.target_seconds"); int(a.avg_rounds, 1, 7, "auto.avg_rounds");
  num(a.tolerance_percent, 0, 50, "auto.tolerance_percent"); num(a.step_max, 1, 100, "auto.step_max"); num(a.step_factor, 1, 1000, "auto.step_factor");
  num(a.step_grid, 1, 50, "auto.step_grid"); num(a.syl_to_len_ratio, 1, 10, "auto.syl_to_len_ratio"); num(a.syl_cap, 1, 100, "auto.syl_cap");
  num(a.new_combo_discount, 0, 100, "auto.new_combo_discount"); int(a.stats_rounds, 1, 20, "auto.stats_rounds");
  num(a.default_len_balance, 0, 100, "auto.default_len_balance"); num(a.default_syl_difficulty, 0, 100, "auto.default_syl_difficulty");
  int(r.task_count, 1, 100, "round.task_count"); num(r.repeat_damping, 0, 20, "round.repeat_damping");
  num(r.letter_frequency_default, 0, 100, "round.letter_frequency_default"); num(r.difficulty_curve_exponent, 0.1, 20, "round.difficulty_curve_exponent");
  int(r.min_pool, 1, 20, "round.min_pool");
  int(m.window, 1, 100, "mastery.window"); int(m.drop_longest, 0, 50, "mastery.drop_longest"); int(m.min_measurements, 1, 100, "mastery.min_measurements");
  (["2", "3", "4"] as const).forEach((L) => opt(m.time_limit_seconds[L], 0.1, 3600, `mastery.time_limit_seconds.${L}`));
  if (m.min_measurements > m.window) e.push("mastery.min_measurements darf nicht größer als mastery.window sein");
  if (m.window > s.retention) e.push("mastery.window darf nicht größer als syl_time.retention sein (es werden sonst zu wenige Zeiten gespeichert)");
  opt(w.bronze_percent, 0, 100, "award.bronze_percent"); opt(w.silver_percent, 0, 100, "award.silver_percent"); opt(w.gold_percent, 0, 100, "award.gold_percent");
  const set = [w.bronze_percent, w.silver_percent, w.gold_percent];
  if (set.every((x) => x !== null)) {
    if (!(w.bronze_percent! < w.silver_percent! && w.silver_percent! < w.gold_percent!)) e.push("award: Bronze < Silber < Gold erwartet");
  } else if (set.some((x) => x !== null)) e.push("award: Bronze, Silber und Gold müssen gemeinsam festgelegt oder gemeinsam leer sein");
  int(c.security.max_failed_logins, 1, 100, "security.max_failed_logins"); int(c.security.lock_minutes, 1, 1440, "security.lock_minutes");
  int(c.security.code_max_attempts_per_hour, 1, 1000, "security.code_max_attempts_per_hour"); int(c.security.parent_code_days, 1, 365, "security.parent_code_days");
  num(c.train.unmastered_weight, 1, 10, "train.unmastered_weight");
  return e;
}
