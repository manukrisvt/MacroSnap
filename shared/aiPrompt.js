// Shared AI prompt + response schema for Phase 2 ("Help the AI").
// Used by BOTH the server (moonshot.js) and the BYO client (clientAI.js)
// so behavior is identical regardless of who pays for the tokens.
//
// PROMPT_VERSION lives in server/src/config.js — bump it whenever this
// prompt changes so ai_estimates rows stay comparable.

export const SYSTEM_PROMPT = `You are a nutrition vision assistant for a calorie-tracking app. Analyze the food photo and estimate the meal.
Return STRICT JSON only — no markdown, no commentary. The JSON must match exactly:
{
  "items": [
    { "name": "", "grams": 0, "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "confidence": "high|medium|low", "assumes_added_fat": false }
  ],
  "visible_fat_cues": [],
  "clarifying_question": null
}
Rules:
- Estimate each item's nutrition EXCLUDING added cooking fat (oil, ghee, butter used in cooking). Do not include cooking fat calories in the items.
- Instead, report visible signs of added fat in "visible_fat_cues" as short strings, e.g. ["oil sheen on curry", "ghee tadka visible", "fried texture"].
- Set "assumes_added_fat" true only if you think the item's own numbers may already contain some cooking fat you could not separate.
- Give each item a "confidence": "high" (certain what it is), "medium", or "low" (best guess).
- If ANY item is low confidence, include AT MOST ONE "clarifying_question": { "question": "...", "options": ["...", "..."] } with 2-4 short answer options that would most improve the estimate. Otherwise null.
- "grams" is your best estimate of the visible portion weight in grams.
- If multiple foods, list each separately.
- Numbers must be integers or floats, not strings.
- Output ONLY the JSON object.`;

// Build the user text message sent alongside the image.
// context: { hint, mealSource, previousOutput, correctionText, clarifyingAnswer }
export function buildUserText(context = {}) {
  const parts = ['Analyze this meal photo and return the JSON.'];
  if (context.hint) parts.push(`User context: ${context.hint}`);
  if (context.mealSource) parts.push(`Meal source: ${context.mealSource}.`);
  if (context.clarifyingAnswer) parts.push(`Answer to your earlier question: ${context.clarifyingAnswer}`);
  if (context.previousOutput) {
    parts.push(`Your previous estimate was: ${JSON.stringify(context.previousOutput)}`);
  }
  if (context.correctionText) {
    parts.push(`The user says your previous estimate was wrong: "${context.correctionText}". Re-analyze the photo with this correction and return the corrected JSON.`);
  }
  return parts.join('\n');
}

// Validate + normalize the model's parsed JSON. Throws {code:'BAD_SCHEMA'} on
// structurally invalid output so callers can fall back gracefully.
export function validateAIResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') throwAI('not an object');
  if (!Array.isArray(parsed.items)) throwAI('missing items array');

  const items = parsed.items.map((it, i) => {
    if (!it || typeof it !== 'object') throwAI(`item ${i} not an object`);
    const conf = ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'low';
    return {
      name: String(it.name || 'Unknown'),
      grams: num(it.grams),
      portion_estimate: it.grams ? `~${Math.round(num(it.grams))}g` : '',
      calories: num(it.kcal ?? it.calories),
      protein_g: num(it.protein_g),
      carbs_g: num(it.carbs_g),
      fat_g: num(it.fat_g),
      fiber_g: num(it.fiber_g),
      confidence: conf,
      assumes_added_fat: it.assumes_added_fat === true
    };
  });

  const cues = Array.isArray(parsed.visible_fat_cues)
    ? parsed.visible_fat_cues.map(String).slice(0, 10)
    : [];

  let clarifying = null;
  const q = parsed.clarifying_question;
  if (q && typeof q === 'object' && q.question && Array.isArray(q.options) && q.options.length >= 2) {
    clarifying = { question: String(q.question), options: q.options.slice(0, 4).map(String) };
  }

  return {
    foods: items, // keep 'foods' key for backward compat with the UI
    items,
    total_calories: items.reduce((s, f) => s + f.calories, 0),
    confidence: items.some((f) => f.confidence === 'low') ? 'low' : items.some((f) => f.confidence === 'medium') ? 'medium' : 'high',
    visible_fat_cues: cues,
    clarifying_question: clarifying
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function throwAI(why) {
  const err = new Error(`Model output failed schema validation (${why}).`);
  err.code = 'BAD_SCHEMA';
  throw err;
}
