import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// On-device storage for the user's BYO API key + provider settings.
// The key NEVER touches the server — calls go directly from the device to the AI provider.

const DEFAULTS = {
  aiMode: 'server',          // 'server' (use your cloud key) or 'byo' (bring your own)
  byoProvider: 'openrouter', // 'openrouter' | 'openai' | 'custom'
  byoBaseUrl: 'https://openrouter.ai/api/v1',
  byoApiKey: '',
  byoModel: 'google/gemini-3.7-flash'
};

export async function getAISettings() {
  const result = {};
  for (const key of Object.keys(DEFAULTS)) {
    const { value } = await Preferences.get({ key });
    if (value !== null && value !== undefined) result[key] = value;
  }
  return { ...DEFAULTS, ...result };
}

export async function saveAISetting(key, value) {
  await Preferences.set({ key, value: String(value) });
}

export async function saveAISettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    await Preferences.set({ key, value: String(value) });
  }
}

export async function isBYO() {
  const { value } = await Preferences.get({ key: 'aiMode' });
  return value === 'byo';
}

// List of popular providers for the settings dropdown
export const PROVIDERS = [
  {
    id: 'openrouter',
    label: 'OpenRouter (recommended)',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'google/gemini-3.7-flash', label: 'Gemini 3.7 Flash (fast & cheap)' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { id: 'meta-llama/llama-3.2-90b-vision-instruct', label: 'Llama 3.2 90B Vision' }
    ],
    helpUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (cheap)' },
      { id: 'gpt-4o', label: 'GPT-4o (best)' }
    ],
    helpUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    models: [],
    helpUrl: ''
  }
];
