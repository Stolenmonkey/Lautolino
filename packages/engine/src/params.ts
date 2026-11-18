import type { SilbenflugConfig } from "@silbenflug/shared";
import type { RoundParams } from "@silbenflug/core";
import type { AutoParams } from "./automatik";
import type { SylTimeParams } from "./sylTime";
import type { ScopeParams } from "./scope";

export const sylTimeParams = (c: SilbenflugConfig): SylTimeParams => ({ window: c.syl_time.window, dropLongest: c.syl_time.drop_longest, minKeep: c.syl_time.min_keep });
export const autoParams = (c: SilbenflugConfig): AutoParams => ({
  tolerancePercent: c.auto.tolerance_percent, stepMax: c.auto.step_max, stepFactor: c.auto.step_factor, stepGrid: c.auto.step_grid,
  sylToLenRatio: c.auto.syl_to_len_ratio, sylCap: c.auto.syl_cap, newComboDiscount: c.auto.new_combo_discount,
});
export const roundParams = (c: SilbenflugConfig): RoundParams => ({ repeatDamping: c.round.repeat_damping, curveExponent: c.round.difficulty_curve_exponent, minPool: c.round.min_pool });
// cap 0 = keine Begrenzung (sehr großer Wert), sonst Obergrenze je Lernstufe.
export const scopeParams = (c: SilbenflugConfig): ScopeParams => ({ capStage14: c.scope.cap_stage_1_4 || 1e9, capStage57: c.scope.cap_stage_5_7 || 1e9, freqPercent: c.scope.freq_percent });
