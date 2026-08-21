import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { isLoggedIn, logout } from './lib/api.js';
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
  const [onboarded, setOnboarded] = React.useState(() => {
    try { return localStorage.getItem('macrosnap_onboarded') === 'true'; } catch { return false; }
  });

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthGate />
    </HashRouter>
  </React.StrictMode>
);
