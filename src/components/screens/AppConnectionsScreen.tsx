import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Ban,
  Smartphone,
  Play,
} from 'lucide-react';
import { SupportedPlatform } from '../../types/job';

interface AppItem {
  id: SupportedPlatform;
  name: string;
  packageName: string;
  category: 'Social Publishing' | 'E-Commerce Link Sharing';
  status: 'Ready' | 'Installed' | 'Requires Update';
  adapterStatus: 'Active Adapter' | 'Skeleton Adapter';
  safeActions: string[];
  safetyRules: string[];
  capabilities?: {
    supportsVideo: boolean;
    supportsTitle: boolean;
    supportsDescription: boolean;
    supportsHashtags: boolean;
    supportsCover: boolean;
    supportsBoard?: boolean;
    requiresApproval: boolean;
    uiAutomation?: boolean;
    paymentAutomation?: boolean;
    otpAutomation?: boolean;
    loginAutomation?: boolean;
    securityBypass?: boolean;
  };
}

const TARGET_APPS: AppItem[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    packageName: 'com.instagram.android',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: ['Publish Reels', 'Publish Feed Post', 'Hashtags Entry', 'Cover Selection'],
    safetyRules: ['Mandatory operator approval before share button tap', 'Stops on account login challenge'],
    capabilities: {
      supportsVideo: true,
      supportsTitle: true,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: true,
      requiresApproval: true,
    },
  },
  {
    id: 'amazon',
    name: 'Amazon Shopping',
    packageName: 'com.amazon.mShop.android.shopping',
    category: 'E-Commerce Link Sharing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: ['Search Product', 'Open Product Details', 'Open Share Sheet', 'Copy Link to Clipboard'],
    safetyRules: ['STRICT: Never clicks "Buy Now", "Add to Cart", or payment flows', 'Exits immediately after copying link'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: ['Upload Shorts', 'Dynamic UI Inspection', 'Title (100 char limit)', 'Hashtags Entry', 'Visual Upload Confirmation'],
    safetyRules: [
      'Strict package verification before every action; stops immediately on package change',
      'Instant Emergency Stop on OTP, PIN, CAPTCHA, re-auth, or payment prompts',
      'Mandatory human approval gate before Upload Short action',
      'Local media URI validation required prior to interaction',
      'Max 2 recovery attempts before fail-stop',
    ],
    capabilities: {
      supportsVideo: true,
      supportsTitle: true,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false,
      requiresApproval: true,
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    packageName: 'com.zhiliaoapp.musically',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: [
      'Upload Short Video',
      'Dynamic UI Inspection',
      'Describe Video / Caption',
      'Unique Hashtags',
      'Optional Cover Selection (if detected)',
      'Pre-Publish Preview Verification',
      'Publication Confirmation Verification',
    ],
    safetyRules: [
      'Strict package verification before every action (supports musically, trill, musically.go)',
      'Immediate Emergency Stop on unexpected package change',
      'Zero-trust tripwires: halts immediately on login, OTP, 2FA, PIN, CAPTCHA slider puzzle',
      'Immediate Emergency Stop on account switcher, coins/wallet/recharge, or promote/boost prompts',
      'Mandatory operator approval gate prior to Post action',
      'Strict local media URI validation (content://, file://); remote URLs prohibited',
      'Deterministic max 2-attempt recovery limit with full cryptographic audit logging',
    ],
    capabilities: {
      supportsVideo: true,
      supportsTitle: false,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false, // Detected capability: false unless exposed in UI
      requiresApproval: true,
      uiAutomation: true,
      paymentAutomation: false,
      otpAutomation: false,
      loginAutomation: false,
    },
  },
  {
    id: 'facebook',
    name: 'Facebook',
    packageName: 'com.facebook.katana',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: ['Share Video / Post', 'Dynamic UI Inspection', 'Description / Caption', 'Unique Hashtags', 'Post Creation Verification'],
    safetyRules: [
      'Strict package verification before every action; stops immediately on package change',
      'Instant Emergency Stop on OTP, PIN, CAPTCHA, re-auth, account switcher, or payment prompts',
      'Mandatory human approval gate before Post / Publish action',
      'Local media URI validation required prior to interaction',
      'Max 2 recovery attempts before fail-stop',
    ],
    capabilities: {
      supportsVideo: true,
      supportsTitle: false,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false, // detected capability: false unless exposed in UI
      requiresApproval: true,
      uiAutomation: true,
      paymentAutomation: false,
      otpAutomation: false,
      loginAutomation: false,
    },
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    packageName: 'com.pinterest',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: [
      'Create Pin / Idea Pin',
      'Dynamic UI Inspection',
      'Pin Title (detected UI limit)',
      'Pin Description (newlines preserved)',
      'Deduplicated Hashtags',
      'Safe Board Selection (no creation/ambiguity)',
      'Optional Cover (if detected)',
      'Publication Verification',
    ],
    safetyRules: [
      'Strict foreground package verification (supports com.pinterest, tiramisu, lite)',
      'Immediate Emergency Stop on unexpected package change',
      'Zero-trust tripwires: halts on login, OTP, 2FA, PIN, CAPTCHA puzzle, account switcher',
      'Immediate Emergency Stop on payment, billing, credit card, or promoted-pin/ad flow',
      'Mandatory operator approval gate prior to final Save/Publish action',
      'Safe board selection: never creates new boards; halts on ambiguous board identity',
      'Local media URI validation (content://, file://); remote HTTP/HTTPS strictly prohibited',
      'Deterministic max 2-attempt recovery limit with full cryptographic audit logging',
    ],
    capabilities: {
      supportsVideo: true,
      supportsTitle: false, // Detected capability: false unless exposed in UI
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false, // Detected capability: false unless exposed in UI
      supportsBoard: true,
      requiresApproval: true,
      uiAutomation: true,
      paymentAutomation: false,
      otpAutomation: false,
      loginAutomation: false,
      securityBypass: false,
    },
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    packageName: 'com.twitter.android',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: [
      'Compose Post / Tweet',
      'Dynamic UI Inspection',
      'Attach Video / Photo',
      'Text Sanitization (280 char limit)',
      'Deduplicated Hashtags',
      'Pre-Publish Preview Verification',
      'Publication Confirmation Verification',
    ],
    safetyRules: [
      'Strict foreground package verification (supports com.twitter.android, com.twitter.android.lite)',
      'Immediate Emergency Stop on unexpected package change',
      'Zero-trust tripwires: halts on login, OTP, 2FA, PIN, CAPTCHA puzzle, account switcher',
      'Immediate Emergency Stop on Premium, subscriptions, Super Follows, Tips, or billing',
      'Mandatory human approval gate before Post / Tweet action',
      'Local media URI validation (content://, file://); remote HTTP/HTTPS strictly prohibited',
      'Deterministic max 2-attempt recovery limit with cryptographic audit logging',
    ],
    capabilities: {
      supportsVideo: true,
      supportsTitle: false,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false,
      requiresApproval: true,
      uiAutomation: true,
      paymentAutomation: false,
      otpAutomation: false,
      loginAutomation: false,
      securityBypass: false,
    },
  },
  {
    id: 'threads',
    name: 'Threads',
    packageName: 'com.instagram.barcelona',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: [
      'Create Thread',
      'Dynamic UI Inspection',
      'Attach Video / Photo',
      'Sanitize Post Text (500 limit)',
      'Deduplicated Hashtags',
      'Pre-Publish Preview Verification',
      'Publication Confirmation Verification',
    ],
    safetyRules: [
      'Strict foreground package verification (com.instagram.barcelona)',
      'Immediate Emergency Stop on unexpected package change',
      'Zero-trust tripwires: halts on login, OTP, 2FA, PIN, CAPTCHA puzzle, account switcher',
      'Immediate Emergency Stop on Meta Verified, boost post, in-app purchases, or billing',
      'Mandatory human approval gate before final Post action',
      'Local media URI validation (content://, file://); remote HTTP/HTTPS strictly prohibited',
      'Deterministic max 2-attempt recovery limit with cryptographic audit logging',
    ],
    capabilities: {
      supportsVideo: true,
      supportsTitle: false,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false,
      requiresApproval: true,
      uiAutomation: true,
      paymentAutomation: false,
      otpAutomation: false,
      loginAutomation: false,
      securityBypass: false,
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    packageName: 'com.linkedin.android',
    category: 'Social Publishing',
    status: 'Ready',
    adapterStatus: 'Active Adapter',
    safeActions: [
      'Create Post',
      'Dynamic UI Inspection',
      'Attach Video / Photo',
      'Sanitize Post Text (3,000 char limit)',
      'Deduplicated Hashtags',
      'Pre-Publish Preview Verification',
      'Publication Confirmation Verification',
    ],
    safetyRules: [
      'Strict foreground package verification (com.linkedin.android)',
      'Immediate Emergency Stop on unexpected package change',
      'Zero-trust tripwires: halts on login, OTP, 2FA, PIN, CAPTCHA puzzle, Arkose, account switcher',
      'Immediate Emergency Stop on LinkedIn Premium, Boost post, sponsored content, or billing',
      'Mandatory human approval gate before final Post action',
      'Local media URI validation (content://, file://); remote HTTP/HTTPS strictly prohibited',
      'Deterministic max 2-attempt recovery limit with cryptographic audit logging',
    ],
    capabilities: {
      supportsVideo: true,
      supportsTitle: false,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false,
      requiresApproval: true,
      uiAutomation: true,
      paymentAutomation: false,
      otpAutomation: false,
      loginAutomation: false,
      securityBypass: false,
    },
  },
];

const PROHIBITED_APPS = [
  { name: 'Google Pay (GPay / Tez)', package: 'com.google.android.apps.nbu.paisa.user', reason: 'Financial / UPI' },
  { name: 'PhonePe', package: 'com.phonepe.app', reason: 'UPI / Payments' },
  { name: 'Paytm', package: 'net.one97.paytm', reason: 'Financial / Wallet' },
  { name: 'PayPal', package: 'com.paypal.android.p2pmobile', reason: 'Payments' },
  { name: 'Chase Mobile', package: 'com.chase.sig.android', reason: 'Banking' },
  { name: 'Bank of America', package: 'com.bankofamerica.activity', reason: 'Banking' },
  { name: 'Wells Fargo', package: 'com.wellsfargo.mobile', reason: 'Banking' },
  { name: 'Google Messages / SMS', package: 'com.google.android.apps.messaging', reason: 'SMS / OTP Security' },
  { name: 'Bitwarden / 1Password', package: 'com.bitwarden / com.onepassword.android', reason: 'Password Vault' },
];

interface AppConnectionsScreenProps {
  onTestApp: (platform: SupportedPlatform) => void;
  theme: 'dark' | 'light';
}

export const AppConnectionsScreen: React.FC<AppConnectionsScreenProps> = ({
  onTestApp,
  theme,
}) => {
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
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Target App Connections</h2>
            <p className="text-xs text-neutral-400">
              Only authorized social & sharing applications are permitted. Banking, SMS, and OTP apps are quarantined.
            </p>
          </div>
        </div>
      </div>

      {/* Target Apps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TARGET_APPS.map(app => (
          <div
            key={app.id}
            className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${
              isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-bold text-sm">{app.name}</h3>
                  <span className="text-[10px] text-neutral-400 font-mono block truncate max-w-[180px]">
                    {app.packageName}
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                    app.adapterStatus === 'Active Adapter'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {app.adapterStatus}
                </span>
              </div>

              <div className="my-3 space-y-1.5 text-xs">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                  Permitted Actions:
                </span>
                <div className="flex flex-wrap gap-1">
                  {app.safeActions.map(act => (
                    <span key={act} className="px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-300 text-[10px]">
                      {act}
                    </span>
                  ))}
                </div>
              </div>

              {app.capabilities && (
                <div className="my-3 space-y-1.5 text-xs">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                    Supported Capabilities:
                  </span>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <span className={`px-2 py-0.5 rounded ${app.capabilities.supportsVideo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-500'}`}>
                      Video {app.capabilities.supportsVideo ? '✓' : '✗'}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${app.capabilities.supportsTitle ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>
                      Title: {app.capabilities.supportsTitle ? 'Detected ✓' : 'Dynamic / Conditional'}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${app.capabilities.supportsDescription ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-500'}`}>
                      Description {app.capabilities.supportsDescription ? '✓' : '✗'}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${app.capabilities.supportsHashtags ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-500'}`}>
                      Hashtags {app.capabilities.supportsHashtags ? '✓' : '✗'}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${app.capabilities.supportsCover ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>
                      Cover: {app.capabilities.supportsCover ? 'Detected ✓' : 'Dynamic / Skipped'}
                    </span>
                    {app.capabilities.supportsBoard && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
                        Board ✓ (Gated)
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded ${app.capabilities.requiresApproval ? 'bg-amber-500/10 text-amber-300' : 'bg-neutral-800 text-neutral-500'}`}>
                      Human approval {app.capabilities.requiresApproval ? '✓' : 'Optional'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-400">
                      Login automation: OFF
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-400">
                      OTP automation: OFF
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-400">
                      Payment automation: OFF
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-400">
                      Security bypass: OFF
                    </span>
                  </div>
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-neutral-950/50 border border-neutral-800/60 text-[11px] text-amber-300/90 space-y-1 mb-4">
                <span className="font-semibold block text-[10px] uppercase text-amber-400">Safety Guardrails:</span>
                {app.safetyRules.map((rule, i) => (
                  <p key={i} className="flex items-start gap-1">
                    <span>•</span>
                    <span>{rule}</span>
                  </p>
                ))}
              </div>
            </div>

            <button
              onClick={() => onTestApp(app.id)}
              className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Dispatch Sample Job</span>
            </button>
          </div>
        ))}
      </div>

      {/* Prohibited Banking & Security Apps Table */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-2.5 mb-2 text-red-400">
          <Ban className="w-5 h-5" />
          <h3 className="font-bold text-sm text-red-200">Hard-Quarantined Applications (Zero-Access Guarantee)</h3>
        </div>
        <p className="text-xs text-neutral-400 mb-4">
          By strict architectural design, Phone Agent cannot bind, inspect, or dispatch clicks to any of these application categories:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {PROHIBITED_APPS.map(item => (
            <div
              key={item.package}
              className="p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-xs flex items-center justify-between"
            >
              <div>
                <span className="font-semibold text-neutral-200 block">{item.name}</span>
                <span className="text-[10px] text-neutral-400 font-mono block truncate max-w-[160px]">
                  {item.package}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold">
                {item.reason}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
