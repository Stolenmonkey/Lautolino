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
  mastery: { window: number; drop_longest: number; min_measurements: number; time_limit_seconds: Record<"1" | "3" | "4" | "5" | "6" | "7", number | null> };   // Zeitvorgabe je Lernstufe (Stufe 2 nutzt die Vorgabe der Stufe 1)
  award: { bronze_percent: number | null; silver_percent: number | null; gold_percent: number | null };
  unlock: { rules: unknown | null };
  retention: { after_use_days: number | null; after_leaving_days: number | null };
  security: {
    max_failed_logins: number; lock_minutes: number; code_max_attempts_per_hour: number; parent_code_days: number;
    invite_hours: number; reset_minutes: number; reset_max_per_email_hour: number; reset_max_per_ip_hour: number; parent_session_days: number;
  };
  scope: { cap_stage_1_4: number; cap_stage_5_7: number; freq_percent: number };   // Silbenumfang je neuem Buchstaben (gilt nur für künftige Freigaben): höchstens cap_stage_1_4 Wörter je Lernstufe 1 bis 4, cap_stage_5_7 je Lernstufe 5 bis 7; 0 = keine Begrenzung; freq_percent = Anteil der Plätze nach Häufigkeit im Deutschen (Rest fest ausgelost)
  stages: { enabled: number; gate_percent: number; mix_new_percent: number; mix_weak_percent: number; mix_review_percent: number };      // Lernstufen (Auswahl je Silbe): enabled 1 = ein, 0 = alte Aufgabenverteilung ohne Stufen; gate_percent = Anteil sicherer Vorstufen-Silben, ab dem eine Silbe freigeschaltet wird; mix_*_percent = Anteil neuer/angefangener, schwacher und sicher beherrschter Silben (Wiederholung) pro Runde, Summe 100
}

// Startwerte laut geprüftem Entwurf (Abschnitt 5). Das alte Silbenzauber-Verhalten entspricht window 12, drop_longest 2, min_keep 3, max_seconds 30.
export const DEFAULT_CONFIG: SilbenflugConfig = {
  syl_time: { window: 12, drop_longest: 2, min_keep: 10, max_seconds: 60, retention: 12 },
  auto: {
    target_seconds: 75, avg_rounds: 3, tolerance_percent: 5, step_max: 15, step_factor: 40, step_grid: 5,
    syl_to_len_ratio: 2, syl_cap: 100, new_combo_discount: 25, stats_rounds: 7, default_len_balance: 50, default_syl_difficulty: 50,
  },
  round: { task_count: 20, repeat_damping: 2, letter_frequency_default: 0, difficulty_curve_exponent: 4, min_pool: 3 },
  mastery: { window: 12, drop_longest: 2, min_measurements: 10, time_limit_seconds: { "1": 3.5, "3": 3.5, "4": 5, "5": 5, "6": 7, "7": 5 } },
  award: { bronze_percent: 50, silver_percent: 75, gold_percent: 95 },
  unlock: { rules: null },
  retention: { after_use_days: null, after_leaving_days: null },
  security: {
    max_failed_logins: 5, lock_minutes: 15, code_max_attempts_per_hour: 10, parent_code_days: 30,
    invite_hours: 72, reset_minutes: 60, reset_max_per_email_hour: 3, reset_max_per_ip_hour: 10, parent_session_days: 90,
  },
  scope: { cap_stage_1_4: 10, cap_stage_5_7: 8, freq_percent: 100 },
  stages: { enabled: 1, gate_percent: 80, mix_new_percent: 45, mix_weak_percent: 30, mix_review_percent: 25 },
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
  (["1", "3", "4", "5", "6", "7"] as const).forEach((L) => opt(m.time_limit_seconds[L], 0.1, 3600, `mastery.time_limit_seconds.${L}`));
  if (m.min_measurements > m.window) e.push("mastery.min_measurements darf nicht größer als mastery.window sein");
  if (m.window > s.retention) e.push("mastery.window darf nicht größer als syl_time.retention sein (es werden sonst zu wenige Zeiten gespeichert)");
  opt(w.bronze_percent, 0, 100, "award.bronze_percent"); opt(w.silver_percent, 0, 100, "award.silver_percent"); opt(w.gold_percent, 0, 100, "award.gold_percent");
  const set = [w.bronze_percent, w.silver_percent, w.gold_percent];
  if (set.every((x) => x !== null)) {
    if (!(w.bronze_percent! < w.silver_percent! && w.silver_percent! < w.gold_percent!)) e.push("award: Bronze < Silber < Gold erwartet");
  } else if (set.some((x) => x !== null)) e.push("award: Bronze, Silber und Gold müssen gemeinsam festgelegt oder gemeinsam leer sein");
  int(c.security.max_failed_logins, 1, 100, "security.max_failed_logins"); int(c.security.lock_minutes, 1, 1440, "security.lock_minutes");
  int(c.security.code_max_attempts_per_hour, 1, 1000, "security.code_max_attempts_per_hour"); int(c.security.parent_code_days, 1, 365, "security.parent_code_days");
  int(c.security.invite_hours, 1, 720, "security.invite_hours"); int(c.security.reset_minutes, 5, 1440, "security.reset_minutes");
  int(c.security.reset_max_per_email_hour, 1, 100, "security.reset_max_per_email_hour"); int(c.security.reset_max_per_ip_hour, 1, 1000, "security.reset_max_per_ip_hour");
  int(c.security.parent_session_days, 1, 730, "security.parent_session_days");
  int(c.scope.cap_stage_1_4, 0, 200, "scope.cap_stage_1_4"); int(c.scope.cap_stage_5_7, 0, 200, "scope.cap_stage_5_7"); num(c.scope.freq_percent, 0, 100, "scope.freq_percent");
  int(c.stages.enabled, 0, 1, "stages.enabled");
  num(c.stages.gate_percent, 0, 100, "stages.gate_percent");
  num(c.stages.mix_new_percent, 0, 100, "stages.mix_new_percent"); num(c.stages.mix_weak_percent, 0, 100, "stages.mix_weak_percent"); num(c.stages.mix_review_percent, 0, 100, "stages.mix_review_percent");
  if (Math.abs(c.stages.mix_new_percent + c.stages.mix_weak_percent + c.stages.mix_review_percent - 100) > 0.001) e.push("stages: mix_new_percent + mix_weak_percent + mix_review_percent müssen zusammen 100 ergeben");
  return e;
}

// Ältere gespeicherte Konfigurationsversionen kennen neue Abschnitte und Werte noch nicht: fehlende Werte werden mit den Standardwerten ergänzt (gespeicherte Versionen bleiben unverändert).
export function withDefaults(c: Partial<SilbenflugConfig>): SilbenflugConfig {
  const out: any = { ...c };
  for (const k of Object.keys(DEFAULT_CONFIG) as Array<keyof SilbenflugConfig>) out[k] = { ...(DEFAULT_CONFIG as any)[k], ...((c as any)[k] || {}) };
  out.mastery.time_limit_seconds = { ...DEFAULT_CONFIG.mastery.time_limit_seconds, ...((c.mastery as any)?.time_limit_seconds || {}) };   // verschachtelt: ältere Versionen kennen neue Stufen nicht
  return out as SilbenflugConfig;
}
