import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, MEAL_TYPES, guessMealType } from '../lib/image.js';
import Header from '../components/Header.jsx';

export default function History() {
  const navigate = useNavigate();
  const [monthOffset, setMonthOffset] = useState(0);
  const [totals, setTotals] = useState({});
  const [selected, setSelected] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editingMeal, setEditingMeal] = useState(null); // meal being edited

  async function deleteMeal(mealId) {
    if (!confirm('Delete this meal? This cannot be undone.')) return;
    await api.deleteMeal(mealId);
    setSelectedDay((d) => ({ ...d, meals: d.meals.filter((m) => m.id !== mealId) }));
    // Refresh month totals
    api.history(90).then((rows) => {
      const map = {};
      for (const r of rows) map[r.date] = r;
      setTotals(map);
    });
  }

  async function saveMealEdit() {
    if (!editingMeal) return;
    await api.updateMeal(editingMeal.id, {
      meal_type: editingMeal.meal_type,
      items: editingMeal.items.map((it) => ({
        ...it,
        calories: Math.round(Number(it.calories) || 0),
        multiplier: Number(it.multiplier) || 1
      }))
    });
    setEditingMeal(null);
    api.day(selected).then(setSelectedDay);
  }

  useEffect(() => {
    api.history(90).then((rows) => {
      const map = {};
      for (const r of rows) map[r.date] = r;
      setTotals(map);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.day(selected).then(setSelectedDay);
  }, [selected]);

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date: ds, day: d });
  }

  return (
    <div className="px-4">
      <Header title="History" subtitle="Tap a day to see meals" />

      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="rounded-lg bg-white p-2 shadow-sm">‹</button>
        <span className="text-sm font-semibold text-slate-700">
          {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => setMonthOffset((m) => m + 1)} className="rounded-lg bg-white p-2 shadow-sm">›</button>
      </div>

      {/* Calendar with visual markers */}
      <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm">
        <div className="grid grid-cols-7 text-center text-[10px] font-medium text-slate-400">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <div key={i} />;
            const t = totals[c.date];
            const hasMeals = t && t.calories > 0;
            const isToday = c.date === todayStr;
            const isSel = c.date === selected;
            const isFuture = c.date > todayStr;
            return (
              <button key={i} onClick={() => setSelected(c.date)} disabled={isFuture}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-all ${
                  isSel ? 'bg-brand-500 text-white shadow-md' 
                  : isToday ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                  : isFuture ? 'text-slate-300'
                  : 'text-slate-700 active:bg-slate-100'
                }`}>
                <span className="font-medium">{c.day}</span>
                {/* Visual marker dot for days with meals */}
                {hasMeals && !isSel && (
                  <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-brand-500"></span>
                )}
                {hasMeals && isSel && (
                  <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-white"></span>
                )}
                {/* Calorie count for days with meals */}
                {hasMeals && (
                  <span className={`text-[8px] leading-none ${isSel ? 'text-white/80' : 'text-slate-400'}`}>{t.calories}</span>
                )}
              </button>
            );
          })}
        </div>
        {/* Legend */}
        <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-brand-500"></span> Meals logged</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-brand-200 ring-1 ring-brand-300"></span> Today</span>
        </div>
      </div>

      {/* Selected day detail */}
      {selected && selectedDay && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">{formatDate(selected)}</h2>
            {/* Add food button for this day */}
            <button
              onClick={() => navigate(`/analyze?date=${selected}`)}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >+ Add food</button>
          </div>

          {/* Day summary */}
          <div className="mt-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
            <span className="font-semibold text-slate-800">{selectedDay.totals.calories} kcal</span>
            <span className="text-slate-400"> · P {Math.round(selectedDay.totals.protein_g)}g · C {Math.round(selectedDay.totals.carbs_g)}g · F {Math.round(selectedDay.totals.fat_g)}g</span>
          </div>

          {/* Meals list */}
          <div className="mt-2 space-y-2">
            {selectedDay.meals.length === 0 && (
              <div className="rounded-2xl bg-white p-6 text-center">
                <p className="text-sm text-slate-400">No meals logged this day.</p>
                <button
                  onClick={() => navigate(`/analyze?date=${selected}`)}
                  className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white active:scale-95"
                >📸 Snap meal →</button>
                <button
                  onClick={() => navigate(`/manual?date=${selected}`)}
                  className="mt-2 ml-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm active:scale-95"
                >✏️ Manual →</button>
              </div>
            )}
            {selectedDay.meals.map((m) => (
              <div key={m.id} className="rounded-2xl bg-white p-3 shadow-sm">
                {editingMeal?.id === m.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <select
                        value={editingMeal.meal_type}
                        onChange={(e) => setEditingMeal({ ...editingMeal, meal_type: e.target.value })}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-sm capitalize"
                      >
                        {MEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={saveMealEdit}
                          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-95">Save</button>
                        <button onClick={() => setEditingMeal(null)}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">Cancel</button>
                      </div>
                    </div>
                    {editingMeal.items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={it.name}
                          onChange={(e) => {
                            const items = [...editingMeal.items];
                            items[idx] = { ...it, name: e.target.value };
                            setEditingMeal({ ...editingMeal, items });
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                        <input
                          type="number"
                          value={it.calories}
                          onChange={(e) => {
                            const items = [...editingMeal.items];
                            items[idx] = { ...it, calories: Number(e.target.value) || 0 };
                            setEditingMeal({ ...editingMeal, items });
                          }}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                        <span className="text-[10px] text-slate-400">kcal</span>
                        <button
                          onClick={() => setEditingMeal({ ...editingMeal, items: editingMeal.items.filter((_, i) => i !== idx) })}
                          className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-600 active:scale-95">✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      {m.photo_thumb ? (
                        <img src={m.photo_thumb} alt="" className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl">🍽️</div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-semibold capitalize text-slate-800">{m.meal_type}</p>
                        <p className="text-xs text-slate-500">
                          {m.items.reduce((s, i) => s + i.calories, 0)} kcal · {m.items.length} item(s)
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingMeal(m)}
                          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">✏️</button>
                        <button onClick={() => deleteMeal(m.id)}
                          className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 active:scale-95">🗑️</button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      {m.items.map((it) => (
                        <div key={it.id} className="flex justify-between text-xs">
                          <span className="text-slate-600">{it.name}{it.multiplier !== 1 ? ` (${it.multiplier}x)` : ''}</span>
                          <span className="text-slate-400">{it.calories} kcal</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Quick add buttons for this day */}
          {selectedDay.meals.length > 0 && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate(`/analyze?date=${selected}`)}
                className="flex-1 rounded-xl bg-brand-500 py-2.5 text-xs font-semibold text-white active:scale-95"
              >📸 Snap meal</button>
              <button
                onClick={() => navigate(`/manual?date=${selected}`)}
                className="flex-1 rounded-xl bg-white py-2.5 text-xs font-semibold text-slate-600 shadow-sm active:scale-95"
              >✏️ Add manually</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
