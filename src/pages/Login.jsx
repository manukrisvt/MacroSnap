import { useState } from 'react';
import { api, setAuth } from '../lib/api.js';

export default function Login({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = mode === 'signup'
        ? await api.signup(email, password, name)
        : await api.login(email, password);
      setAuth(r.token, r.email);
      onAuthed();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-3xl shadow-lg shadow-brand-500/30">
            📸
          </div>
          <h1 className="text-2xl font-bold text-slate-900">MacroSnap</h1>
          <p className="mt-1 text-sm text-slate-500">Snap a photo, track your macros</p>
        </div>

        {/* Mode toggle */}
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              mode === 'login' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >Log In</button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              mode === 'signup' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >Sign Up</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
          />
          {error && (
            <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-500/30 active:scale-[.98] disabled:opacity-60"
          >{loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          {mode === 'signup'
            ? 'Already have an account? '
            : "Don't have an account? "}
          <button
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
            className="font-medium text-brand-600"
          >{mode === 'signup' ? 'Log in' : 'Sign up'}</button>
        </p>
      </div>
    </div>
  );
}
