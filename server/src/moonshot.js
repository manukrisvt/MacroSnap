import 'dotenv/config';
import { SYSTEM_PROMPT, buildUserText, validateAIResponse } from '../../shared/aiPrompt.js';

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

export async function analyzeMealImage(base64Image, mimeType = 'image/jpeg', context = {}) {
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

  // Strict schema validation + normalization (Phase 2)
  try {
    return validateAIResponse(parsed);
  } catch (e) {
    // Attach the raw output so callers can log/diagnose what the model said
    e.raw = content;
    throw e;
  }
}
