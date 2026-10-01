// Client-side meal analysis — calls the AI provider directly from the device.
// Used when the user has "Bring Your Own Key" enabled.
// The API key never touches the MacroSnap server.

import { SYSTEM_PROMPT, buildUserText, validateAIResponse } from '../../shared/aiPrompt.js';

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

// Text-only key test — validates auth + model WITHOUT an image.
// (The old 1x1 test image was rejected by Gemini's inline_data validation
// with a 400 even when the key was perfectly valid.)
export async function testBYOKey(settings) {
  const byoBaseUrl = (settings.byoBaseUrl || '').trim();
  const byoApiKey = (settings.byoApiKey || '').trim();
  const byoModel = (settings.byoModel || '').trim();
  if (!byoApiKey) {
    const err = new Error('No API key set.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const res = await fetch(`${byoBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${byoApiKey}`,
      'HTTP-Referer': 'https://macrosnap.app',
      'X-Title': 'MacroSnap'
    },
    body: JSON.stringify({
      model: byoModel,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 5
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`AI provider error ${res.status}: ${txt.slice(0, 200)}`);
    err.code = 'API_ERROR';
    err.status = res.status;
    if (res.status === 401) {
      err.message = '401: key rejected. Check it is from the SELECTED provider (sk-or-v1-… = OpenRouter, sk-… = OpenAI, AIza… = Google with Custom provider).';
    } else if (res.status === 404) {
      err.message = '404: model not found. Pick a different model for this provider.';
    }
    throw err;
  }
  return true;
}

export async function analyzeMealImageDirect(dataUrl, settings, context = {}) {
  const byoBaseUrl = (settings.byoBaseUrl || '').trim();
  const byoApiKey = (settings.byoApiKey || '').trim();
  const byoModel = (settings.byoModel || '').trim();
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
          { type: 'text', text: buildUserText(context) }
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 2500
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
    if (res.status === 401) {
      err.message = 'Invalid API key (401). Check the key has no extra spaces, and that it is from the selected provider — e.g. an OpenRouter key (sk-or-v1-…) must use OpenRouter, a Google AI Studio key (AIza…) will not work there.';
    }
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

  // Strict schema validation + normalization (Phase 2)
  try {
    return validateAIResponse(parsed);
  } catch (e) {
    e.raw = content;
    throw e;
  }
}
