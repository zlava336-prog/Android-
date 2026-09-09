import React from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  ZapOff,
} from 'lucide-react';

interface EmergencyStopScreenProps {
  isEmergencyActive: boolean;
  stopReason: string;
  onTriggerEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
  theme: 'dark' | 'light';
}

export const EmergencyStopScreen: React.FC<EmergencyStopScreenProps> = ({
  isEmergencyActive,
  stopReason,
  onTriggerEmergencyStop,
  onResetEmergencyStop,
  theme,
}) => {
  const isLight = theme === 'light';

  return (
    <div className="space-y-6">
      {/* Massive Emergency Stop Action Panel */}
      <div
        className={`p-6 rounded-2xl border transition-all text-center ${
          isEmergencyActive
            ? 'bg-red-950/80 border-2 border-red-500 shadow-2xl shadow-red-950/50'
            : isLight
            ? 'bg-white border-neutral-200'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="max-w-xl mx-auto space-y-4">
          <div
            className={`w-20 h-20 rounded-2xl mx-auto flex items-center justify-center transition-all ${
              isEmergencyActive
                ? 'bg-red-600 text-white shadow-xl shadow-red-600/40 animate-pulse'
                : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}
          >
            <AlertOctagon className="w-10 h-10" />
          </div>

          <div>
            <h2
              className={`text-2xl font-extrabold tracking-tight ${
                isEmergencyActive ? 'text-red-200' : 'text-neutral-100'
              }`}
            >
              {isEmergencyActive ? 'EMERGENCY STOP ACTIVATED' : 'Global Emergency Stop Control'}
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">
              Hardware-grade instantaneous priority cutoff. Cancels all background tasks, stops ongoing gestures,
              and immediately releases all accessibility interaction hooks.
            </p>
          </div>

          {/* Trigger Button or Reset */}
          <div className="pt-2">
            {isEmergencyActive ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-black/60 border border-red-800/60 text-xs text-red-200">
                  <span className="text-neutral-400 font-semibold block mb-0.5">Stop Reason:</span>
                  <span className="font-mono text-white">{stopReason || 'Manual Emergency Halt'}</span>
                </div>

                <button
                  onClick={onResetEmergencyStop}
                  className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold shadow-lg shadow-amber-900/40 flex items-center gap-2 mx-auto transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Release Safety Lock & Reset</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onTriggerEmergencyStop}
                className="px-8 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-base font-black tracking-wider uppercase transition-all shadow-xl shadow-red-900/60 hover:scale-105 active:scale-95 flex items-center gap-2.5 mx-auto cursor-pointer"
              >
                <ZapOff className="w-5 h-5 fill-white" />
                <span>Trigger Emergency STOP</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Guaranteed Actions Checklist */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <span>Execution Interruption Protocol</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {[
            {
              title: 'Gesture Abort',
              desc: 'Ongoing scroll, swipe, and tap gestures are instantly interrupted on Android AccessibilityService.',
            },
            {
              title: 'Text Input Cutoff',
              desc: 'Halts typing immediately and clears any uncommitted text buffers.',
            },
            {
              title: 'Publish Gate Block',
              desc: 'Permanently inhibits any click on "Share", "Publish", or "Post" buttons.',
            },
            {
              title: 'Backend Invalidation',
              desc: 'Emits an immediate WSS abort signal to Master AI backend with timestamp and error snapshot.',
            },
            {
              title: 'Zero Background Creep',
              desc: 'WorkManager background jobs are cancelled. No headless or covert operations run.',
            },
            {
              title: 'Manual Control Return',
              desc: 'Device touch screen is returned to the user without interference.',
            },
          ].map(item => (
            <div
              key={item.title}
              className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60 space-y-1"
            >
              <div className="flex items-center gap-2 text-neutral-200 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{item.title}</span>
              </div>
              <p className="text-[11px] text-neutral-400 pl-5 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
