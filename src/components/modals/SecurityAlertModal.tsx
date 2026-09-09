import React from 'react';
import { ShieldAlert, AlertOctagon, RefreshCw } from 'lucide-react';

interface SecurityAlertModalProps {
  isOpen: boolean;
  reason: string;
  detectedElement?: string;
  onDismiss: () => void;
}

export const SecurityAlertModal: React.FC<SecurityAlertModalProps> = ({
  isOpen,
  reason,
  detectedElement,
  onDismiss,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-red-950 border-2 border-red-500/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-neutral-100 animate-in zoom-in-95">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-600/30 border border-red-400 flex items-center justify-center text-red-300 animate-pulse">
            <ShieldAlert className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-red-100 flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-red-400" />
              SAFETY TRIPWIRE TRIGGERED
            </h3>
            <p className="text-xs text-red-300/80">Automation Halted Immediately</p>
          </div>
        </div>

        <div className="bg-black/60 rounded-xl border border-red-800/60 p-4 mb-5 text-sm text-red-200 space-y-2">
          <p className="font-semibold text-white">Detection Reason:</p>
          <p className="text-xs leading-relaxed text-red-300 font-mono bg-red-900/30 p-2.5 rounded border border-red-800/40">
            {reason}
          </p>
          {detectedElement && (
            <p className="text-xs text-neutral-400 mt-2">
              Element: <span className="text-red-200 font-mono">{detectedElement}</span>
            </p>
          )}
        </div>

        <div className="text-xs text-neutral-300 space-y-1.5 mb-6">
          <p className="font-medium text-white">Guaranteed Safeguards Enforced:</p>
          <ul className="list-disc pl-5 space-y-1 text-neutral-400">
            <li>Zero accessibility gestures or key inputs were dispatched to the screen.</li>
            <li>No OTP, PIN, password, or financial credential was read or transmitted.</li>
            <li>The active automation job was transitioned directly to <span className="font-mono text-red-300">STOPPED</span>.</li>
            <li>Master AI backend has been alerted with an incident report.</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onDismiss}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-all shadow-lg shadow-red-950 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Acknowledge & Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
