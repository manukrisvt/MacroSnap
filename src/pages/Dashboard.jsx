import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { todayStr, formatDate } from '../lib/image.js';
import MacroRing from '../components/MacroRing.jsx';

export default function Dashboard() {
  const [day, setDay] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([api.day(todayStr()), api.settings()]);
      setDay(d);
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addWater() {
    await api.water(todayStr(), 1);
    load();
  }

  if (loading) return <div className="p-4 text-sm text-slate-400">Loading…</div>;
  if (!day) return null;

  const goal = Number(settings?.calorie_goal) || 2000;
  const pGoal = Number(settings?.protein_goal) || 150;
  const cGoal = Number(settings?.carbs_goal) || 225;
  const fGoal = Number(settings?.fat_goal) || 67;
  const t = day.totals;
  const remaining = Math.max(0, goal - t.calories);

  return (
    <div className="px-4">
      <header className="pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">MacroSnap</p>
        <h1 className="text-xl font-bold text-slate-900">Today</h1>
        <p className="text-xs text-slate-500">{formatDate(todayStr())}</p>
      </header>

      {/* Calorie hero card */}
      <div className="mt-3 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-lg">
        <div className="flex items-center gap-5">
          <MacroRing value={t.calories} goal={goal} size={120} stroke={11} color="#34d399"
            sub={`/ ${goal}`} />
          <div className="flex-1">
            <p className="text-xs uppercase text-slate-400">Consumed</p>
            <p className="text-3xl font-extrabold">{t.calories}</p>
            <p className="mt-1 text-xs text-slate-400">{remaining} kcal left of {goal}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, (t.calories/goal)*100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Macro rings */}
      <div className="mt-4 flex justify-around rounded-2xl bg-white p-4 shadow-sm">
        <MacroRing value={t.protein_g} goal={pGoal} color="#f43f5e" label="Protein" sub="g" />
        <MacroRing value={t.carbs_g} goal={cGoal} color="#f59e0b" label="Carbs" sub="g" />
        <MacroRing value={t.fat_g} goal={fGoal} color="#0ea5e9" label="Fat" sub="g" />
        <MacroRing value={t.fiber_g} goal={30} color="#10b981" label="Fiber" sub="g" />
      </div>

      {/* Water */}
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💧</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Water</p>
            <p className="text-xs text-slate-500">{day.water_glasses} glasses · {(day.water_glasses * 0.25).toFixed(1)} L</p>
          </div>
        </div>
        <button onClick={addWater}
          className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white active:scale-95">+1 glass</button>
      </div>

      {/* Quick add */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link to="/analyze" className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 active:scale-[.98]">
          📸 Snap meal
        </Link>
        <Link to="/manual" className="flex items-center justify-center gap-2 rounded-2xl bg-white py-4 font-semibold text-slate-700 shadow active:scale-[.98]">
          ✏️ Add manually
        </Link>
      </div>

      {/* Today's meals */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Today’s meals</h2>
          <Link to="/favorites" className="text-xs font-medium text-brand-600">Favorites →</Link>
        </div>
        {day.meals.length === 0 ? (
          <div className="mt-2 rounded-2xl bg-white p-6 text-center text-sm text-slate-400">
            No meals logged yet. Tap “Snap meal” to start.
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {day.meals.map((m) => (
              <MealRow key={m.id} meal={m} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MealRow({ meal, onChanged }) {
  const cal = meal.items.reduce((s, i) => s + i.calories, 0);
  async function del() {
    if (!confirm('Delete this meal?')) return;
    await api.deleteMeal(meal.id);
    onChanged();
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
      {meal.photo_thumb ? (
        <img src={meal.photo_thumb} alt="" className="h-12 w-12 rounded-xl object-cover" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl">🍽️</div>
      )}
      <div className="flex-1">
        <p className="text-sm font-semibold capitalize text-slate-800">{meal.meal_type}</p>
        <p className="text-xs text-slate-500">
          {meal.items.map((i) => i.name).join(', ').slice(0, 50)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-slate-800">{cal}</p>
        <p className="text-[10px] text-slate-400">kcal</p>
      </div>
      <button onClick={del} className="rounded-lg p-2 text-slate-300 active:bg-slate-100">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </div>
  );
}
