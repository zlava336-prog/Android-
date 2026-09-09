import React, { useState } from 'react';
import { Sliders, Save, CheckCircle2, ShieldCheck, Key, Wifi, RefreshCw } from 'lucide-react';
import { BackendConfig } from '../../types/job';

interface AutomationSettingsScreenProps {
  backendConfig: BackendConfig;
  onUpdateConfig: (config: BackendConfig) => void;
  theme: 'dark' | 'light';
}

export const AutomationSettingsScreen: React.FC<AutomationSettingsScreenProps> = ({
  backendConfig,
  onUpdateConfig,
  theme,
}) => {
  const isLight = theme === 'light';

  const [form, setForm] = useState<BackendConfig>({ ...backendConfig });
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoScreenshotOnFail, setAutoScreenshotOnFail] = useState(true);
  const [haltOnUnknownScreen, setHaltOnUnknownScreen] = useState(true);
  const [stepDelayMs, setStepDelayMs] = useState(850);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = () => {
    onUpdateConfig(form);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Automation & Backend Settings</h2>
            <p className="text-xs text-neutral-400">
              Configure Master AI endpoint connections, device authentication, and zero-trust safety tripwires.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backend & Security Credentials */}
        <div
          className={`p-5 rounded-2xl border transition-all space-y-4 ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800/60 font-bold text-sm">
            <Wifi className="w-4 h-4 text-purple-400" />
            <span>Master AI Backend (HTTPS / WSS)</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1">
              API Base URL (HTTPS only):
            </label>
            <input
              type="text"
              value={form.apiBaseUrl}
              onChange={e => setForm({ ...form, apiBaseUrl: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs font-mono text-neutral-200 focus:outline-hidden focus:border-blue-500"
              placeholder="https://api.mycompanion.ai/v1"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1">
              WebSocket Control Channel (WSS only):
            </label>
            <input
              type="text"
              value={form.websocketUrl}
              onChange={e => setForm({ ...form, websocketUrl: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs font-mono text-neutral-200 focus:outline-hidden focus:border-blue-500"
              placeholder="wss://ws.mycompanion.ai/agent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1">
              Android Device Identifier:
            </label>
            <input
              type="text"
              value={form.deviceId}
              onChange={e => setForm({ ...form, deviceId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs font-mono text-neutral-200 focus:outline-hidden focus:border-blue-500"
              placeholder="phone_agent_pixel8_01"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1 flex items-center justify-between">
              <span>Device Security Token:</span>
              <span className="text-[10px] text-emerald-400 font-normal">Encrypted in KeyStore</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={form.authToken}
                onChange={e => setForm({ ...form, authToken: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs font-mono text-neutral-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saveSuccess ? 'Settings Saved!' : 'Save Backend Credentials'}</span>
            </button>
          </div>
        </div>

        {/* Safety Tripwires & Execution Multipliers */}
        <div
          className={`p-5 rounded-2xl border transition-all space-y-4 ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800/60 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Safety & Tripwire Controls</span>
          </div>

          <div className="space-y-3">
            {/* Require approval */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/40 border border-neutral-800 text-xs">
              <div>
                <span className="font-semibold text-neutral-200 block">Require Explicit Operator Approval</span>
                <span className="text-[11px] text-neutral-400">
                  Always pause before publishing clicks until operator confirms.
                </span>
              </div>
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={e => setRequireApproval(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </div>

            {/* Halt on unexpected UI */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/40 border border-neutral-800 text-xs">
              <div>
                <span className="font-semibold text-neutral-200 block">Auto-Halt on Unknown Screen</span>
                <span className="text-[11px] text-neutral-400">
                  Never blindly click if expected package or UI anchor is missing.
                </span>
              </div>
              <input
                type="checkbox"
                checked={haltOnUnknownScreen}
                onChange={e => setHaltOnUnknownScreen(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </div>

            {/* Screenshot on failure */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/40 border border-neutral-800 text-xs">
              <div>
                <span className="font-semibold text-neutral-200 block">Diagnostic Screenshot on Divergence</span>
                <span className="text-[11px] text-neutral-400">
                  Capture UI snapshot metadata for debugging when a failure happens.
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoScreenshotOnFail}
                onChange={e => setAutoScreenshotOnFail(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </div>

            {/* Step Delay Slider */}
            <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-neutral-200">Step Inspection Delay:</span>
                <span className="font-mono text-blue-400 font-bold">{stepDelayMs} ms</span>
              </div>
              <input
                type="range"
                min="300"
                max="2500"
                step="50"
                value={stepDelayMs}
                onChange={e => setStepDelayMs(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[10px] text-neutral-400 block">
                Prevents rapid or erratic automated interactions, ensuring user-visible stability.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
