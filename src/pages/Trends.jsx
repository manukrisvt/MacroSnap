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

  const cals = data.map((d) => d.calories);
  const pros = data.map((d) => d.protein_g);
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

      <Patterns patterns={patterns} />
    </div>
  );
}

function Patterns({ patterns }) {
  const hasData = patterns && patterns.overall && (
    Object.keys(patterns.overall.processing).length > 0 ||
    Object.keys(patterns.overall.profile).length > 0
  );
  if (!hasData) return null;
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Eating patterns</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">How your meals break down over the last 90 days</p>
      <BucketBar title="Food quality" data={patterns.overall.processing} order={['fresh', 'minimally_processed', 'ultra_processed']} />
      <BucketBar title="Meal profile" data={patterns.overall.profile} order={['high_protein', 'balanced', 'carb_heavy', 'high_fat', 'high_sugar']} />
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

function avg(arr) { return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0; }

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
