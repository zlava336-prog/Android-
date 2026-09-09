import React from 'react';
import {
  Shield,
  Radio,
  Play,
  Share2,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  Sparkles,
  Server,
} from 'lucide-react';
import { JobModel, JobState, SupportedPlatform } from '../../types/job';

interface HomeScreenProps {
  currentJob: JobModel | null;
  currentJobState: JobState;
  backendConnected: boolean;
  isEmergencyActive: boolean;
  onEmergencyStop: () => void;
  onLoadSampleJob: (type: SupportedPlatform | 'instagram' | 'amazon' | 'youtube' | 'facebook' | 'tiktok' | 'pinterest' | 'x' | 'threads' | 'linkedin') => void;
  onNavigateToJob: () => void;
  onNavigateToScreen: (screen: any) => void;
  theme: 'dark' | 'light';
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  currentJob,
  currentJobState,
  backendConnected,
  isEmergencyActive,
  onEmergencyStop,
  onLoadSampleJob,
  onNavigateToJob,
  onNavigateToScreen,
  theme,
}) => {
  const isLight = theme === 'light';

  return (
    <div className="space-y-6">
      {/* Emergency Stop Active Warning Banner */}
      {isEmergencyActive && (
        <div className="p-4 rounded-2xl bg-red-950/70 border-2 border-red-500/80 text-white flex items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-6 h-6 text-red-400 animate-pulse shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-200">SAFETY LOCK ENGAGED</h3>
              <p className="text-xs text-red-300/80">
                All gestures, input dispatchers, and publishing tasks are strictly halted.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToScreen('emergency_stop')}
            className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-xs font-semibold whitespace-nowrap"
          >
            Manage Stop
          </button>
        </div>
      )}

      {/* Hero Overview: Android Device & System Health */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight
            ? 'bg-white border-neutral-200 shadow-xs'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-lg font-bold">Device Companion Engine</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Android 14 (API 35) • Target SDK 35 • Host: Samsung Galaxy S24 Ultra (SM-S928B)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5 ${
                backendConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>WebSocket: {backendConnected ? 'Authenticated' : 'Connecting'}</span>
            </span>

            <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Accessibility: Active</span>
            </span>
          </div>
        </div>

        {/* 3 Status metric cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <div className="text-[11px] text-neutral-400 uppercase font-semibold">Active Pipeline</div>
            <div className="text-base font-bold text-neutral-100 mt-1 flex items-center gap-2">
              <span className="capitalize">{currentJob ? currentJob.platform : 'Idle'}</span>
              {currentJob && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                  {currentJob.action}
                </span>
              )}
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              State: <span className="text-blue-400 font-mono font-medium">{currentJobState}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <div className="text-[11px] text-neutral-400 uppercase font-semibold">Safety Boundary</div>
            <div className="text-base font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Zero-Trust Active</span>
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              17 Banking / SMS / OTP apps quarantined
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <div className="text-[11px] text-neutral-400 uppercase font-semibold">Backend Controller</div>
            <div className="text-base font-bold text-neutral-100 mt-1 flex items-center gap-2">
              <Server className="w-4 h-4 text-purple-400" />
              <span>Master AI API</span>
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              Device ID: <span className="font-mono text-neutral-300">phone_s24u_01</span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Job Live Preview Card */}
      {currentJob ? (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800/40">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
                {currentJob.platform[0].toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-sm capitalize">{currentJob.platform} Workflow</h3>
                <p className="text-[11px] text-neutral-400 font-mono">Job ID: {currentJob.jobId}</p>
              </div>
            </div>

            <button
              onClick={onNavigateToJob}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>Inspect Timeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
            <div>
              <span className="text-neutral-400 block mb-1">Caption / Query:</span>
              <p className="p-2.5 rounded-lg bg-neutral-950/50 border border-neutral-800/60 text-neutral-200 font-sans italic">
                {currentJob.caption || currentJob.productSearchQuery || 'None'}
              </p>
            </div>
            <div>
              <span className="text-neutral-400 block mb-1">Hashtags & Approval:</span>
              <div className="flex flex-wrap gap-1.5 items-center mb-2">
                {currentJob.hashtags && currentJob.hashtags.length > 0 ? (
                  currentJob.hashtags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono text-[11px]">
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-neutral-500">None</span>
                )}
              </div>
              <div className="text-neutral-400 flex items-center gap-1.5">
                <span>Requires User Approval:</span>
                <span className="text-amber-400 font-semibold">
                  {currentJob.requiresApproval ? 'YES (Mandatory)' : 'NO'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`p-6 rounded-2xl border text-center transition-all ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
          }`}
        >
          <Sparkles className="w-8 h-8 text-blue-400 mx-auto mb-2" />
          <h3 className="font-bold text-sm">No Active Job Running</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto mt-1 mb-4">
            Phone Agent is idling in standby mode awaiting authorized commands from Master AI backend.
            You can dispatch a test job below:
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onLoadSampleJob('instagram')}
              className="px-4 py-2 rounded-xl bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-purple-900/20"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Instagram Reel</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('youtube')}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-red-900/20"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>YouTube Short</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('facebook')}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-blue-900/20"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Facebook Post</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('tiktok')}
              className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-neutral-900/40"
            >
              <Play className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" />
              <span>TikTok Video</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('pinterest')}
              className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-red-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Pinterest Pin</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('x')}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-neutral-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>X Post</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('threads')}
              className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-neutral-900/40"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Threads Post</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('linkedin')}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-blue-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>LinkedIn Post</span>
            </button>

            <button
              onClick={() => onLoadSampleJob('amazon')}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-amber-900/20"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Amazon Link Extract</span>
            </button>
          </div>
        </div>
      )}

      {/* Target Apps Quick Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">Target Applications Readiness</h3>
          <button
            onClick={() => onNavigateToScreen('apps')}
            className="text-xs text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>View all 9 apps</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {[
            { id: 'instagram', name: 'Instagram', pkg: 'com.instagram.android', ready: true },
            { id: 'amazon', name: 'Amazon', pkg: 'com.amazon.mShop.android.shopping', ready: true },
            { id: 'youtube', name: 'YouTube', pkg: 'com.google.android.youtube', ready: true },
            { id: 'tiktok', name: 'TikTok', pkg: 'com.zhiliaoapp.musically', ready: true },
            { id: 'facebook', name: 'Facebook', pkg: 'com.facebook.katana', ready: true },
            { id: 'pinterest', name: 'Pinterest', pkg: 'com.pinterest', ready: true },
            { id: 'x', name: 'X / Twitter', pkg: 'com.twitter.android', ready: true },
            { id: 'threads', name: 'Threads', pkg: 'com.instagram.barcelona', ready: true },
            { id: 'linkedin', name: 'LinkedIn', pkg: 'com.linkedin.android', ready: true },
          ].map(app => (
            <div
              key={app.id}
              className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
              }`}
            >
              <div>
                <span className="font-medium block truncate max-w-[90px]">{app.name}</span>
                <span className="text-[10px] text-neutral-400">Authorized</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
