import React, { useState, useMemo } from 'react';
import {
  Share2,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  Ban,
  Play,
  RotateCcw,
  Eye,
  CheckSquare,
  Square,
  FileText,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowRight,
  Info,
  Clock,
  Lock,
} from 'lucide-react';
import {
  SupportedPlatform,
  NormalizedContentPayload,
  PlatformExecutionStep,
  MultiPlatformExecutionPlan,
  ApprovalLevel,
  PlannerError,
} from '../../types/job';
import { AdapterRegistry } from '../../core/AdapterRegistry';
import { MultiPlatformPlanner, MultiPlatformJobExecutor } from '../../core/MultiPlatformPlanner';
import { PublicationGuard, computeContentFingerprint } from '../../core/fingerprint';
import { EmergencyStopManager } from '../../core/emergencyStop';
import { LocalActionLogger } from '../../core/logger';
import { SafeUiInspector } from '../../core/inspector';

interface MultiPlatformJobScreenProps {
  theme: 'dark' | 'light';
  onTriggerEmergencyStop?: (reason: string) => void;
}

const PUBLISHING_PLATFORMS: Array<{
  id: SupportedPlatform;
  name: string;
  badge: string;
  supportsVideo: boolean;
  supportsTitle: boolean;
  supportsCover: boolean;
}> = [
  { id: 'instagram', name: 'Instagram', badge: 'Reels & Feed', supportsVideo: true, supportsTitle: false, supportsCover: true },
  { id: 'youtube', name: 'YouTube', badge: 'Shorts', supportsVideo: true, supportsTitle: true, supportsCover: false },
  { id: 'facebook', name: 'Facebook', badge: 'Reels & Feed', supportsVideo: true, supportsTitle: false, supportsCover: false },
  { id: 'tiktok', name: 'TikTok', badge: 'Video Feed', supportsVideo: true, supportsTitle: false, supportsCover: false },
  { id: 'pinterest', name: 'Pinterest', badge: 'Pins & Idea Pins', supportsVideo: true, supportsTitle: false, supportsCover: false },
  { id: 'x', name: 'X (Twitter)', badge: 'Posts & Media', supportsVideo: true, supportsTitle: false, supportsCover: false },
  { id: 'threads', name: 'Threads', badge: 'Threads & Media', supportsVideo: true, supportsTitle: false, supportsCover: false },
  { id: 'linkedin', name: 'LinkedIn', badge: 'Professional Feed', supportsVideo: true, supportsTitle: false, supportsCover: false },
];

export const MultiPlatformJobScreen: React.FC<MultiPlatformJobScreenProps> = ({
  theme,
  onTriggerEmergencyStop,
}) => {
  const isLight = theme === 'light';

  // Core singletons
  const registry = useMemo(() => AdapterRegistry.getInstance(), []);
  const emergencyStop = useMemo(() => EmergencyStopManager.getInstance(), []);
  const publicationGuard = useMemo(() => PublicationGuard.getInstance(), []);
  const logger = useMemo(() => LocalActionLogger.getInstance(), []);
  const planner = useMemo(() => new MultiPlatformPlanner(registry), [registry]);

  // Form State
  const [selectedPlatforms, setSelectedPlatforms] = useState<SupportedPlatform[]>([
    'instagram',
    'youtube',
    'threads',
  ]);
  const [caption, setCaption] = useState('Exciting updates from our personal device automation agent! #PhoneAgent #Android #Build');
  const [title, setTitle] = useState('Automated Production Walkthrough');
  const [description, setDescription] = useState('Full overview of deterministic sequential mobile automation through Android Accessibility.');
  const [hashtagsText, setHashtagsText] = useState('#PhoneAgent, #Android, #Automation, #Tech');
  const [mediaUri, setMediaUri] = useState('content://media/external/video/media/1089');
  const [coverUri, setCoverUri] = useState('content://media/external/images/media/442');
  const [approvalLevel, setApprovalLevel] = useState<ApprovalLevel>('PLATFORM_APPROVAL');

  // Amazon Link Source Demo state
  const [amazonSearchQuery, setAmazonSearchQuery] = useState('wireless lavalier microphone');
  const [amazonExtractedLink, setAmazonExtractedLink] = useState('');
  const [amazonExtracting, setAmazonExtracting] = useState(false);

  // Plan & Execution State
  const [validationErrors, setValidationErrors] = useState<PlannerError[]>([]);
  const [currentPlan, setCurrentPlan] = useState<MultiPlatformExecutionPlan | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [waitingApprovalStep, setWaitingApprovalStep] = useState<PlatformExecutionStep | null>(null);
  const [approvalResolver, setApprovalResolver] = useState<((approved: boolean) => void) | null>(null);
  const [executionSummary, setExecutionSummary] = useState<string | null>(null);

  // Platform selection toggles
  const togglePlatform = (id: SupportedPlatform) => {
    if (selectedPlatforms.includes(id)) {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== id));
    } else {
      setSelectedPlatforms([...selectedPlatforms, id]);
    }
  };

  const selectAllPlatforms = () => {
    setSelectedPlatforms(PUBLISHING_PLATFORMS.map(p => p.id));
  };

  const clearPlatforms = () => {
    setSelectedPlatforms([]);
  };

  // Build Payload
  const getPayload = (): NormalizedContentPayload => {
    const rawTags = hashtagsText
      .split(/[, ]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => (t.startsWith('#') ? t : `#${t}`));

    return {
      text: caption,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      hashtags: rawTags,
      mediaUri: mediaUri.trim() || undefined,
      videoUri: mediaUri.trim() || undefined,
      coverUri: coverUri.trim() || undefined,
    };
  };

  // Generate & Validate Plan
  const handleGeneratePlan = () => {
    setValidationErrors([]);
    const payload = getPayload();

    const validation = planner.validatePlan({
      payload,
      platforms: selectedPlatforms,
      approvalLevel,
    });

    if (!validation.valid) {
      setValidationErrors(validation.errors);
      setCurrentPlan(null);
      return;
    }

    try {
      const plan = planner.plan({
        payload,
        platforms: selectedPlatforms,
        approvalLevel,
      });
      setCurrentPlan(plan);
      setShowPreviewModal(true);
      setExecutionSummary(null);
    } catch (err: any) {
      if (err.errors) {
        setValidationErrors(err.errors);
      } else {
        setValidationErrors([{ code: 'PLAN_ERROR', message: err.message || String(err) }]);
      }
    }
  };

  // Execute Planned Steps
  const handleExecutePlan = async () => {
    if (!currentPlan) return;
    setShowPreviewModal(false);
    setIsExecuting(true);
    setExecutionSummary(null);

    const inspector = new SafeUiInspector('com.instagram.android');
    const executor = new MultiPlatformJobExecutor(registry, logger, emergencyStop, publicationGuard);

    try {
      const result = await executor.executePlan(currentPlan, {
        inspector,
        approvalProvider: async (step: PlatformExecutionStep) => {
          // If approval level is PLATFORM_APPROVAL, wait for operator manual confirmation
          return new Promise<boolean>((resolve) => {
            setWaitingApprovalStep(step);
            setApprovalResolver(() => (approved: boolean) => {
              setWaitingApprovalStep(null);
              setApprovalResolver(null);
              resolve(approved);
            });
          });
        },
        onStepProgress: (step, index) => {
          setActiveStepIndex(index);
        },
      });

      if (result.success && result.allPublished) {
        setExecutionSummary(`All ${result.completedPlatforms.length} platforms published successfully!`);
      } else if (result.stoppedReason) {
        setExecutionSummary(`Execution halted by Emergency Stop: ${result.stoppedReason}`);
      } else {
        setExecutionSummary(
          `Execution finished. Completed: ${result.completedPlatforms.length}, Failed: ${result.failedPlatforms.length}.`
        );
      }
    } catch (err: any) {
      setExecutionSummary(`Execution error: ${err.message || String(err)}`);
    } finally {
      setIsExecuting(false);
      setActiveStepIndex(-1);
    }
  };

  // Amazon Link Extraction Demo
  const handleExtractAmazonLink = async () => {
    setAmazonExtracting(true);
    setAmazonExtractedLink('');
    await new Promise(r => setTimeout(r, 600));
    const sanitizedSlug = amazonSearchQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const demoAsin = 'B09XYZ' + Math.floor(1000 + Math.random() * 9000);
    const generatedUrl = `https://www.amazon.com/dp/${demoAsin}?tag=phoneagent-20&ref=${sanitizedSlug}`;
    setAmazonExtractedLink(generatedUrl);
    setAmazonExtracting(false);

    logger.log({
      platform: 'amazon',
      action: 'EXTRACT_PRODUCT_LINK',
      details: `Extracted product link for query: "${amazonSearchQuery}" -> ${generatedUrl}`,
      severity: 'ACTION',
      safetyCheckPassed: true,
    });
  };

  // Load sample content
  const handleLoadSample = (type: 'reel' | 'announcement') => {
    if (type === 'reel') {
      setTitle('Product Launch Keynote');
      setCaption('New mobile automation capabilities live! Check out the details below. #Mobile #Automation #Tech');
      setDescription('Detailed walkthrough of local Android Accessibility automation with bounded recovery.');
      setHashtagsText('#PhoneAgent, #Android, #Engineering, #Mobile');
      setMediaUri('content://media/external/video/media/2026');
      setCoverUri('content://media/external/images/media/505');
      setSelectedPlatforms(['instagram', 'youtube', 'tiktok', 'facebook']);
    } else {
      setTitle('');
      setCaption('Major milestone achieved: 100% test pass rate across all platform adapters. No network APIs required.');
      setDescription('Zero-network personal assistant executing entirely on visible Android UI.');
      setHashtagsText('#AndroidDev, #Accessibility, #Milestone');
      setMediaUri('content://media/external/images/media/303');
      setCoverUri('');
      setSelectedPlatforms(['x', 'threads', 'linkedin', 'facebook']);
    }
    setValidationErrors([]);
    setCurrentPlan(null);
  };

  const isStopActive = emergencyStop.isActive();
  const capabilityMatrix = registry.getCapabilityMatrix();

  return (
    <div className="space-y-6">
      {/* Top Banner: Emergency Stop & Status */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isStopActive
            ? 'bg-red-950/40 border-red-800 text-red-200'
            : isLight
            ? 'bg-white border-neutral-200'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isStopActive ? 'bg-red-600/30 text-red-400' : 'bg-blue-600/20 text-blue-400'
              }`}
            >
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Multi-Platform Job Planner</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-blue-500/20 text-blue-400">
                  Step 2H Orchestration
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Safe capability-checked multi-destination distribution with sequential execution & mandatory human approval.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isStopActive ? (
              <div className="px-3 py-1.5 rounded-lg bg-red-900/60 border border-red-700/60 text-red-300 text-xs font-semibold flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400" />
                <span>EMERGENCY STOP ACTIVE</span>
              </div>
            ) : (
              <button
                onClick={() => onTriggerEmergencyStop?.('Manual Emergency Stop triggered from Multi-Platform Job')}
                className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Trigger Emergency Stop</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Adapter Registry & Capability Matrix */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300">
              Adapter Registry & Capability Matrix
            </h3>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            {capabilityMatrix.length} Registered Adapters
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {capabilityMatrix.map((item) => {
            const isAmazon = item.adapterId === 'amazon';
            return (
              <div
                key={item.adapterId}
                className={`p-3.5 rounded-xl border text-xs transition-all ${
                  isAmazon
                    ? 'bg-amber-950/20 border-amber-800/40'
                    : isLight
                    ? 'bg-neutral-50 border-neutral-200'
                    : 'bg-neutral-950/40 border-neutral-800/70'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-neutral-200">{item.displayName}</span>
                  {isAmazon ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400">
                      Link Source Only
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">
                      Publishing Adapter
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-neutral-400 font-mono mb-2 truncate">
                  {item.packageName}
                </div>

                <div className="flex flex-wrap gap-1">
                  {item.capabilities.supportsVideo && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/15 text-blue-400 font-medium">
                      Video
                    </span>
                  )}
                  {item.capabilities.supportsImage && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/15 text-sky-400 font-medium">
                      Image
                    </span>
                  )}
                  {item.capabilities.supportsTitle && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/15 text-purple-400 font-medium">
                      Title
                    </span>
                  )}
                  {item.capabilities.supportsCover && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-pink-500/15 text-pink-400 font-medium">
                      Cover
                    </span>
                  )}
                  {item.capabilities.supportsHashtags && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-400 font-medium">
                      Hashtags
                    </span>
                  )}
                  {item.capabilities.requiresApproval && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-300 font-medium">
                      Approval Req.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Amazon Special Rule Box: STRICTLY SEPARATE AS PRODUCT LINK SOURCE */}
      <div className="p-5 rounded-2xl border bg-amber-950/15 border-amber-800/40 text-amber-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
              a
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-amber-300">Amazon Shopping — Product Link Source</h3>
                <span className="px-2 py-0.2 rounded text-[10px] font-semibold uppercase bg-red-900/40 text-red-300 border border-red-700/40">
                  Publishing Prohibited
                </span>
              </div>
              <p className="text-xs text-amber-200/70">
                Restricted strictly to product search and affiliate link extraction. Amazon is NEVER a publishing destination.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="md:col-span-2 flex gap-2">
            <input
              type="text"
              value={amazonSearchQuery}
              onChange={e => setAmazonSearchQuery(e.target.value)}
              placeholder="Search product query to extract link..."
              className="flex-1 px-3 py-2 rounded-xl bg-neutral-950/60 border border-amber-800/40 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleExtractAmazonLink}
              disabled={amazonExtracting || !amazonSearchQuery.trim()}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
            >
              {amazonExtracting ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              <span>Extract Link</span>
            </button>
          </div>

          <div className="p-2.5 rounded-xl bg-neutral-950/60 border border-amber-800/30 text-xs flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">Extracted URL:</span>
            {amazonExtractedLink ? (
              <span className="font-mono text-emerald-400 truncate max-w-[200px]" title={amazonExtractedLink}>
                {amazonExtractedLink}
              </span>
            ) : (
              <span className="text-neutral-500 italic text-[11px]">None extracted yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Job Planner Form */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-neutral-800/60">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300">
              Create Multi-Platform Job
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Select destination platforms and define payload content for capability validation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleLoadSample('reel')}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-all"
            >
              Sample Video Reel
            </button>
            <button
              onClick={() => handleLoadSample('announcement')}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-all"
            >
              Sample Text Update
            </button>
          </div>
        </div>

        {/* Platform Selection Checkboxes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold uppercase text-neutral-400">
              Select Target Platforms ({selectedPlatforms.length} Selected)
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAllPlatforms}
                className="text-[11px] text-blue-400 hover:underline"
              >
                Select All
              </button>
              <span className="text-neutral-600">•</span>
              <button
                onClick={clearPlatforms}
                className="text-[11px] text-neutral-400 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {PUBLISHING_PLATFORMS.map((platform) => {
              const isSelected = selectedPlatforms.includes(platform.id);
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => togglePlatform(platform.id)}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                    isSelected
                      ? 'bg-blue-950/30 border-blue-600/70 text-blue-200 shadow-xs'
                      : isLight
                      ? 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      : 'bg-neutral-950/40 border-neutral-800/80 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <div className="mt-0.5">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-neutral-500 shrink-0" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-neutral-100 truncate">
                      {platform.name}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate">
                      {platform.badge}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Payload Inputs */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Main Caption / Text <span className="text-red-400">*</span>
              </label>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={3}
                placeholder="Enter caption or post text..."
                className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-blue-500 font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Title <span className="text-[10px] text-neutral-500 font-normal">(YouTube Shorts only)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (leave empty if not supported)"
                className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-blue-500 font-sans"
              />

              <label className="block text-xs font-semibold text-neutral-300 mt-3 mb-1">
                Hashtags <span className="text-[10px] text-neutral-500 font-normal">(Comma or space separated)</span>
              </label>
              <input
                type="text"
                value={hashtagsText}
                onChange={e => setHashtagsText(e.target.value)}
                placeholder="#tag1, #tag2"
                className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-blue-500 font-sans"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Media URI (Video or Photo)
              </label>
              <input
                type="text"
                value={mediaUri}
                onChange={e => setMediaUri(e.target.value)}
                placeholder="content://media/external/video/..."
                className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Cover Image URI <span className="text-[10px] text-neutral-500 font-normal">(Instagram/Pinterest only)</span>
              </label>
              <input
                type="text"
                value={coverUri}
                onChange={e => setCoverUri(e.target.value)}
                placeholder="content://media/external/images/..."
                className="w-full px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Approval Level Selector */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-neutral-400">Approval Level:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApprovalLevel('PLATFORM_APPROVAL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    approvalLevel === 'PLATFORM_APPROVAL'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  PLATFORM_APPROVAL (Default)
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalLevel('JOB_APPROVAL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    approvalLevel === 'JOB_APPROVAL'
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  JOB_APPROVAL
                </button>
              </div>
            </div>

            <button
              onClick={handleGeneratePlan}
              disabled={selectedPlatforms.length === 0}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <Eye className="w-4 h-4" />
              <span>Generate & Preview Plan</span>
            </button>
          </div>
        </div>

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <div className="mt-5 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-red-300">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>Plan Validation Failed ({validationErrors.length} issues)</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-red-300/90 font-mono">
              {validationErrors.map((err, i) => (
                <li key={i}>
                  [{err.platform || 'General'}] {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Execution Summary Notification */}
        {executionSummary && (
          <div className="mt-5 p-4 rounded-xl bg-neutral-800/80 border border-neutral-700 text-neutral-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400" />
              <span>{executionSummary}</span>
            </div>
            <button
              onClick={() => setExecutionSummary(null)}
              className="text-neutral-400 hover:text-neutral-200 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Live Execution Progress Tracker */}
      {isExecuting && currentPlan && (
        <div className="p-5 rounded-2xl border bg-blue-950/20 border-blue-800/50 text-neutral-200 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 animate-spin text-blue-400" />
              <h3 className="text-sm font-bold">Sequential Platform Execution in Progress</h3>
            </div>
            <span className="text-xs font-mono text-neutral-400">
              Step {activeStepIndex + 1} of {currentPlan.steps.length}
            </span>
          </div>

          <div className="space-y-2">
            {currentPlan.steps.map((step, idx) => (
              <div
                key={step.platform}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                  idx === activeStepIndex
                    ? 'bg-blue-900/30 border-blue-600 text-white'
                    : step.status === 'PUBLISHED'
                    ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                    : step.status === 'FAILED'
                    ? 'bg-red-950/30 border-red-800/60 text-red-300'
                    : step.status === 'CANCELLED'
                    ? 'bg-neutral-900/40 border-neutral-800 text-neutral-500'
                    : 'bg-neutral-950/30 border-neutral-800 text-neutral-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-neutral-500">#{idx + 1}</span>
                  <span className="font-bold capitalize">{step.platform}</span>
                  <span className="text-[10px] text-neutral-400 font-mono">({step.action})</span>
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span>{step.status}</span>
                  {step.status === 'PUBLISHED' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {step.status === 'RUNNING' && <RotateCcw className="w-4 h-4 animate-spin text-blue-400" />}
                  {step.status === 'FAILED' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                  {step.status === 'CANCELLED' && <Ban className="w-4 h-4 text-neutral-500" />}
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Human Approval Gate Dialog */}
          {waitingApprovalStep && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm">Mandatory Operator Approval Required</span>
              </div>
              <p className="text-xs text-amber-200/90">
                Confirm publishing payload for <span className="font-bold uppercase">{waitingApprovalStep.platform}</span> ({waitingApprovalStep.action}):
              </p>
              <div className="p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800 text-[11px] font-mono text-neutral-300 max-h-24 overflow-y-auto">
                <div>Caption: {waitingApprovalStep.payload.text}</div>
                {waitingApprovalStep.payload.title && <div>Title: {waitingApprovalStep.payload.title}</div>}
                {waitingApprovalStep.payload.hashtags && <div>Hashtags: {waitingApprovalStep.payload.hashtags.join(' ')}</div>}
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => approvalResolver?.(false)}
                  className="px-4 py-2 rounded-lg bg-red-800/40 hover:bg-red-800/60 text-red-300 text-xs font-semibold transition-all"
                >
                  Reject & Skip
                </button>
                <button
                  onClick={() => approvalResolver?.(true)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs"
                >
                  Approve & Publish
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deterministic Execution Preview Modal (Requirement 16) */}
      {showPreviewModal && currentPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl transition-all ${
              isLight ? 'bg-white border-neutral-200 text-neutral-900' : 'bg-neutral-900 border-neutral-800 text-neutral-100'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-4">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-blue-400" />
                  Deterministic Multi-Platform Job Preview
                </h3>
                <span className="text-xs text-neutral-400 font-mono">
                  Job ID: {currentPlan.jobId} • Fingerprint: {currentPlan.fingerprint}
                </span>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-neutral-400 hover:text-neutral-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Base Job Content Overview */}
            <div className="p-3.5 rounded-xl bg-neutral-950/50 border border-neutral-800 text-xs space-y-2 mb-4">
              <div className="flex justify-between text-neutral-400 text-[11px]">
                <span>Approval Level: <strong className="text-neutral-200">{currentPlan.approvalLevel}</strong></span>
                <span>Platforms: <strong className="text-neutral-200">{currentPlan.steps.length} destinations</strong></span>
              </div>
              <div>
                <span className="text-neutral-400 font-medium">Media: </span>
                <span className="font-mono text-neutral-200 text-[11px]">{mediaUri || '(None)'}</span>
              </div>
              <div>
                <span className="text-neutral-400 font-medium">Caption: </span>
                <span className="text-neutral-200">{caption}</span>
              </div>
            </div>

            {/* Platform Normalized Payloads */}
            <div className="space-y-3 mb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Normalized Platform Payloads (Deterministic Queue)
              </h4>

              {currentPlan.steps.map((step, index) => (
                <div
                  key={step.platform}
                  className="p-3.5 rounded-xl border border-neutral-800/80 bg-neutral-950/40 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2">
                    <div className="flex items-center gap-2 font-bold capitalize text-neutral-200">
                      <span className="text-neutral-500 font-mono">#{index + 1}</span>
                      <span>{step.platform}</span>
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                        {step.action}
                      </span>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                      Approval: REQUIRED
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] font-mono text-neutral-300">
                    {step.payload.title && (
                      <div>
                        <span className="text-neutral-500">Title: </span>
                        <span>{step.payload.title}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-neutral-500">Text: </span>
                      <span>{step.payload.text || '(None)'}</span>
                    </div>
                    {step.payload.hashtags && step.payload.hashtags.length > 0 && (
                      <div>
                        <span className="text-neutral-500">Hashtags: </span>
                        <span>{step.payload.hashtags.join(' ')}</span>
                      </div>
                    )}
                    {step.payload.mediaUri && (
                      <div>
                        <span className="text-neutral-500">Media: </span>
                        <span className="text-blue-400 truncate">{step.payload.mediaUri}</span>
                      </div>
                    )}
                    {step.payload.coverUri && (
                      <div>
                        <span className="text-neutral-500">Cover: </span>
                        <span className="text-pink-400 truncate">{step.payload.coverUri}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-all"
              >
                Cancel Plan
              </button>
              <button
                onClick={handleExecutePlan}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Sequential Execution</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
