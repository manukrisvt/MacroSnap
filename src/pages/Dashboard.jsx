import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { todayStr, formatDate } from '../lib/image.js';
import { getStreak, onMealLogged } from '../lib/gamification.js';

// ─────────────────────────────────────────────────────────────
// Home — "Calm Ledger × Coach" direction.
// Ledger layout (hairlines, no card stacks) with a coach-voice
// hero sentence. One accent (brand green), tabular numerals,
// full dark mode, no red / no shaming when over target.
// ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [day, setDay] = useState(null);
  const [settings, setSettings] = useState(null);
  const [weights, setWeights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [newBadge, setNewBadge] = useState(null);
  const [showAllMeals, setShowAllMeals] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s, w] = await Promise.all([api.day(todayStr()), api.settings(), api.weight().catch(() => [])]);
      setDay(d);
      setSettings(s);
      setWeights(Array.isArray(w) ? w : []);
      const mealCount = d.meals?.length || 0;
      const totalCals = d.totals?.calories || 0;
      const currentStreak = await getStreak();
      setStreak(currentStreak);
      if (mealCount > 0) {
        const result = await onMealLogged(mealCount, totalCals, currentStreak);
        if (result.newBadges.length > 0) {
          setNewBadge(result.newBadges[0]);
          setStreak(result.streak);
          setTimeout(() => setNewBadge(null), 5000);
        }
      }
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

  const hasGoal = !!settings?.calorie_goal;
  const goal = Number(settings?.calorie_goal) || 2000;
  const pGoal = Number(settings?.protein_goal) || 150;
  const cGoal = Number(settings?.carbs_goal) || 225;
  const fGoal = Number(settings?.fat_goal) || 67;
  const fibGoal = 30;
  const t = day.totals;
  const consumed = t.calories;
  const remaining = goal - consumed;
  const over = consumed - goal;
  const pct = goal > 0 ? Math.min(100, (consumed / goal) * 100) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Coach hero line — neutral, never shaming
  function heroLine() {
    if (consumed === 0) return 'a fresh day ahead.';
    if (remaining > 400) return `room for ${mealWord(hour)}.`;
    if (remaining > 0) return 'a light meal still fits.';
    return 'day’s done — tomorrow is fresh.';
  }
  function mealWord(h) {
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 18) return 'a snack';
    return 'dinner';
  }

  // Weight trend: last 8 weigh-ins, weekly rate
  const wSorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = wSorted.slice(-8);
  let weeklyRate = null;
  if (recent.length >= 2) {
    const days = (new Date(recent[recent.length - 1].date) - new Date(recent[0].date)) / 86400000;
    if (days >= 3) {
      const deltaKg = recent[recent.length - 1].weight_kg - recent[0].weight_kg;
      weeklyRate = (deltaKg / days) * 7;
    }
  }

  const meals = day.meals || [];
  const visibleMeals = showAllMeals ? meals : meals.slice(0, 3);

  return (
    <div className="px-5 pb-28">
      {/* Header */}
      <header className="flex items-center justify-between pt-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-brand-600 dark:text-brand-400">{formatDate(todayStr())}</p>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{greeting}.</h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 dark:bg-orange-900/40">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-300 tabular-nums">{streak}</span>
          </div>
        )}
      </header>

      {/* Badge celebration */}
      {newBadge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setNewBadge(null)}>
          <div className="mx-4 rounded-3xl bg-white p-8 text-center dark:bg-slate-800">
            <div className="text-6xl">{newBadge.emoji}</div>
            <p className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Badge Earned!</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{newBadge.label}</p>
          </div>
        </div>
      )}

      {/* No-profile state: friendly setup card instead of empty rings */}
      {!settings?.calorie_goal ? (
        <div className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center dark:border-brand-800 dark:bg-brand-900/30">
          <div className="text-4xl">🎯</div>
          <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">Set your targets</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Answer a few quick questions and we’ll calculate your daily calories & macros.
          </p>
          <Link to="/settings"
            className="mt-4 block rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white active:scale-[.98]">
            Set up in 2 minutes →
          </Link>
        </div>
      ) : (
        <>
          {/* HERO — calories remaining, coach sentence */}
          <section className="mt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">You have</p>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-black tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
                {remaining >= 0 ? remaining.toLocaleString() : over.toLocaleString()}
              </span>
              <span className="text-base font-semibold text-slate-400 dark:text-slate-500">
                {remaining >= 0 ? 'kcal left' : 'kcal over'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">— {heroLine()}</p>
            {/* progress bar — neutral when over */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full ${remaining >= 0 ? 'bg-brand-500' : 'bg-slate-500 dark:bg-slate-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              of {goal.toLocaleString()} kcal
            </p>
          </section>

          <Hairline />

          {/* PROTEIN — second hero */}
          <section>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Protein</p>
              <p className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{Math.round(t.protein_g)}</span>
                <span className="text-slate-400"> / {pGoal} g</span>
              </p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (t.protein_g / pGoal) * 100)}%` }} />
            </div>
            {t.protein_g < pGoal * 0.5 && consumed > 0 && (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                {Math.round(pGoal - t.protein_g)}g to go — the most actionable number here.
              </p>
            )}
          </section>

          <Hairline />

          {/* Carbs / Fat / Fiber — compact */}
          <section className="flex gap-5">
            <MiniMacro label="Carbs" value={Math.round(t.carbs_g)} goal={cGoal} />
            <MiniMacro label="Fat" value={Math.round(t.fat_g)} goal={fGoal} />
            <MiniMacro label="Fiber" value={Math.round(t.fiber_g)} goal={fibGoal} />
          </section>

          <Hairline />

          {/* Weight trend — sparkline + rate + log */}
          <section>
            {recent.length < 2 ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Weight</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">No weigh-ins yet — log to see your trend.</p>
                </div>
                <Link to="/settings" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Log weight
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Weight <span className="ml-1 text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
                      {weeklyRate !== null ? `${weeklyRate > 0 ? '+' : ''}${weeklyRate.toFixed(2)} kg/wk` : ''}
                    </span>
                  </p>
                  <Sparkline points={recent.map((w) => w.weight_kg)} />
                </div>
                <Link to="/settings" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Log weight
                </Link>
              </div>
            )}
          </section>

          <Hairline />

          {/* Water — single compact row */}
          <section className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              💧 <span className="font-semibold tabular-nums">{day.water_glasses}</span> glasses
              <span className="ml-1 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                · {(day.water_glasses * 0.25).toFixed(1)} L
              </span>
            </p>
            <button onClick={addWater}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95 dark:bg-slate-800 dark:text-slate-300">
              +1
            </button>
          </section>
        </>
      )}

      {/* Today's meals — below the fold, collapsed after 3 */}
      {settings?.calorie_goal && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Today’s meals</h2>
            <Link to="/favorites" className="text-xs font-medium text-brand-600 dark:text-brand-400">Favorites →</Link>
          </div>
          {meals.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
              Nothing yet. Snap your first meal below.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {visibleMeals.map((m) => <MealRow key={m.id} meal={m} onChanged={load} />)}
              {meals.length > 3 && !showAllMeals && (
                <button onClick={() => setShowAllMeals(true)}
                  className="w-full py-2.5 text-xs font-medium text-brand-600 dark:text-brand-400">
                  Show {meals.length - 3} more ∨
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Primary action — thumb reach */}
      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-5 pb-2">
        <Link to="/analyze"
          className="block w-full rounded-2xl bg-brand-500 py-4 text-center text-base font-bold text-white shadow-lg shadow-brand-500/25 active:scale-[.98]">
          📸 Snap meal
        </Link>
        <Link to="/manual"
          className="mt-1.5 block text-center text-xs font-medium text-slate-400 dark:text-slate-500">
          or add manually
        </Link>
      </div>
    </div>
  );
}

function Hairline() {
  return <div className="my-4 h-px w-full bg-slate-200 dark:bg-slate-800" />;
}

function MiniMacro({ label, value, goal }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="flex-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">
        {value}<span className="text-xs font-normal text-slate-400"> / {goal}g</span>
      </p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-slate-400 dark:bg-slate-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Sparkline({ points }) {
  if (points.length < 2) return null;
  const w = 120, h = 32;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((p) => h - ((p - min) / range) * (h - 6) - 3);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="mt-1">
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={1.5} fill="currentColor" className="text-slate-300 dark:text-slate-600" />
      ))}
      <path d={path} fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-brand-500" />
    </svg>
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
    <div className="flex items-center gap-3 py-2.5">
      {meal.photo_thumb ? (
        <img src={meal.photo_thumb} alt="" className="h-10 w-10 rounded-lg object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-base dark:bg-slate-800">🍽️</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium capitalize text-slate-800 dark:text-slate-200">{meal.meal_type}</p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
          {meal.items.map((i) => i.name).join(', ').slice(0, 50)}
        </p>
      </div>
      <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300">{cal}</p>
      <button onClick={del} className="rounded-lg p-1.5 text-slate-300 active:bg-slate-100 dark:text-slate-600">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </div>
  );
}
