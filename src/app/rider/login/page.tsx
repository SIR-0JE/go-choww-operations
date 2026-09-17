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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 select-none">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 mb-4 ring-1 ring-white/20">
            <Bike className="w-8 h-8 text-white stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            Go Choww <span className="text-amber-500 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 uppercase tracking-wider font-extrabold">Rider</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 font-medium">
            Campus Dispatch &amp; Live Order-Claiming Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/50">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Error banner */}
            {errorMessage && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Phone Number Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 ml-1">
                Registered Phone Number
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
                  placeholder="e.g. 0810 566 2458"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-medium"
                  autoComplete="tel"
                  required
                />
              </div>
            </div>

            {/* 4-Digit Security PIN */}
            <div>
              <div className="flex items-center justify-between mb-1.5 ml-1">
                <label className="block text-xs font-semibold text-slate-300">
                  4-Digit Security PIN
                </label>
                <span className="text-[10px] text-slate-500 font-medium">Default: 1234</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  id="rider-pin"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="rider-login-btn"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold py-3.5 px-4 rounded-2xl text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Connecting to Fleet...</span>
                </>
              ) : (
                <>
                  <span>Enter Dispatch Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500/80" />
            <span>Authorized Go Choww Dispatch Riders Only</span>
          </div>
        </div>

        {/* Help footer */}
        <p className="text-center text-[11px] text-slate-400 mt-6">
          Trouble logging in? Reach out to your Campus Operations Supervisor.
        </p>
      </div>
    </div>
  );
}
