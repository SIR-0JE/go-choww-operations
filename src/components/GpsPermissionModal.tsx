'use client';

import React, { useState } from 'react';
import {
  MapPinOff,
  X,
  Smartphone,
  Laptop,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Compass,
} from 'lucide-react';

interface GpsPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (coords: { lat: number; lng: number }) => void;
  riderId?: string;
}

export const GpsPermissionModal: React.FC<GpsPermissionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  riderId,
}) => {
  const [activePlatform, setActivePlatform] = useState<'android' | 'ios' | 'desktop'>('android');
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  if (!isOpen) return null;

  const testGpsAccess = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatusMessage({
        type: 'error',
        text: 'Geolocation is not supported on this device/browser.',
      });
      return;
    }

    setIsVerifying(true);
    setStatusMessage({
      type: 'info',
      text: 'Querying device GPS satellite coordinates...',
    });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setIsVerifying(false);
        const { latitude, longitude, heading, speed } = position.coords;
        setStatusMessage({
          type: 'success',
          text: `GPS Connected! Location verified (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
        });

        // Transmit immediately to backend if riderId is present
        if (riderId) {
          try {
            await fetch('/api/rider/location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                riderId,
                lat: latitude,
                lng: longitude,
                heading,
                speed,
              }),
            });
          } catch (err) {
            console.warn('[GPS Modal] Heartbeat transmit error:', err);
          }
        }

        if (onSuccess) {
          onSuccess({ lat: latitude, lng: longitude });
        }

        setTimeout(() => {
          onClose();
        }, 1200);
      },
      (err) => {
        setIsVerifying(false);
        if (err.code === err.PERMISSION_DENIED) {
          setStatusMessage({
            type: 'error',
            text: 'Location is still BLOCKED. Please complete Step 1 & 2 above in your browser URL bar, then tap this button again.',
          });
        } else if (err.code === err.TIMEOUT) {
          setStatusMessage({
            type: 'error',
            text: 'GPS reading timed out. Make sure Device Location / GPS is toggled ON in your phone quick settings.',
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: `GPS Error: ${err.message || 'Unable to retrieve location.'}`,
          });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fadeIn">
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <MapPinOff className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
                <span>Unblock GPS Location</span>
              </h3>
              <p className="text-[11px] text-rose-100 mt-0.5">Required for live order dispatch & handovers</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Why GPS is needed */}
        <div className="px-5 pt-3.5 pb-2 bg-amber-50 border-b border-amber-200/60 shrink-0">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
              Because <span className="font-bold text-amber-900">&quot;Never / Block&quot;</span> was tapped earlier, your browser permanently locked location. Follow the 2 steps below to unlock it:
            </p>
          </div>
        </div>

        {/* Platform Selector Tabs */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
            <button
              onClick={() => setActivePlatform('android')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activePlatform === 'android'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Android</span>
            </button>

            <button
              onClick={() => setActivePlatform('ios')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activePlatform === 'ios'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span>iPhone (iOS)</span>
            </button>

            <button
              onClick={() => setActivePlatform('desktop')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activePlatform === 'desktop'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Laptop className="w-3.5 h-3.5 text-purple-600" />
              <span>Laptop/PC</span>
            </button>
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1">
          {activePlatform === 'android' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-bold text-slate-900">Tap the Lock 🔒 or Tune ⚙️ icon</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Look at the very top of your screen inside the Chrome browser address bar (next to the website link).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-bold text-slate-900">Change Location to &quot;Allow&quot;</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tap <span className="font-semibold text-slate-800">&quot;Permissions&quot;</span> (or <span className="font-semibold text-slate-800">&quot;Site settings&quot;</span>) ➔ <span className="font-semibold text-slate-800">&quot;Location&quot;</span> ➔ Toggle to <span className="font-bold text-emerald-600">Allow</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="text-xs text-emerald-900">
                  <p className="font-bold">Tap &quot;Test &amp; Enable GPS&quot; below</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Once allowed, click the green button below to immediately verify and activate live dispatch.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activePlatform === 'ios' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-blue-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-bold text-slate-900">Tap the &quot;aA&quot; or Settings icon</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Look at the Safari address bar (top or bottom of Safari) and tap the <span className="font-semibold text-slate-800">&quot;aA&quot;</span> icon.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-blue-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-bold text-slate-900">Open Website Settings ➔ Location</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Select <span className="font-semibold text-slate-800">&quot;Website Settings&quot;</span> ➔ Tap <span className="font-semibold text-slate-800">&quot;Location&quot;</span> ➔ Choose <span className="font-bold text-emerald-600">&quot;Allow&quot;</span>.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    (If still off: iPhone Settings App ➔ Privacy &amp; Security ➔ Location Services ➔ Safari ➔ &quot;While Using the App&quot;).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="text-xs text-emerald-900">
                  <p className="font-bold">Tap &quot;Test &amp; Enable GPS&quot; below</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Tap the button below to confirm your coordinates.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activePlatform === 'desktop' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-purple-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-bold text-slate-900">Click the 🔒 Padlock icon</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click the lock icon on the left side of the website URL in Chrome / Edge.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-purple-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-bold text-slate-900">Toggle Location to ON / Allow</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Switch the <span className="font-semibold text-slate-800">&quot;Location&quot;</span> toggle from Blocked to <span className="font-bold text-emerald-600">Allow</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="text-xs text-emerald-900">
                  <p className="font-bold">Tap &quot;Test &amp; Enable GPS&quot; below</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Re-test location access to resume live tracking.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Feedback message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {statusMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
              {statusMessage.type === 'info' && <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />}
              <div className="leading-snug">{statusMessage.text}</div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors"
          >
            Dismiss
          </button>

          <button
            type="button"
            disabled={isVerifying}
            onClick={testGpsAccess}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
          >
            {isVerifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Checking GPS...</span>
              </>
            ) : (
              <>
                <Compass className="w-4 h-4" />
                <span>⚡ Test &amp; Enable GPS</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
