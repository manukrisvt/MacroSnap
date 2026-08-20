import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { MEAL_TYPES, guessMealType, todayStr } from '../lib/image.js';
import Header from '../components/Header.jsx';

export default function Favorites() {
  const navigate = useNavigate();
  const [favs, setFavs] = useState([]);
  const [recent, setRecent] = useState([]);
  const [selected, setSelected] = useState([]);
  const [mealType, setMealType] = useState(guessMealType());

  useEffect(() => {
    api.favorites().then(setFavs);
    api.recent(15).then(setRecent);
  }, []);

  function add(f) { setSelected((p) => [...p, { ...f, multiplier: 1 }]); }
  function remove(idx) { setSelected((p) => p.filter((_, i) => i !== idx)); }
  async function favFood(f) {
    await api.addFavorite(f);
    api.favorites().then(setFavs);
  }
  async function unfav(name) {
    await api.removeFavorite(name);
    api.favorites().then(setFavs);
  }
  const total = selected.reduce((s, f) => s + Math.round((f.calories || 0) * f.multiplier), 0);

  async function log() {
    if (selected.length === 0) return;
    await api.addMeal({
      date: todayStr(),
      meal_type: mealType,
      photo_thumb: null,
      items: selected.map((f) => ({
        name: f.name, portion: f.portion || '', multiplier: f.multiplier,
        calories: Math.round((f.calories || 0) * f.multiplier),
        protein_g: Math.round((f.protein_g || 0) * f.multiplier * 10) / 10,
        carbs_g: Math.round((f.carbs_g || 0) * f.multiplier * 10) / 10,
        fat_g: Math.round((f.fat_g || 0) * f.multiplier * 10) / 10,
        fiber_g: Math.round((f.fiber_g || 0) * f.multiplier * 10) / 10
      }))
    });
    navigate('/');
  }

  return (
    <div className="px-4">
      <Header title="Favorites & recent" subtitle="Quick re-log" />

      <div className="mt-3 flex gap-2">
        {MEAL_TYPES.map((m) => (
          <button key={m} onClick={() => setMealType(m)}
            className={`flex-1 rounded-xl py-2 text-xs font-medium capitalize ${
              mealType === m ? 'bg-brand-500 text-white' : 'bg-white text-slate-500'
            }`}>{m}</button>
        ))}
      </div>

      <section className="mt-4">
        <h2 className="text-sm font-semibold text-slate-700">⭐ Favorites</h2>
        <div className="mt-2 space-y-1">
          {favs.length === 0 && <p className="rounded-xl bg-white p-4 text-center text-xs text-slate-400">No favorites yet. Star a food to save it.</p>}
          {favs.map((f) => (
            <div key={f.name} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 shadow-sm">
              <button onClick={() => add(f)} className="flex-1 text-left">
                <p className="text-sm font-medium text-slate-800">{f.name}</p>
                <p className="text-[11px] text-slate-400">{f.portion} · {f.calories} kcal</p>
              </button>
              <button onClick={() => unfav(f.name)} className="text-amber-500">★</button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-semibold text-slate-700">Recently logged</h2>
        <div className="mt-2 space-y-1">
          {recent.map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 shadow-sm">
              <button onClick={() => add(f)} className="flex-1 text-left">
                <p className="text-sm font-medium text-slate-800">{f.name}</p>
                <p className="text-[11px] text-slate-400">{f.portion} · {f.calories} kcal</p>
              </button>
              <button onClick={() => favFood(f)} className="text-slate-300">☆</button>
            </div>
          ))}
          {recent.length === 0 && <p className="rounded-xl bg-white p-4 text-center text-xs text-slate-400">Nothing logged yet.</p>}
        </div>
      </section>

      {selected.length > 0 && (
        <div className="sticky bottom-24 z-10 mt-3 rounded-2xl bg-slate-900 p-4 text-white shadow-xl">
          <div className="mb-2 flex flex-wrap gap-1">
            {selected.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-slate-700 px-2 py-1 text-xs">
                {f.name}
                <button onClick={() => remove(i)} className="text-slate-400">✕</button>
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Total</span>
            <span className="text-2xl font-bold">{total} <span className="text-sm text-slate-400">kcal</span></span>
          </div>
          <button onClick={log} className="mt-3 w-full rounded-xl bg-brand-500 py-3.5 font-semibold active:scale-[.98]">Log it</button>
        </div>
      )}
    </div>
  );
}
