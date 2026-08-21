import { useState } from 'react';
import { api } from '../lib/api.js';

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(1);
  const [calorieGoal, setCalorieGoal] = useState('2000');
  const [proteinGoal, setProteinGoal] = useState('150');
  const [carbsGoal, setCarbsGoal] = useState('225');
  const [fatGoal, setFatGoal] = useState('67');
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      await api.saveSettings({
        calorie_goal: calorieGoal,
        protein_goal: proteinGoal,
        carbs_goal: carbsGoal,
        fat_goal: fatGoal,
        macro_unit: 'g'
      });
      onDone();
    } catch (e) {
      onDone(); // proceed even if save fails
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {step === 1 && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-3xl shadow-lg shadow-brand-500/30">
              🎯
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome to MacroSnap!</h1>
            <p className="mt-2 text-sm text-slate-500">
              Let's set up your daily goals. You can change these anytime in Settings.
            </p>
            <button onClick={() => setStep(2)}
              className="mt-6 w-full rounded-xl bg-brand-500 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 active:scale-[.98]">
              Get started
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900">Daily calorie goal</h2>
            <p className="mt-1 text-sm text-slate-500">How many calories do you want to eat per day?</p>
            <input type="number" inputMode="numeric" value={calorieGoal}
              onChange={(e) => setCalorieGoal(e.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-4 text-2xl font-bold text-center" />
            <div className="mt-2 flex gap-2">
              {[1500, 2000, 2500, 3000].map(c => (
                <button key={c} onClick={() => setCalorieGoal(String(c))}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${calorieGoal===String(c) ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                  {c}
                </button>
              ))}
            </div>
            <button onClick={() => setStep(3)}
              className="mt-4 w-full rounded-xl bg-brand-500 py-3.5 font-semibold text-white active:scale-[.98]">
              Next
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900">Macro targets</h2>
            <p className="mt-1 text-sm text-slate-500">Protein, carbs, and fat in grams per day.</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-rose-500">Protein (g)</label>
                <input type="number" inputMode="numeric" value={proteinGoal}
                  onChange={(e) => setProteinGoal(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold" />
              </div>
              <div>
                <label className="text-xs font-medium text-amber-500">Carbs (g)</label>
                <input type="number" inputMode="numeric" value={carbsGoal}
                  onChange={(e) => setCarbsGoal(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold" />
              </div>
              <div>
                <label className="text-xs font-medium text-sky-500">Fat (g)</label>
                <input type="number" inputMode="numeric" value={fatGoal}
                  onChange={(e) => setFatGoal(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold" />
              </div>
            </div>
            <button onClick={finish} disabled={saving}
              className="mt-4 w-full rounded-xl bg-brand-500 py-3.5 font-semibold text-white active:scale-[.98] disabled:opacity-60">
              {saving ? 'Saving…' : 'Start tracking!'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
