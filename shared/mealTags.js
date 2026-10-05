// Meal bucket classification — the "patterns" feature.
// Two sources of tags:
//   1. AI tags: returned alongside the photo analysis (shared/aiPrompt.js schema)
//   2. Retroactive: derived from stored meal items with pure math — no AI needed,
//      so every historical meal gets bucketed instantly and for free.
// Both paths produce the same shape so the Trends UI can mix them.

export const BUCKETS = {
  source: ['home', 'restaurant', 'packaged'],
  processing: ['fresh', 'minimally_processed', 'ultra_processed'],
  profile: ['high_protein', 'balanced', 'carb_heavy', 'high_fat', 'high_sugar'],
};

// Ultra-processed food name cues (checked case-insensitively against item names).
const UP_CUES = [
  'nugget', 'fries', 'fried', 'chips', 'crisps', 'soda', 'cola', 'instant',
  'noodles', 'cereal', 'candy', 'chocolate', 'cookie', 'biscuit', 'cake',
  'pastry', 'donut', 'sausage', 'hot dog', 'bacon', 'ham', 'deli meat',
  'white bread', 'bun', 'pizza', 'burger', 'patty', 'ketchup', 'mayo',
  'sauce', 'spread', 'jam', 'juice box', 'energy drink', 'protein bar',
  'granola bar', 'pop tart', 'mac and cheese', 'ramen', 'microwave',
];

// Fresh/whole-food cues — counterweight to UP_CUES.
const FRESH_CUES = [
  'salad', 'vegetable', 'veggie', 'fruit', 'apple', 'banana', 'orange',
  'berries', 'broccoli', 'spinach', 'rice', 'dal', 'lentil', 'chicken',
  'fish', 'salmon', 'egg', 'yogurt', 'curd', 'oats', 'roti', 'chapati',
  'tofu', 'paneer', 'beans', 'soup', 'grilled', 'steamed', 'boiled',
];

/**
 * Classify a single meal from its items (retroactive path — no AI).
 * items: [{ name, calories, protein_g, carbs_g, fat_g }]
 * Returns { source, processing, profile } — one value per bucket, or null
 * for a bucket when there isn't enough signal.
 */
export function classifyMeal(items) {
  if (!Array.isArray(items) || items.length === 0) return {};
  const names = items.map((i) => String(i.name || '').toLowerCase());
  const total = (f) => items.reduce((s, i) => s + (Number(i[f]) || 0), 0);
  const kcal = total('calories');
  const p = total('protein_g'), c = total('carbs_g'), f = total('fat_g');

  // --- processing bucket ---
  const upHits = names.filter((n) => UP_CUES.some((cue) => n.includes(cue))).length;
  const freshHits = names.filter((n) => FRESH_CUES.some((cue) => n.includes(cue))).length;
  let processing = null;
  if (items.length > 0) {
    if (upHits >= Math.max(1, items.length / 2)) processing = 'ultra_processed';
    else if (freshHits >= Math.max(1, items.length / 2)) processing = 'fresh';
    else if (upHits > 0) processing = 'minimally_processed';
    else if (freshHits > 0) processing = 'minimally_processed';
  }

  // --- profile bucket (macro split by % of calories) ---
  // kcal per gram: protein 4, carbs 4, fat 9
  let profile = null;
  if (kcal > 0) {
    const pPct = (p * 4) / kcal, cPct = (c * 4) / kcal, fPct = (f * 9) / kcal;
    if (pPct >= 0.30) profile = 'high_protein';
    else if (fPct >= 0.45) profile = 'high_fat';
    else if (cPct >= 0.55) profile = 'carb_heavy';
    else if (/\bsugar|soda|dessert|sweet|cake|candy|chocolate|cookie\b/.test(names.join(' '))) profile = 'high_sugar';
    else profile = 'balanced';
  }

  return { source: null, processing, profile };
}

/**
 * Merge AI tags (from a new analysis) with retroactive classification.
 * AI tags win when present; retroactive fills the gaps.
 */
export function mergeTags(aiTags, items) {
  const retro = classifyMeal(items);
  const t = aiTags && typeof aiTags === 'object' ? aiTags : {};
  return {
    source: valid(t.source, BUCKETS.source) || retro.source || null,
    processing: valid(t.processing, BUCKETS.processing) || retro.processing || null,
    profile: valid(t.profile, BUCKETS.profile) || retro.profile || null,
  };
}

function valid(v, allowed) {
  return allowed.includes(v) ? v : null;
}

/**
 * Aggregate bucket shares over a list of meals.
 * meals: [{ date, items: [...] }] (optionally with .tags from AI)
 * Returns { processing: {fresh: {count, pct}, ...}, profile: {...} }
 * for the whole period, plus per-week breakdown for trend display.
 */
export function bucketShares(meals) {
  const tally = { processing: {}, profile: {} };
  const weeks = {};
  for (const m of meals || []) {
    const tags = mergeTags(m.tags, m.items);
    for (const bucket of ['processing', 'profile']) {
      const v = tags[bucket];
      if (!v) continue;
      tally[bucket][v] = (tally[bucket][v] || 0) + 1;
      // week key: ISO date of the Monday of that week
      const wk = mondayOf(m.date);
      weeks[wk] = weeks[wk] || { processing: {}, profile: {} };
      weeks[wk][bucket][v] = (weeks[wk][bucket][v] || 0) + 1;
    }
  }
  // convert counts to percentages
  const pct = (obj) => {
    const total = Object.values(obj).reduce((s, n) => s + n, 0);
    return total ? Object.fromEntries(Object.entries(obj).map(([k, n]) => [k, Math.round((n / total) * 100)])) : {};
  };
  return {
    overall: { processing: pct(tally.processing), profile: pct(tally.profile) },
    weeks: Object.fromEntries(Object.entries(weeks).map(([wk, w]) => [wk, { processing: pct(w.processing), profile: pct(w.profile) }])),
  };
}

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  return d.toLocaleDateString('en-CA');
}

export const BUCKET_LABELS = {
  fresh: 'Fresh / whole foods',
  minimally_processed: 'Minimally processed',
  ultra_processed: 'Ultra-processed',
  high_protein: 'High protein',
  balanced: 'Balanced',
  carb_heavy: 'Carb-heavy',
  high_fat: 'High fat',
  high_sugar: 'High sugar',
  home: 'Home-cooked',
  restaurant: 'Restaurant',
  packaged: 'Packaged / ready-to-eat',
};
