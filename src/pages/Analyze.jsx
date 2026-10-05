import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { api } from '../lib/api.js';
import { compressImage, makeThumbnail, MEAL_TYPES, guessMealType, todayStr } from '../lib/image.js';
import { getAISettings, incrementBYOSnapCount } from '../lib/aiSettings.js';
import { analyzeMealImageDirect } from '../lib/clientAI.js';
import { getRandomFunnyMessage } from '../lib/funnyMessages.js';
import Header from '../components/Header.jsx';
import MealItemEditor from '../components/MealItemEditor.jsx';
import FatSelector from '../components/FatSelector.jsx';
import { computeFatItem, defaultFatLevel } from '../../shared/fatConfig.js';
import { matchRecipe, scaleRecipeToGrams } from '../../shared/recipeLogic.js';
import { BUCKET_LABELS, mergeTags } from '../../shared/mealTags.js';

const isNative = Capacitor.isNativePlatform();
// App Store builds: no purchase path in-app (Apple IAP rules).
// Users who want a paid plan upgrade via the website; the same account
// picks up the plan automatically.
const isIOSApp = isNative && Capacitor.getPlatform() === 'ios';

export default function Analyze() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedDate = searchParams.get('date'); // from history page
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [preview, setPreview] = useState(null);
  const [base64, setBase64] = useState(null);
  const [base64Mime, setBase64Mime] = useState('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { foods, total_calories, confidence }
  const [mealType, setMealType] = useState(guessMealType());
  const [logging, setLogging] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState(null);
  const [quotaExceeded, setQuotaExceeded] = useState(null);
  const [funnyMsg, setFunnyMsg] = useState('');
  // Raw AI output captured the instant the API responds — BEFORE the user sees
  // or edits anything — so ai_estimates stays an unbiased record.
  const rawResultRef = useRef(null);
  const aiSettingsRef = useRef(null);
  const [verified, setVerified] = useState(false); // "I weighed this" mode
  const [gtItems, setGtItems] = useState([]); // ground-truth items when verified
  // Phase 2: "Help the AI"
  const [hint, setHint] = useState('');
  const [mealSource, setMealSource] = useState(null); // 'Home-cooked' | 'Restaurant' | 'Packaged'
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [reanalyzing, setReanalyzing] = useState(false);
  // Phase 3: cooking fat selector
  const [fatLevel, setFatLevel] = useState(null); // null = not yet set for this meal
  const [fatType, setFatType] = useState('oil');
  // Phase 4: recipe matching
  const [recipeApplied, setRecipeApplied] = useState(null); // { itemIdx, recipe, original }
  const [recipes, setRecipes] = useState([]);
  const [checkoutError, setCheckoutError] = useState(null);

  async function startCheckout(planId) {
    setCheckoutError(null);
    try {
      const { url } = await api.startCheckout(planId);
      if (url) window.location.href = url;
    } catch (e) {
      setCheckoutError(e.message || 'Checkout failed. Try again.');
    }
  }

  async function handleDataUrl(dataUrl) {
    // Preserve the original MIME (Capacitor may return image/png or heic) —
    // hardcoding jpeg breaks Gemini's inline_data validation in BYO mode.
    const b64 = dataUrl.split(',')[1];
    setPreview(dataUrl);
    setBase64(b64);
    setBase64Mime((dataUrl.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg');
    // Phase 2: photo is captured — user can add a hint before analyzing.
    // Analysis starts immediately; hint applies to re-analyze.
    analyze(b64);
  }

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const { dataUrl } = await compressImage(file, 1024, 0.8);
      handleDataUrl(dataUrl);
    } catch (e) {
      setError('Could not read that image. Try another.');
    }
  }

  // Native camera (Capacitor). Returns a base64 data URL.
  async function takeNativePhoto(source = CameraSource.Camera) {
    setError(null);
    setResult(null);
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source,
        width: 1024,
        correctOrientation: true
      });
      if (!photo?.dataUrl) throw new Error('No image returned.');
      handleDataUrl(photo.dataUrl);
    } catch (e) {
      // user cancelled silently; surface real errors only
      if (e && /cancel|denied|dismiss/i.test(e.message || '')) return;
      setError('Could not open the camera. Use upload instead.');
    }
  }

  function takePhoto() {
    if (isNative) takeNativePhoto(CameraSource.Camera);
    else cameraRef.current?.click();
  }
  function pickFromGallery() {
    if (isNative) takeNativePhoto(CameraSource.Photos);
    else fileRef.current?.click();
  }

  async function analyze(b64, extraContext = {}) {
    setLoading(true);
    setError(null);
    setQuotaExceeded(null);
    setFunnyMsg(getRandomFunnyMessage());
    // Cycle the loading message every 2.5s so the wait feels alive
    const cycle = setInterval(() => setFunnyMsg(getRandomFunnyMessage()), 2500);
    try {
      const aiSettings = await getAISettings();
      aiSettingsRef.current = aiSettings;
      let r;
      const context = { hint: hint || undefined, mealSource: mealSource || undefined, ...extraContext };
      if (aiSettings.aiMode === 'byo' && aiSettings.byoApiKey) {
        // BYO key — call AI directly from device, key never touches server, no quota.
        // Use the ORIGINAL data URL (correct MIME) — Gemini rejects mismatched types.
        const dataUrl = `data:${base64Mime};base64,${b64}`;
        r = await analyzeMealImageDirect(dataUrl, aiSettings, context);
        incrementBYOSnapCount(); // local counter for Settings display
      } else {
        // Server mode — use cloud backend's API key (quota limited)
        r = await api.analyze(b64, base64Mime, context);
      }
      // Capture raw output immediately, before any user edits, for ai_estimates.
      rawResultRef.current = { ...r, foods: (r.foods || []).map((f) => ({ ...f })) };
      const foods = (r.foods || []).map((f) => ({ ...f, multiplier: 1 }));
      setResult({ foods, total_calories: r.total_calories, confidence: r.confidence, visible_fat_cues: r.visible_fat_cues || [], clarifying_question: r.clarifying_question || null });
      setRecipeApplied(null);
      // Phase 4: fuzzy-match items against the user's recipes
      try {
        const userRecipes = await api.recipes();
        setRecipes(userRecipes);
        if (userRecipes.length > 0) {
          const m = matchRecipe(foods[0]?.name || '', userRecipes);
          if (m && foods.length > 0) {
            const scaled = scaleRecipeToGrams(m.recipe, foods[0].grams || 150);
            setRecipeApplied({ itemIdx: 0, recipe: m.recipe, original: foods[0], scaled, score: m.score });
            setResult((prev) => ({
              ...prev,
              foods: prev.foods.map((f, i) => (i === 0 ? scaled : f))
            }));
          }
        }
      } catch { /* recipes unavailable — skip matching */ }
      // Phase 3: default fat level — cues -> normal; Restaurant -> normal; else light.
      // Remembered last choice per meal category takes precedence.
      const remembered = getRememberedFat(mealType);
      setFatLevel(remembered ?? defaultFatLevel(r.visible_fat_cues || [], mealSource));
      if (r.quota) setQuotaInfo(r.quota);
      if (foods.length === 0) setError('No foods detected. Enter manually instead.');
    } catch (e) {
      if (e.status === 402) {
        // Quota exceeded — show paywall
        try {
          const q = await api.usage();
          setQuotaExceeded(q);
        } catch {
          setQuotaExceeded({ used: 3, limit: 3, remaining: 0, isPremium: false });
        }
      } else {
        // Graceful error handling with specific messages
        let msg = "Couldn't analyze the photo. Enter manually instead.";
        if (e.code === 'NO_API_KEY') {
          msg = "No AI API key set. Go to Settings → AI Provider to add your key, or use manual entry.";
        } else if (e.code === 'NETWORK') {
          msg = "Can't reach the AI server. Check your internet connection and try again.";
        } else if (e.code === 'API_ERROR' && e.status === 401) {
          msg = "Your API key is invalid. Check Settings → AI Provider.";
        } else if (e.code === 'API_ERROR' && e.status === 429) {
          msg = "AI provider is rate-limited. Wait a minute and try again, or add your own key in Settings.";
        } else if (e.code === 'BAD_JSON') {
          msg = "The AI returned an unexpected response. Try retaking the photo or enter manually.";
        } else if (e.code === 'EMPTY') {
          msg = "The AI didn't return any results. Try a clearer photo or enter manually.";
        } else if (e.message) {
          msg = e.message;
        }
        setError(msg);
      }
    } finally {
      clearInterval(cycle);
      setLoading(false);
    }
  }

  function setItems(items) {
    setResult((prev) => ({ ...prev, foods: items }));
  }

  // Phase 3: remember the user's last fat choice per meal category.
  function getRememberedFat(meal) {
    try { return JSON.parse(localStorage.getItem(`macrosnap_fat_${meal}`) || 'null'); } catch { return null; }
  }
  function rememberFat(meal, level, type) {
    try { localStorage.setItem(`macrosnap_fat_${meal}`, JSON.stringify({ level, type })); } catch {}
  }

  function changeFatLevel(level) {
    setFatLevel(level);
    rememberFat(mealType, level, fatType);
  }
  function changeFatType(type) {
    setFatType(type);
    rememberFat(mealType, fatLevel, type);
  }

  // Phase 4: undo a recipe match — restore the original AI item
  function undoRecipe() {
    if (!recipeApplied) return;
    setResult((prev) => ({
      ...prev,
      foods: prev.foods.map((f, i) => (i === recipeApplied.itemIdx ? { ...recipeApplied.original, multiplier: 1 } : f))
    }));
    setRecipeApplied(null);
  }

  // The cooking fat is a real, visible, editable line item in the list.
  // Skipped when a recipe is applied (recipe macros already include fat).
  const fatItem = fatLevel && !recipeApplied ? computeFatItem(fatLevel, fatType) : null;
  const displayItems = verified
    ? gtItems
    : fatItem ? [...(result?.foods || []), fatItem] : (result?.foods || []);

  // Phase 2: re-analyze with extra context (hint, correction, clarifying answer).
  // Does NOT consume a free snap (server-side /api/reanalyze is quota-free,
  // rate-limited to 3 per 10 min).
  async function reanalyze(extraContext) {
    if (!base64 || reanalyzing) return;
    setReanalyzing(true);
    setError(null);
    try {
      const aiSettings = aiSettingsRef.current || (await getAISettings());
      aiSettingsRef.current = aiSettings;
      let r;
      if (aiSettings.aiMode === 'byo' && aiSettings.byoApiKey) {
        const dataUrl = `data:${base64Mime};base64,${base64}`;
        r = await analyzeMealImageDirect(dataUrl, aiSettings, extraContext);
      } else {
        r = await api.reanalyze(base64, base64Mime, extraContext);
      }
      const foods = (r.foods || []).map((f) => ({ ...f, multiplier: 1 }));
      setResult({ foods, total_calories: r.total_calories, confidence: r.confidence, visible_fat_cues: r.visible_fat_cues || [], clarifying_question: r.clarifying_question || null });
      if (foods.length === 0) setError('No foods detected. Enter manually instead.');
    } catch (e) {
      if (e.status === 429) {
        setError(e.message || 'Too many re-analyses. Edit items manually instead.');
      } else {
        // Surface the real cause so failures are diagnosable
        let msg = "Couldn't re-analyze. You can still edit the items manually below.";
        if (e.code === 'BAD_JSON' || e.code === 'BAD_SCHEMA') {
          msg = 'The AI returned an unexpected response. Try rewording your correction, or edit items manually.';
        } else if (e.code === 'NETWORK') {
          msg = "Can't reach the server. Check your connection and try again.";
        } else if (e.code === 'API_ERROR') {
          msg = `AI provider error${e.status ? ` (${e.status})` : ''}. Try again in a moment.`;
        } else if (e.message && !/Request failed/i.test(e.message)) {
          msg = `${msg} (${e.message})`;
        }
        setError(msg);
      }
    } finally {
      setReanalyzing(false);
      setShowCorrection(false);
      setCorrectionText('');
    }
  }

  function answerClarifying(answer) {
    reanalyze({ clarifyingAnswer: answer });
  }

  function submitCorrection() {
    if (!correctionText.trim()) return;
    reanalyze({ previousOutput: rawResultRef.current, correctionText: correctionText.trim() });
  }

  const totalCal = verified
    ? gtItems.reduce((s, f) => s + Math.round((f.calories || 0) * (f.multiplier || 1)), 0)
    : displayItems.reduce((s, f) => s + Math.round((f.calories || 0) * (f.multiplier || 1)), 0);

  async function logIt() {
    const items = verified ? gtItems : displayItems;
    if (!result || items.length === 0) return;
    setLogging(true);
    try {
      let thumb = null;
      if (preview) thumb = await makeThumbnail(preview, 256, 0.6);
      const raw = rawResultRef.current;
      const ai_estimate = raw
        ? {
            model_name: aiSettingsModelName(),
            prompt_version: '2.0',
            raw_model_output: raw,
            user_hint: [hint, mealSource].filter(Boolean).join(' — ') || null,
            fat_level: verified ? null : (fatLevel && fatLevel !== 'none' ? `${fatLevel}:${fatType}` : fatLevel),
            final_items: verified ? null : items.map(cleanItem),
            ground_truth_items: verified ? items.map(cleanItem) : null,
            is_verified: verified,
            // Verified meals keep the 1024px image for future model re-runs.
            image: verified ? base64 : undefined,
            image_mime: base64Mime
          }
        : undefined;
      await api.addMeal({
        date: selectedDate || todayStr(),
        meal_type: mealType,
        photo_thumb: thumb,
        items: items.map((f) => ({
          name: f.name,
          portion: f.portion_estimate || f.portion || '',
          multiplier: f.multiplier,
          grams: f.grams ?? null,
          confidence: f.confidence || null,
          calories: Math.round((f.calories || 0) * (f.multiplier || 1)),
          protein_g: Math.round((f.protein_g || 0) * (f.multiplier || 1) * 10) / 10,
          carbs_g: Math.round((f.carbs_g || 0) * (f.multiplier || 1) * 10) / 10,
          fat_g: Math.round((f.fat_g || 0) * (f.multiplier || 1) * 10) / 10,
          fiber_g: Math.round((f.fiber_g || 0) * (f.multiplier || 1) * 10) / 10
        })),
        ai_estimate
      });
      navigate('/');
    } catch (e) {
      setError('Failed to save meal: ' + (e.message || 'unknown error'));
    } finally {
      setLogging(false);
    }
  }

  function cleanItem(f) {
    return {
      name: f.name,
      grams: f.grams ?? null,
      portion: f.portion_estimate || f.portion || '',
      multiplier: f.multiplier || 1,
      calories: Math.round((f.calories || 0) * (f.multiplier || 1)),
      protein_g: Math.round((f.protein_g || 0) * (f.multiplier || 1) * 10) / 10,
      carbs_g: Math.round((f.carbs_g || 0) * (f.multiplier || 1) * 10) / 10,
      fat_g: Math.round((f.fat_g || 0) * (f.multiplier || 1) * 10) / 10,
      fiber_g: Math.round((f.fiber_g || 0) * (f.multiplier || 1) * 10) / 10,
      confidence: f.confidence || null
    };
  }

  function aiSettingsModelName() {
    const s = aiSettingsRef.current;
    if (s?.aiMode === 'byo') return `byo:${s.byoModel || 'unknown'}`;
    return 'server';
  }

  function reset() {
    setPreview(null);
    setBase64(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="px-4">
      <Header title="Snap a meal" subtitle="Photo → calorie estimate" right={
        (preview || result) && (
          <button onClick={reset} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500">Reset</button>
        )
      } />

      {!preview && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="flex h-56 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white text-center">
            <div className="mb-2 text-5xl">📸</div>
            <p className="px-8 text-sm text-slate-500">Take a photo or upload a picture of your meal to estimate calories & macros.</p>
          </div>
          <button
            onClick={takePhoto}
            className="w-full rounded-2xl bg-brand-500 py-4 text-lg font-semibold text-white shadow-lg shadow-brand-500/30 active:scale-[.98]"
          >
            Take photo
          </button>
          <button
            onClick={pickFromGallery}
            className="w-full rounded-2xl bg-white py-4 text-lg font-semibold text-slate-700 shadow active:scale-[.98]"
          >
            Upload from gallery
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      )}

      {preview && !result && !loading && (
        <div className="mt-3">
          <div className="relative overflow-hidden rounded-3xl">
            <img src={preview} alt="meal" className="max-h-64 w-full object-cover" />
          </div>
          {/* Phase 2: optional hint + quick source chips */}
          <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold text-slate-500">Help the AI (optional)</p>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. homemade chicken curry, 2 rotis"
              className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm"
            />
            <div className="mt-2 flex gap-2">
              {['Home-cooked', 'Restaurant', 'Packaged'].map((s) => (
                <button key={s} onClick={() => setMealSource((cur) => (cur === s ? null : s))}
                  className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${
                    mealSource === s ? 'bg-brand-500 text-white' : 'bg-slate-50 text-slate-500'
                  }`}>{s}</button>
              ))}
            </div>
            {hint && (
              <button
                onClick={() => base64 && analyze(base64)}
                className="mt-2 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white active:scale-[.98]"
              >Analyze with this hint</button>
            )}
          </div>
        </div>
      )}

      {preview && result && (
        <div className="relative mt-3 overflow-hidden rounded-3xl">
          <img src={preview} alt="meal" className="max-h-44 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight text-white">{totalCal}</span>
                <span className="text-sm font-medium text-white/70">kcal</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {result.confidence && result.confidence !== 'high' && (
                  <OverallConfidence level={result.confidence} />
                )}
                {result.visible_fat_cues?.length > 0 && (
                  <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950">oil visible</span>
                )}
              </div>
            </div>
            <div className="flex gap-1 rounded-full bg-black/40 p-1 backdrop-blur">
              {MEAL_TYPES.map((m) => (
                <button key={m} onClick={() => setMealType(m)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${
                    mealType === m ? 'bg-white text-slate-900' : 'text-white/70'
                  }`}>{m}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
          <p className="text-sm font-medium text-slate-600 transition-opacity duration-300">{funnyMsg}</p>
        </div>
      )}

      {error && !loading && !quotaExceeded && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Couldn't analyze</p>
          <p className="mt-1">{error}</p>
          <button
            onClick={() => navigate('/manual')}
            className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white"
          >Enter manually →</button>
        </div>
      )}

      {/* Quota paywall */}
      {quotaExceeded && !loading && (
        <div className="mt-4 rounded-2xl bg-slate-900 p-6 text-white">
          <div className="text-center">
            <div className="text-4xl">📸</div>
            <p className="mt-2 text-lg font-bold">You've used your {quotaExceeded.limit} free snaps</p>
            <p className="mt-1 text-sm text-slate-400">
              Keep the momentum going — pick a plan that fits your pace.
            </p>
          </div>
          <div className="mt-5 space-y-3">
            {isIOSApp ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
                <p className="text-sm font-semibold text-slate-200">Want more snaps?</p>
                <p className="mt-1 text-xs text-slate-400">
                  Sign in to your TallyBite account on the web to choose a plan —
                  it applies here automatically.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Or add your own AI key in Settings for unlimited free snaps.
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={() => startCheckout('basic')}
                  className="flex w-full items-center justify-between rounded-xl bg-brand-500 px-4 py-3 text-left active:scale-[.98]"
                >
                  <div>
                    <p className="font-semibold">Basic</p>
                    <p className="text-xs text-white/80">90 snaps / month (~3 a day)</p>
                  </div>
                  <p className="text-lg font-bold">$1.99<span className="text-xs font-normal text-white/80">/mo</span></p>
                </button>
                <button
                  onClick={() => startCheckout('plus')}
                  className="flex w-full items-center justify-between rounded-xl bg-emerald-500 px-4 py-3 text-left active:scale-[.98]"
                >
                  <div>
                    <p className="font-semibold">Plus</p>
                    <p className="text-xs text-white/80">500 snaps / month — for power users</p>
                  </div>
                  <p className="text-lg font-bold">$8.99<span className="text-xs font-normal text-white/80">/mo</span></p>
                </button>
                <Link to="/settings"
                  className="block rounded-xl border border-slate-700 py-3 text-center text-sm font-medium text-slate-300">
                  🔑 Or bring your own API key (free, unlimited)
                </Link>
              </>
            )}
          </div>
          <button
            onClick={() => navigate('/manual')}
            className="mt-3 w-full rounded-xl border border-slate-700 py-3 text-sm font-medium text-slate-300"
          >Add food manually →</button>
          {checkoutError && (
            <p className="mt-2 text-center text-xs text-rose-400">{checkoutError}</p>
          )}
        </div>
      )}

      {/* Quota counter (when still has free snaps) */}
      {quotaInfo && !quotaInfo.isPremium && quotaInfo.remaining > 0 && !quotaExceeded && !loading && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>📸 Free snaps used: {quotaInfo.used}/{quotaInfo.limit}</span>
          <Link to="/settings" className="font-medium text-brand-600">{isIOSApp ? 'Use your own AI key →' : 'Go unlimited →'}</Link>
        </div>
      )}

      {result && result.foods.length > 0 && !loading && (
        <div className="mt-3 space-y-3 pb-28">
          {/* Clarifying question — most important, ask first */}
          {result.clarifying_question && !reanalyzing && (
            <div className="rounded-2xl bg-brand-500 p-4 text-white shadow-lg shadow-brand-500/25">
              <p className="text-sm font-semibold">🤔 Quick question</p>
              <p className="mt-0.5 text-sm text-white/90">{result.clarifying_question.question}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.clarifying_question.options.map((opt) => (
                  <button key={opt} onClick={() => answerClarifying(opt)}
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-700 active:scale-95">
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recipe match banner */}
          {recipeApplied && !verified && (
            <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">🍲 Using your recipe: {recipeApplied.recipe.name}</p>
                <p className="text-[11px] text-emerald-600">Your macros · fat included</p>
              </div>
              <button onClick={undoRecipe}
                className="ml-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                Undo
              </button>
            </div>
          )}

          {/* AI classification chips — AI tags merged with retroactive fallback so they always show */}
          {(() => {
            const tags = mergeTags(result.tags, result.foods);
            const chips = ['source', 'processing', 'profile'].map((b) => tags[b] && { b, v: tags[b] });
            const visible = chips.filter(Boolean);
            if (!visible.length) return null;
            return (
              <div className="flex flex-wrap gap-1.5">
                {visible.map(({ b, v }) => (
                  <span key={b} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium capitalize text-slate-600">
                    {BUCKET_LABELS[v] || v.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Items */}
          {verified ? (
            <div>
              <p className="px-1 pb-2 text-xs text-slate-500">
                Enter each ingredient with its actual weight, including cooking fat as its own item.
              </p>
              <MealItemEditor items={gtItems} onChange={setGtItems} />
            </div>
          ) : (
            <div>
              <MealItemEditor items={result.foods} onChange={setItems} showConfidence />
              {/* Cooking fat line item */}
              {fatItem && fatItem.calories > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">🫕 Cooking fat: {fatItem.type}, {fatItem.level}</p>
                    <p className="text-[11px] text-amber-600">{fatItem.grams}g · {fatItem.fat_g}g fat</p>
                  </div>
                  <span className="text-sm font-bold text-amber-700">+{fatItem.calories} kcal</span>
                </div>
              )}
            </div>
          )}

          {/* Fat selector */}
          {!verified && fatLevel && !recipeApplied && (
            <FatSelector level={fatLevel} type={fatType} onLevel={changeFatLevel} onType={changeFatType} />
          )}

          {/* Verified toggle */}
          <button
            onClick={() => { setVerified((v) => !v); if (!verified && gtItems.length === 0) setGtItems([]); }}
            className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors ${
              verified ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 shadow-sm'
            }`}
          >
            ⚖️ {verified ? 'Verified mode ON — enter what you actually weighed' : 'I weighed this — enter exact amounts'}
          </button>

          {/* Tell the AI */}
          {!verified && (
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              {!showCorrection ? (
                <button onClick={() => setShowCorrection(true)}
                  className="w-full rounded-xl bg-slate-50 py-2.5 text-sm font-medium text-slate-600">
                  💬 Not right? Tell the AI
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    placeholder="e.g. it's sambar not rasam, and there are 3 rotis not 2"
                    rows={2}
                    className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowCorrection(false); setCorrectionText(''); }}
                      className="flex-1 rounded-xl bg-slate-50 py-2 text-sm font-medium text-slate-500">Cancel</button>
                    <button onClick={submitCorrection} disabled={reanalyzing || !correctionText.trim()}
                      className="flex-1 rounded-xl bg-brand-500 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
                    </button>
                  </div>
                </div>
              )}
              {reanalyzing && (
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
                  Asking the AI again…
                </div>
              )}
            </div>
          )}

          {/* Sticky log bar */}
          <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4 pb-[env(safe-area-inset-bottom)]">
            <button
              onClick={logIt}
              disabled={logging}
              className="w-full rounded-2xl bg-slate-900 py-4 text-base font-bold text-white shadow-2xl shadow-slate-900/30 ring-1 ring-white/10 active:scale-[.98] disabled:opacity-60"
            >
              {logging ? 'Saving…' : `Log it · ${totalCal} kcal`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OverallConfidence({ level }) {
  // Only low/medium are shown (high is hidden upstream) — worded as an action, not a label.
  const map = { low: 'bg-rose-100 text-rose-700', medium: 'bg-amber-100 text-amber-700' };
  const label = { low: '⚠️ Double-check portions', medium: '⚠️ Double-check portions' };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[level] || map.low}`}>{label[level] || label.low}</span>;
}

