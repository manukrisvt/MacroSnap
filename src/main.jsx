import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analyze from './pages/Analyze.jsx';
import History from './pages/History.jsx';
import Trends from './pages/Trends.jsx';
import Settings from './pages/Settings.jsx';
import ManualAdd from './pages/ManualAdd.jsx';
import Favorites from './pages/Favorites.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
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
    </HashRouter>
  </React.StrictMode>
);
