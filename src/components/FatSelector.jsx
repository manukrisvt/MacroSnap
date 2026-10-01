import { FAT_GRAMS, FAT_KCAL_PER_G, FAT_LEVELS, FAT_TYPES } from '../../shared/fatConfig.js';

export function fatKcal(level) {
  return Math.round((FAT_GRAMS[level] || 0) * FAT_KCAL_PER_G);
}

// Phase 3: cooking fat selector — one row of level chips + type chips.
// Fat is added as its own transparent, editable line item in the meal.
//
// Props:
//   level: 'none'|'light'|'normal'|'heavy'
//   type: 'oil'|'ghee'|'butter'
//   onLevel(level), onType(type)
export default function FatSelector({ level, type, onLevel, onType }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">🫕 Fat used</span>
        {level !== 'none' && (
          <span className="text-xs font-medium text-amber-600">
            +{fatKcal(level)} kcal · {FAT_GRAMS[level]}g {type}
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-1.5">
        {FAT_LEVELS.map((l) => (
          <button key={l} onClick={() => onLevel(l)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize ${
              level === l ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
            }`}>{l}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {FAT_TYPES.map((t) => (
          <button key={t} onClick={() => onType(t)} disabled={level === 'none'}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize ${
              type === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
            } disabled:opacity-40`}>{t}</button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        AI estimates exclude cooking fat — this adds it back, once.
      </p>
    </div>
  );
}
