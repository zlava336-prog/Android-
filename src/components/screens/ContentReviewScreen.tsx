/**
 * Phone Agent - Step 2J Content & Media Pipeline + Human Review Screen
 * Production-grade review UI binding human approval to cryptographic content fingerprints.
 * Strictly enforces that unapproved, stale, or claims-flagged content cannot publish.
 * Amazon remains strictly Product Link Source.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  Share2,
  ExternalLink,
  Layers,
  Sparkles,
  AlertOctagon,
  Eye,
  RefreshCw,
  Edit3,
  Lock,
  FileText,
  Video,
  Image as ImageIcon,
} from 'lucide-react';
import { SupportedPlatform } from '../../types/job';
import {
  ContentPackage,
  MediaAsset,
  ProductData,
  createDefaultContentPackage,
} from '../../core/content/ContentPackage';
import { ContentReviewManager } from '../../core/content/ContentReviewManager';
import { PlatformContentProfileCalculator } from '../../core/content/PlatformContentProfile';
import { ContentClaimValidator } from '../../core/content/ContentClaimValidator';
import { ContentNormalizer } from '../../core/content/ContentNormalizer';
import { MediaValidator } from '../../core/content/MediaValidator';
import { sha256 } from '../../core/content/ContentFingerprint';
import { MultiPlatformPlanner } from '../../core/MultiPlatformPlanner';
import { PersistentJobStore } from '../../core/PersistentJobStore';
import { EmergencyStopManager } from '../../core/emergencyStop';
import { LocalActionLogger } from '../../core/logger';

interface ContentReviewScreenProps {
  theme: 'dark' | 'light';
  onNavigateToPlan?: (jobId: string) => void;
}

export const ContentReviewScreen: React.FC<ContentReviewScreenProps> = ({
  theme,
  onNavigateToPlan,
}) => {
  const isLight = theme === 'light';

  const reviewManager = useMemo(() => ContentReviewManager.getInstance(), []);
  const profileCalc = useMemo(() => new PlatformContentProfileCalculator(), []);
  const normalizer = useMemo(() => ContentNormalizer.getInstance(), []);
  const planner = useMemo(() => new MultiPlatformPlanner(), []);
  const store = useMemo(() => PersistentJobStore.getInstance(), []);

  // Demo Initial Content Package
  const [contentPkg, setContentPkg] = useState<ContentPackage>(() => {
    const dummySha1 = sha256('sample_image_1080_desk_lamp');
    const dummyAsset: MediaAsset = {
      assetId: 'asset_img_sample_1',
      localUri: 'content://media/external/images/media/4021',
      mimeType: 'image/jpeg',
      mediaType: 'IMAGE',
      sizeBytes: 2.4 * 1024 * 1024,
      width: 1080,
      height: 1080,
      sha256: dummySha1,
      createdAt: Date.now(),
    };

    const initialProduct: ProductData = {
      productName: 'Ergonomic Desk Glow LED Lamp',
      productId: 'B09XYZTEST',
      productUrl: 'https://www.amazon.com/dp/B09XYZTEST',
      affiliateLink: 'https://amzn.to/3SampleDeskGlow',
      price: 49.99,
      currency: 'USD',
      source: 'AMAZON',
      sourceTimestamp: Date.now(),
      keyFeatures: [
        'Eye-caring warm neutral diffuser',
        'Built-in USB-C charging port',
        'Touch-dimming 5-level brightness',
      ],
      benefits: ['Reduces eyestrain during late-night coding', 'Saves desk space'],
    };

    const initial = createDefaultContentPackage({
      contentId: 'pkg_sample_desk_glow',
      sourceType: 'AMAZON_PRODUCT',
      sourceReference: 'https://www.amazon.com/dp/B09XYZTEST',
      productData: initialProduct,
      title: 'Upgrade Your Desk Setup With The Glow LED Lamp ✨',
      baseCaption:
        'Late night coding just got 10x better. 🚀 The ergonomic diffuser creates gentle warm illumination without monitor glare.\n\nTouch-dimmable with USB-C power.',
      description: 'Full product walkthrough and setup test of the Ergonomic Desk Glow LED Lamp.',
      hashtags: ['#DeskSetup', '#WorkFromHome', '#TechReview', '#Productivity'],
      callToAction: 'Check out live pricing: https://amzn.to/3SampleDeskGlow',
      mediaAssets: [dummyAsset],
      selectedPlatforms: ['instagram', 'threads', 'x', 'linkedin'],
    });

    const { pkg } = reviewManager.validate(initial);
    return pkg;
  });

  const [selectedPlatformTab, setSelectedPlatformTab] = useState<SupportedPlatform>('threads');
  const [operatorName, setOperatorName] = useState('Lead Content Reviewer');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Platform Projection for Active Tab
  const activeProjection = useMemo(() => {
    if (selectedPlatformTab === 'amazon') return null;
    try {
      return profileCalc.projectForPlatform(contentPkg, selectedPlatformTab);
    } catch {
      return null;
    }
  }, [contentPkg, selectedPlatformTab, profileCalc]);

  // Approval validity check
  const approvalValidity = useMemo(() => {
    return reviewManager.checkApprovalValidity(contentPkg);
  }, [contentPkg, reviewManager]);

  const handleRevalidate = () => {
    const { pkg } = reviewManager.validate(contentPkg);
    setContentPkg(pkg);
    setActionNotice('Content package validated and fingerprints refreshed.');
  };

  const handleUpdateCaption = (newCaption: string) => {
    const updated: ContentPackage = {
      ...contentPkg,
      baseCaption: newCaption,
    };
    // Recheck modifications: invalidates approval if it was approved!
    const verified = reviewManager.checkAndInvalidateIfModified(updated);
    setContentPkg(verified);
  };

  const handleAddHashtag = (tagInput: string) => {
    if (!tagInput.trim()) return;
    const clean = normalizer.normalizeHashtag(tagInput);
    if (!clean) return;
    const newTags = normalizer.deduplicateHashtags([...contentPkg.hashtags, clean]);
    const updated: ContentPackage = {
      ...contentPkg,
      hashtags: newTags,
    };
    const verified = reviewManager.checkAndInvalidateIfModified(updated);
    setContentPkg(verified);
  };

  const handleRemoveHashtag = (tagToRemove: string) => {
    const newTags = contentPkg.hashtags.filter(t => t !== tagToRemove);
    const updated: ContentPackage = {
      ...contentPkg,
      hashtags: newTags,
    };
    const verified = reviewManager.checkAndInvalidateIfModified(updated);
    setContentPkg(verified);
  };

  const handleTogglePlatform = (platform: SupportedPlatform) => {
    if (platform === 'amazon') {
      alert('Security Invariant: Amazon cannot be selected as a publishing destination.');
      return;
    }
    const current = new Set(contentPkg.selectedPlatforms);
    if (current.has(platform)) {
      if (current.size === 1) {
        alert('At least one platform must remain selected.');
        return;
      }
      current.delete(platform);
    } else {
      current.add(platform);
    }
    const updated: ContentPackage = {
      ...contentPkg,
      selectedPlatforms: Array.from(current),
    };
    const verified = reviewManager.checkAndInvalidateIfModified(updated);
    setContentPkg(verified);
  };

  const handleUpdatePlatformOverride = (platform: SupportedPlatform, overrideCaption: string) => {
    const existingOverrides = { ...contentPkg.platformOverrides };
    if (!overrideCaption.trim()) {
      delete existingOverrides[platform];
    } else {
      existingOverrides[platform] = {
        platform,
        caption: overrideCaption,
        hashtags: contentPkg.hashtags,
      };
    }
    const updated: ContentPackage = {
      ...contentPkg,
      platformOverrides: existingOverrides,
    };
    const verified = reviewManager.checkAndInvalidateIfModified(updated);
    setContentPkg(verified);
  };

  const handleApproveAll = () => {
    try {
      const sessionId = `session_${Date.now()}`;
      const approved = reviewManager.approveJob(contentPkg, sessionId, operatorName);
      setContentPkg(approved);
      setActionNotice(`Content package explicitly approved for all ${approved.selectedPlatforms.length} platform(s)!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Approval error: ${msg}`);
    }
  };

  const handleApproveSinglePlatform = (platform: SupportedPlatform) => {
    try {
      const sessionId = `session_${platform}_${Date.now()}`;
      const approved = reviewManager.approvePlatform(contentPkg, platform, sessionId, operatorName);
      setContentPkg(approved);
      setActionNotice(`Explicit approval recorded for ${platform}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Approval error: ${msg}`);
    }
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejecting the content package.');
      return;
    }
    const rejected = reviewManager.rejectContent(contentPkg, rejectionReason, operatorName);
    setContentPkg(rejected);
    setShowRejectModal(false);
    setRejectionReason('');
    setActionNotice(`Content package marked as REJECTED.`);
  };

  const handleGenerateExecutionPlan = () => {
    try {
      const plan = planner.planContentPackage(contentPkg);
      // Persist job to store
      const job = store.createJobFromContentPackage(contentPkg, { jobId: plan.jobId });
      setActionNotice(`Multi-platform execution plan created (Job ID: ${job.jobId})!`);
      if (onNavigateToPlan) {
        onNavigateToPlan(job.jobId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Planning error: ${msg}`);
    }
  };

  const handleEmergencyStop = () => {
    EmergencyStopManager.getInstance().trigger('Emergency stop triggered from Content Review screen.');
    setActionNotice('EMERGENCY STOP ACTIVATED! All operations paused.');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header Card */}
      <div
        id="content-review-header"
        className={`p-6 rounded-2xl border transition-all ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <FileCheck className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Content Pipeline & Human Review</h1>
                <p className="text-xs text-slate-400">
                  Step 2J Deterministic Pipeline • Cryptographic Fingerprints • Mandatory Approval Gate
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Review State Badge */}
            <div
              id="review-state-badge"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                contentPkg.reviewState === 'APPROVED'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : contentPkg.reviewState === 'STALE_APPROVAL'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : contentPkg.reviewState === 'NEEDS_REVIEW'
                  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                  : contentPkg.reviewState === 'REJECTED'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              }`}
            >
              {contentPkg.reviewState === 'APPROVED' && <CheckCircle2 className="w-4 h-4" />}
              {contentPkg.reviewState === 'STALE_APPROVAL' && <AlertTriangle className="w-4 h-4" />}
              {contentPkg.reviewState === 'NEEDS_REVIEW' && <Clock className="w-4 h-4" />}
              {contentPkg.reviewState === 'REJECTED' && <XCircle className="w-4 h-4" />}
              {contentPkg.reviewState === 'READY_FOR_REVIEW' && <Eye className="w-4 h-4" />}
              {contentPkg.reviewState === 'DRAFT' && <Edit3 className="w-4 h-4" />}
              <span>{contentPkg.reviewState}</span>
            </div>

            {/* Revalidate Button */}
            <button
              id="btn-revalidate-content"
              onClick={handleRevalidate}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-Validate
            </button>

            {/* Emergency Stop Button */}
            <button
              id="btn-review-emergency-stop"
              onClick={handleEmergencyStop}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              Emergency Stop
            </button>
          </div>
        </div>

        {/* Action Notice Alert */}
        {actionNotice && (
          <div className="mt-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs flex items-center justify-between">
            <span>{actionNotice}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-slate-400 hover:text-white text-xs font-bold ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stale Warning Banner if modified */}
        {contentPkg.reviewState === 'STALE_APPROVAL' && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Approval Invalidation:</strong> Content, media, or platform selection was modified after approval. Cryptographic fingerprints do not match previous approval session. Re-approval by human operator is strictly required before execution.
            </span>
          </div>
        )}
      </div>

      {/* Cryptographic Fingerprints Bar */}
      <div
        id="fingerprint-summary-bar"
        className={`p-4 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
          isLight
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-slate-900/50 border-slate-800 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-400">Content Fingerprint (CFP):</span>
          <code className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono text-[11px]">
            {contentPkg.contentFingerprint || 'Not computed'}
          </code>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-400">Media Fingerprint (MFP):</span>
          <code className="px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono text-[11px]">
            {contentPkg.mediaFingerprint || 'None'}
          </code>
        </div>

        {contentPkg.currentApproval && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Approval Session:</span>
            <span className="font-mono text-emerald-400">
              {contentPkg.currentApproval.approvalSessionId} ({contentPkg.currentApproval.approvedBy})
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Content Package Details & Editor (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Source Data Card */}
          <div
            id="source-data-card"
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-amber-400" />
                Product Link Source Data
              </h2>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                Amazon: Product Link Source Only
              </span>
            </div>

            {contentPkg.productData ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-slate-200">{contentPkg.productData.productName}</span>
                  <span className="text-emerald-400 font-bold">
                    ${contentPkg.productData.price?.toFixed(2)} {contentPkg.productData.currency}
                  </span>
                </div>
                <div className="text-slate-400 break-all">
                  <span>Source URL: </span>
                  <a
                    href={contentPkg.productData.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 underline"
                  >
                    {contentPkg.productData.productUrl}
                  </a>
                </div>
                {contentPkg.productData.affiliateLink && (
                  <div className="text-slate-400 break-all">
                    <span>Affiliate Link: </span>
                    <span className="text-emerald-400 font-mono">{contentPkg.productData.affiliateLink}</span>
                  </div>
                )}
                {contentPkg.productData.keyFeatures && (
                  <ul className="list-disc list-inside text-slate-400 mt-2 space-y-1">
                    {contentPkg.productData.keyFeatures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No external product link source attached.</p>
            )}
          </div>

          {/* Caption & Title Editor */}
          <div
            id="content-editor-card"
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Base Content Package
              </h2>
              <span className="text-[11px] text-slate-400">
                Editing modifies fingerprint & invalidates prior approval
              </span>
            </div>

            {/* Title */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Title (Long-Form & YouTube)</label>
              <input
                id="input-content-title"
                type="text"
                value={contentPkg.title || ''}
                onChange={e => {
                  const updated = { ...contentPkg, title: e.target.value };
                  setContentPkg(reviewManager.checkAndInvalidateIfModified(updated));
                }}
                className={`w-full px-3 py-2 text-xs rounded-xl border font-sans ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-800/80 border-slate-700 text-slate-100'
                }`}
                placeholder="Product or post title..."
              />
            </div>

            {/* Base Caption */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-300">Base Caption Body</label>
                <span className="text-[11px] text-slate-500">
                  {contentPkg.baseCaption.length} characters
                </span>
              </div>
              <textarea
                id="textarea-base-caption"
                rows={4}
                value={contentPkg.baseCaption}
                onChange={e => handleUpdateCaption(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border font-sans resize-y ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-800/80 border-slate-700 text-slate-100'
                }`}
                placeholder="Write caption text..."
              />
            </div>

            {/* Call To Action */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Call To Action (CTA)</label>
              <input
                id="input-content-cta"
                type="text"
                value={contentPkg.callToAction || ''}
                onChange={e => {
                  const updated = { ...contentPkg, callToAction: e.target.value };
                  setContentPkg(reviewManager.checkAndInvalidateIfModified(updated));
                }}
                className={`w-full px-3 py-2 text-xs rounded-xl border font-sans ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-800/80 border-slate-700 text-slate-100'
                }`}
                placeholder="e.g. Check it out: https://..."
              />
            </div>

            {/* Hashtag Manager */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-indigo-400" />
                Normalized Hashtags ({contentPkg.hashtags.length})
              </label>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {contentPkg.hashtags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-mono"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveHashtag(tag)}
                      className="text-slate-400 hover:text-rose-400 ml-1"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Add Hashtag Input */}
              <div className="flex gap-2">
                <input
                  id="input-add-hashtag"
                  type="text"
                  placeholder="Add hashtag (e.g. DeskGlow)..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleAddHashtag((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg border ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-800/80 border-slate-700 text-slate-100'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Media Assets Card */}
          <div
            id="media-assets-card"
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-cyan-400" />
                Validated Media Assets ({contentPkg.mediaAssets.length})
              </h2>
              <span className="text-[10px] text-emerald-400 font-mono">Local Storage Only</span>
            </div>

            <div className="space-y-3">
              {contentPkg.mediaAssets.map((asset, idx) => (
                <div
                  key={asset.assetId}
                  className={`p-3 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {asset.mediaType === 'VIDEO' ? (
                        <Video className="w-5 h-5" />
                      ) : (
                        <ImageIcon className="w-5 h-5" />
                      )}
                    </span>
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-200">{asset.assetId}</div>
                      <div className="text-[11px] text-slate-400 break-all">{asset.localUri}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{asset.mimeType}</span>
                        <span>•</span>
                        <span>
                          {asset.width}x{asset.height}
                        </span>
                        <span>•</span>
                        <span>{(asset.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                        {asset.durationMs && (
                          <>
                            <span>•</span>
                            <span>{Math.round(asset.durationMs / 1000)}s</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400 font-mono">SHA-256</span>
                    <code className="text-[10px] text-cyan-400 font-mono bg-slate-900 px-2 py-0.5 rounded">
                      {asset.sha256.slice(0, 12)}...{asset.sha256.slice(-6)}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Platform Projections, Claims, & Approvals (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Claim Warnings Console */}
          <div
            id="claim-warnings-card"
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Content Claims & Policy Validator
            </h2>

            {contentPkg.lastValidationResult?.claimWarnings &&
            contentPkg.lastValidationResult.claimWarnings.length > 0 ? (
              <div className="space-y-2">
                {contentPkg.lastValidationResult.claimWarnings.map((claim, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                      claim.severity === 'BLOCK'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        <span>[{claim.category}]</span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-800">
                          {claim.severity}
                        </span>
                      </div>
                      <p className="mt-0.5">{claim.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 italic">Matched: "{claim.matchedText}"</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero deceptive, medical, or guaranteed-result claims flagged.</span>
              </div>
            )}
          </div>

          {/* Platform Projection & Overrides Tabs */}
          <div
            id="platform-projections-card"
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-purple-400" />
                Platform Normalization & Previews
              </h2>
            </div>

            {/* Platform Selection Toggles */}
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Active Destinations (Amazon strictly disabled for publishing):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    'instagram',
                    'threads',
                    'x',
                    'youtube',
                    'facebook',
                    'tiktok',
                    'pinterest',
                    'linkedin',
                  ] as SupportedPlatform[]
                ).map(platform => {
                  const isSelected = contentPkg.selectedPlatforms.includes(platform);
                  return (
                    <button
                      key={platform}
                      onClick={() => handleTogglePlatform(platform)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium border transition-colors ${
                        isSelected
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {platform}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Platform Tab Buttons */}
            <div className="flex border-b border-slate-700 mb-3 overflow-x-auto pb-1 gap-1">
              {contentPkg.selectedPlatforms.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPlatformTab(p)}
                  className={`px-3 py-1 text-xs font-semibold rounded-t-lg transition-colors capitalize ${
                    selectedPlatformTab === p
                      ? 'bg-slate-800 text-purple-400 border-b-2 border-purple-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Projected Payload for Active Tab */}
            {activeProjection && (
              <div className="space-y-3 text-xs">
                {activeProjection.unsupportedOmissions.length > 0 && (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                    <strong>Unsupported Fields Omitted:</strong>{' '}
                    {activeProjection.unsupportedOmissions.join(', ')}
                  </div>
                )}

                {activeProjection.warnings.length > 0 && (
                  <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-[11px]">
                    {activeProjection.warnings.join(' ')}
                  </div>
                )}

                {/* Rendered Preview Body */}
                <div>
                  <span className="font-semibold text-slate-300">Projected Payload Text:</span>
                  <div
                    className={`mt-1 p-3 rounded-xl border text-xs whitespace-pre-wrap font-sans ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/80 border-slate-700'
                    }`}
                  >
                    {activeProjection.payload.text}
                  </div>
                </div>

                {/* Platform Override Input */}
                <div>
                  <span className="font-semibold text-slate-300">
                    Platform Override for {selectedPlatformTab}:
                  </span>
                  <textarea
                    rows={2}
                    placeholder={`Custom text specifically for ${selectedPlatformTab}...`}
                    value={contentPkg.platformOverrides[selectedPlatformTab]?.caption || ''}
                    onChange={e => handleUpdatePlatformOverride(selectedPlatformTab, e.target.value)}
                    className={`mt-1 w-full px-3 py-1.5 text-xs rounded-xl border ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900'
                        : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>

                {/* Individual Platform Approval */}
                <button
                  id={`btn-approve-${selectedPlatformTab}`}
                  onClick={() => handleApproveSinglePlatform(selectedPlatformTab)}
                  className="w-full py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve {selectedPlatformTab} Only
                </button>
              </div>
            )}
          </div>

          {/* Explicit Human Approval Action Panel */}
          <div
            id="human-approval-action-card"
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              Human Review & Authorization
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Operator Signature / Identification
                </label>
                <input
                  id="input-operator-signature"
                  type="text"
                  value={operatorName}
                  onChange={e => setOperatorName(e.target.value)}
                  className={`w-full px-3 py-1.5 text-xs rounded-xl border ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Approve All Platforms */}
              <button
                id="btn-approve-all-platforms"
                onClick={handleApproveAll}
                disabled={
                  contentPkg.lastValidationResult?.claimWarnings.some(c => c.severity === 'BLOCK') ||
                  contentPkg.selectedPlatforms.length === 0
                }
                className={`w-full py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all ${
                  contentPkg.lastValidationResult?.claimWarnings.some(c => c.severity === 'BLOCK')
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Explicitly Approve Content ({contentPkg.selectedPlatforms.length} Platforms)
              </button>

              {/* Reject Content */}
              <button
                id="btn-reject-content"
                onClick={() => setShowRejectModal(true)}
                className="w-full py-2 text-xs font-semibold rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 flex items-center justify-center gap-2 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Reject Content Package
              </button>

              {/* Generate Plan & Launch Execution */}
              <button
                id="btn-generate-execution-plan"
                onClick={handleGenerateExecutionPlan}
                disabled={contentPkg.reviewState !== 'APPROVED' || !approvalValidity.isValid}
                className={`w-full py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${
                  contentPkg.reviewState === 'APPROVED' && approvalValidity.isValid
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                <Share2 className="w-4 h-4" />
                Generate Multi-Platform Execution Plan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md p-6 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <h3 className="text-base font-bold text-rose-400 flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5" />
              Reject Content Package
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Rejection marks this package as REJECTED and invalidates all prior approval sessions. Please state the reason:
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g. Inaccurate specifications, unverified medical claim, blurry video..."
              className={`w-full p-2.5 text-xs rounded-xl border mb-4 ${
                isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-800 border-slate-700 text-slate-100'
              }`}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
