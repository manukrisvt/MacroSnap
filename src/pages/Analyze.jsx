import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { api } from '../lib/api.js';
import { compressImage, makeThumbnail, MEAL_TYPES, guessMealType, todayStr } from '../lib/image.js';
import { getAISettings } from '../lib/aiSettings.js';
import { analyzeMealImageDirect } from '../lib/clientAI.js';
import Header from '../components/Header.jsx';

const MULTIPLIERS = [0.5, 1, 1.5, 2];
const isNative = Capacitor.isNativePlatform();

export default function Analyze() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [preview, setPreview] = useState(null);
  const [base64, setBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { foods, total_calories, confidence }
  const [mealType, setMealType] = useState(guessMealType());
  const [logging, setLogging] = useState(false);

  async function handleDataUrl(dataUrl) {
    const b64 = dataUrl.split(',')[1];
    setPreview(dataUrl);
    setBase64(b64);
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

  async function analyze(b64) {
    setLoading(true);
    setError(null);
    try {
      const aiSettings = await getAISettings();
      let r;
      if (aiSettings.aiMode === 'byo' && aiSettings.byoApiKey) {
        // BYO key — call AI directly from device, key never touches server
        const dataUrl = `data:image/jpeg;base64,${b64}`;
        r = await analyzeMealImageDirect(dataUrl, aiSettings);
      } else {
        // Server mode — use cloud backend's API key
        r = await api.analyze(b64, 'image/jpeg');
      }
      const foods = (r.foods || []).map((f) => ({ ...f, multiplier: 1 }));
      setResult({ foods, total_calories: r.total_calories, confidence: r.confidence });
      if (foods.length === 0) setError('No foods detected. Enter manually instead.');
    } catch (e) {
      setError(e.message || "Couldn't analyze the photo. Enter manually instead.");
    } finally {
      setLoading(false);
    }
  }

  function setMultiplier(idx, m) {
    setResult((prev) => {
      const foods = prev.foods.map((f, i) => (i === idx ? { ...f, multiplier: m } : f));
      return { ...prev, foods };
    });
  }

  function editField(idx, field, value) {
    setResult((prev) => {
      const foods = prev.foods.map((f, i) =>
        i === idx ? { ...f, [field]: field === 'name' ? value : Number(value) || 0 } : f
      );
      return { ...prev, foods };
    });
  }

  function deleteItem(idx) {
    setResult((prev) => ({ ...prev, foods: prev.foods.filter((_, i) => i !== idx) }));
  }

  function scaledCalories(f) {
    return Math.round((f.calories || 0) * f.multiplier);
  }
  function scaledMacro(f, key) {
    return Math.round((f[key] || 0) * f.multiplier * 10) / 10;
  }
  const totalCal = (result?.foods || []).reduce((s, f) => s + scaledCalories(f), 0);

  async function logIt() {
    if (!result || result.foods.length === 0) return;
    setLogging(true);
    try {
      let thumb = null;
      if (preview) thumb = await makeThumbnail(preview, 256, 0.6);
      await api.addMeal({
        date: todayStr(),
        meal_type: mealType,
        photo_thumb: thumb,
        items: result.foods.map((f) => ({
          name: f.name,
          portion: f.portion_estimate || '',
          multiplier: f.multiplier,
          calories: scaledCalories(f),
          protein_g: scaledMacro(f, 'protein_g'),
          carbs_g: scaledMacro(f, 'carbs_g'),
          fat_g: scaledMacro(f, 'fat_g'),
          fiber_g: scaledMacro(f, 'fiber_g')
        }))
      });
      navigate('/');
    } catch (e) {
      setError('Failed to save meal: ' + (e.message || 'unknown error'));
    } finally {
      setLogging(false);
    }
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
        </div>
      )}

      {loading && (
        <div className="mt-6 flex flex-col items-center gap-2 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
          <p className="text-sm">Analyzing your meal…</p>
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Couldn’t analyze</p>
          <p className="mt-1">{error}</p>
          <button
            onClick={() => navigate('/manual')}
            className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white"
          >Enter manually →</button>
        </div>
      )}

      {result && result.foods.length > 0 && !loading && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
            <span className="text-sm text-slate-500">Confidence</span>
            <ConfidenceBadge level={result.confidence} />
          </div>

          <div className="flex gap-2">
            {MEAL_TYPES.map((m) => (
              <button key={m} onClick={() => setMealType(m)}
                className={`flex-1 rounded-xl py-2 text-xs font-medium capitalize ${
                  mealType === m ? 'bg-brand-500 text-white' : 'bg-white text-slate-500'
                }`}>{m}</button>
            ))}
          </div>

          {result.foods.map((f, idx) => (
            <div key={idx} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <input
                  value={f.name}
                  onChange={(e) => editField(idx, 'name', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-base font-semibold text-slate-800"
                />
                <button onClick={() => deleteItem(idx)} className="rounded-lg p-2 text-slate-400 active:bg-slate-100">
                  <TrashIcon />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">{f.portion_estimate || 'portion estimate'}</p>

              <div className="mt-3 flex gap-1.5">
                {MULTIPLIERS.map((m) => (
                  <button key={m} onClick={() => setMultiplier(idx, m)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
                      f.multiplier === m ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                    }`}>{m}x</button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                <Macro label="kcal" value={scaledCalories(f)} />
                <Macro label="P" value={scaledMacro(f, 'protein_g')} color="text-rose-500" />
                <Macro label="C" value={scaledMacro(f, 'carbs_g')} color="text-amber-500" />
                <Macro label="F" value={scaledMacro(f, 'fat_g')} color="text-sky-500" />
                <Macro label="Fib" value={scaledMacro(f, 'fiber_g')} color="text-emerald-500" />
              </div>
            </div>
          ))}

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

function Macro({ label, value, color = 'text-slate-800' }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[9px] uppercase text-slate-400">{label}</div>
    </div>
  );
}

function ConfidenceBadge({ level }) {
  const map = { low: 'bg-rose-100 text-rose-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-emerald-100 text-emerald-700' };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${map[level] || map.low}`}>{level}</span>;
}

function TrashIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
