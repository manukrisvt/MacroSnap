import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { todayStr, formatDate } from '../lib/image.js';
import Header from '../components/Header.jsx';

export default function Settings() {
  const [s, setS] = useState({});
  const [weight, setWeight] = useState('');
  const [weightLog, setWeightLog] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings().then(setS);
    api.weight().then(setWeightLog);
  }, []);

  function update(k, v) { setS((p) => ({ ...p, [k]: v })); }

  async function save() {
    await api.saveSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function logWeight() {
    if (!weight) return;
    await api.logWeight(todayStr(), Number(weight));
    setWeight('');
    api.weight().then(setWeightLog);
  }

  const macroUnit = s.macro_unit || 'g';

  return (
    <div className="px-4">
      <Header title="Settings" subtitle="Goals & profile" />

      <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Daily calorie goal</h2>
        <input type="number" inputMode="numeric" value={s.calorie_goal || ''}
          onChange={(e) => update('calorie_goal', e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-lg font-semibold" />
      </section>

      <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Macro targets</h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {['g', 'percent'].map((u) => (
              <button key={u} onClick={() => update('macro_unit', u)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  macroUnit === u ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}>{u === 'g' ? 'grams' : '% of cal'}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MacroInput label="Protein" value={s.protein_goal} onChange={(v) => update('protein_goal', v)} unit={macroUnit} color="text-rose-500" />
          <MacroInput label="Carbs" value={s.carbs_goal} onChange={(v) => update('carbs_goal', v)} unit={macroUnit} color="text-amber-500" />
          <MacroInput label="Fat" value={s.fat_goal} onChange={(v) => update('fat_goal', v)} unit={macroUnit} color="text-sky-500" />
        </div>
        {macroUnit === 'percent' && (
          <p className="mt-2 text-[11px] text-slate-400">Percentages convert to grams using your calorie goal (4 kcal/g protein & carbs, 9 kcal/g fat).</p>
        )}
      </section>

      <button onClick={save}
        className="mt-3 w-full rounded-2xl bg-brand-500 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 active:scale-[.98]">
        {saved ? 'Saved ✓' : 'Save goals'}
      </button>

      <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Weight log</h2>
        <div className="mt-2 flex gap-2">
          <input type="number" inputMode="decimal" placeholder="kg" value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-3" />
          <button onClick={logWeight}
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">Log</button>
        </div>
        <div className="mt-3 space-y-1">
          {weightLog.slice(-10).reverse().map((w) => (
            <div key={w.date} className="flex justify-between text-sm">
              <span className="text-slate-500">{formatDate(w.date)}</span>
              <span className="font-medium text-slate-800">{w.weight_kg} kg</span>
            </div>
          ))}
          {weightLog.length === 0 && <p className="text-xs text-slate-400">No weight entries yet.</p>}
        </div>
      </section>

      <p className="mt-6 text-center text-[11px] text-slate-400">MacroSnap v1.0 · single-user, local SQLite</p>
    </div>
  );
}

function MacroInput({ label, value, onChange, unit, color }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 text-center">
      <div className={`text-xs font-semibold ${color}`}>{label}</div>
      <input type="number" inputMode="numeric" value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-center text-sm font-semibold" />
      <div className="mt-0.5 text-[9px] text-slate-400">{unit === 'g' ? 'grams' : '%'}</div>
    </div>
  );
}
