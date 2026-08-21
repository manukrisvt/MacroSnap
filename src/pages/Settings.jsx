import { useEffect, useState } from 'react';
import { api, logout } from '../lib/api.js';
import { todayStr, formatDate } from '../lib/image.js';
import { getAISettings, saveAISettings, PROVIDERS } from '../lib/aiSettings.js';
import { analyzeMealImageDirect } from '../lib/clientAI.js';
import Header from '../components/Header.jsx';

export default function Settings() {
  const [s, setS] = useState({});
  const [weight, setWeight] = useState('');
  const [weightLog, setWeightLog] = useState([]);
  const [saved, setSaved] = useState(false);
  const [ai, setAI] = useState(null);
  const [aiSaved, setAISaved] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    api.settings().then(setS);
    api.weight().then(setWeightLog);
    getAISettings().then(setAI);
    api.me().then(setProfile).catch(() => {});
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
  const byoActive = ai?.aiMode === 'byo' && ai?.byoApiKey;

  return (
    <div className="px-4 pb-8">
      <Header title="Settings" />

      {/* ===== PROFILE CARD ===== */}
      {profile ? (
        <div className="mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold">
              {(profile.name || profile.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-base font-bold">{profile.name || 'User'}</p>
              <p className="text-xs text-slate-400">{profile.email}</p>
            </div>
          </div>

          {/* Tier badges */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {profile.isPremium ? (
              <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-bold text-white">
                ⭐ PREMIUM
              </span>
            ) : (
              <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                FREE TIER
              </span>
            )}
            {byoActive && (
              <span className="rounded-full bg-brand-500/20 px-3 py-1 text-xs font-bold text-brand-300">
                🔑 BYO KEY
              </span>
            )}
          </div>

          {/* Quota bar (free tier only) */}
          {!profile.isPremium && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Cloud snaps</span>
                <span>{profile.quota.used}/{profile.quota.limit} used · {profile.quota.remaining} left</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.min(100, (profile.quota.used / profile.quota.limit) * 100)}%` }} />
              </div>
            </div>
          )}

          {profile.isPremium && (
            <p className="mt-3 text-xs text-slate-400">Unlimited cloud photo analyses included.</p>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl bg-white p-5 text-center text-sm text-slate-400">Loading profile…</div>
      )}

      {/* ===== PLAN STATUS ===== */}
      <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Plan</h2>
        <div className="mt-2 space-y-2">
          <PlanRow icon="🔑" label="BYO API Key" value={byoActive ? 'Active · Unlimited' : 'Not set up'} active={byoActive} />
          <PlanRow icon="⭐" label="Premium" value={profile?.isPremium ? 'Active' : 'Not subscribed'} active={profile?.isPremium} />
          <PlanRow icon="📸" label="Cloud Snaps" value={profile?.isPremium ? 'Unlimited' : `${profile?.quota?.remaining || 0}/${profile?.quota?.limit || 3} left`} active={!profile?.isPremium} />
        </div>
        {!byoActive && !profile?.isPremium && (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Add your own API key below for unlimited free snaps — no subscription needed.
          </p>
        )}
      </section>

      {/* ===== AI PROVIDER ===== */}
      {ai && <AIProviderSection ai={ai} setAI={setAI} saved={aiSaved} setSaved={setAISaved} />}

      {/* ===== GOALS ===== */}
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
                className={`rounded-md px-3 py-1 text-xs font-medium ${macroUnit === u ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                {u === 'g' ? 'grams' : '% of cal'}
              </button>
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

      {/* ===== WEIGHT LOG ===== */}
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

      {/* ===== FEEDBACK ===== */}
      <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Feedback</h2>
        <p className="mt-1 text-xs text-slate-400">Report a bug or suggest a feature.</p>
        <textarea id="feedback-msg" placeholder="What went wrong? What's missing?"
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" rows={3} />
        <button onClick={async () => {
          const el = document.getElementById('feedback-msg');
          const msg = el?.value?.trim();
          if (!msg) return;
          try { await api.feedback(msg, 'bug'); el.value = ''; alert('Thanks! Feedback sent.'); }
          catch { alert('Could not send feedback. Try again later.'); }
        }} className="mt-2 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white">
          Send feedback
        </button>
      </section>

      {/* ===== DANGER ZONE ===== */}
      <details className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-rose-600">Danger zone</summary>
        <button
          onClick={async () => {
            if (!confirm('This permanently deletes your account and ALL data. This cannot be undone. Continue?')) return;
            if (!confirm('Are you absolutely sure? All meals, history, and settings will be lost.')) return;
            try {
              await api.deleteAccount();
              logout();
              window.location.reload();
            } catch { alert('Failed to delete account. Please try again.'); }
          }}
          className="mt-3 w-full rounded-xl border border-rose-300 bg-white py-3 text-sm font-semibold text-rose-600 active:scale-[.98]"
        >Delete my account</button>
      </details>

      {/* ===== LOGOUT ===== */}
      <button
        onClick={() => { if (confirm('Log out?')) { logout(); window.location.reload(); } }}
        className="mt-5 w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 active:scale-[.98]"
      >Log out</button>

      <p className="mt-4 text-center text-[11px] text-slate-400">MacroSnap v1.0</p>
    </div>
  );
}

function PlanRow({ icon, label, value, active }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-sm text-slate-700">{label}</span>
      </div>
      <span className={`text-xs font-semibold ${active ? 'text-brand-600' : 'text-slate-400'}`}>{value}</span>
    </div>
  );
}

function AIProviderSection({ ai, setAI, saved, setSaved }) {
  const provider = PROVIDERS.find((p) => p.id === ai.byoProvider) || PROVIDERS[0];
  function update(field, value) { setAI((p) => ({ ...p, [field]: value })); }
  function selectProvider(id) {
    const p = PROVIDERS.find((x) => x.id === id);
    setAI((prev) => ({ ...prev, byoProvider: id, byoBaseUrl: p.baseUrl || prev.byoBaseUrl }));
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
      <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
        <button onClick={() => update('aiMode', 'server')}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold ${ai.aiMode === 'server' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
          ☁️ Cloud Key
        </button>
        <button onClick={() => update('aiMode', 'byo')}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold ${ai.aiMode === 'byo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
          🔑 BYO Key
        </button>
      </div>
      {ai.aiMode === 'server' ? (
        <p className="mt-3 text-xs text-slate-500">
          Uses MacroSnap's cloud API key. Free tier: 3 snaps. Premium: unlimited. No setup needed.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Use your own AI API key — calls go directly from your device.
            <strong className="text-slate-700"> Free, unlimited.</strong>
            Key stored on-device only, never sent to our server.
          </p>
          <div>
            <label className="text-xs font-medium text-slate-600">Provider</label>
            <select value={ai.byoProvider} onChange={(e) => selectProvider(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">API Key</label>
            <input type="password" value={ai.byoApiKey || ''} onChange={(e) => update('byoApiKey', e.target.value)}
              placeholder="sk-..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
            {provider.helpUrl && (
              <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer"
                className="mt-1 block text-[11px] text-brand-600">Get a key →</a>
            )}
          </div>
          {provider.models.length > 0 ? (
            <div>
              <label className="text-xs font-medium text-slate-600">Model</label>
              <select value={ai.byoModel} onChange={(e) => update('byoModel', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                {provider.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-slate-600">Base URL</label>
                <input type="text" value={ai.byoBaseUrl || ''} onChange={(e) => update('byoBaseUrl', e.target.value)}
                  placeholder="https://api.example.com/v1" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Model ID</label>
                <input type="text" value={ai.byoModel || ''} onChange={(e) => update('byoModel', e.target.value)}
                  placeholder="model-name" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
              </div>
            </>
          )}
          <button onClick={save}
            className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white active:scale-[.98]">
            {saved ? 'Saved ✓' : 'Save AI Settings'}
          </button>
          <button onClick={async () => {
            const btn = document.getElementById('test-key-result');
            if (btn) btn.textContent = 'Testing…';
            try {
              // Send a tiny test request to verify the key works
              const testUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARAAEAAQADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=';
              await analyzeMealImageDirect(testUrl, ai);
              if (btn) btn.textContent = '✅ Key works! Ready to snap.';
              if (btn) btn.className = 'mt-2 text-xs text-brand-600';
            } catch (e) {
              if (btn) btn.textContent = '❌ ' + (e.message || 'Key test failed');
              if (btn) btn.className = 'mt-2 text-xs text-rose-500';
            }
          }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 active:scale-[.98]">
            Test key
          </button>
          <p id="test-key-result" className="mt-2 text-xs text-slate-400"></p>
        </div>
      )}
    </section>
  );
}

function MacroInput({ label, value, onChange, unit, color }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 text-center">
      <div className={`text-xs font-semibold ${color}`}>{label}</div>
      <input type="number" inputMode="numeric" value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-center text-sm font-semibold" />
      <div className="mt-0.5 text-[9px] text-slate-400">{unit === 'g' ? 'grams' : '%'}</div>
    </div>
  );
}
