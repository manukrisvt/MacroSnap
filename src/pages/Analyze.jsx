import { useState, useRef } from 'react';
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

const isNative = Capacitor.isNativePlatform();

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
      setLoading(false);
    }
  }

  function setItems(items) {
    setResult((prev) => ({ ...prev, foods: items }));
  }

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
    : (result?.foods || []).reduce((s, f) => s + Math.round((f.calories || 0) * (f.multiplier || 1)), 0);

  async function logIt() {
    const items = verified ? gtItems : (result?.foods || []);
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

      {preview && (
        <div className="mt-3">
          <img src={preview} alt="meal" className="max-h-64 w-full rounded-2xl object-cover" />
          {/* Phase 2: optional hint + quick source chips */}
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Anything the AI should know? (e.g. homemade chicken curry, 2 rotis)"
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
          />
          <div className="mt-2 flex gap-2">
            {['Home-cooked', 'Restaurant', 'Packaged'].map((s) => (
              <button key={s} onClick={() => setMealSource((cur) => (cur === s ? null : s))}
                className={`flex-1 rounded-xl py-2 text-xs font-medium ${
                  mealSource === s ? 'bg-brand-500 text-white' : 'bg-white text-slate-500'
                }`}>{s}</button>
            ))}
          </div>
          {hint && !result && !loading && (
            <button
              onClick={() => base64 && analyze(base64)}
              className="mt-2 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white"
            >Analyze with this hint</button>
          )}
        </div>
      )}

      {loading && (
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
          <p className="text-sm font-medium text-slate-600">{funnyMsg}</p>
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
        <div className="mt-4 rounded-2xl bg-slate-900 p-6 text-center text-white">
          <div className="text-4xl">🔒</div>
          <p className="mt-2 text-lg font-bold">Free snaps used up</p>
          <p className="mt-1 text-sm text-slate-400">
            You've used all {quotaExceeded.limit} free photo analyses.
          </p>
          <div className="mt-4 space-y-2">
            <Link to="/settings"
              className="block rounded-xl bg-brand-500 py-3 font-semibold text-white active:scale-[.98]">
              🔑 Bring your own API key (Free)
            </Link>
            <p className="text-xs text-slate-500">
              Add your own OpenRouter/OpenAI key in Settings to get unlimited snaps for free.
              No subscription needed.
            </p>
          </div>
          <button
            onClick={() => navigate('/manual')}
            className="mt-3 w-full rounded-xl border border-slate-700 py-3 text-sm font-medium text-slate-300"
          >Add food manually →</button>
        </div>
      )}

      {/* Quota counter (when still has free snaps) */}
      {quotaInfo && !quotaInfo.isPremium && quotaInfo.remaining > 0 && !quotaExceeded && !loading && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>📸 Free snaps used: {quotaInfo.used}/{quotaInfo.limit}</span>
          <Link to="/settings" className="font-medium text-brand-600">Go unlimited →</Link>
        </div>
      )}

      {result && result.foods.length > 0 && !loading && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
            <span className="text-sm text-slate-500">Confidence</span>
            <OverallConfidence level={result.confidence} />
          </div>

          {/* Phase 2: visible fat cues from the model */}
          {result.visible_fat_cues?.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <span className="font-semibold">Visible fat: </span>
              {result.visible_fat_cues.join(' · ')}
            </div>
          )}

          {/* Phase 2: clarifying question with tappable options */}
          {result.clarifying_question && !reanalyzing && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-800">🤔 {result.clarifying_question.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.clarifying_question.options.map((opt) => (
                  <button key={opt} onClick={() => answerClarifying(opt)}
                    className="rounded-full bg-brand-100 px-4 py-2 text-xs font-medium text-brand-700 active:bg-brand-200">
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Phase 2: "Not right? Tell the AI" */}
          {!verified && (
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              {!showCorrection ? (
                <button onClick={() => setShowCorrection(true)}
                  className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600">
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowCorrection(false); setCorrectionText(''); }}
                      className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-medium text-slate-500">Cancel</button>
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

          <div className="flex gap-2">
            {MEAL_TYPES.map((m) => (
              <button key={m} onClick={() => setMealType(m)}
                className={`flex-1 rounded-xl py-2 text-xs font-medium capitalize ${
                  mealType === m ? 'bg-brand-500 text-white' : 'bg-white text-slate-500'
                }`}>{m}</button>
            ))}
          </div>

          {/* Verified meal toggle — build ground truth */}
          <button
            onClick={() => { setVerified((v) => !v); if (!verified && gtItems.length === 0) setGtItems([]); }}
            className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium ${
              verified ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600'
            }`}
          >
            ⚖️ {verified ? 'Verified mode ON — enter what you actually weighed' : 'I weighed this — enter exact amounts'}
          </button>

          {verified ? (
            <div>
              <p className="px-1 text-xs text-slate-500">
                Enter each ingredient with its actual weight, including cooking fat (oil/ghee/butter) as its own item.
              </p>
              <MealItemEditor items={gtItems} onChange={setGtItems} />
            </div>
          ) : (
            <MealItemEditor items={result.foods} onChange={setItems} showConfidence />
          )}

          <div className="mt-2 rounded-2xl bg-slate-900 p-4 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Total estimate</span>
              <span className="text-2xl font-bold">{totalCal} <span className="text-sm font-normal text-slate-400">kcal</span></span>
            </div>
            <button
              onClick={logIt}
              disabled={logging}
              className="mt-3 w-full rounded-xl bg-brand-500 py-3.5 text-base font-semibold active:scale-[.98] disabled:opacity-60"
            >{logging ? 'Saving…' : 'Log it'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OverallConfidence({ level }) {
  const map = { low: 'bg-rose-100 text-rose-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-emerald-100 text-emerald-700' };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${map[level] || map.low}`}>{level}</span>;
}

