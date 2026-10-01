import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { api, setAuth } from '../lib/api.js';

const isIOSApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

async function appleSignInNative() {
  const { SignInWithApple } = await import('@capawesome/capacitor-apple-sign-in');
  const result = await SignInWithApple.authorize({
    clientId: 'com.macrosnap.app',
    scopes: ['name', 'email']
  });
  return result.token?.idToken || result.identityToken;
}

export default function Login({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  async function handleApple() {
    setError(null);
    setAppleLoading(true);
    try {
      const identityToken = await appleSignInNative();
      if (!identityToken) throw new Error('Apple sign-in was cancelled.');
      const r = await api.appleSignIn(identityToken);
      setAuth(r.token, r.email);
      onAuthed();
    } catch (err) {
      setError(err.message || 'Apple sign-in failed.');
    } finally {
      setAppleLoading(false);
    }
  }

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

        {/* Sign in with Apple (iOS app only) */}
        {isIOSApp && (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              onClick={handleApple}
              disabled={appleLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3.5 text-base font-semibold text-white active:scale-[.98] disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              {appleLoading ? 'Signing in…' : 'Sign in with Apple'}
            </button>
          </>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          {mode === 'signup'
            ? 'Already have an account? '
            : "Don't have an account? "}
          <button
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
            className="font-medium text-brand-600"
          >{mode === 'signup' ? 'Log in' : 'Sign up'}</button>
        </p>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          By continuing you agree to our{' '}
          <a href="#/privacy" className="underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
