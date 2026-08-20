import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { MEAL_TYPES, guessMealType, todayStr } from '../lib/image.js';
import Header from '../components/Header.jsx';

export default function ManualAdd() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]); // chosen foods
  const [mealType, setMealType] = useState(guessMealType());
  const [custom, setCustom] = useState({ name: '', portion: '1 serving', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' });
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.foods(query).then(setResults);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function addFood(f) {
    setSelected((p) => [...p, { ...f, multiplier: 1, source: 'db' }]);
  }
  function removeItem(idx) {
    setSelected((p) => p.filter((_, i) => i !== idx));
  }
  function setMult(idx, m) {
    setSelected((p) => p.map((it, i) => (i === idx ? { ...it, multiplier: m } : it)));
  }
  async function addCustom() {
    if (!custom.name) return;
    await api.addFood({ ...custom, category: 'other' });
    addFood({ ...custom, calories: Number(custom.calories) || 0, protein_g: Number(custom.protein_g) || 0, carbs_g: Number(custom.carbs_g) || 0, fat_g: Number(custom.fat_g) || 0, fiber_g: Number(custom.fiber_g) || 0 });
    setCustom({ name: '', portion: '1 serving', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' });
    setShowCustom(false);
  }

  const total = selected.reduce((s, f) => s + Math.round((f.calories || 0) * f.multiplier), 0);

  async function log() {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await api.addMeal({
        date: todayStr(),
        meal_type: mealType,
        photo_thumb: null,
        items: selected.map((f) => ({
          name: f.name,
          portion: f.portion || '',
          multiplier: f.multiplier,
          calories: Math.round((f.calories || 0) * f.multiplier),
          protein_g: Math.round((f.protein_g || 0) * f.multiplier * 10) / 10,
          carbs_g: Math.round((f.carbs_g || 0) * f.multiplier * 10) / 10,
          fat_g: Math.round((f.fat_g || 0) * f.multiplier * 10) / 10,
          fiber_g: Math.round((f.fiber_g || 0) * f.multiplier * 10) / 10
        }))
      });
      navigate('/');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4">
      <Header title="Add food" subtitle="Search or enter manually" />

      <div className="mt-3 flex gap-2">
        {MEAL_TYPES.map((m) => (
          <button key={m} onClick={() => setMealType(m)}
            className={`flex-1 rounded-xl py-2 text-xs font-medium capitalize ${
              mealType === m ? 'bg-brand-500 text-white' : 'bg-white text-slate-500'
            }`}>{m}</button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search foods (e.g. dal, idli, chicken)…"
        className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
      />

      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl bg-white p-1 shadow-sm">
        {results.map((f) => (
          <button key={f.id} onClick={() => addFood(f)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left active:bg-slate-50">
            <div>
              <p className="text-sm font-medium text-slate-800">{f.name}</p>
              <p className="text-[11px] text-slate-400">{f.portion} · {f.calories} kcal</p>
            </div>
            <span className="text-brand-500">+</span>
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">No matches.</p>}
      </div>

      <button onClick={() => setShowCustom((v) => !v)}
        className="mt-3 w-full rounded-xl bg-slate-100 py-3 text-sm font-medium text-slate-600">
        {showCustom ? 'Hide custom entry' : '+ Add custom food'}
      </button>

      {showCustom && (
        <div className="mt-2 space-y-2 rounded-2xl bg-white p-3 shadow-sm">
          <input placeholder="Food name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5" />
          <input placeholder="Portion (e.g. 1 cup)" value={custom.portion} onChange={(e) => setCustom({ ...custom, portion: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5" />
          <div className="grid grid-cols-5 gap-1">
            <Num placeholder="kcal" v={custom.calories} on={(v) => setCustom({ ...custom, calories: v })} />
            <Num placeholder="P" v={custom.protein_g} on={(v) => setCustom({ ...custom, protein_g: v })} />
            <Num placeholder="C" v={custom.carbs_g} on={(v) => setCustom({ ...custom, carbs_g: v })} />
            <Num placeholder="F" v={custom.fat_g} on={(v) => setCustom({ ...custom, fat_g: v })} />
            <Num placeholder="Fib" v={custom.fiber_g} on={(v) => setCustom({ ...custom, fiber_g: v })} />
          </div>
          <button onClick={addCustom} className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white">Add to meal</button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">In this meal</h2>
          {selected.map((f, idx) => (
            <div key={idx} className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{f.name}</p>
                  <p className="text-[11px] text-slate-400">{f.portion} · {Math.round((f.calories||0)*f.multiplier)} kcal</p>
                </div>
                <button onClick={() => removeItem(idx)} className="text-slate-300">✕</button>
              </div>
              <div className="mt-2 flex gap-1">
                {[0.5, 1, 1.5, 2].map((m) => (
                  <button key={m} onClick={() => setMult(idx, m)}
                    className={`flex-1 rounded-lg py-1 text-xs font-semibold ${
                      f.multiplier === m ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                    }`}>{m}x</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-24 z-10 mt-3 rounded-2xl bg-slate-900 p-4 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Total</span>
            <span className="text-2xl font-bold">{total} <span className="text-sm text-slate-400">kcal</span></span>
          </div>
          <button onClick={log} disabled={saving}
            className="mt-3 w-full rounded-xl bg-brand-500 py-3.5 font-semibold active:scale-[.98] disabled:opacity-60">
            {saving ? 'Saving…' : 'Log it'}
          </button>
        </div>
      )}
    </div>
  );
}

function Num({ placeholder, v, on }) {
  return (
    <input type="number" inputMode="numeric" placeholder={placeholder} value={v}
      onChange={(e) => on(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-1 py-2 text-center text-xs" />
  );
}
