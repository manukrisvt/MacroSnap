export default function Header({ title, subtitle, right }) {
  return (
    <header className="sticky top-0 z-20 bg-slate-50/90 px-4 pb-2 pt-3 backdrop-blur dark:bg-slate-900/90">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
