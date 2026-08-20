// In the browser (dev or PWA) the API is served same-origin via the Vite proxy.
// In the native iOS app (Capacitor) there's no proxy, so we point at the Mac's
// backend over WiFi via the VITE_API_BASE env var.
const BASE = (import.meta.env.VITE_API_BASE || '') + '/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
