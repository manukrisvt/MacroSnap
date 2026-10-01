// Phase 3 — cooking fat constants + helpers. Shared by server and frontend.
// Tune the gram values here; everything else derives from them.

export const FAT_GRAMS = { none: 0, light: 5, normal: 10, heavy: 20 };
export const FAT_KCAL_PER_G = 9;
export const FAT_LEVELS = ['none', 'light', 'normal', 'heavy'];
export const FAT_TYPES = ['oil', 'ghee', 'butter'];

// Compute the cooking-fat line item for a level + type.
// All types are ~100% fat nutritionally; the type mainly affects the label.
export function computeFatItem(level, type) {
  const grams = FAT_GRAMS[level] ?? 0;
  const kcal = Math.round(grams * FAT_KCAL_PER_G);
  return {
    name: grams > 0 ? `Cooking fat (${type})` : 'Cooking fat (none)',
    grams,
    portion: `${level} · ${type}`,
    multiplier: 1,
    calories: kcal,
    protein_g: 0,
    carbs_g: 0,
    fat_g: grams,
    fiber_g: 0,
    confidence: null,
    is_cooking_fat: true,
    level,
    type
  };
}

// Default fat level for a new meal:
// - AI reported visible fat cues -> normal
// - else Restaurant -> normal, otherwise light
export function defaultFatLevel(visibleFatCues = [], mealSource = null) {
  if (visibleFatCues && visibleFatCues.length > 0) return 'normal';
  if (mealSource === 'Restaurant') return 'normal';
  return 'light';
}
