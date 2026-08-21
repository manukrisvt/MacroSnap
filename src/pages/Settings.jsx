import { useEffect, useState } from 'react';
import { api, logout, getStoredEmail } from '../lib/api.js';
import { todayStr, formatDate } from '../lib/image.js';
import { getAISettings, saveAISettings, PROVIDERS } from '../lib/aiSettings.js';
import Header from '../components/Header.jsx';

export default function Settings() {
  const [s, setS] = useState({});
  const [weight, setWeight] = useState('');
  const [weightLog, setWeightLog] = useState([]);
  const [saved, setSaved] = useState(false);
  const [ai, setAI] = useState(null);
  const [aiSaved, setAISaved] = useState(false);

  useEffect(() => {
    api.settings().then(setS);
    api.weight().then(setWeightLog);
    getAISettings().then(setAI);
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

      {/* AI Provider — BYO key vs server key */}
      {ai && (
        <AIProviderSection ai={ai} setAI={setAI} saved={aiSaved} setSaved={setAISaved} />
      )}

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

      <button
        onClick={() => { if (confirm('Log out?')) { logout(); window.location.reload(); } }}
        className="mt-3 w-full rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-600 active:scale-[.98]"
      >Log out{getStoredEmail() ? ` (${getStoredEmail()})` : ''}</button>
    </div>
  );
}

function AIProviderSection({ ai, setAI, saved, setSaved }) {
  const provider = PROVIDERS.find((p) => p.id === ai.byoProvider) || PROVIDERS[0];

  function update(field, value) {
    setAI((p) => ({ ...p, [field]: value }));
  }

  function selectProvider(id) {
    const p = PROVIDERS.find((x) => x.id === id);
    setAI((prev) => ({
      ...prev,
      byoProvider: id,
      byoBaseUrl: p.baseUrl || prev.byoBaseUrl
    }));
  }

  async function save() {
    await saveAISettings(ai);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-base">🤖</span>
        <h2 className="text-sm font-semibold text-slate-700">AI Provider</h2>
      </div>

      {/* Mode toggle */}
      <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => update('aiMode', 'server')}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
            ai.aiMode === 'server' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
          }`}
        >☁️ Use MacroSnap Cloud (Premium)</button>
        <button
          onClick={() => update('aiMode', 'byo')}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
            ai.aiMode === 'byo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
          }`}
        >🔑 Bring Your Own Key (Free)</button>
      </div>

      {ai.aiMode === 'server' ? (
        <p className="mt-3 text-xs text-slate-500">
          Photo analysis runs through MacroSnap's cloud server. Uses our API key —
          a subscription may be required for heavy use. Works out of the box, no setup needed.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Use your own AI API key — calls go directly from your device to the provider.
            <strong className="text-slate-700"> Free, unlimited.</strong> Your key is stored
            only on this device and never sent to our server.
          </p>

          {/* Provider dropdown */}
          <div>
            <label className="text-xs font-medium text-slate-600">Provider</label>
            <select
              value={ai.byoProvider}
              onChange={(e) => selectProvider(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* API key */}
          <div>
            <label className="text-xs font-medium text-slate-600">API Key</label>
            <input
              type="password"
              value={ai.byoApiKey || ''}
              onChange={(e) => update('byoApiKey', e.target.value)}
              placeholder="sk-..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
            />
            {provider.helpUrl && (
              <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer"
                className="mt-1 block text-[11px] text-brand-600">
                Get a key →
              </a>
            )}
          </div>

          {/* Model selection */}
          {provider.models.length > 0 ? (
            <div>
              <label className="text-xs font-medium text-slate-600">Model</label>
              <select
                value={ai.byoModel}
                onChange={(e) => update('byoModel', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-slate-600">Base URL</label>
                <input
                  type="text"
                  value={ai.byoBaseUrl || ''}
                  onChange={(e) => update('byoBaseUrl', e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Model ID</label>
                <input
                  type="text"
                  value={ai.byoModel || ''}
                  onChange={(e) => update('byoModel', e.target.value)}
                  placeholder="model-name"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                />
              </div>
            </>
          )}

          <button
            onClick={save}
            className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white active:scale-[.98]"
          >{saved ? 'Saved ✓' : 'Save AI Settings'}</button>
        </div>
      )}
    </section>
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
