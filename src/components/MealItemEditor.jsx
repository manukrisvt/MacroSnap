import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const MULTIPLIERS = [0.5, 1, 1.5, 2];

/**
 * Shared meal item editor used by both Analyze (AI result) and ManualAdd.
 *
 * items: [{ name, grams, portion, multiplier, calories, protein_g, carbs_g,
 *          fat_g, fiber_g, confidence }]
 * onChange(items) — parent owns state.
 *
 * Per item the user can: rename/swap (search over local food DB + custom
 * foods), edit grams, adjust multiplier, delete. Low-confidence items are
 * highlighted. "Add item" opens the same search sheet.
 */
export default function MealItemEditor({ items, onChange, showConfidence = false }) {
  const [searchFor, setSearchFor] = useState(null); // index of item being swapped, or 'add'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (searchFor === null) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try { setResults(await api.foods(query)); } finally { setSearching(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [query, searchFor]);

  function update(idx, patch) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function deleteItem(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }

  // Swap an item's food: replace macros using per-gram values scaled to the
  // item's current grams. Falls back to portion-multiplier scaling when the
  // food has no known gram weight.
  function pickFood(food) {
    const per100 = food.grams_per_portion
      ? {
          calories: (food.calories / food.grams_per_portion) * 100,
          protein_g: (food.protein_g / food.grams_per_portion) * 100,
          carbs_g: (food.carbs_g / food.grams_per_portion) * 100,
          fat_g: (food.fat_g / food.grams_per_portion) * 100,
          fiber_g: (food.fiber_g / food.grams_per_portion) * 100
        }
      : null;

    if (searchFor === 'add') {
      const grams = food.grams_per_portion || null;
      const scale = grams ? grams / 100 : 1;
      onChange([
        ...items,
        {
          name: food.name,
          grams,
          portion: food.portion || '',
          multiplier: 1,
          calories: per100 && grams ? Math.round(per100.calories * scale) : food.calories,
          protein_g: per100 && grams ? Math.round(per100.protein_g * scale * 10) / 10 : food.protein_g,
          carbs_g: per100 && grams ? Math.round(per100.carbs_g * scale * 10) / 10 : food.carbs_g,
          fat_g: per100 && grams ? Math.round(per100.fat_g * scale * 10) / 10 : food.fat_g,
          fiber_g: per100 && grams ? Math.round(per100.fiber_g * scale * 10) / 10 : food.fiber_g,
          confidence: null
        }
      ]);
    } else {
      const cur = items[searchFor];
      const grams = cur.grams || food.grams_per_portion || null;
      const patch = { name: food.name, portion: food.portion || cur.portion, grams };
      if (per100 && grams) {
        const s = grams / 100;
        patch.calories = Math.round(per100.calories * s);
        patch.protein_g = Math.round(per100.protein_g * s * 10) / 10;
        patch.carbs_g = Math.round(per100.carbs_g * s * 10) / 10;
        patch.fat_g = Math.round(per100.fat_g * s * 10) / 10;
        patch.fiber_g = Math.round(per100.fiber_g * s * 10) / 10;
        patch.multiplier = 1;
      } else {
        patch.calories = food.calories;
        patch.protein_g = food.protein_g;
        patch.carbs_g = food.carbs_g;
        patch.fat_g = food.fat_g;
        patch.fiber_g = food.fiber_g;
        patch.multiplier = 1;
      }
      update(searchFor, patch);
    }
    setSearchFor(null);
    setQuery('');
  }

  function scaledCalories(f) {
    return Math.round((f.calories || 0) * (f.multiplier || 1));
  }
  function scaledMacro(f, key) {
    return Math.round((f[key] || 0) * (f.multiplier || 1) * 10) / 10;
  }

  return (
    <div className="space-y-3">
      {items.map((f, idx) => (
        <div key={idx} className={`overflow-hidden rounded-2xl bg-white shadow-sm ${f.confidence === 'low' ? 'ring-2 ring-amber-300' : ''}`}>
          <div className="flex items-center gap-2 px-3 pt-3">
            <button
              onClick={() => { setSearchFor(idx); setQuery(''); }}
              className="flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-800"
            >
              {f.name}
              <span className="ml-1 text-xs text-brand-500">⇄</span>
            </button>
            {showConfidence && f.confidence && (
              <ConfidenceBadge level={f.confidence} />
            )}
            <button onClick={() => deleteItem(idx)} className="rounded-lg p-2 text-slate-300 active:bg-slate-50">
              <TrashIcon />
            </button>
          </div>

          {f.confidence === 'low' && (
            <p className="px-3 pt-1 text-[11px] font-medium text-amber-600">⚠️ Low confidence — double-check</p>
          )}

          <div className="mt-2 flex items-center gap-2 px-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5">
              <input
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={f.grams ?? ''}
                onChange={(e) => update(idx, { grams: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-16 bg-transparent text-center text-sm font-semibold text-slate-800 outline-none"
              />
              <span className="text-xs text-slate-400">g</span>
            </div>
            <div className="flex flex-1 gap-1">
              {MULTIPLIERS.map((m) => (
                <button key={m} onClick={() => update(idx, { multiplier: m })}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    (f.multiplier || 1) === m ? 'bg-brand-500 text-white' : 'bg-slate-50 text-slate-400'
                  }`}>{m}x</button>
              ))}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-5 gap-1 px-3 pb-3 text-center">
            <Macro label="kcal" value={scaledCalories(f)} />
            <Macro label="P" value={scaledMacro(f, 'protein_g')} color="text-rose-500" />
            <Macro label="C" value={scaledMacro(f, 'carbs_g')} color="text-amber-500" />
            <Macro label="F" value={scaledMacro(f, 'fat_g')} color="text-sky-500" />
            <Macro label="Fib" value={scaledMacro(f, 'fiber_g')} color="text-emerald-500" />
          </div>
        </div>
      ))}

      <button
        onClick={() => { setSearchFor('add'); setQuery(''); }}
        className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white py-3 text-sm font-medium text-slate-500 active:bg-slate-50"
      >+ Add item</button>

      {/* Food search sheet (swap or add) */}
      {searchFor !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setSearchFor(null)}>
          <div className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-t-3xl bg-slate-50 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                {searchFor === 'add' ? 'Add a food' : 'Swap this item'}
              </h3>
              <button onClick={() => setSearchFor(null)} className="text-slate-400">✕</button>
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods (e.g. dal, roti, chicken)…"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
            />
            <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
              {searching && <p className="px-3 py-4 text-center text-xs text-slate-400">Searching…</p>}
              {!searching && results.map((f) => (
                <button key={f.id} onClick={() => pickFood(f)}
                  className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2.5 text-left shadow-sm active:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{f.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {f.portion}{f.grams_per_portion ? ` · ${f.grams_per_portion}g` : ''} · {f.calories} kcal
                    </p>
                  </div>
                  <span className="text-brand-500">{searchFor === 'add' ? '+' : '⇄'}</span>
                </button>
              ))}
              {!searching && results.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-slate-400">No matches.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Macro({ label, value, color = 'text-slate-800' }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function ConfidenceBadge({ level }) {
  const map = { low: 'bg-rose-100 text-rose-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-emerald-100 text-emerald-700' };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${map[level] || map.low}`}>{level}</span>;
}

function TrashIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
