import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/image.js';
import Header from '../components/Header.jsx';
import { BUCKET_LABELS } from '../../shared/mealTags.js';

export default function Trends() {
  const [range, setRange] = useState(7);
  const [data, setData] = useState([]);
  const [goal, setGoal] = useState(2000);
  const [patterns, setPatterns] = useState(null);

  useEffect(() => {
    api.history(range).then(setData);
    api.settings().then((s) => setGoal(Number(s.calorie_goal) || 2000));
  }, [range]);

  useEffect(() => {
    api.patterns(90).then(setPatterns).catch(() => setPatterns(null));
  }, []);

  // Defensive: server may return numbers as strings (pg bigint) — always coerce.
  const cals = data.map((d) => Number(d.calories) || 0);
  const pros = data.map((d) => Number(d.protein_g) || 0);
  const maxCal = Math.max(goal, ...cals, 1);
  const maxPro = Math.max(...pros, 1);

  return (
    <div className="px-4">
      <Header title="Trends" subtitle="Calories & protein over time" />
      <div className="mt-3 flex gap-2">
        {[7, 30].map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
              range === r ? 'bg-brand-500 text-white' : 'bg-white text-slate-500'
            }`}>Last {r} days</button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Calories</h2>
          <span className="text-xs text-slate-400">goal {goal}</span>
        </div>
        <LineChart data={cals} max={maxCal} goal={goal} color="#10b981" />
        <div className="mt-1 flex justify-between text-[9px] text-slate-400">
          <span>{data[0] ? formatDate(data[0].date) : ''}</span>
          <span>{data[data.length - 1] ? formatDate(data[data.length - 1].date) : ''}</span>
        </div>
        <div className="mt-2 flex justify-between text-xs">
          <Stat label="Avg" value={avg(cals)} />
          <Stat label="High" value={Math.max(...cals, 0)} />
          <Stat label="Low" value={cals.length ? Math.min(...cals) : 0} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Protein (g)</h2>
        <LineChart data={pros} max={maxPro} color="#f43f5e" />
        <div className="mt-2 flex justify-between text-xs">
          <Stat label="Avg" value={avg(pros)} />
          <Stat label="High" value={Math.max(...pros, 0)} />
          <Stat label="Low" value={pros.length ? Math.min(...pros) : 0} />
        </div>
      </div>

      <WeekCompare cals={cals} pros={pros} goal={goal} />

      {/* Generated insights — the compare/contrast, in words */}
      {patterns && <Insights patterns={patterns} cals={cals} goal={goal} />}

      <Patterns patterns={patterns} />
    </div>
  );
}

/** This week (last 7 entries) vs the previous 7 — the compare/contrast card. */
function WeekCompare({ cals, pros, goal }) {
  if (cals.length < 8) return null;
  const cur = cals.slice(-7), prev = cals.slice(-14, -7);
  const curP = pros.slice(-7), prevP = pros.slice(-14, -7);
  const avgCur = avg(cur), avgPrev = avg(prev);
  const pCur = avg(curP), pPrev = avg(prevP);
  const calDelta = avgPrev ? Math.round(((avgCur - avgPrev) / avgPrev) * 100) : null;
  const proDelta = pPrev ? Math.round(((pCur - pPrev) / pPrev) * 100) : null;
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">This week vs last week</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">Last 7 logged days vs the 7 before that</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <CompareCell label="Avg calories" cur={avgCur} prev={avgPrev} delta={calDelta} goodWhenLower={avgCur > goal} />
        <CompareCell label="Avg protein (g)" cur={pCur} prev={pPrev} delta={proDelta} goodWhenLower={false} />
      </div>
    </div>
  );
}

function CompareCell({ label, cur, prev, delta, goodWhenLower }) {
  const up = delta != null && delta > 0;
  const flat = delta == null || delta === 0;
  const good = flat ? null : (goodWhenLower ? !up : up);
  const color = flat ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-600';
  const arrow = flat ? '—' : up ? '↑' : '↓';
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-black text-slate-800">{cur}</span>
        <span className={`text-xs font-bold ${color}`}>{arrow} {flat ? '' : `${Math.abs(delta)}%`}</span>
      </div>
      <div className="text-[10px] text-slate-400">was {prev}</div>
    </div>
  );
}

/** Turn the data into 2-4 plain-language insights users can act on. */
function Insights({ patterns, cals, goal }) {
  const tips = [];
  const overall = patterns?.overall;
  const weekdays = patterns?.weekdays;

  // 1. Goal adherence
  if (cals.length >= 3) {
    const a = avg(cals);
    const off = Math.round(((a - goal) / goal) * 100);
    if (off > 15) tips.push({ icon: '🎯', text: `You're averaging ${a} kcal — ${off}% above your ${goal} goal. Trimming ~${Math.round((a - goal) / 3)} kcal per meal gets you back on target.` });
    else if (off < -15) tips.push({ icon: '🎯', text: `You're averaging ${a} kcal — ${Math.abs(off)}% below your goal. Consistently under-eating can stall your progress too.` });
    else tips.push({ icon: '✅', text: `Nice — your ${a} kcal average is within 15% of your ${goal} goal.` });
  }

  // 2. Quality trend (this week vs last)
  const wk = Object.keys(patterns?.weeks || {}).sort();
  if (wk.length >= 2) {
    const cur = patterns.weeks[wk[wk.length - 1]].processing || {};
    const prev = patterns.weeks[wk[wk.length - 2]].processing || {};
    const dFresh = (cur.fresh || 0) - (prev.fresh || 0);
    const dUP = (cur.ultra_processed || 0) - (prev.ultra_processed || 0);
    if (dUP >= 10) tips.push({ icon: '⚠️', text: `Ultra-processed food jumped ${dUP} points this week vs last. One home-cooked meal a day turns that around.` });
    else if (dFresh >= 10) tips.push({ icon: '📈', text: `Fresh/whole foods up ${dFresh} points this week — keep that streak going.` });
  }

  // 3. Weekday pattern (best vs worst day)
  if (weekdays && weekdays.some((d) => Object.keys(d).length)) {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const freshByDay = weekdays.map((d) => d.fresh || 0);
    const upByDay = weekdays.map((d) => d.ultra_processed || 0);
    const bestI = freshByDay.indexOf(Math.max(...freshByDay));
    const worstI = upByDay.indexOf(Math.max(...upByDay));
    if (upByDay[worstI] >= 25 && bestI !== worstI) {
      tips.push({ icon: '📅', text: `${names[worstI]}s are your weakest day (${upByDay[worstI]}% ultra-processed), while ${names[bestI]}s are your strongest (${freshByDay[bestI]}% fresh). Plan ${names[worstI]} meals ahead — that's your leverage day.` });
    }
  }

  // 4. Protein share
  if (overall?.profile && (overall.profile.high_protein || 0) < 20 && Object.keys(overall.profile).length >= 2) {
    tips.push({ icon: '💪', text: `Only ${overall.profile.high_protein || 0}% of your meals are high-protein. Adding a protein source to one meal a day shifts this fast.` });
  }

  if (!tips.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {tips.map((t, i) => (
        <div key={i} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <span className="text-lg leading-none">{t.icon}</span>
          <p className="text-[13px] leading-snug text-slate-700">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

function Patterns({ patterns }) {
  const hasData = patterns && patterns.overall && (
    Object.keys(patterns.overall.processing).length > 0 ||
    Object.keys(patterns.overall.profile).length > 0
  );
  if (!hasData) return null;
  const weekKeys = Object.keys(patterns.weeks || {}).sort();
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Eating patterns over time</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">Weekly food quality — spot drift before it becomes a habit</p>

      {/* Weekly stacked bars: processing mix per week */}
      {/* Compact weekly mix — kept small; insights above carry the meaning */}
      {weekKeys.length > 0 && (
        <WeeklyStack weeks={patterns.weeks} weekKeys={weekKeys.slice(-8)} bucket="processing" />
      )}

      {/* Overall 90-day mix */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="text-[11px] font-medium text-slate-500">Overall · last 90 days</div>
        <BucketBar title="Food quality" data={patterns.overall.processing} order={['fresh', 'minimally_processed', 'ultra_processed']} />
        <BucketBar title="Meal profile" data={patterns.overall.profile} order={['high_protein', 'balanced', 'carb_heavy', 'high_fat', 'high_sugar']} />
      </div>
    </div>
  );
}

/** Stacked weekly bars for one bucket — the "over days" view. */
function WeeklyStack({ weeks, weekKeys, bucket }) {
  const order = bucket === 'processing'
    ? ['fresh', 'minimally_processed', 'ultra_processed']
    : ['high_protein', 'balanced', 'carb_heavy', 'high_fat', 'high_sugar'];
  const colors = { fresh: '#10b981', minimally_processed: '#f59e0b', ultra_processed: '#ef4444', high_protein: '#3b82f6', balanced: '#10b981', carb_heavy: '#f59e0b', high_fat: '#a855f7', high_sugar: '#ef4444' };
  const fmt = (wk) => {
    const d = new Date(wk + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return (
    <div className="mt-3">
      <div className="flex h-24 items-end gap-1.5">
        {weekKeys.map((wk) => {
          const data = weeks[wk][bucket] || {};
          return (
            <div key={wk} className="flex-1" title={`${fmt(wk)}: ${order.filter(k => data[k]).map(k => `${BUCKET_LABELS[k]} ${data[k]}%`).join(', ')}`}>
              <div className="flex h-20 w-full flex-col-reverse overflow-hidden rounded-md">
                {order.filter((k) => data[k] > 0).map((k) => (
                  <div key={k} style={{ height: `${data[k]}%`, backgroundColor: colors[k] }} />
                ))}
              </div>
              <div className="mt-1 text-center text-[8px] text-slate-400">{fmt(wk)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {order.map((k) => (
          <span key={k} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colors[k] }} />
            {BUCKET_LABELS[k] || k}
          </span>
        ))}
      </div>
    </div>
  );
}

function BucketBar({ title, data, order }) {
  const entries = order.filter((k) => data[k] > 0).map((k) => [k, data[k]]);
  if (!entries.length) return null;
  const colors = { fresh: '#10b981', minimally_processed: '#f59e0b', ultra_processed: '#ef4444', high_protein: '#3b82f6', balanced: '#10b981', carb_heavy: '#f59e0b', high_fat: '#a855f7', high_sugar: '#ef4444' };
  return (
    <div className="mt-3">
      <div className="text-[11px] font-medium text-slate-500">{title}</div>
      <div className="mt-1 flex h-6 overflow-hidden rounded-lg">
        {entries.map(([k, pct]) => (
          <div key={k} style={{ width: `${pct}%`, backgroundColor: colors[k] || '#94a3b8' }}
            className="flex items-center justify-center text-[9px] font-bold text-white"
            title={`${BUCKET_LABELS[k] || k}: ${pct}%`}>
            {pct >= 15 ? `${pct}%` : ''}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {entries.map(([k, pct]) => (
          <span key={k} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colors[k] || '#94a3b8' }} />
            {BUCKET_LABELS[k] || k} · {pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function avg(arr) { return arr.length ? Math.round(arr.reduce((a, b) => a + (Number(b) || 0), 0) / arr.length) : 0; }

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <div className="font-bold text-slate-800">{value}</div>
      <div className="text-[9px] uppercase text-slate-400">{label}</div>
    </div>
  );
}

function LineChart({ data, max, goal, color }) {
  const W = 300, H = 120, P = 8;
  if (data.length === 0) return <div className="py-8 text-center text-xs text-slate-400">No data yet.</div>;
  const stepX = data.length > 1 ? (W - P * 2) / (data.length - 1) : 0;
  const y = (v) => H - P - (v / max) * (H - P * 2);
  const pts = data.map((v, i) => `${P + i * stepX},${y(v)}`);
  const path = `M ${pts.join(' L ')}`;
  const area = `${path} L ${P + (data.length - 1) * stepX},${H - P} L ${P},${H - P} Z`;
  const goalY = goal != null ? y(goal) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
      {goalY != null && (
        <line x1={P} y1={goalY} x2={W - P} y2={goalY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 3" />
      )}
      <path d={area} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => (
        <circle key={i} cx={P + i * stepX} cy={y(v)} r="2.5" fill={color} />
      ))}
    </svg>
  );
}
