// In the browser (dev or PWA) the API is served same-origin via the Vite proxy.
// In the native iOS app (Capacitor) there's no proxy, so we point at the Mac's
// backend over WiFi via the VITE_API_BASE env var.
const BASE = (import.meta.env.VITE_API_BASE || '') + '/api';

// Token storage — persists across app launches via Capacitor Preferences on native,
// localStorage on web.
let _token = null;
const TOKEN_KEY = 'macrosnap_token';
const EMAIL_KEY = 'macrosnap_email';

export function getStoredToken() {
  if (_token) return _token;
  try { _token = localStorage.getItem(TOKEN_KEY); } catch { _token = null; }
  return _token;
}

export function setAuth(token, email) {
  _token = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      if (email) localStorage.setItem(EMAIL_KEY, email);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  } catch {}
}

export function getStoredEmail() {
  try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
}

export function isLoggedIn() {
  return !!getStoredToken();
}

export function logout() {
  setAuth(null, null);
}

async function req(path, opts = {}) {
  const token = getStoredToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...opts
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  signup: (email, password, name) =>
    req('/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email, password) =>
    req('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  usage: () => req('/usage'),
  me: () => req('/me'),
  barcode: (code) => req(`/barcode/${code}`),

  analyze: (image, mimeType) =>
    req('/analyze', { method: 'POST', body: JSON.stringify({ image, mimeType }) }),

  foods: (q = '') => req(`/foods${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  addFood: (food) => req('/foods', { method: 'POST', body: JSON.stringify(food) }),

  meals: (date) => req(`/meals${date ? `?date=${date}` : ''}`),
  addMeal: (meal) => req('/meals', { method: 'POST', body: JSON.stringify(meal) }),
  deleteMeal: (id) => req(`/meals/${id}`, { method: 'DELETE' }),

  day: (date) => req(`/day${date ? `?date=${date}` : ''}`),
  water: (date, delta) => req('/water', { method: 'POST', body: JSON.stringify({ date, delta }) }),

  history: (days = 30) => req(`/history?days=${days}`),

  favorites: () => req('/favorites'),
  addFavorite: (f) => req('/favorites', { method: 'POST', body: JSON.stringify(f) }),
  removeFavorite: (name) => req(`/favorites/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  settings: () => req('/settings'),
  saveSettings: (s) => req('/settings', { method: 'POST', body: JSON.stringify(s) }),

  weight: () => req('/weight'),
  logWeight: (date, weight_kg) =>
    req('/weight', { method: 'POST', body: JSON.stringify({ date, weight_kg }) }),

  recent: (limit = 20) => req(`/recent?limit=${limit}`)
};
