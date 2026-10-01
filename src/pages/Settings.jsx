import { useEffect, useState } from 'react';
import { api, logout } from '../lib/api.js';
import { todayStr, formatDate } from '../lib/image.js';
import { getAISettings, saveAISettings, PROVIDERS, getBYOSnapCount } from '../lib/aiSettings.js';
import { analyzeMealImageDirect, testBYOKey } from '../lib/clientAI.js';
import Header from '../components/Header.jsx';

export default function Settings() {
  const [s, setS] = useState({});
  const [weight, setWeight] = useState('');
  const [weightLog, setWeightLog] = useState([]);
  const [saved, setSaved] = useState(false);
  const [ai, setAI] = useState(null);
  const [aiSaved, setAISaved] = useState(false);
  const [profile, setProfile] = useState(null);
  const [byoSnaps, setByoSnaps] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);

  useEffect(() => {
    api.settings().then(setS);
    api.weight().then(setWeightLog);
    getAISettings().then(setAI);
    api.me().then(setProfile).catch(() => {});
    getBYOSnapCount().then(setByoSnaps);
  }, []);

  async function startCheckout(planId) {
    setCheckoutError(null);
    try {
      const { url } = await api.startCheckout(planId);
      if (url) window.location.href = url;
    } catch (e) {
      setCheckoutError(e.message || 'Checkout failed. Try again.');
    }
  }

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
            {profile.plan === 'plus' && (
              <span className="rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-1 text-xs font-bold text-white">
                ⚡ PLUS
              </span>
            )}
            {profile.plan === 'basic' && (
              <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-bold text-white">
                ⭐ BASIC
              </span>
            )}
            {(!profile.plan || profile.plan === 'free') && (
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

          {/* Quota bar */}
          {profile.quota && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Cloud snaps</span>
                <span>
                  {profile.quota.used}/{profile.quota.limit} used · {profile.quota.remaining} left
                  {profile.quota.resetsMonthly ? ' · resets monthly' : ''}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.min(100, (profile.quota.used / profile.quota.limit) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl bg-white p-5 text-center text-sm text-slate-400">Loading profile…</div>
      )}

      {/* ===== PLAN STATUS ===== */}
      <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Plan</h2>
        <div className="mt-2 space-y-2">
          <PlanRow icon="🔑" label="BYO API Key" value={byoActive ? `Active · ${byoSnaps} snaps used · Unlimited` : 'Not set up'} active={byoActive} />
          <PlanRow icon="📸" label="Cloud Snaps"
            value={profile?.plan === 'plus' ? 'Plus · 500/month'
              : profile?.plan === 'basic' ? 'Basic · 90/month'
              : `${profile?.quota?.remaining || 0}/${profile?.quota?.limit || 3} left`}
            active={profile?.plan !== 'free'} />
        </div>

        {/* Upgrade options */}
        {(!profile?.plan || profile?.plan === 'free') && (
          <div className="mt-3 space-y-2">
            <button onClick={() => startCheckout('basic')}
              className="flex w-full items-center justify-between rounded-xl bg-amber-500 px-4 py-3 text-left text-white active:scale-[.98]">
              <div>
                <p className="text-sm font-semibold">Upgrade to Basic</p>
                <p className="text-xs text-white/80">90 snaps / month (~3 a day)</p>
              </div>
              <p className="font-bold">$2/mo</p>
            </button>
            <button onClick={() => startCheckout('plus')}
              className="flex w-full items-center justify-between rounded-xl bg-emerald-500 px-4 py-3 text-left text-white active:scale-[.98]">
              <div>
                <p className="text-sm font-semibold">Upgrade to Plus</p>
                <p className="text-xs text-white/80">500 snaps / month — for power users</p>
              </div>
              <p className="font-bold">$10/mo</p>
            </button>
            {checkoutError && <p className="text-xs text-rose-500">{checkoutError}</p>}
            {!byoActive && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                Or add your own API key below for unlimited free snaps — no subscription needed.
              </p>
            )}
          </div>
        )}
        {(profile?.plan === 'basic' || profile?.plan === 'plus') && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            You're on {profile.plan === 'plus' ? 'Plus' : 'Basic'} — {profile.quota?.limit} snaps/month.
            Manage or cancel your subscription from the link in your payment confirmation email.
          </p>
        )}
      </section>

      {/* ===== AI PROVIDER ===== */}
      {ai && <AIProviderSection ai={ai} setAI={setAI} saved={aiSaved} setSaved={setAISaved} />}

      {/* ===== MY RECIPES (Phase 4) ===== */}
      <MyRecipesSection />

      {/* ===== REDO SETUP ===== */}
      <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Your plan</h2>
        <p className="mt-1 text-xs text-slate-400">
          Re-run the setup quiz — goals, body, activity, pace — prefilled with your current answers.
        </p>
        <button
          onClick={() => {
            try {
              const ctx = JSON.parse(localStorage.getItem('macrosnap_plan_context') || '{}');
              localStorage.setItem('macrosnap_onboarding_draft', JSON.stringify({
                goal: ctx.goal || 'lose',
                sex: ctx.sex || 'male',
                birthYear: String(new Date().getFullYear() - (ctx.age || 30)),
                heightCm: 175, weightKg: ctx.weightKg || 75,
                activity: ctx.activity || 'light',
                pace: ctx.pace || 0.5,
                diet: ctx.diet || 'non_veg',
                macroStyle: ctx.macroStyle || 'balanced'
              }));
              localStorage.removeItem('macrosnap_onboarded');
            } catch {}
            window.location.reload();
          }}
          className="mt-3 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white active:scale-[.98] dark:bg-slate-700"
        >↻ Redo setup</button>
      </section>

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
        <textarea value={feedbackMsg} onChange={(e) => setFeedbackMsg(e.target.value)}
          placeholder="What went wrong? What's missing?"
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" rows={3} />
        <button onClick={async () => {
          if (!feedbackMsg.trim()) return;
          setFeedbackStatus('sending');
          try {
            await api.feedback(feedbackMsg.trim(), 'bug');
            setFeedbackMsg('');
            setFeedbackStatus('sent');
            setTimeout(() => setFeedbackStatus(null), 3000);
          } catch {
            setFeedbackStatus('error');
            setTimeout(() => setFeedbackStatus(null), 3000);
          }
        }} className="mt-2 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          disabled={feedbackStatus === 'sending'}>
          {feedbackStatus === 'sending' ? 'Sending…' : feedbackStatus === 'sent' ? '✓ Sent!' : feedbackStatus === 'error' ? '✗ Failed' : 'Send feedback'}
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
    // Trim key/base URL — pasted keys often carry trailing spaces/newlines
    // that cause 401 "Missing Authentication header" at the provider.
    const cleaned = { ...ai, byoApiKey: (ai.byoApiKey || '').trim(), byoBaseUrl: (ai.byoBaseUrl || '').trim(), byoModel: (ai.byoModel || '').trim() };
    setAI(cleaned);
    await saveAISettings(cleaned);
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
              // Text-only test: validates key + model without any image
              // (tiny test images get 400-rejected by some providers).
              await testBYOKey(ai);
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

// ===== MY RECIPES (Phase 4) =====
function MyRecipesSection() {
  const [recipes, setRecipes] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [yieldG, setYieldG] = useState('');
  const [fatG, setFatG] = useState('');
  const [ings, setIngs] = useState([]); // [{ name, grams, kcal_per_100g, ... }]
  const [ingQuery, setIngQuery] = useState('');
  const [ingResults, setIngResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const reload = () => api.recipes().then(setRecipes).catch(() => {});
  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (!showNew) return;
    const t = setTimeout(() => { api.foods(ingQuery).then(setIngResults); }, 200);
    return () => clearTimeout(t);
  }, [ingQuery, showNew]);

  function addIngredient(f) {
    // Convert a food (per portion) to per-100g ingredient entry
    const gpp = f.grams_per_portion || 100;
    setIngs((p) => [...p, {
      name: f.name,
      grams: '',
      kcal_per_100g: Math.round((f.calories / gpp) * 100),
      protein_per_100g: Math.round((f.protein_g / gpp) * 100 * 10) / 10,
      carbs_per_100g: Math.round((f.carbs_g / gpp) * 100 * 10) / 10,
      fat_per_100g: Math.round((f.fat_g / gpp) * 100 * 10) / 10,
      fiber_per_100g: Math.round((f.fiber_g / gpp) * 100 * 10) / 10
    }]);
    setIngQuery('');
  }

  async function saveRecipe() {
    setErr(null);
    if (!name || !yieldG || ings.length === 0 || ings.some((i) => !Number(i.grams))) {
      setErr('Need a name, total cooked weight, and grams for every ingredient.');
      return;
    }
    setSaving(true);
    try {
      await api.addRecipe({
        name,
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
        ingredients: ings,
        total_cooked_yield_g: Number(yieldG),
        cooking_fat_g: Number(fatG) || 0
      });
      setShowNew(false); setName(''); setAliases(''); setYieldG(''); setFatG(''); setIngs([]);
      reload();
    } catch (e) {
      setErr(e.message || 'Failed to save recipe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🍲</span>
          <h2 className="text-sm font-semibold text-slate-700">My Recipes</h2>
        </div>
        <button onClick={() => setShowNew((v) => !v)}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white">
          {showNew ? 'Cancel' : '+ New'}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Home-cooked dishes saved with exact ingredients. AI matches them by name and uses YOUR macros.
      </p>

      {showNew && (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name (e.g. Chicken curry)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Aliases, comma-separated (e.g. kerala chicken curry, curry)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <div className="flex gap-2">
            <input type="number" inputMode="numeric" value={yieldG} onChange={(e) => setYieldG(e.target.value)}
              placeholder="Total cooked weight (g)" className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input type="number" inputMode="numeric" value={fatG} onChange={(e) => setFatG(e.target.value)}
              placeholder="Cooking fat (g)" className="w-36 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>

          <div className="rounded-xl bg-slate-50 p-2">
            <p className="text-xs font-medium text-slate-600">Ingredients</p>
            {ings.map((ing, i) => (
              <div key={i} className="mt-1 flex items-center gap-2">
                <span className="flex-1 truncate text-xs text-slate-700">{ing.name}</span>
                <input type="number" inputMode="numeric" value={ing.grams}
                  onChange={(e) => setIngs((p) => p.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))}
                  placeholder="g" className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center text-xs" />
                <span className="text-[10px] text-slate-400">{ing.kcal_per_100g} kcal/100g</span>
                <button onClick={() => setIngs((p) => p.filter((_, j) => j !== i))} className="text-slate-300">✕</button>
              </div>
            ))}
            <input value={ingQuery} onChange={(e) => setIngQuery(e.target.value)}
              placeholder="Search foods to add…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" />
            {ingQuery && (
              <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                {ingResults.map((f) => (
                  <button key={f.id} onClick={() => addIngredient(f)}
                    className="flex w-full items-center justify-between rounded-lg bg-white px-2 py-1.5 text-left text-xs shadow-sm">
                    <span>{f.name}</span>
                    <span className="text-brand-500">+</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {err && <p className="text-xs text-rose-500">{err}</p>}
          <button onClick={saveRecipe} disabled={saving}
            className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      )}

      {recipes.length > 0 && (
        <div className="mt-3 space-y-1">
          {recipes.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-800">{r.name}</p>
                <p className="text-[11px] text-slate-400">
                  {Math.round(r.kcal_per_100g)} kcal/100g · P {r.protein_per_100g} · C {r.carbs_per_100g} · F {r.fat_per_100g}
                </p>
              </div>
              <button onClick={async () => { await api.deleteRecipe(r.id); reload(); }}
                className="text-slate-300">✕</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
