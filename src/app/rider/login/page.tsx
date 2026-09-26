'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, ShieldCheck, KeyRound, Phone, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function RiderLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-redirect if already logged in persistently
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = localStorage.getItem('rider_id');
      if (storedId) {
        router.replace('/rider/portal');
      }
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!phone.trim()) {
      setErrorMessage('Please enter your registered phone number.');
      return;
    }
    if (!pin.trim() || pin.trim().length < 4) {
      setErrorMessage('Please enter your 4-digit security PIN.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/rider/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          pin: pin.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Save persistent session in phone localStorage
        if (typeof window !== 'undefined' && data.rider) {
          localStorage.setItem('rider_session', JSON.stringify(data.rider));
          localStorage.setItem('rider_id', data.rider.id);
        }
        // Redirect to live rider portal
        router.push('/rider/portal');
      } else {
        setErrorMessage(data.error || 'Login failed. Please verify your phone and PIN.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error. Check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-500 mb-5">
            <Bike className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Rider sign in</h1>
          <p className="text-sm text-slate-500 mt-1">Go Choww dispatch. Use the phone number you registered with.</p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Error banner */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Phone Number Field */}
            <div>
              <label htmlFor="rider-phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                Phone number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  id="rider-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0810 566 2458"
                  className="w-full h-12 bg-white border border-slate-200 rounded-lg pl-10 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  autoComplete="tel"
                  required
                />
              </div>
            </div>

            {/* 4-Digit Security PIN */}
            <div>
              <label htmlFor="rider-pin" className="block text-sm font-medium text-slate-700 mb-1.5">
                PIN
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  id="rider-pin"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full h-12 bg-white border border-slate-200 rounded-lg pl-10 pr-4 text-base text-slate-900 placeholder:text-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="rider-login-btn"
              disabled={isLoading}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Help footer */}
        <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          Forgot your PIN? Ask the operations team.
        </p>
      </div>
    </div>
  );
}
