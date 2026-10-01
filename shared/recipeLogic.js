// Phase 4 — household recipe logic, shared by server and frontend.
// A recipe = named list of ingredients (each with grams) + total cooked
// yield. Per-100g macros are computed from the raw ingredient macros
// (which INCLUDE cooking fat, so recipe-matched items skip the fat selector).

export const RECIPE_MATCH_THRESHOLD = 0.6; // similarity score 0..1

// Compute per-100g macros for a recipe.
// ingredients: [{ name, grams, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g }]
//   (each ingredient's macros are per 100g of that ingredient)
// totalYieldG: total cooked weight of the whole recipe
// Returns per-100g macros of the COOKED dish.
export function computeRecipeMacros(ingredients, totalYieldG) {
  if (!totalYieldG || totalYieldG <= 0) {
    throw new Error('Total cooked yield must be > 0');
  }
  let kcal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0;
  for (const ing of ingredients || []) {
    const g = Number(ing.grams) || 0;
    const s = g / 100;
    kcal += (Number(ing.kcal_per_100g) || 0) * s;
    protein += (Number(ing.protein_per_100g) || 0) * s;
    carbs += (Number(ing.carbs_per_100g) || 0) * s;
    fat += (Number(ing.fat_per_100g) || 0) * s;
    fiber += (Number(ing.fiber_per_100g) || 0) * s;
  }
  const per100 = totalYieldG / 100;
  return {
    kcal_per_100g: Math.round((kcal / per100) * 10) / 10,
    protein_per_100g: Math.round((protein / per100) * 10) / 10,
    carbs_per_100g: Math.round((carbs / per100) * 10) / 10,
    fat_per_100g: Math.round((fat / per100) * 10) / 10,
    fiber_per_100g: Math.round((fiber / per100) * 10) / 10
  };
}

// Scale a recipe's per-100g macros to a served portion (grams).
export function scaleRecipeToGrams(recipe, grams) {
  const s = (Number(grams) || 0) / 100;
  return {
    name: recipe.name,
    grams: Number(grams) || 0,
    portion: `my recipe · ${Math.round(grams)}g`,
    multiplier: 1,
    calories: Math.round((recipe.kcal_per_100g || 0) * s),
    protein_g: Math.round((recipe.protein_per_100g || 0) * s * 10) / 10,
    carbs_g: Math.round((recipe.carbs_per_100g || 0) * s * 10) / 10,
    fat_g: Math.round((recipe.fat_per_100g || 0) * s * 10) / 10,
    fiber_g: Math.round((recipe.fiber_per_100g || 0) * s * 10) / 10,
    confidence: 'high',
    recipe_id: recipe.id,
    recipe_matched: true
  };
}

// Simple token-based similarity score (0..1). No pg_trgm dependency —
// works identically in Postgres-less contexts and on the client.
// "chicken curry" vs "chicken curry homemade" -> high score;
// "sambar" vs "sambar" -> 1.0; "dal" vs "dal fry" -> decent.
export function similarity(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const ta = norm(a), tb = norm(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let matches = 0;
  for (const t of ta) {
    if (setB.has(t)) matches++;
    else if (tb.some((u) => u.startsWith(t) || t.startsWith(u))) matches += 0.7; // partial word match
  }
  return matches / Math.max(ta.length, tb.length);
}

// Find the best recipe match for an item name among the user's recipes
// (checks name + aliases). Returns { recipe, score } or null below threshold.
export function matchRecipe(itemName, recipes, threshold = RECIPE_MATCH_THRESHOLD) {
  let best = null;
  for (const r of recipes || []) {
    const candidates = [r.name, ...(r.aliases || [])];
    for (const c of candidates) {
      const score = similarity(itemName, c);
      if (!best || score > best.score) best = { recipe: r, score };
    }
  }
  if (best && best.score >= threshold) return best;
  return null;
}
