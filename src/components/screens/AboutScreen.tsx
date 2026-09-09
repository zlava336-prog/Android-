import React from 'react';
import { Shield, Smartphone, Layers, CheckCircle2, FileCode, Lock } from 'lucide-react';

interface AboutScreenProps {
  theme: 'dark' | 'light';
}

export const AboutScreen: React.FC<AboutScreenProps> = ({ theme }) => {
  const isLight = theme === 'light';

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
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">About Phone Agent</h2>
            <p className="text-xs text-neutral-400">
              Personal-use Android companion agent controlled by Master AI with strict safety constraints.
            </p>
          </div>
        </div>
      </div>

      {/* Safety Charter */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <h3 className="text-sm font-bold text-amber-400 mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          <span>Core Safety Charter & Zero-Trust Mandates</span>
        </h3>
        <p className="text-xs text-neutral-300 leading-relaxed mb-4">
          Phone Agent is engineered specifically for authorized social media content publishing and product link sharing.
          It enforces uncompromising safety boundaries to ensure user accounts, finances, and personal credentials remain untouched.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <h4 className="font-semibold text-neutral-200 mb-1">No Financial / Banking Interaction</h4>
            <p className="text-neutral-400 text-[11px]">
              The application explicitly blacklists banking apps, UPI, Paytm, GPay, PayPal, credit card forms, and wallet screens.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <h4 className="font-semibold text-neutral-200 mb-1">No OTP or SMS Access</h4>
            <p className="text-neutral-400 text-[11px]">
              Zero SMS permissions are declared in AndroidManifest. If any OTP or 2FA prompt appears on screen, automation halts immediately.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <h4 className="font-semibold text-neutral-200 mb-1">Mandatory Human Approval Gate</h4>
            <p className="text-neutral-400 text-[11px]">
              Content is never posted autonomously. The agent advances through metadata verification and waits for operator confirmation.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <h4 className="font-semibold text-neutral-200 mb-1">Persistent Emergency Stop</h4>
            <p className="text-neutral-400 text-[11px]">
              A global Emergency STOP button is continuously available in the UI, floating action window, and Android notification drawer.
            </p>
          </div>
        </div>
      </div>

      {/* Production Tech Stack Overview */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <FileCode className="w-4 h-4 text-blue-400" />
          <span>Android Production Architecture</span>
        </h3>

        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between border-b border-neutral-800/60 pb-2">
            <span className="text-neutral-400">Language:</span>
            <span className="font-semibold text-neutral-200">Kotlin 2.0+ (100% Type Safe)</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/60 pb-2">
            <span className="text-neutral-400">UI Framework:</span>
            <span className="font-semibold text-neutral-200">Jetpack Compose & Material 3</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/60 pb-2">
            <span className="text-neutral-400">Architecture:</span>
            <span className="font-semibold text-neutral-200">Single Activity + MVVM + StateFlow Coroutines</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/60 pb-2">
            <span className="text-neutral-400">UI Automation:</span>
            <span className="font-semibold text-neutral-200">
              Android AccessibilityService (UiInspector & ActionExecutor abstraction)
            </span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/60 pb-2">
            <span className="text-neutral-400">Services:</span>
            <span className="font-semibold text-neutral-200">AgentForegroundService + WorkManager</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/60 pb-2">
            <span className="text-neutral-400">Security Storage:</span>
            <span className="font-semibold text-neutral-200">AndroidX EncryptedSharedPreferences (AES-256 GCM)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
