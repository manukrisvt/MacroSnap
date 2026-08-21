// Client-side meal analysis — calls the AI provider directly from the device.
// Used when the user has "Bring Your Own Key" enabled.
// The API key never touches the MacroSnap server.

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
  let t = text.trim();
  t = t.replace(/^```[a-zA-Z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

export async function analyzeMealImageDirect(dataUrl, settings) {
  const { byoBaseUrl, byoApiKey, byoModel } = settings;
  if (!byoApiKey) {
    const err = new Error('No API key set. Add your key in Settings → AI Provider.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const body = {
    model: byoModel,
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
    res = await fetch(`${byoBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${byoApiKey}`,
        'HTTP-Referer': 'https://macrosnap.app',
        'X-Title': 'MacroSnap'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timeout);
    const err = new Error('Network error contacting AI provider. Check your internet connection.');
    err.code = 'NETWORK';
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`AI provider error ${res.status}: ${txt.slice(0, 200)}`);
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
    throw err;
  }

  if (!parsed.foods || !Array.isArray(parsed.foods)) parsed.foods = [];
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
    ? parsed.confidence : 'low';
  return parsed;
}
