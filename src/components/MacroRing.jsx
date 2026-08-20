// Circular progress ring. value/goal in same units (0..1 fill = value/goal).
export default function MacroRing({ value = 0, goal = 100, size = 64, stroke = 7, color = '#10b981', label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const dash = c * pct;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-slate-800">{Math.round(value)}</span>
          {sub && <span className="text-[9px] text-slate-400">{sub}</span>}
        </div>
      </div>
      {label && <span className="mt-1 text-[11px] font-medium text-slate-500">{label}</span>}
    </div>
  );
}
