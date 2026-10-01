import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { calculatePlan, CONFIG, kgToLb, lbToKg, cmToFtIn, ftInToCm, validateMacroSum } from '../../shared/planCalc.js';

// ─────────────────────────────────────────────────────────────
// Onboarding — 6 question screens + plan reveal.
// Progress bar, back button, one question per screen, defaults
// preselected, partial progress persisted to localStorage.
// ─────────────────────────────────────────────────────────────

const SAVE_KEY = 'macrosnap_onboarding_draft';
const TOTAL_SCREENS = 7; // 6 questions + reveal

const DEFAULTS = {
  goal: 'lose',
  sex: 'male',
  birthYear: '1995',
  heightCm: 175,
  weightKg: 75,
  unit: 'metric',
  activity: 'light',
  pace: 0.5,
  goalWeightKg: '',
  diet: 'non_veg',
  macroStyle: 'balanced',
  pregnant: false
};

function loadDraft() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export default function Onboarding({ onDone, prefill }) {
  const [screen, setScreen] = useState(1);
  const [a, setA] = useState(prefill ? { ...DEFAULTS, ...prefill } : loadDraft());
  const [saving, setSaving] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [custom, setCustom] = useState(null); // { kcal, protein, carbs, fat, mode }

  // Persist partial progress on every change
  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(a)); } catch {}
  }, [a]);

  const plan = calculatePlan(a);
  const up = (k, v) => setA((p) => ({ ...p, [k]: v }));

  // Customized values override the calculated plan on the reveal
  const shown = custom
    ? { ...plan, target: custom.kcal, macros: { protein: custom.protein, carbs: custom.carbs, fat: custom.fat, fiber: plan.macros.fiber } }
    : plan;

  async function finish() {
    setSaving(true);
    try {
      await api.saveSettings({
        calorie_goal: String(shown.target),
        protein_goal: String(shown.macros.protein),
        carbs_goal: String(shown.macros.carbs),
        fat_goal: String(shown.macros.fat),
        macro_unit: 'g'
      });
      // Store calculation intermediates for the home-screen explain sheet
      try {
        localStorage.setItem('macrosnap_plan_context', JSON.stringify({
          bmr: plan.bmr, tdee: plan.tdee, goal: plan.goal, pace: plan.pace,
          activity: a.activity, sex: a.sex, age: new Date().getFullYear() - Number(a.birthYear),
          weightKg: a.weightKg, diet: a.diet, macroStyle: a.macroStyle, source: 'formula'
        }));
        localStorage.removeItem(SAVE_KEY);
      } catch {}
      onDone();
    } catch {
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col px-5 pb-8 pt-4">
      {/* Progress bar + back */}
      <div className="flex items-center gap-3">
        {screen > 1 ? (
          <button onClick={() => setScreen((s) => s - 1)}
            className="-ml-1 rounded-lg p-2 text-slate-400 active:bg-slate-100 dark:text-slate-500">←</button>
        ) : <div className="w-8" />}
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(screen / TOTAL_SCREENS) * 100}%` }} />
        </div>
        <span className="text-[10px] font-medium tabular-nums text-slate-400">{screen} / {TOTAL_SCREENS}</span>
      </div>

      <div className="mt-6 flex-1">
        {screen === 1 && <GoalScreen a={a} up={up} next={() => setScreen(2)} />}
        {screen === 2 && <BodyScreen a={a} up={up} next={() => setScreen(3)} />}
        {screen === 3 && <ActivityScreen a={a} up={up} next={() => setScreen(4)} />}
        {screen === 4 && <PaceScreen a={a} up={up} plan={plan} next={() => setScreen(5)} />}
        {screen === 5 && <DietScreen a={a} up={up} next={() => setScreen(6)} />}
        {screen === 6 && <StyleScreen a={a} up={up} next={() => setScreen(7)} />}
        {screen === 7 && (
          <RevealScreen
            a={a} up={up} plan={shown} rawPlan={plan}
            showCalc={showCalc} setShowCalc={setShowCalc}
            showCustomize={showCustomize} setShowCustomize={setShowCustomize}
            custom={custom} setCustom={setCustom}
            finish={finish} saving={saving}
          />
        )}
      </div>
    </div>
  );
}

// ── Screens ──────────────────────────────────────────────────

function NextButton({ onClick, label = 'Next', disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="mt-6 w-full rounded-2xl bg-brand-500 py-4 text-base font-bold text-white shadow-lg shadow-brand-500/25 active:scale-[.98] disabled:opacity-50">
      {label}
    </button>
  );
}

function Question({ title, sub, children }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{title}</h2>
      {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function OptionRow({ options, value, onChange }) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`w-full rounded-2xl px-4 py-4 text-left transition-colors ${
            value === o.value
              ? 'bg-brand-500 text-white'
              : 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-200'
          }`}>
          <p className="text-sm font-semibold">{o.label}</p>
          {o.desc && <p className={`mt-0.5 text-xs ${value === o.value ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`}>{o.desc}</p>}
        </button>
      ))}
    </div>
  );
}

function GoalScreen({ a, up, next }) {
  return (
    <Question title="What's your goal?" sub="You can change this anytime.">
      <OptionRow
        value={a.goal}
        onChange={(v) => up('goal', v)}
        options={[
          { value: 'lose', label: 'Lose weight', desc: 'Eat slightly below what you burn' },
          { value: 'maintain', label: 'Maintain weight', desc: 'Stay where you are' },
          { value: 'gain', label: 'Gain weight or muscle', desc: 'Eat slightly above what you burn' }
        ]}
      />
      {a.goal !== 'maintain' && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Goal weight (optional — shows your timeline)
          </label>
          <input type="number" inputMode="decimal" value={a.goalWeightKg}
            onChange={(e) => up('goalWeightKg', e.target.value)}
            placeholder={a.unit === 'metric' ? 'kg' : 'lb'}
            className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-base shadow-sm dark:bg-slate-800 dark:text-slate-100" />
        </div>
      )}
      <NextButton onClick={next} />
    </Question>
  );
}

function BodyScreen({ a, up, next }) {
  const imperial = a.unit === 'imperial';
  const { ft, in: inch } = cmToFtIn(a.heightCm);
  const weightDisplay = imperial ? kgToLb(a.weightKg) : a.weightKg;
  return (
    <Question title="About you" sub="Used to calculate your calorie needs.">
      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {[['metric', 'kg / cm'], ['imperial', 'lb / ft']].map(([v, l]) => (
          <button key={v} onClick={() => up('unit', v)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${a.unit === v ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>
      <OptionRow
        value={a.sex}
        onChange={(v) => up('sex', v)}
        options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Birth year</label>
          <input type="number" inputMode="numeric" value={a.birthYear}
            onChange={(e) => up('birthYear', e.target.value)}
            className="mt-1 w-full rounded-xl bg-white px-3 py-3 text-base shadow-sm dark:bg-slate-800 dark:text-slate-100" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Height {imperial ? '(ft / in)' : '(cm)'}</label>
          {imperial ? (
            <div className="mt-1 flex gap-2">
              <input type="number" inputMode="numeric" value={ft}
                onChange={(e) => up('heightCm', ftInToCm(e.target.value || 0, inch))}
                className="w-full rounded-xl bg-white px-3 py-3 text-center text-base shadow-sm dark:bg-slate-800 dark:text-slate-100" />
              <input type="number" inputMode="numeric" value={inch}
                onChange={(e) => up('heightCm', ftInToCm(ft, e.target.value || 0))}
                className="w-full rounded-xl bg-white px-3 py-3 text-center text-base shadow-sm dark:bg-slate-800 dark:text-slate-100" />
            </div>
          ) : (
            <input type="number" inputMode="numeric" value={a.heightCm}
              onChange={(e) => up('heightCm', e.target.value)}
              className="mt-1 w-full rounded-xl bg-white px-3 py-3 text-center text-base shadow-sm dark:bg-slate-800 dark:text-slate-100" />
          )}
        </div>
      </div>
      <div className="mt-3">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Weight ({imperial ? 'lb' : 'kg'})</label>
        <input type="number" inputMode="decimal" value={weightDisplay}
          onChange={(e) => up('weightKg', imperial ? lbToKg(Number(e.target.value) || 0) : Number(e.target.value) || 0)}
          className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-center text-lg font-bold shadow-sm dark:bg-slate-800 dark:text-slate-100" />
      </div>
      {a.sex === 'female' && (
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={a.pregnant} onChange={(e) => up('pregnant', e.target.checked)} className="h-5 w-5 rounded" />
          Pregnant or breastfeeding
        </label>
      )}
      <NextButton onClick={next} disabled={!a.birthYear || !a.heightCm || !a.weightKg} />
    </Question>
  );
}

function ActivityScreen({ a, up, next }) {
  return (
    <Question title="How active are you?" sub="A typical week, not your best week.">
      <OptionRow
        value={a.activity}
        onChange={(v) => up('activity', v)}
        options={Object.entries(CONFIG.ACTIVITY).map(([value, x]) => ({ value, label: x.label, desc: x.desc }))}
      />
      <NextButton onClick={next} />
    </Question>
  );
}

function PaceScreen({ a, up, plan, next }) {
  if (a.goal === 'maintain') {
    return (
      <Question title="No pace needed" sub="You're maintaining — we'll target what you burn.">
        <NextButton onClick={next} label="Continue" />
      </Question>
    );
  }
  const verb = a.goal === 'lose' ? 'Lose' : 'Gain';
  return (
    <Question title="How fast?" sub="Steady is easier to keep.">
      <OptionRow
        value={String(a.pace)}
        onChange={(v) => up('pace', Number(v))}
        options={CONFIG.PACES.map((p) => ({
          value: String(p),
          label: `${verb} ${p} kg/week`,
          desc: a.goalWeightKg
            ? `≈ ${Math.ceil(Math.abs(a.weightKg - Number(a.goalWeightKg)) / p)} weeks to goal weight`
            : p === 0.25 ? 'Very steady' : p === 0.5 ? 'Recommended' : 'Ambitious'
        }))}
      />
      <NextButton onClick={next} />
    </Question>
  );
}

function DietScreen({ a, up, next }) {
  return (
    <Question title="What do you eat?" sub="Affects your protein plan.">
      <OptionRow
        value={a.diet}
        onChange={(v) => up('diet', v)}
        options={[
          { value: 'non_veg', label: 'Non-veg' },
          { value: 'eggetarian', label: 'Eggetarian', desc: 'Veg + eggs' },
          { value: 'veg', label: 'Veg' },
          { value: 'vegan', label: 'Vegan' }
        ]}
      />
      <NextButton onClick={next} />
    </Question>
  );
}

function StyleScreen({ a, up, next }) {
  return (
    <Question title="Macro style" sub="How should we split your calories?">
      <OptionRow
        value={a.macroStyle}
        onChange={(v) => up('macroStyle', v)}
        options={Object.entries(CONFIG.MACRO_STYLES).map(([value, s]) => ({ value, label: s.label, desc: s.desc }))}
      />
      <NextButton onClick={next} label="See my plan" />
    </Question>
  );
}

// ── Plan reveal ──────────────────────────────────────────────

function RevealScreen({ a, up, plan, rawPlan, showCalc, setShowCalc, showCustomize, setShowCustomize, custom, setCustom, finish, saving }) {
  const m = plan.macros;
  const pct = rawPlan.macroKcalPct;
  const v = custom ? validateMacroSum(custom.kcal, custom) : null;

  function startCustomize() {
    if (!custom) {
      setCustom({ kcal: plan.target, protein: m.protein, carbs: m.carbs, fat: m.fat, mode: 'g' });
    }
    setShowCustomize((s) => !s);
  }

  function switchToModerate() {
    const moderate = Math.round(a.weightKg * CONFIG.MODERATE_PROTEIN_G_PER_KG);
    const fat = Math.round((plan.target * 0.30) / 9);
    const carbs = Math.max(0, Math.round((plan.target - moderate * 4 - fat * 9) / 4));
    setCustom({ kcal: plan.target, protein: moderate, carbs, fat, mode: 'g' });
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Your daily plan</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {plan.goal === 'lose' ? `Lose ${plan.pace} kg/week` : plan.goal === 'gain' ? `Gain ${plan.pace} kg/week` : 'Maintain weight'}
      </p>

      {/* Hero kcal */}
      <div className="mt-6 text-center">
        <p className="text-6xl font-black tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
          {plan.target.toLocaleString()}
        </p>
        <p className="text-sm font-medium text-slate-400">kcal per day</p>
      </div>

      {/* Guardrail notes */}
      {plan.notes.map((n, i) => (
        <p key={i} className="mt-3 rounded-xl bg-slate-100 px-4 py-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{n}</p>
      ))}

      {/* Macros with % bars */}
      <div className="mt-6 space-y-3">
        <MacroRow label="Protein" grams={m.protein} pct={pct.protein} why={`${rawPlan.style === 'high_protein' ? '2.0' : '1.6'} g per kg to keep muscle while ${plan.goal === 'lose' ? 'losing fat' : 'training'}`} color="bg-rose-400" />
        <MacroRow label="Carbs" grams={m.carbs} pct={pct.carbs} why="Energy for your day and workouts" color="bg-amber-400" />
        <MacroRow label="Fat" grams={m.fat} pct={pct.fat} why="Hormones, vitamins, and staying full" color="bg-sky-400" />
        <MacroRow label="Fiber" grams={m.fiber} pct={null} why="Digestion and steady energy" color="bg-emerald-400" />
      </div>

      {/* Veg protein warning */}
      {plan.vegWarn && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-900/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">High protein on a {a.diet === 'vegan' ? 'vegan' : 'veg'} diet is doable but takes planning</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Good sources: {plan.vegWarn.sources}. Or switch to moderate protein ({plan.vegWarn.moderateProteinG} g).
          </p>
          <button onClick={switchToModerate}
            className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">
            Switch to moderate protein
          </button>
        </div>
      )}

      {/* How we calculated this */}
      <button onClick={() => setShowCalc((s) => !s)}
        className="mt-4 w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {showCalc ? 'Hide' : 'How we calculated this'} {showCalc ? '∧' : '∨'}
      </button>
      {showCalc && (
        <div className="mt-2 space-y-1.5 rounded-2xl bg-white p-4 text-xs shadow-sm dark:bg-slate-800">
          <CalcRow label="BMR (what you burn at rest)" value={`${rawPlan.bmr.toLocaleString()} kcal`} />
          <CalcRow label={`Activity (${CONFIG.ACTIVITY[a.activity]?.label})`} value={`× ${CONFIG.ACTIVITY[a.activity]?.mult}`} />
          <CalcRow label="TDEE (total burn)" value={`${rawPlan.tdee.toLocaleString()} kcal`} />
          <CalcRow label={rawPlan.goal === 'maintain' ? 'Maintain' : `${rawPlan.goal === 'lose' ? 'Deficit' : 'Surplus'} (${rawPlan.pace} kg/wk)`} value={`${rawPlan.goal === 'maintain' ? '±0' : rawPlan.goal === 'lose' ? '−' : '+'}${Math.abs(rawPlan.target - rawPlan.tdee).toLocaleString()} kcal`} />
          <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-700">
            <CalcRow bold label="Daily target" value={`${plan.target.toLocaleString()} kcal`} />
          </div>
        </div>
      )}

      {/* Customize */}
      <button onClick={startCustomize}
        className="mt-3 w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {showCustomize ? 'Hide customize' : 'Customize'} {showCustomize ? '∧' : '∨'}
      </button>
      {showCustomize && custom && (
        <div className="mt-2 space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-700">
            {[['g', 'Grams'], ['pct', '% of kcal']].map(([mode, l]) => (
              <button key={mode} onClick={() => setCustom({ ...custom, mode })}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${custom.mode === mode ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-600 dark:text-slate-100' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <NumField label="kcal" value={custom.kcal} onChange={(v) => setCustom({ ...custom, kcal: Number(v) || 0 })} />
            <NumField label="P (g)" value={custom.protein} onChange={(v) => setCustom({ ...custom, protein: Number(v) || 0 })} />
            <NumField label="C (g)" value={custom.carbs} onChange={(v) => setCustom({ ...custom, carbs: Number(v) || 0 })} />
            <NumField label="F (g)" value={custom.fat} onChange={(v) => setCustom({ ...custom, fat: Number(v) || 0 })} />
          </div>
          {v && !v.ok && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              ⚠ Macros sum to {v.sumKcal.toLocaleString()} kcal — {v.mismatchPct}% off your {custom.kcal.toLocaleString()} kcal target. Adjust so they're within 5%.
            </p>
          )}
          {v && v.ok && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Macros match your target ({v.sumKcal.toLocaleString()} kcal)</p>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
        These targets will adapt to your real data after ~2 weeks of logging.
      </p>

      <button onClick={finish} disabled={saving}
        className="mt-4 w-full rounded-2xl bg-brand-500 py-4 text-base font-bold text-white shadow-lg shadow-brand-500/25 active:scale-[.98] disabled:opacity-60">
        {saving ? 'Saving…' : 'Start tracking'}
      </button>
    </div>
  );
}

function MacroRow({ label, grams, pct, why, color }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>
        <p className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">{grams}</span> g
          {pct != null && <span className="ml-1 text-xs text-slate-400">· {pct}%</span>}
        </p>
      </div>
      {pct != null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{why}</p>
    </div>
  );
}

function CalcRow({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold text-slate-900 dark:text-slate-50' : 'text-slate-700 dark:text-slate-300'}`}>{value}</span>
    </div>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-slate-400">{label}</label>
      <input type="number" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg bg-slate-50 px-2 py-2 text-center text-sm font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100" />
    </div>
  );
}
