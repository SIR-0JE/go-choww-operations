'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, Flame, KeyRound, Loader2, ShieldCheck } from 'lucide-react';

type Mode = 'loading' | 'login' | 'setup';

// Only go back to a page on this site
const safeNext = (value: string | null) => (value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login') ? value : '/dashboard');

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>('loading');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.authenticated) {
          window.location.replace(safeNext(params.get('next')));
          return;
        }
        if (d.success) setMode(d.configured ? 'login' : 'setup');
        else setError('Could not reach the server. Refresh and try again.');
      })
      .catch(() => setError('No connection. Refresh and try again.'));
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'setup') {
      if (password.length < 8) return setError('Use at least 8 characters.');
      if (password !== confirm) return setError('The two passwords are not the same.');
    }
    setBusy(true);
    try {
      const res = await fetch(mode === 'setup' ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'setup' ? { code, password } : { password }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.replace(safeNext(params.get('next')));
        return;
      }
      if (data.needsSetup) setMode('setup');
      setError(data.error || 'Something went wrong. Try again.');
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full h-12 bg-white border border-slate-200 rounded-lg px-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-500 mb-5">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {mode === 'setup' ? 'Choose your password' : 'Go Choww Operations'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'setup'
              ? 'First time here. Use the setup code you were given, then pick a password.'
              : 'Sign in to the admin dashboard.'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {mode === 'loading' && !error ? (
            <div className="py-6 flex justify-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5" role="alert">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {mode === 'setup' && (
                <div>
                  <label htmlFor="setup-code" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Setup code
                  </label>
                  <input
                    id="setup-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                    className={`${field} font-mono uppercase tracking-wider`}
                    autoComplete="off"
                    autoCapitalize="characters"
                    required
                  />
                </div>
              )}

              {mode !== 'loading' && (
                <div>
                  <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    {mode === 'setup' ? 'New password' : 'Password'}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${field} pl-10`}
                      autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                      autoFocus={mode === 'login'}
                      required
                    />
                  </div>
                </div>
              )}

              {mode === 'setup' && (
                <div>
                  <label htmlFor="admin-confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Type it again
                  </label>
                  <input
                    id="admin-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={field}
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              {mode !== 'loading' && (
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-12 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{mode === 'setup' ? 'Saving…' : 'Signing in…'}</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'setup' ? 'Save password and sign in' : 'Sign in'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </form>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          Riders and reps sign in on their own apps.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
