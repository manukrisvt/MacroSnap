import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/image.js';
import Header from '../components/Header.jsx';

export default function History() {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const [totals, setTotals] = useState({}); // date -> { calories }
  const [selected, setSelected] = useState(null); // date string
  const [selectedDay, setSelectedDay] = useState(null);

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

      <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm">
        <div className="grid grid-cols-7 text-center text-[10px] font-medium text-slate-400">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <div key={i} />;
            const t = totals[c.date];
            const isToday = c.date === todayStr;
            const isSel = c.date === selected;
            return (
              <button key={i} onClick={() => setSelected(c.date)}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs ${
                  isSel ? 'bg-brand-500 text-white' : isToday ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                }`}>
                <span className="font-medium">{c.day}</span>
                {t && t.calories > 0 && (
                  <span className={`text-[8px] ${isSel ? 'text-white/80' : 'text-slate-400'}`}>{t.calories}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && selectedDay && (
        <div className="mt-4">
          <h2 className="text-base font-bold text-slate-800">{formatDate(selected)}</h2>
          <div className="mt-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
            <span className="font-semibold text-slate-800">{selectedDay.totals.calories} kcal</span>
            <span className="text-slate-400"> · P {Math.round(selectedDay.totals.protein_g)}g · C {Math.round(selectedDay.totals.carbs_g)}g · F {Math.round(selectedDay.totals.fat_g)}g</span>
          </div>
          <div className="mt-2 space-y-2">
            {selectedDay.meals.length === 0 && (
              <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-400">No meals logged.</p>
            )}
            {selectedDay.meals.map((m) => (
              <div key={m.id} className="rounded-2xl bg-white p-3 shadow-sm">
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
                </div>
                <div className="mt-2 space-y-1">
                  {m.items.map((it) => (
                    <div key={it.id} className="flex justify-between text-xs">
                      <span className="text-slate-600">{it.name}{it.multiplier !== 1 ? ` (${it.multiplier}x)` : ''}</span>
                      <span className="text-slate-400">{it.calories} kcal</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
