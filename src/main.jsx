import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { isLoggedIn, logout, api } from './lib/api.js';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analyze from './pages/Analyze.jsx';
import History from './pages/History.jsx';
import Trends from './pages/Trends.jsx';
import Settings from './pages/Settings.jsx';
import ManualAdd from './pages/ManualAdd.jsx';
import Favorites from './pages/Favorites.jsx';

function AuthGate() {
  const [authed, setAuthed] = React.useState(isLoggedIn());
  const [onboarded, setOnboarded] = React.useState(null); // null = checking, true/false = result
  const [checking, setChecking] = React.useState(true);

  // Check if user has already set their goals (on server, not just localStorage)
  React.useEffect(() => {
    if (!authed) { setChecking(false); return; }
    // Check localStorage first (fast path)
    try {
      if (localStorage.getItem('macrosnap_onboarded') === 'true') {
        setOnboarded(true);
        setChecking(false);
        return;
      }
    } catch {}
    // Fallback: check server for calorie_goal
    api.settings().then(s => {
      setOnboarded(!!(s && s.calorie_goal));
      setChecking(false);
    }).catch(() => {
      setOnboarded(false);
      setChecking(false);
    });
  }, [authed]);

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  if (checking) return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!onboarded) return <Onboarding onDone={() => {
    try { localStorage.setItem('macrosnap_onboarded', 'true'); } catch {}
    setOnboarded(true);
  }} />;
  return (
    <Routes>
      <Route path="/" element={<App onLogout={() => { logout(); setAuthed(false); }} />}>
        <Route index element={<Dashboard />} />
        <Route path="analyze" element={<Analyze />} />
        <Route path="manual" element={<ManualAdd />} />
        <Route path="history" element={<History />} />
        <Route path="trends" element={<Trends />} />
        <Route path="settings" element={<Settings />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Self-heal after deploys: if a stale cached index.html references a JS chunk
// that no longer exists on the server (asset hash changed), the dynamic
// import fails. Detect that and force one clean reload so the browser picks
// up the new index.html + service worker.
window.addEventListener('error', (e) => {
  const msg = String(e?.message || '');
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
    // Guard against reload loops: only reload once per session for this error.
    if (!sessionStorage.getItem('macrosnap_stale_reload')) {
      sessionStorage.setItem('macrosnap_stale_reload', '1');
      window.location.reload();
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthGate />
    </HashRouter>
  </React.StrictMode>
);
