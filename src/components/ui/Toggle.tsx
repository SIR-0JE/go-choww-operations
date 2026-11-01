'use client';

import React from 'react';

/** An on/off switch. Big enough to tap on a phone. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="h-11 px-1 inline-flex items-center gap-2 shrink-0"
    >
      <span className={`relative inline-block w-12 h-7 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
      <span className={`text-xs font-medium w-6 ${on ? 'text-emerald-700' : 'text-slate-500'}`}>{on ? 'On' : 'Off'}</span>
    </button>
  );
}
