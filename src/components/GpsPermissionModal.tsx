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

  const handleGpsSuccess = async (position: GeolocationPosition) => {
    setIsVerifying(false);
    const { latitude, longitude, heading, speed } = position.coords;
    setStatusMessage({
      type: 'success',
      text: `GPS Connected! Location verified (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    });

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
  };

  const handleGpsFailure = (err: GeolocationPositionError) => {
    setIsVerifying(false);
    if (err.code === err.PERMISSION_DENIED) {
      setStatusMessage({
        type: 'error',
        text: 'Location is BLOCKED. Please verify: 1) Phone Master Location is ON in top pull-down tray, 2) Android Settings ➔ Apps ➔ Chrome ➔ Permissions ➔ Location is Allowed, 3) Chrome URL lock 🔒 is set to Allow.',
      });
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setStatusMessage({
        type: 'error',
        text: 'Phone GPS is turned OFF. Pull down your phone notification bar and turn ON the "Location" icon.',
      });
    } else if (err.code === err.TIMEOUT) {
      setStatusMessage({
        type: 'error',
        text: 'GPS satellite reading timed out. Make sure your phone Location toggle is ON and retry.',
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: `GPS Notice: ${err.message || 'Unable to retrieve location.'}`,
      });
    }
  };

  const testGpsAccess = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatusMessage({
        type: 'error',
        text: 'Geolocation is not supported on this device/browser.',
      });
      return;
    }

    // Check secure context
    if (window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setStatusMessage({
        type: 'error',
        text: '🔒 Insecure Connection: Chrome strictly blocks GPS on unencrypted HTTP addresses (http://...). You must open this site using HTTPS (https://...).',
      });
      return;
    }

    setIsVerifying(true);
    setStatusMessage({
      type: 'info',
      text: 'Querying device GPS satellite coordinates...',
    });

    // Stage 1: High Accuracy GPS
    navigator.geolocation.getCurrentPosition(
      (position) => {
        handleGpsSuccess(position);
      },
      (err) => {
        // Stage 2: Automatic Fallback to Standard/Network location if High Accuracy times out
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          setStatusMessage({
            type: 'info',
            text: 'Satellite acquiring... Retrying with network location fallback...',
          });
          navigator.geolocation.getCurrentPosition(
            (pos) => handleGpsSuccess(pos),
            (err2) => handleGpsFailure(err2),
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        } else {
          handleGpsFailure(err);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000,
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fadeIn">
      <div
        className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <MapPinOff className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight text-white flex items-center gap-1.5">
                <span>Unblock GPS Location</span>
              </h3>
              <p className="text-xs text-rose-100 mt-0.5">Required for live order dispatch & handovers</p>
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
        <div className="px-5 pt-3 pb-2.5 bg-amber-50 border-b border-amber-200/60 shrink-0">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              If GPS shows blocked, check both your <strong>Phone Location switch</strong> and <strong>Browser Permissions</strong>:
            </p>
          </div>
        </div>

        {/* Platform Selector Tabs */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
            <button
              onClick={() => setActivePlatform('android')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activePlatform === 'android'
                  ? 'bg-white text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Android</span>
            </button>

            <button
              onClick={() => setActivePlatform('ios')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activePlatform === 'ios'
                  ? 'bg-white text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span>iPhone (iOS)</span>
            </button>

            <button
              onClick={() => setActivePlatform('desktop')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activePlatform === 'desktop'
                  ? 'bg-white text-slate-900'
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
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200">
                <div className="w-6 h-6 rounded-full bg-amber-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="text-xs text-amber-900">
                  <p className="font-semibold">Turn ON Phone Master Location</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Pull down your phone top notification tray and tap the <span className="font-semibold">Location 📍</span> icon to turn it <span className="font-semibold text-emerald-700">ON</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-slate-800 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Allow in Chrome URL Bar</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tap the <strong>Lock 🔒</strong> or <strong>Tune ⚙️</strong> icon beside the website address ➔ Tap <strong>Permissions / Site settings</strong> ➔ Set Location to <span className="font-semibold text-emerald-600">Allow</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-slate-800 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Check Android Chrome App Permission</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    If still blocked: Phone <strong>Settings App ➔ Apps ➔ Chrome ➔ Permissions ➔ Location ➔ Choose &quot;Allow while using app&quot;</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  4
                </div>
                <div className="text-xs text-emerald-900">
                  <p className="font-semibold">Tap &quot;Test &amp; Enable GPS&quot; below</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Tap the green button below to verify your coordinates and switch to <strong>GPS Live</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activePlatform === 'ios' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50/80 border border-blue-200">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="text-xs text-blue-900">
                  <p className="font-semibold">Enable iPhone Location Services</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    iPhone <strong>Settings App ➔ Privacy &amp; Security ➔ Location Services ➔ Turn ON</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-slate-800 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Tap &quot;aA&quot; in Safari Address Bar</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tap the <strong>&quot;aA&quot;</strong> icon ➔ <strong>Website Settings ➔ Location ➔ Choose &quot;Allow&quot;</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="text-xs text-emerald-900">
                  <p className="font-semibold">Tap &quot;Test &amp; Enable GPS&quot; below</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Tap the button below to confirm your coordinates.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activePlatform === 'desktop' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-purple-50/80 border border-purple-200">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="text-xs text-purple-900">
                  <p className="font-semibold text-slate-900">Click the 🔒 Padlock icon</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click the lock icon on the left side of the website URL in Chrome / Edge.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-slate-800 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Toggle Location to ON / Allow</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Switch the <span className="font-semibold text-slate-800">&quot;Location&quot;</span> toggle from Blocked to <span className="font-semibold text-emerald-600">Allow</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="text-xs text-emerald-900">
                  <p className="font-semibold">Tap &quot;Test &amp; Enable GPS&quot; below</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
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
            className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-colors"
          >
            Dismiss
          </button>

          <button
            type="button"
            disabled={isVerifying}
            onClick={testGpsAccess}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
