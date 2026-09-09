import React from 'react';
import { Shield, Radio, Octagon, Moon, Sun, AlertTriangle } from 'lucide-react';
import { JobState } from '../types/job';

interface MaterialTopBarProps {
  isEmergencyActive: boolean;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
  currentJobState: JobState;
  backendConnected: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  activeTab: string;
}

export const MaterialTopBar: React.FC<MaterialTopBarProps> = ({
  isEmergencyActive,
  onEmergencyStop,
  onResetEmergencyStop,
  currentJobState,
  backendConnected,
  theme,
  onToggleTheme,
}) => {
  const isLight = theme === 'light';

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-colors border-b ${
        isLight
          ? 'bg-white/95 border-neutral-200 text-neutral-900 shadow-xs'
          : 'bg-neutral-950/95 border-neutral-800 text-neutral-100 backdrop-blur-md'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight leading-none">Phone Agent</h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                v1.0.0
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5 font-sans">
              Personal Android Companion • Zero-Trust
            </p>
          </div>
        </div>

        {/* Center: Live Status Badges */}
        <div className="hidden md:flex items-center gap-2.5">
          {/* Backend link badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              backendConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${backendConnected ? 'animate-pulse' : ''}`} />
            <span>{backendConnected ? 'Backend Connected' : 'Standby Mode'}</span>
          </div>

          {/* Job State Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-neutral-800/80 border border-neutral-700 text-neutral-200">
            <span className="text-neutral-400">State:</span>
            <span
              className={`font-semibold ${
                currentJobState === 'STOPPED' || currentJobState === 'FAILED'
                  ? 'text-red-400'
                  : currentJobState === 'COMPLETED'
                  ? 'text-emerald-400'
                  : currentJobState === 'WAITING_FOR_APPROVAL'
                  ? 'text-amber-400 animate-pulse'
                  : 'text-blue-400'
              }`}
            >
              {currentJobState}
            </span>
          </div>
        </div>

        {/* Right: Theme Toggle & Prominent Emergency Stop Button */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-xl border border-neutral-700/60 bg-neutral-800/50 hover:bg-neutral-800 text-neutral-300 transition-colors"
          >
            {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* Emergency Stop Button */}
          {isEmergencyActive ? (
            <button
              onClick={onResetEmergencyStop}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md shadow-amber-900/30 flex items-center gap-1.5"
            >
              <AlertTriangle className="w-4 h-4 animate-spin" />
              <span>STOPPED • Reset Lock</span>
            </button>
          ) : (
            <button
              onClick={onEmergencyStop}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold tracking-wide uppercase transition-all shadow-lg shadow-red-900/40 hover:shadow-red-800/60 flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Octagon className="w-4 h-4 fill-white" />
              <span>Emergency STOP</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
