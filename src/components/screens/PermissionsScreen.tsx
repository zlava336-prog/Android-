import React from 'react';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Lock } from 'lucide-react';

interface PermissionsScreenProps {
  theme: 'dark' | 'light';
}

export const PermissionsScreen: React.FC<PermissionsScreenProps> = ({ theme }) => {
  const isLight = theme === 'light';

  const GRANTED_PERMISSIONS = [
    {
      name: 'Android Accessibility Service',
      permission: 'android.permission.BIND_ACCESSIBILITY_SERVICE',
      status: 'Active (Granted by User in System Settings)',
      scope: 'Restricted by xml filter to 9 social media & shopping packages only',
    },
    {
      name: 'Foreground Service',
      permission: 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      status: 'Running with Persistent Notification',
      scope: 'Keeps agent responsive and provides emergency stop button in status bar',
    },
    {
      name: 'System Notifications',
      permission: 'android.permission.POST_NOTIFICATIONS',
      status: 'Granted',
      scope: 'Real-time job progress alerts & manual approval prompts',
    },
    {
      name: 'Network / Internet',
      permission: 'android.permission.INTERNET',
      status: 'Granted',
      scope: 'Secure TLS WebSocket & HTTPS communication to Master AI backend only',
    },
  ];

  const FORBIDDEN_PERMISSIONS = [
    {
      name: 'Read & Receive SMS',
      permission: 'android.permission.READ_SMS & RECEIVE_SMS',
      guarantee: 'STRICTLY PROHIBITED: Never declared in AndroidManifest. Zero OTP access.',
    },
    {
      name: 'Contacts Access',
      permission: 'android.permission.READ_CONTACTS',
      guarantee: 'STRICTLY PROHIBITED: Personal contacts are never read or stored.',
    },
    {
      name: 'Precise GPS Location',
      permission: 'android.permission.ACCESS_FINE_LOCATION',
      guarantee: 'STRICTLY PROHIBITED: No geolocation access.',
    },
    {
      name: 'Financial & Banking Ingress',
      permission: 'In-App Purchases / Google Play Billing',
      guarantee: 'STRICTLY PROHIBITED: No billing SDKs or financial transaction capabilities.',
    },
    {
      name: 'Password Manager Credential Vaults',
      permission: 'Autofill / Password Vault Inspection',
      guarantee: 'STRICTLY PROHIBITED: Vault packages are hard-coded in quarantine blacklist.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Permissions & Safety Audit</h2>
            <p className="text-xs text-neutral-400">
              Verified compliance with Android OS security requirements and zero-trust safety principles.
            </p>
          </div>
        </div>
      </div>

      {/* Granted Permitted Permissions */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Active Android System Permissions</span>
        </h3>

        <div className="space-y-3">
          {GRANTED_PERMISSIONS.map(p => (
            <div
              key={p.permission}
              className="p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-200">{p.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">
                    {p.status}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">{p.permission}</p>
                <p className="text-[11px] text-neutral-300 mt-1">{p.scope}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prohibited Security Guarantee */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <h3 className="text-sm font-bold text-red-400 mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          <span>Permanently Excluded & Prohibited Privileges</span>
        </h3>
        <p className="text-xs text-neutral-400 mb-4">
          To protect user privacy and financial security, the following capabilities are guaranteed never to be requested or executed:
        </p>

        <div className="space-y-3">
          {FORBIDDEN_PERMISSIONS.map(p => (
            <div
              key={p.permission}
              className="p-3 rounded-xl bg-red-950/15 border border-red-900/40 text-xs flex items-start gap-2.5"
            >
              <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-neutral-200">{p.name}</span>
                <span className="text-[11px] text-neutral-400 font-mono block">{p.permission}</span>
                <p className="text-[11px] text-red-300 mt-1">{p.guarantee}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
