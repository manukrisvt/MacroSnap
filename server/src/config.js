// Central tuning config. All Phase 1+ knobs live here so they can be adjusted
// without hunting through the codebase. Bump PROMPT_VERSION whenever the
// system prompt in moonshot.js changes, so ai_estimates rows stay comparable.

export const PROMPT_VERSION = '2.0';

// Phase 3 — fat constants live in shared/fatConfig.js (used by server AND
// frontend). Re-exported here for server-side convenience.
export { FAT_GRAMS, FAT_KCAL_PER_G, FAT_LEVELS, FAT_TYPES, computeFatItem, defaultFatLevel } from '../../shared/fatConfig.js';

// Phase 1 placeholder — display-only multipliers (identity by default).
// Applied to what the user SEES; raw_model_output is always stored untouched.
export const BIAS_CORRECTION = { food: 1.0, fat: 1.0 };

// Phase 5 placeholder — interval/range display. No UI, no math yet.
export const INTERVAL = { enabled: false, lower_q: null, upper_q: null };

// Phase 4 placeholder — fuzzy recipe match threshold (0..1 similarity).
export const RECIPE_MATCH_THRESHOLD = 0.6;

// Apply display-only bias correction to an item's numbers.
// Returns a NEW object; never mutates. Raw values stay raw in storage.
export function applyBiasCorrection(item) {
  const f = BIAS_CORRECTION.food;
  if (f === 1.0) return { ...item };
  return {
    ...item,
    calories: Math.round((item.calories || 0) * f),
    protein_g: Math.round((item.protein_g || 0) * f * 10) / 10,
    carbs_g: Math.round((item.carbs_g || 0) * f * 10) / 10,
    fat_g: Math.round((item.fat_g || 0) * f * 10) / 10,
    fiber_g: Math.round((item.fiber_g || 0) * f * 10) / 10
  };
}
