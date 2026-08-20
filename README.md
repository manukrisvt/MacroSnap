# 📸 MacroSnap

A mobile-first **Progressive Web App** for tracking food, calories, and macros — with AI photo calorie estimation powered by Moonshot AI's Kimi vision model.

Snap a photo of your meal → get an instant calorie & macro estimate → adjust portions → log it. Like MyNetDiary, but simpler and installable on your phone home screen.

## ✨ Features

- **Photo calorie estimation** — take/upload a meal photo, the Kimi vision model returns foods, portions, calories, and macros as strict JSON. Editable card with portion sliders (0.5x–2x), edit/delete items, then "Log it".
- **Daily dashboard** — calories consumed vs goal, macro ring charts (protein/carbs/fat/fiber), water intake tracker (+1 glass).
- **Manual entry** — searchable local database of ~200 common foods (including Indian dishes: dal, idli, dosa, sambar, chapati, biryani, paneer dishes, and many more). Add custom foods too.
- **Meal categorization** — Breakfast, Lunch, Dinner, Snacks (auto-guessed by time of day).
- **History** — calendar with daily totals; tap a day to see all meals with their photos.
- **Weekly trends** — line charts of calories & protein over the last 7 or 30 days.
- **Settings** — daily calorie goal, macro targets (grams or % of calories), weight log.
- **Favorites & recent foods** — star foods for quick re-logging.
- **PWA** — installable on iPhone/Android, works offline (app shell cached), portrait-optimized, large touch targets.
- **Graceful errors** — if the API fails, you get a friendly "couldn't analyze, enter manually" fallback.
- **Image compression** — photos are resized to max 1024px wide client-side before upload (cuts token cost); a 256px thumbnail is stored with each logged meal.
- **Single user, no auth** — all data in a local SQLite file.

## 🧱 Stack

- **Frontend:** React + Vite + Tailwind CSS, vite-plugin-pwa
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **AI:** Any OpenAI-compatible vision API (OpenRouter, Moonshot Kimi, OpenAI, etc.) — configurable via `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` env vars.

## 🚀 Setup

### 1. Prerequisites
- Node.js 18+ (Node 20+ recommended; better-sqlite3 needs native build tooling)
- A Moonshot AI API key from https://platform.moonshot.ai

### 2. Install dependencies
From the project root:

```bash
# frontend deps
npm install

# backend deps
cd server && npm install && cd ..
```

### 3. Add your AI API key (OpenRouter or Moonshot)

The backend uses any **OpenAI-compatible vision API**. The easiest option is **OpenRouter**, which gives you access to many vision models (Gemini, GPT-4o, Claude, Llama Vision, etc.) with one key.

Copy the example env file:

```bash
cp .env.example .env
```

#### Option A — OpenRouter (recommended)
1. Get a key at https://openrouter.ai/keys
2. Pick a vision model from https://openrouter.ai/models
3. Edit `.env`:

```
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-or-your-key-here
AI_MODEL=google/gemini-2.5-flash
```

Other good vision models on OpenRouter: `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3.2-90b-vision-instruct`.

#### Option B — Moonshot AI (Kimi)
1. Get a key at https://platform.moonshot.ai
2. Edit `.env`:

```
AI_BASE_URL=https://api.moonshot.ai/v1
AI_API_KEY=sk-your-moonshot-key-here
AI_MODEL=kimi-k3
```

> The `.env` file lives in the **project root** and is loaded by the backend via `dotenv`. It is gitignored — never commit your key. For backward compatibility, `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` still work if `AI_API_KEY` / `AI_MODEL` aren't set.

### 4. Run both servers
From the project root:

```bash
npm start
```

This runs the Vite dev server (http://localhost:5173) and the Express API (http://localhost:8787) together. The frontend proxies `/api/*` to the backend.

Open **http://localhost:5173** in your browser.

### 5. Build for production

```bash
npm run build        # outputs dist/
node server/src/index.js   # serve the API
```

To serve the built frontend together with the API in production, point a static server at `dist/` and keep the Express API running on port 8787 (or set `PORT`).

## 📱 Install on your phone

### iPhone (Safari)
1. Open the app URL in Safari.
2. Tap the **Share** button → **Add to Home Screen**.
3. Launch from the home screen — it runs full-screen, no browser chrome.

### Android (Chrome)
1. Open the app URL in Chrome.
2. Tap the **⋮** menu → **Install app** (or the prompt that appears).
3. Launch from the app drawer.

For testing on a real phone, run the dev server with your machine's IP, e.g. `vite --host`, and open `http://<your-ip>:5173`. (PWA install requires HTTPS in production — use a tunnel like `ngrok` or deploy behind HTTPS for the install prompt to appear on iOS.)

## 📲 Native app (Capacitor) — install as a real iOS / Android app

MacroSnap is also wrapped with [Capacitor](https://capacitorjs.com) so it can run as a **native app** with a real home-screen icon and native camera. Personal-device testing is **free on both platforms** — no paid developer program required.

> The native app talks to your Mac's backend over WiFi (`http://<your-Mac-LAN-IP>:8787`). Your Mac must keep running `npm run server` and your phone must be on the same WiFi network while you use the app.

### Shared setup
```bash
npm install                 # already done
cp .env.example .env        # add your AI_API_KEY (already configured)
```

### iPhone (free, personal testing)
1. Install **Xcode** from the Mac App Store (free, one-time). Open it once and accept the license.
2. In Xcode → Settings → Accounts, sign in with your **Apple ID** (a free personal team is fine — **no $99 program needed**).
3. Plug in your iPhone via USB. On the iPhone, enable Developer Mode: Settings → Privacy & Security → Developer Mode.
4. Build, sync, and open Xcode:
   ```bash
   ./run-ios.sh
   ```
   This builds the web app with `VITE_API_BASE` set to your Mac's WiFi IP, syncs it into the iOS project, and opens Xcode.
5. In Xcode: select the **MacroSnap** scheme + your iPhone at the top → **Signing & Capabilities** → pick your personal team → press **⌘R** to build & run.
6. If the phone prompts "Untrusted Developer": iPhone → Settings → General → VPN & Device Management → trust your Apple ID.

> Free personal builds **expire after 7 days** — just run `./run-ios.sh` and ⌘R again to refresh. Your logged data in SQLite on the device is preserved across rebuilds.

### Android (free, no expiry)
1. Install **Android Studio** from https://developer.android.com/studio (free, one-time). Open it once so it downloads the SDK.
2. Plug in your phone via USB. Enable USB debugging: Settings → About phone → tap **Build number** 7× → back to Settings → System → Developer options → **USB debugging** = ON. Approve the "Allow USB debugging?" prompt on the phone.
3. Build, sync, and open Android Studio:
   ```bash
   ./run-android.sh
   ```
   This builds with `VITE_API_BASE` set to your Mac's WiFi IP, syncs into the Android project, and opens Android Studio.
4. In Android Studio: select the **app** configuration + your phone → press the green **Run (▶)** button.
5. Approve the install + camera permission prompts on the phone.

**Want a shareable `.apk` (no USB, no expiry)?**
```bash
cd android && ./gradlew assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk` — send it to your phone (AirDrop, Drive, email), tap to install (enable "Install unknown apps" for your file manager), and you're in.

### Native scripts
- `npm run ios:run` — build + sync + open Xcode
- `npm run android:run` — build + sync + open Android Studio
- `./run-ios.sh` / `./run-android.sh` — same, but auto-detects your Mac's WiFi IP for `VITE_API_BASE`

## 🗂 Project structure

```
MacroSnap/
├── index.html
├── vite.config.js          # Vite + PWA config (manifest, service worker)
├── capacitor.config.json   # Capacitor (native iOS/Android) config
├── run-ios.sh / run-android.sh  # native build + open helpers
├── tailwind.config.js
├── package.json            # frontend deps + scripts (ios:run, android:run)
├── .env.example            # copy to .env, add AI_API_KEY
├── ios/                    # generated native Xcode project (Capacitor)
├── android/                # generated native Android Studio project (Capacitor)
├── public/
│   ├── favicon.svg
│   ├── pwa-192.png
│   ├── pwa-512.png
│   ├── pwa-512-maskable.png
│   └── apple-touch-icon.png
├── src/
│   ├── main.jsx            # routes
│   ├── App.jsx             # shell + bottom nav
│   ├── index.css           # Tailwind + touch styles
│   ├── lib/
│   │   ├── api.js          # fetch wrapper for /api
│   │   └── image.js        # client-side image compression + helpers
│   ├── components/
│   │   ├── Header.jsx
│   │   └── MacroRing.jsx   # SVG progress ring
│   └── pages/
│       ├── Dashboard.jsx   # calorie ring, macro rings, water, today's meals
│       ├── Analyze.jsx     # photo → AI estimate → editable card → log
│       ├── ManualAdd.jsx   # search DB + custom food entry
│       ├── History.jsx     # calendar + day detail with photos
│       ├── Trends.jsx      # line charts (7/30 days)
│       ├── Favorites.jsx   # favorites + recent quick-log
│       └── Settings.jsx    # goals, macro unit, weight log
└── server/
    ├── package.json
    ├── data/               # macrosnap.db (auto-created, gitignored)
    └── src/
        ├── index.js        # Express app + all routes
        ├── db.js           # SQLite schema + settings + seeding
        ├── seedFoods.js    # ~200 foods (incl. Indian dishes)
        └── moonshot.js     # Moonshot vision API client
```

## 🔌 API endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/analyze` | Send `{ image: base64, mimeType }` → returns foods JSON |
| GET | `/api/foods?q=` | Search local food DB |
| POST | `/api/foods` | Add a custom food |
| GET | `/api/meals?date=` | List meals for a date |
| POST | `/api/meals` | Create a meal with items |
| DELETE | `/api/meals/:id` | Delete a meal |
| GET | `/api/day?date=` | Day totals + meals + water |
| POST | `/api/water` | `{ date, delta }` adjust water glasses |
| GET | `/api/history?days=` | Daily calorie/protein totals |
| GET/POST | `/api/favorites` | List / add favorites |
| DELETE | `/api/favorites/:name` | Remove favorite |
| GET/POST | `/api/settings` | Read / update settings |
| GET/POST | `/api/weight` | Weight log |
| GET | `/api/recent?limit=` | Recently logged foods |

## 🔐 Notes

- The AI API key is read from `AI_API_KEY` (or `MOONSHOT_API_KEY` for backward compat) on the backend — it is **never** exposed to the browser.
- Images are sent base64-encoded to the provider's `chat/completions` endpoint using the OpenAI-compatible image content format with the model set by `AI_MODEL`.
- The model is prompted to return **strict JSON only**; the backend strips any markdown fences and validates/normalizes the response before returning it to the client.
- All user data (meals, foods, water, weight, favorites, settings) is stored in `server/data/macrosnap.db` — a single SQLite file. Back it up by copying that file.

## 🛠 Troubleshooting

- **`better-sqlite3` install fails** — make sure you have build tools installed (`xcode-select --install` on macOS, or `build-essential` on Linux). Node 18+ is required.
- **Photo analysis returns "couldn't analyze"** — check that `AI_API_KEY` (or `MOONSHOT_API_KEY`) is set in `.env`, the `AI_MODEL` is a vision-capable model, and the backend is running. The error card includes a manual-entry fallback.
- **PWA install prompt doesn't show on iOS** — iOS requires HTTPS for install. Use a tunnel (`ngrok http 5173`) or deploy behind HTTPS.
- **Camera doesn't open** — some browsers require HTTPS for `capture="environment"`. Use the "Upload from gallery" button as a fallback.

---

Built as a single-user, local-first food tracker. Enjoy snapping your meals! 🥗
