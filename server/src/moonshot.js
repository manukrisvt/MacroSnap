import 'dotenv/config';

// Generic OpenAI-compatible vision config.
// Works with OpenRouter, Moonshot, OpenAI, Groq, etc.
// Backward compatible: falls back to MOONSHOT_* vars if the generic ones aren't set.
const AI_BASE_URL =
  process.env.AI_BASE_URL ||
  process.env.MOONSHOT_BASE_URL ||
  'https://api.moonshot.ai/v1';
const AI_API_KEY =
  process.env.AI_API_KEY ||
  process.env.MOONSHOT_API_KEY ||
  '';
const AI_MODEL =
  process.env.AI_MODEL ||
  process.env.MOONSHOT_MODEL ||
  'kimi-k3';
const PROVIDER_NAME = AI_BASE_URL.includes('openrouter')
  ? 'OpenRouter'
  : AI_BASE_URL.includes('moonshot')
    ? 'Moonshot'
    : 'AI';

const SYSTEM_PROMPT = `You are a nutrition vision assistant. Analyze the food photo and estimate the meal.
Return STRICT JSON only — no markdown, no commentary. The JSON must match exactly:
{
  "foods": [
    { "name": "", "portion_estimate": "", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 }
  ],
  "total_calories": 0,
  "confidence": "low|medium|high"
}
Rules:
- Estimate per-item calories and macros for the visible portion.
- If multiple foods, list each separately.
- If you cannot identify the food confidently, set confidence to "low" and still give your best guess.
- Numbers must be integers or floats, not strings.
- Output ONLY the JSON object.`;

function stripJson(text) {
  // Remove ```json fences if present and grab the first {...} block.
  let t = text.trim();
  // Strip any leading/trailing code fences (possibly with language tag).
  t = t.replace(/^```[a-zA-Z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  // Fallback: extract the first balanced {...} block regardless of surrounding text.
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

export async function analyzeMealImage(base64Image, mimeType = 'image/jpeg') {
  if (!AI_API_KEY) {
    const err = new Error(
      'No AI API key set. Set AI_API_KEY (or MOONSHOT_API_KEY) in your .env file.'
    );
    err.code = 'NO_API_KEY';
    throw err;
  }

  const dataUrl = base64Image.startsWith('data:')
    ? base64Image
    : `data:${mimeType};base64,${base64Image}`;

  const body = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: 'Analyze this meal photo and return the JSON.' }
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 1200
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
        // OpenRouter recommends these optional headers; harmless on other providers.
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
        'X-Title': 'MacroSnap'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timeout);
    const err = new Error(`Network error contacting ${PROVIDER_NAME} API.`);
    err.code = 'NETWORK';
    err.cause = e;
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`${PROVIDER_NAME} API error ${res.status}: ${txt.slice(0, 200)}`);
    err.code = 'API_ERROR';
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error('Empty response from model.');
    err.code = 'EMPTY';
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJson(content));
  } catch (e) {
    const err = new Error('Model did not return valid JSON.');
    err.code = 'BAD_JSON';
    err.raw = content;
    throw err;
  }

  // Light validation / normalization
  if (!parsed.foods || !Array.isArray(parsed.foods)) {
    parsed.foods = [];
  }
  parsed.foods = parsed.foods.map((f) => ({
    name: String(f.name || 'Unknown'),
    portion_estimate: String(f.portion_estimate || ''),
    calories: Number(f.calories) || 0,
    protein_g: Number(f.protein_g) || 0,
    carbs_g: Number(f.carbs_g) || 0,
    fat_g: Number(f.fat_g) || 0,
    fiber_g: Number(f.fiber_g) || 0
  }));
  parsed.total_calories =
    Number(parsed.total_calories) ||
    parsed.foods.reduce((s, f) => s + (Number(f.calories) || 0), 0);
  parsed.confidence = ['low', 'medium', 'high'].includes(parsed.confidence)
    ? parsed.confidence
    : 'low';
  return parsed;
}
