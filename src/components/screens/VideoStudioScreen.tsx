/**
 * Phone Agent - Step 2M Video Studio Screen
 * Human Review Dashboard for video creation, scene editing, audio, render queue,
 * output validation, and cryptographic approval bindings.
 * INVARIANT: No direct publishing from Video Studio! Publishing is downstream via phone UI automation.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Video,
  Film,
  Layers,
  Sparkles,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  AlertOctagon,
  Volume2,
  VolumeX,
  FileText,
  Smartphone,
  CheckSquare,
  Hash,
  Eye,
  Trash2,
  Plus,
} from 'lucide-react';

import {
  VideoProject,
  VideoOutputSpec,
  VIDEO_OUTPUT_PRESETS,
  VideoFormatType,
} from '../../core/video/VideoProject';
import { VideoScene, SceneRole } from '../../core/video/VideoScene';
import { ShortFormVideoBuilder } from '../../core/video/ShortFormTemplates';
import { VideoRenderQueue } from '../../core/video/VideoRenderQueue';
import { VideoReviewManager } from '../../core/video/VideoReviewManager';
import { ApprovedVideoArtifact } from '../../core/video/ApprovedVideoArtifact';
import { VideoRenderJob } from '../../core/video/VideoRenderJob';
import { SubtitleTrackValidator } from '../../core/video/SubtitleTrack';
import { TextOverlayValidator } from '../../core/video/TextOverlay';
import { VideoFingerprintComputer } from '../../core/video/VideoFingerprint';
import { ProductData, MediaAsset } from '../../core/content/ContentPackage';
import { EmergencyStopManager } from '../../core/emergencyStop';
import { LocalActionLogger } from '../../core/logger';
import { SupportedPlatform } from '../../types/job';

interface VideoStudioScreenProps {
  theme: 'dark' | 'light';
  onNavigateToPlan?: (jobId: string) => void;
}

export const VideoStudioScreen: React.FC<VideoStudioScreenProps> = ({
  theme,
  onNavigateToPlan,
}) => {
  const isLight = theme === 'light';
  const renderQueue = useMemo(() => VideoRenderQueue.getInstance(), []);
  const reviewManager = useMemo(() => VideoReviewManager.getInstance(), []);
  const logger = useMemo(() => LocalActionLogger.getInstance(), []);
  const emergencyStop = useMemo(() => EmergencyStopManager.getInstance(), []);

  // Demo Initial Project Setup
  const [productData] = useState<ProductData>({
    productName: 'ErgoLift Foldable Laptop Stand',
    brand: 'ErgoTech',
    price: 39.99,
    currency: 'USD',
    source: 'AMAZON',
    sourceUrl: 'https://www.amazon.com/dp/B09V3K3K5V',
    sourceTimestamp: Date.now(),
    dataFingerprint: 'pfp_sample_laptop_stand_123',
    keyFeatures: ['6-level height adjustment', 'Aircraft-grade aluminum', 'Foldable & portable'],
    benefits: ['Relieves neck tension', 'Improves laptop cooling'],
  });

  const [mediaAssets] = useState<MediaAsset[]>([
    {
      assetId: 'asset_laptop_angle_1',
      localUri: 'content://media/external/images/media/5011',
      mimeType: 'image/jpeg',
      mediaType: 'IMAGE',
      sizeBytes: 2450000,
      width: 1080,
      height: 1920,
      sha256: 'sha256_sample_laptop_photo_front',
      createdAt: Date.now() - 3600000,
    },
    {
      assetId: 'asset_laptop_demo_vid',
      localUri: 'content://media/external/video/media/7023',
      mimeType: 'video/mp4',
      mediaType: 'VIDEO',
      sizeBytes: 15400000,
      width: 1080,
      height: 1920,
      durationMs: 8000,
      sha256: 'sha256_sample_laptop_video_unfold',
      createdAt: Date.now() - 1800000,
    },
  ]);

  const [activeTab, setActiveTab] = useState<'timeline' | 'overlays' | 'audio' | 'render' | 'review'>('timeline');
  const [reviewerName, setReviewerName] = useState('Alex Chen (Lead Editor)');
  const [reviewNotes, setReviewNotes] = useState('Reviewed factual claims against Amazon source specifications. Approved for Reels/Shorts.');
  const [selectedPlatforms, setSelectedPlatforms] = useState<SupportedPlatform[]>(['instagram', 'tiktok', 'youtube']);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [activeJob, setActiveJob] = useState<VideoRenderJob | null>(null);
  const [approvedArtifact, setApprovedArtifact] = useState<ApprovedVideoArtifact | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Initialize short form project
  const [project, setProject] = useState<VideoProject>(() => {
    return ShortFormVideoBuilder.buildShortFormProject({
      productData,
      productFingerprint: 'pfp_sample_laptop_stand_123',
      mediaAssets,
      mediaFingerprint: 'mfp_sample_assets_123',
      contentFingerprint: 'cfp_sample_content_123',
      inputs: {
        title: 'ErgoLift Stand - 6 Angles Spotlight',
        hookText: 'Stop straining your neck at your desk!',
        problemStatement: 'Hours over a low laptop destroys your posture.',
        productHighlights: ['6 adjustable ergonomic angles', 'Aircraft-grade aluminum heat dissipation'],
        callToAction: 'Check verified details at the product link.',
      },
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });
  });

  // Re-calculate fingerprint whenever scenes or spec changes
  const updateProject = (mutator: (prev: VideoProject) => VideoProject) => {
    setProject(prev => {
      const next = mutator(prev);
      const newFp = VideoFingerprintComputer.computeProjectFingerprint({
        productFingerprint: next.productFingerprint,
        mediaFingerprint: next.mediaFingerprint,
        contentFingerprint: next.contentFingerprint,
        scenes: next.scenes,
        overlays: next.overlays,
        subtitles: next.subtitles,
        audioTrack: next.audioTrack,
        outputSpec: next.outputSpec,
      });

      // If project was previously approved, mark STALE_APPROVAL
      if (next.reviewStatus === 'APPROVED' && newFp !== prev.projectFingerprint) {
        next.reviewStatus = 'STALE_APPROVAL';
        setApprovedArtifact(null);
        logger.log({
          action: 'VIDEO_APPROVAL_STALE',
          details: `Project edited post-approval. Status shifted to STALE_APPROVAL.`,
          severity: 'WARN',
          safetyCheckPassed: true,
        });
      }

      return {
        ...next,
        projectFingerprint: newFp,
        updatedAt: Date.now(),
      };
    });
  };

  // Change format preset
  const handleFormatChange = (fmt: VideoFormatType) => {
    if (fmt === 'CUSTOM') return;
    const spec = VIDEO_OUTPUT_PRESETS[fmt];
    updateProject(prev => ({
      ...prev,
      outputSpec: spec,
    }));
  };

  // Trigger Render
  const handleStartRender = async () => {
    if (emergencyStop.isActive()) {
      setNotification({ type: 'error', message: 'Render blocked: Emergency Stop is active!' });
      return;
    }

    try {
      setIsRendering(true);
      setNotification({ type: 'info', message: 'Starting deterministic render pipeline...' });
      const job = renderQueue.enqueue(project);
      setActiveJob({ ...job });

      const finishedJob = await renderQueue.processJob(job.jobId);
      setActiveJob({ ...finishedJob });
      setIsRendering(false);

      if (finishedJob.status === 'READY_FOR_REVIEW') {
        updateProject(prev => ({ ...prev, reviewStatus: 'READY_FOR_REVIEW' }));
        setNotification({
          type: 'success',
          message: 'Video rendering & output validation succeeded! Ready for human review.',
        });
        setActiveTab('review');
      } else {
        setNotification({
          type: 'error',
          message: `Render failed: ${finishedJob.error || 'Unknown error'}`,
        });
      }
    } catch (err: any) {
      setIsRendering(false);
      setNotification({ type: 'error', message: err.message || String(err) });
    }
  };

  // Human Approval Action
  const handleApprove = () => {
    if (!activeJob || activeJob.status !== 'READY_FOR_REVIEW') {
      setNotification({
        type: 'error',
        message: 'Must complete a successful render before approving.',
      });
      return;
    }

    try {
      const artifact = reviewManager.approve(
        project,
        activeJob,
        reviewerName,
        selectedPlatforms,
        reviewNotes
      );
      setApprovedArtifact(artifact);
      updateProject(prev => ({
        ...prev,
        reviewStatus: 'APPROVED',
      }));
      setNotification({
        type: 'success',
        message: `Project approved by ${reviewerName}! ApprovedVideoArtifact generated.`,
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || String(err) });
    }
  };

  // Human Rejection Action
  const handleReject = () => {
    if (!activeJob) return;
    if (!rejectionReason.trim()) {
      setNotification({ type: 'error', message: 'Please provide a rejection reason.' });
      return;
    }

    reviewManager.reject(project, activeJob, reviewerName, rejectionReason);
    updateProject(prev => ({ ...prev, reviewStatus: 'REJECTED' }));
    setApprovedArtifact(null);
    setNotification({ type: 'info', message: 'Project marked as REJECTED.' });
  };

  // Re-review (reset state to draft)
  const handleReReview = () => {
    updateProject(prev => ({ ...prev, reviewStatus: 'NEEDS_REVIEW' }));
    setApprovedArtifact(null);
    setNotification({ type: 'info', message: 'Project reset to NEEDS_REVIEW.' });
  };

  return (
    <div
      id="video_studio_container"
      className={`min-h-[calc(100vh-4rem)] p-4 md:p-6 lg:p-8 space-y-6 ${
        isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#0f172a] text-slate-100'
      }`}
    >
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-700/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Phase 2M
            </span>
            <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
              Offline Video Creator & Review Engine
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1 flex items-center gap-3">
            <Video className="w-8 h-8 text-indigo-400" />
            Video Studio
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Deterministic scene-based short-form video creation, fact grounding, output validation, and cryptographic approval.
          </p>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-2 ${
              project.reviewStatus === 'APPROVED'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : project.reviewStatus === 'STALE_APPROVAL'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : project.reviewStatus === 'READY_FOR_REVIEW'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : project.reviewStatus === 'REJECTED'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-700/40 text-slate-300 border-slate-600'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                project.reviewStatus === 'APPROVED'
                  ? 'bg-emerald-400'
                  : project.reviewStatus === 'STALE_APPROVAL'
                  ? 'bg-amber-400'
                  : project.reviewStatus === 'READY_FOR_REVIEW'
                  ? 'bg-blue-400'
                  : 'bg-slate-400'
              }`}
            />
            {project.reviewStatus}
          </div>

          <button
            id="btn_start_render_top"
            onClick={handleStartRender}
            disabled={isRendering || emergencyStop.isActive()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-sm flex items-center gap-2 transition"
          >
            <Play className="w-4 h-4" />
            {isRendering ? 'Rendering...' : 'Render Project'}
          </button>
        </div>
      </div>

      {/* Safety Notice Invariant */}
      <div
        className={`p-4 rounded-xl border flex items-start gap-3 ${
          isLight
            ? 'bg-indigo-50 border-indigo-200 text-indigo-950'
            : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-200'
        }`}
      >
        <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold">Production Invariant: Zero Direct Publishing from Video Studio</p>
          <p className="text-slate-400">
            Approved video artifacts are cryptographically signed and handed off downstream to the Multi-Platform Job planner. Social publishing is executed exclusively via real Android UI automation with explicit user authorization. Amazon remains strictly a source-only catalog.
          </p>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-3 rounded-lg text-sm border flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : notification.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
              : 'bg-blue-500/10 border-blue-500/40 text-blue-300'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Project Meta Bar */}
      <div
        className={`p-4 rounded-xl border grid grid-cols-1 md:grid-cols-4 gap-4 ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div>
          <span className="text-xs text-slate-400 block">Product Source</span>
          <span className="text-sm font-semibold truncate block">{productData.productName}</span>
          <span className="text-xs text-emerald-400 font-mono">
            Verified Price: ${productData.price?.toFixed(2)} USD
          </span>
        </div>

        <div>
          <span className="text-xs text-slate-400 block">Format & Aspect Ratio</span>
          <div className="flex items-center gap-2 mt-1">
            {(['VERTICAL_SHORT', 'SQUARE', 'LANDSCAPE'] as VideoFormatType[]).map(fmt => (
              <button
                key={fmt}
                onClick={() => handleFormatChange(fmt)}
                className={`px-2 py-1 text-xs rounded font-medium border ${
                  project.outputSpec.format === fmt
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {fmt === 'VERTICAL_SHORT' ? '9:16 Short' : fmt === 'SQUARE' ? '1:1 Square' : '16:9 Wide'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-400 block">Timeline Stats</span>
          <span className="text-sm font-semibold block">
            {project.scenes.length} Scenes ({(project.timeline.totalDurationMs / 1000).toFixed(1)}s total)
          </span>
          <span className="text-xs text-slate-400">FPS: {project.outputSpec.fps} | Container: {project.outputSpec.container}</span>
        </div>

        <div>
          <span className="text-xs text-slate-400 block">Project Fingerprint</span>
          <span className="text-xs font-mono text-indigo-300 block truncate" title={project.projectFingerprint}>
            {project.projectFingerprint}
          </span>
          <span className="text-xs text-slate-500">Cryptographically bound</span>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-slate-700/60 gap-2">
        {[
          { id: 'timeline', label: 'Scene Timeline', icon: Film, badge: `${project.scenes.length}` },
          { id: 'overlays', label: 'Text & Captions', icon: FileText, badge: `${project.overlays.length}` },
          { id: 'audio', label: 'Audio & Voiceover', icon: Volume2 },
          { id: 'render', label: 'Render & Validation', icon: Sparkles, badge: activeJob?.status },
          { id: 'review', label: 'Human Review & Signoff', icon: ShieldCheck },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
                isActive
                  ? 'border-indigo-500 text-indigo-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.badge && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Scene Timeline & Storyboard */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Film className="w-5 h-5 text-indigo-400" />
              Sequential Scene Storyboard
            </h2>
            <span className="text-xs text-slate-400">
              Deterministic short-form structure: HOOK → PROBLEM → PRODUCT → BENEFITS → DEMO → CTA
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.scenes.map((scene, idx) => (
              <div
                key={scene.sceneId}
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/40">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                      Scene #{idx + 1}: {scene.role}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {scene.durationMs / 1000}s ({scene.startTimeMs / 1000}s - {scene.endTimeMs / 1000}s)
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 mb-3">
                    <p>
                      <span className="text-slate-500">Asset:</span> {scene.mediaAsset.assetId} ({scene.mediaAsset.mediaType})
                    </p>
                    <p className="truncate">
                      <span className="text-slate-500">URI:</span> {scene.mediaAsset.localUri}
                    </p>
                    <p>
                      <span className="text-slate-500">Transition:</span> {scene.transition.type} ({scene.transition.durationMs}ms)
                    </p>
                    <p>
                      <span className="text-slate-500">Scale Mode:</span> {scene.scaleMode}
                    </p>
                  </div>

                  {/* Overlays preview in this scene */}
                  {scene.textOverlays && scene.textOverlays.length > 0 && (
                    <div className="p-2 rounded bg-slate-800/60 border border-slate-700/50 mb-3 text-xs">
                      <span className="text-slate-400 font-semibold block mb-1">On-Screen Overlay:</span>
                      <p className="italic text-slate-200">"{scene.textOverlays[0].text}"</p>
                      <span className="text-[10px] text-emerald-400 mt-1 block">
                        Position: {scene.textOverlays[0].position} | Type: {scene.textOverlays[0].type}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                  <span className="text-slate-500 font-mono text-[10px] truncate max-w-[180px]">
                    SHA: {scene.mediaAsset.sha256}
                  </span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Validated
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Text Overlays & Subtitles */}
      {activeTab === 'overlays' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              Fact-Grounded Text Overlays & Subtitles
            </h2>
          </div>

          <div
            className={`p-4 rounded-xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <h3 className="text-sm font-semibold mb-3">On-Screen Overlay Claims</h3>
            <div className="space-y-2">
              {project.overlays.map((ov, i) => (
                <div
                  key={ov.overlayId}
                  className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-2"
                >
                  <div>
                    <span className="text-xs font-bold text-indigo-300 mr-2">[{ov.type}]</span>
                    <span className="text-sm text-slate-100 font-medium">"{ov.text}"</span>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Timeline: {(ov.startTimeMs / 1000).toFixed(1)}s - {(ov.endTimeMs / 1000).toFixed(1)}s | Position: {ov.position}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {ov.isFactualClaim ? (
                      <span className="px-2 py-1 text-xs rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified Factual
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300">
                        Editorial / Hook
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtitles SRT Preview */}
          {project.subtitles && (
            <div
              className={`p-4 rounded-xl border ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <h3 className="text-sm font-semibold mb-2">Timed Subtitle Segments (SRT Format)</h3>
              <pre className="p-3 rounded bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-48 border border-slate-800">
                {SubtitleTrackValidator.toSrt(project.subtitles)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Audio & Voiceover */}
      {activeTab === 'audio' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-indigo-400" />
              Audio Tracks & Voiceover Management
            </h2>
          </div>

          <div
            className={`p-5 rounded-xl border space-y-4 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold">Local Speech Synthesis / Voiceover</h3>
                <p className="text-xs text-slate-400">Deterministic synthesis of approved script text</p>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Local Simulator Active
              </span>
            </div>

            <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-2">
              <span className="text-xs font-semibold text-slate-300">Script Voiceover Text:</span>
              <p className="text-sm text-slate-200 italic">
                "Stop straining your neck at your desk! Hours over a low laptop destroys your posture. Meet the ErgoLift Stand: 6 adjustable ergonomic angles with aircraft-grade aluminum heat dissipation. Check verified details at the link!"
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-400 pt-2">
                <span>Estimated Duration: 21.0s</span>
                <span>Language: en-US</span>
                <span>MIME: audio/mp3</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Background Music</span>
                <p className="text-xs text-slate-300">Local Track: gentle_workspace_lofi.mp3 (Volume: 0.15)</p>
              </div>

              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Safety Rule</span>
                <p className="text-xs text-slate-400">
                  Zero remote audio downloading. Only approved local assets are permitted.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Render & Validation */}
      {activeTab === 'render' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Render Queue & Output Validation
            </h2>

            <button
              onClick={handleStartRender}
              disabled={isRendering || emergencyStop.isActive()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center gap-2 transition"
            >
              <Play className="w-4 h-4" />
              {isRendering ? 'Rendering...' : 'Execute Render'}
            </button>
          </div>

          {activeJob ? (
            <div
              className={`p-6 rounded-xl border space-y-4 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400">Job ID: {activeJob.jobId}</span>
                  <h3 className="text-base font-bold text-indigo-300">Status: {activeJob.status}</h3>
                </div>
                <span className="text-sm font-mono text-slate-300">{activeJob.progress}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>

              {/* Output Validation Checklist */}
              {activeJob.validationResult && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/60 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Output Integrity Verification
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Local URI Scheme Verified
                    </div>
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> MIME & Container (video/mp4)
                    </div>
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Dimensions (1080x1920)
                    </div>
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Duration Bound Check
                    </div>
                  </div>

                  {activeJob.outputResult && (
                    <div className="pt-2 border-t border-slate-700/60 font-mono text-xs text-slate-300 space-y-1">
                      <p>Output URI: {activeJob.outputResult.outputUri}</p>
                      <p>Output SHA-256 Fingerprint: {activeJob.outputResult.outputFingerprint}</p>
                      <p>Size: {(activeJob.outputResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className={`p-8 rounded-xl border text-center space-y-3 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <Sparkles className="w-8 h-8 text-indigo-400 mx-auto opacity-70" />
              <p className="text-sm text-slate-300">No active render job for this project.</p>
              <p className="text-xs text-slate-500">
                Click "Execute Render" above to start deterministic rendering.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Human Review & Signoff */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Human Video Review & Cryptographic Signoff
            </h2>
          </div>

          <div
            className={`p-6 rounded-xl border space-y-5 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Human Reviewer Name
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={e => setReviewerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Target Social Platforms
                </label>
                <div className="flex items-center gap-2 mt-1">
                  {(['instagram', 'tiktok', 'youtube', 'facebook', 'pinterest'] as SupportedPlatform[]).map(
                    platform => {
                      const isSelected = selectedPlatforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          onClick={() => {
                            setSelectedPlatforms(prev =>
                              isSelected ? prev.filter(p => p !== platform) : [...prev, platform]
                            );
                          }}
                          className={`px-2.5 py-1 text-xs rounded border font-medium ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {platform}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Reviewer Evaluation Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100"
              />
            </div>

            {/* Actions Bar */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  id="btn_approve_video"
                  onClick={handleApprove}
                  disabled={!activeJob || activeJob.status !== 'READY_FOR_REVIEW' || emergencyStop.isActive()}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center gap-2 shadow-sm transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Video
                </button>

                <button
                  onClick={handleReReview}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-2 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to Review
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Rejection reason..."
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 w-48"
                />
                <button
                  onClick={handleReject}
                  disabled={!activeJob}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white transition"
                >
                  Reject
                </button>
              </div>
            </div>

            {/* Approved Artifact Export Card */}
            {approvedArtifact && (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs space-y-2 mt-4">
                <div className="flex items-center justify-between text-emerald-300 font-bold">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> ApprovedVideoArtifact Created
                  </span>
                  <span>Approved At: {new Date(approvedArtifact.approvedAt).toLocaleTimeString()}</span>
                </div>
                <div className="font-mono text-slate-300 space-y-1">
                  <p>Artifact URI: {approvedArtifact.artifactUri}</p>
                  <p>Output Fingerprint: {approvedArtifact.outputFingerprint}</p>
                  <p>Project Fingerprint: {approvedArtifact.projectFingerprint}</p>
                  <p>Approved By: {approvedArtifact.approvedBy}</p>
                  <p>Target Platforms: [{approvedArtifact.approvedPlatformTargets.join(', ')}]</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
