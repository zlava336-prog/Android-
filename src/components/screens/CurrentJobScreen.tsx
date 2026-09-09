import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  ShieldAlert,
  FastForward,
  ExternalLink,
} from 'lucide-react';
import { JobModel, JobState } from '../../types/job';
import { UiNode } from '../../types/job';

interface CurrentJobScreenProps {
  job: JobModel | null;
  jobState: JobState;
  onAdvanceState: () => void;
  onAutoRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onEmergencyStop: () => void;
  onSimulateTripwire: (type: 'captcha' | 'otp' | 'banking') => void;
  onResetJob: () => void;
  isPaused: boolean;
  isAutoRunning: boolean;
  theme: 'dark' | 'light';
  simulatedNodes: UiNode[];
}

const ORDERED_STATES: { state: JobState; label: string; desc: string }[] = [
  { state: 'RECEIVED', label: '1. Received', desc: 'Job payload validated from backend' },
  { state: 'VALIDATING', label: '2. Validating', desc: 'Verify media URI & platform permissions' },
  { state: 'OPENING_APP', label: '3. Opening App', desc: 'Dispatch intent to launch target app' },
  { state: 'WAITING_FOR_READY', label: '4. Waiting Ready', desc: 'Wait for interactive UI window' },
  { state: 'SELECTING_MEDIA', label: '5. Selecting Media', desc: 'Pick target video / image file' },
  { state: 'ENTERING_METADATA', label: '6. Entering Metadata', desc: 'Type caption and hashtags' },
  { state: 'VERIFYING_PREVIEW', label: '7. Verifying Preview', desc: 'Check preview for security challenges' },
  { state: 'WAITING_FOR_APPROVAL', label: '8. Waiting Approval', desc: 'Mandatory human approval gate' },
  { state: 'PUBLISHING', label: '9. Publishing', desc: 'Perform authorized share click' },
  { state: 'VERIFYING_RESULT', label: '10. Verifying Result', desc: 'Verify success banner / URL' },
  { state: 'COMPLETED', label: '11. Completed', desc: 'Job execution finished safely' },
];

export const CurrentJobScreen: React.FC<CurrentJobScreenProps> = ({
  job,
  jobState,
  onAdvanceState,
  onAutoRun,
  onPause,
  onResume,
  onStop,
  onEmergencyStop,
  onSimulateTripwire,
  onResetJob,
  isPaused,
  isAutoRunning,
  theme,
  simulatedNodes,
}) => {
  const isLight = theme === 'light';

  // Find index in timeline
  const activeIndex = ORDERED_STATES.findIndex(s => s.state === jobState);

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Actions */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200 shadow-xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Job Execution Pipeline</h2>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ${
                  jobState === 'STOPPED' || jobState === 'FAILED'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : jobState === 'COMPLETED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : jobState === 'WAITING_FOR_APPROVAL'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}
              >
                {jobState}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              14-Stage Zero-Trust State Machine with Instant Interruption Priority
            </p>
          </div>

          {/* Primary Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {jobState === 'COMPLETED' || jobState === 'STOPPED' || jobState === 'FAILED' ? (
              <button
                onClick={onResetJob}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Pipeline</span>
              </button>
            ) : (
              <>
                <button
                  onClick={onAdvanceState}
                  disabled={isAutoRunning || jobState === 'WAITING_FOR_APPROVAL'}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Next Step</span>
                </button>

                <button
                  onClick={onAutoRun}
                  disabled={isAutoRunning || jobState === 'WAITING_FOR_APPROVAL'}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>{isAutoRunning ? 'Running...' : 'Auto-Run'}</span>
                </button>

                {isPaused ? (
                  <button
                    onClick={onResume}
                    className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                ) : (
                  <button
                    onClick={onPause}
                    className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1.5"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                )}

                <button
                  onClick={onStop}
                  className="px-3 py-2 rounded-xl border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>

                <button
                  onClick={onEmergencyStop}
                  className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-900/30"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>EMERGENCY STOP</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Safety Tripwire Test Simulation Toolbar */}
        <div className="mt-4 pt-4 border-t border-neutral-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-neutral-400 font-medium flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Simulate Safety Interruption:</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onSimulateTripwire('captcha')}
              className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-mono text-[11px] transition-colors"
            >
              + Trigger CAPTCHA Abort
            </button>
            <button
              onClick={() => onSimulateTripwire('otp')}
              className="px-2.5 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-mono text-[11px] transition-colors"
            >
              + Trigger OTP Screen Abort
            </button>
            <button
              onClick={() => onSimulateTripwire('banking')}
              className="px-2.5 py-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-mono text-[11px] transition-colors"
            >
              + Trigger Banking App Block
            </button>
          </div>
        </div>
      </div>

      {/* 13-Stage Timeline Visualizer */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <span>State Machine Lifecycle</span>
          <span className="text-[11px] text-neutral-400 font-normal">
            (Step {activeIndex >= 0 ? activeIndex + 1 : 0} of {ORDERED_STATES.length})
          </span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {ORDERED_STATES.map((step, idx) => {
            const isCurrent = jobState === step.state;
            const isPassed = activeIndex > idx && jobState !== 'STOPPED' && jobState !== 'FAILED';
            const isBlocked = (jobState === 'STOPPED' || jobState === 'FAILED') && activeIndex === idx;

            return (
              <div
                key={step.state}
                className={`p-3 rounded-xl border text-xs transition-all ${
                  isCurrent
                    ? 'bg-blue-600/15 border-blue-500 text-blue-100 shadow-sm'
                    : isBlocked
                    ? 'bg-red-600/15 border-red-500 text-red-100'
                    : isPassed
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : isLight
                    ? 'bg-neutral-100/60 border-neutral-200 text-neutral-500'
                    : 'bg-neutral-950/40 border-neutral-800/60 text-neutral-400'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>{step.label}</span>
                  {isPassed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  )}
                  {isBlocked && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1 leading-tight">{step.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Terminal States info */}
        {(jobState === 'STOPPED' || jobState === 'FAILED' || jobState === 'COMPLETED') && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              jobState === 'COMPLETED'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                : 'bg-red-950/40 border-red-800/60 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {jobState === 'COMPLETED' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertOctagon className="w-5 h-5 text-red-400" />
              )}
              <div>
                <span className="font-bold uppercase tracking-wider block">Terminal State: {jobState}</span>
                <span className="text-[11px] text-neutral-300">
                  {jobState === 'COMPLETED'
                    ? 'All steps verified. Automation disconnected cleanly.'
                    : 'Job terminated safely with all inputs locked.'}
                </span>
              </div>
            </div>

            <button
              onClick={onResetJob}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs"
            >
              Reset State
            </button>
          </div>
        )}
      </div>

      {/* Active Job Payload & UI Inspector Node Tree */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Job Payload Parameters */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400" />
            <span>Job Payload Model</span>
          </h3>

          {job ? (
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-neutral-800/60 pb-2">
                <span className="text-neutral-400">Job ID:</span>
                <span className="font-mono text-neutral-200">{job.jobId}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800/60 pb-2">
                <span className="text-neutral-400">Platform:</span>
                <span className="font-bold text-purple-400 uppercase">{job.platform}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800/60 pb-2">
                <span className="text-neutral-400">Action:</span>
                <span className="font-mono text-neutral-200">{job.action}</span>
              </div>
              {job.videoUri && (
                <div className="flex justify-between border-b border-neutral-800/60 pb-2">
                  <span className="text-neutral-400">Video URI:</span>
                  <span className="font-mono text-cyan-400 truncate max-w-[200px]">{job.videoUri}</span>
                </div>
              )}
              {job.imageUri && (
                <div className="flex justify-between border-b border-neutral-800/60 pb-2">
                  <span className="text-neutral-400">Image URI:</span>
                  <span className="font-mono text-cyan-400 truncate max-w-[200px]">{job.imageUri}</span>
                </div>
              )}
              {job.title && (
                <div className="border-b border-neutral-800/60 pb-2">
                  <span className="text-neutral-400 block mb-1">Title:</span>
                  <p className="p-2 rounded bg-neutral-950/60 text-neutral-200 font-semibold">{job.title}</p>
                </div>
              )}
              {job.description && (
                <div className="border-b border-neutral-800/60 pb-2">
                  <span className="text-neutral-400 block mb-1">Description:</span>
                  <p className="p-2 rounded bg-neutral-950/60 text-neutral-200 italic whitespace-pre-line">{job.description}</p>
                </div>
              )}
              {job.board && (
                <div className="flex justify-between border-b border-neutral-800/60 pb-2">
                  <span className="text-neutral-400">Board:</span>
                  <span className="font-semibold text-red-400">{job.board}</span>
                </div>
              )}
              {job.caption && (
                <div className="border-b border-neutral-800/60 pb-2">
                  <span className="text-neutral-400 block mb-1">Caption:</span>
                  <p className="p-2 rounded bg-neutral-950/60 text-neutral-200 italic">{job.caption}</p>
                </div>
              )}
              {job.productSearchQuery && (
                <div className="border-b border-neutral-800/60 pb-2">
                  <span className="text-neutral-400 block mb-1">Product Query:</span>
                  <p className="p-2 rounded bg-neutral-950/60 text-neutral-200 font-mono">{job.productSearchQuery}</p>
                </div>
              )}
              {job.extractedUrl && (
                <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300">
                  <span className="block text-[10px] text-emerald-400 font-bold uppercase mb-1">Extracted URL:</span>
                  <a
                    href={job.extractedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs underline flex items-center gap-1"
                  >
                    <span>{job.extractedUrl}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              <div className="flex justify-between items-center pt-1">
                <span className="text-neutral-400">Approval Required:</span>
                <span className="text-amber-400 font-bold">
                  {job.requiresApproval ? 'YES (Gated)' : 'NO'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-400 italic">No job loaded.</p>
          )}
        </div>

        {/* Right: Simulated UiInspector Live Nodes */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Accessibility Node Tree (UiInspector)</span>
            </h3>
            <span className="text-[10px] text-neutral-400 font-mono">
              Package: {job ? (job.platform === 'amazon' ? 'com.amazon.mShop' : job.platform === 'youtube' ? 'com.google.android.youtube' : job.platform === 'facebook' ? 'com.facebook.katana' : job.platform === 'tiktok' ? 'com.zhiliaoapp.musically' : job.platform === 'pinterest' ? 'com.pinterest' : 'com.instagram.android') : 'com.android.launcher'}
            </span>
          </div>

          <p className="text-[11px] text-neutral-400 mb-3">
            Real-time interactive nodes verified by PhoneAgentAccessibilityService for safe click & text targets:
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {simulatedNodes.map(node => (
              <div
                key={node.id}
                className="p-2.5 rounded-lg bg-neutral-950/50 border border-neutral-800/60 text-xs space-y-1 font-mono"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-blue-300 font-semibold truncate max-w-[200px]">{node.id}</span>
                  <span className="text-neutral-500 text-[10px]">{node.className.split('.').pop()}</span>
                </div>
                {node.text && (
                  <div className="text-neutral-300 font-sans text-xs">
                    Text: <span className="font-semibold">"{node.text}"</span>
                  </div>
                )}
                {node.contentDescription && (
                  <div className="text-neutral-400 font-sans text-[11px]">
                    Desc: "{node.contentDescription}"
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] text-neutral-400 pt-1">
                  <span>Clickable: {node.isClickable ? '✓' : '✗'}</span>
                  <span>Editable: {node.isEditable ? '✓' : '✗'}</span>
                  <span>Visible: {node.isVisible ? '✓' : '✗'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
