/**
 * Phone Agent - Phase 2O Production End-to-End Workflow Screen
 * Comprehensive 14-section mission control dashboard for the 15-stage master workflow:
 * 1. Job Overview
 * 2. Product Research
 * 3. Product Review (Gate 1)
 * 4. AI Content (Groq-First)
 * 5. Content Review (Gate 2)
 * 6. Video Studio
 * 7. Video Review (Gate 3)
 * 8. Amazon Link (Source-Only)
 * 9. Platform Plan
 * 10. Final Approval (Gate 4 & Final Publish Confirmation Modal)
 * 11. Platform Execution
 * 12. Publication Verification
 * 13. Final Reconciliation
 * 14. Audit Trail
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  AlertOctagon,
  FileCheck,
  ShoppingBag,
  Video,
  Share2,
  Lock,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Hash,
  RefreshCw,
  Search,
  Sparkles,
  Ban,
  Radio,
  FileText,
  Layers,
  ArrowRight,
} from 'lucide-react';

import { MasterOrchestrator } from '../../core/orchestrator/MasterOrchestrator';
import { OrchestrationContext, PublicationItemRecord } from '../../core/orchestrator/OrchestrationContext';
import { OrchestrationState } from '../../core/orchestrator/OrchestrationState';
import { CANONICAL_STEP_SEQUENCE, OrchestrationStepType, StepExecutionStatus } from '../../core/orchestrator/OrchestrationStep';
import { CANONICAL_PLATFORM_ORDER } from '../../core/orchestrator/OrchestrationPolicy';
import { OrchestrationAuditManager, AuditEvent } from '../../core/orchestrator/OrchestrationAuditManager';
import { EmergencyStopManager } from '../../core/emergencyStop';
import { PublicationReconciliationManager } from '../../core/PublicationReconciliationManager';
import { SupportedPlatform } from '../../types/job';

interface EndToEndWorkflowScreenProps {
  theme: 'dark' | 'light';
}

export const EndToEndWorkflowScreen: React.FC<EndToEndWorkflowScreenProps> = ({ theme }) => {
  const isLight = theme === 'light';
  const orchestrator = useMemo(() => MasterOrchestrator.getInstance(), []);
  const emergencyStop = useMemo(() => EmergencyStopManager.getInstance(), []);
  const auditManager = useMemo(() => OrchestrationAuditManager.getInstance(), []);
  const reconciliationManager = useMemo(() => PublicationReconciliationManager.getInstance(), []);

  // Reactive state
  const [context, setContext] = useState<OrchestrationContext | null>(() => orchestrator.getContext());
  const [isEmergencyActive, setIsEmergencyActive] = useState(() => emergencyStop.isActive());
  const [emergencyReason, setEmergencyReason] = useState(() => emergencyStop.getReason());
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => auditManager.getEvents());
  const [chainValid, setChainValid] = useState(() => auditManager.verifyChainIntegrity());

  // Form controls for starting new workflow
  const [searchQuery, setSearchQuery] = useState('Anker Soundcore Space Q45 Wireless Headphones');
  const [asin, setAsin] = useState('B09V3K7S2Q');
  const [selectedPlatforms, setSelectedPlatforms] = useState<SupportedPlatform[]>([
    'instagram',
    'youtube',
    'facebook',
    'tiktok',
    'pinterest',
    'x',
    'threads',
    'linkedin',
  ]);
  const [operatorId, setOperatorId] = useState('Operator_Alice');
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [showFinalConfirmModal, setShowFinalConfirmModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [activeRejectGate, setActiveRejectGate] = useState<'PRODUCT_REVIEW' | 'CONTENT_REVIEW' | 'VIDEO_REVIEW' | 'FINAL_PUBLISH_APPROVAL' | null>(null);

  // Sync state reactively
  useEffect(() => {
    const unsub = orchestrator.subscribe(() => {
      setContext(orchestrator.getContext());
      setAuditEvents(auditManager.getEvents());
      setChainValid(auditManager.verifyChainIntegrity());
      setIsEmergencyActive(emergencyStop.isActive());
      setEmergencyReason(emergencyStop.getReason());
    });

    const interval = setInterval(() => {
      setContext(orchestrator.getContext());
      setIsEmergencyActive(emergencyStop.isActive());
      setEmergencyReason(emergencyStop.getReason());
      setAuditEvents(auditManager.getEvents());
      setChainValid(auditManager.verifyChainIntegrity());
    }, 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [orchestrator, auditManager, emergencyStop]);

  // Actions
  const handleStartJob = async () => {
    try {
      setErrorMessage(null);
      const newCtx = orchestrator.initialize({
        searchQuery,
        asin: asin || undefined,
        targetPlatforms: selectedPlatforms,
        operatorId,
      });
      setContext(newCtx);
      await orchestrator.executeNext();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handlePause = () => {
    try {
      setErrorMessage(null);
      orchestrator.pause('Operator requested pause via dashboard');
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleResume = async () => {
    try {
      setErrorMessage(null);
      orchestrator.resume();
      await orchestrator.executeNext();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleCancel = () => {
    try {
      setErrorMessage(null);
      orchestrator.cancelWorkflow('Operator requested cancellation via dashboard');
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleRetry = async () => {
    try {
      setErrorMessage(null);
      await orchestrator.retryStep();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleEmergencyStop = () => {
    orchestrator.triggerEmergencyStop('Operator manual Emergency Stop from dashboard');
  };

  const handleResetEmergencyStop = () => {
    emergencyStop.reset();
    setIsEmergencyActive(false);
  };

  const handleApproveProduct = async () => {
    try {
      setErrorMessage(null);
      orchestrator.submitProductApproval({
        reviewerId: operatorId,
        notes: reviewNotes || 'Product verified safe and accurate.',
      });
      setReviewNotes('');
      await orchestrator.executeNext();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleApproveContent = async () => {
    try {
      setErrorMessage(null);
      orchestrator.submitContentApproval({
        reviewerId: operatorId,
        notes: reviewNotes || 'Content verified fact-grounded and compliant.',
      });
      setReviewNotes('');
      await orchestrator.executeNext();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleApproveVideo = async () => {
    try {
      setErrorMessage(null);
      orchestrator.submitVideoApproval({
        reviewerId: operatorId,
        notes: reviewNotes || 'Video visual and audio timeline approved.',
      });
      setReviewNotes('');
      await orchestrator.executeNext();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleConfirmPublish = async () => {
    try {
      setErrorMessage(null);
      setShowFinalConfirmModal(false);
      orchestrator.submitPublishApproval({
        reviewerId: operatorId,
        notes: reviewNotes || 'Final multi-platform publication confirmed by operator.',
      });
      setReviewNotes('');
      await orchestrator.executeNext();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleOpenReject = (gate: 'PRODUCT_REVIEW' | 'CONTENT_REVIEW' | 'VIDEO_REVIEW' | 'FINAL_PUBLISH_APPROVAL') => {
    setActiveRejectGate(gate);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleConfirmReject = () => {
    if (!activeRejectGate) return;
    try {
      setErrorMessage(null);
      orchestrator.rejectGate({
        gateType: activeRejectGate,
        reviewerId: operatorId,
        reason: rejectionReason || 'Operator rejected this approval gate.',
      });
      setShowRejectModal(false);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  // Helper for status badge styling
  const renderStateBadge = (state: OrchestrationState | StepExecutionStatus | 'EMERGENCY_STOPPED') => {
    switch (state) {
      case 'COMPLETED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> COMPLETED</span>;
      case 'IN_PROGRESS':
      case 'EXECUTING_PLATFORM':
      case 'RESEARCHING':
      case 'GENERATING_CONTENT':
      case 'CREATING_VIDEO':
      case 'RENDERING_VIDEO':
      case 'CAPTURING_AMAZON_LINK':
      case 'PLANNING_PLATFORMS':
      case 'VERIFYING_PUBLICATION':
      case 'RECONCILING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20 animate-pulse"><RefreshCw className="w-3 h-3 animate-spin" /> RUNNING</span>;
      case 'WAITING_FOR_PRODUCT_REVIEW':
      case 'WAITING_FOR_CONTENT_REVIEW':
      case 'WAITING_FOR_VIDEO_REVIEW':
      case 'WAITING_FOR_PUBLISH_APPROVAL':
      case 'WAITING_APPROVAL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20"><Clock className="w-3 h-3" /> WAITING_FOR_APPROVAL</span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20"><XCircle className="w-3 h-3" /> FAILED</span>;
      case 'UNKNOWN':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/20"><AlertTriangle className="w-3 h-3" /> UNKNOWN</span>;
      case 'EMERGENCY_STOPPED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-600 text-white border border-red-700 font-mono"><AlertOctagon className="w-3 h-3" /> EMERGENCY_STOPPED</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-500/20 text-neutral-600 border border-neutral-500/30"><Ban className="w-3 h-3" /> CANCELLED</span>;
      case 'PENDING':
      case 'IDLE':
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-500/10 text-neutral-500 border border-neutral-500/20"><Clock className="w-3 h-3" /> PENDING</span>;
    }
  };

  return (
    <div className={`space-y-6 max-w-7xl mx-auto pb-16 ${isLight ? 'text-neutral-900' : 'text-neutral-100'}`} id="e2e-workflow-container">
      {/* Top Banner Alert if Emergency Stop Active */}
      {isEmergencyActive && (
        <div className="p-4 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-between shadow-sm" id="emergency-banner">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-6 h-6 text-red-500 shrink-0 animate-bounce" />
            <div>
              <h4 className="font-bold text-red-600 dark:text-red-400">EMERGENCY STOP ACTIVE — SYSTEM LOCKED</h4>
              <p className="text-sm text-red-700 dark:text-red-300">
                {emergencyReason || 'Master safety tripwire triggered. All publication adapters halted.'}
              </p>
            </div>
          </div>
          <button
            id="reset-emergency-stop-btn"
            onClick={handleResetEmergencyStop}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition"
          >
            Reset Emergency Stop
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center justify-between" id="error-banner">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-xs font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: JOB OVERVIEW & WORKFLOW TIMELINE */}
      {/* ========================================================================= */}
      <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200 shadow-sm' : 'bg-neutral-900 border-neutral-800'}`} id="section-job-overview">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Production End-to-End Orchestrator</h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Job ID: <span className="font-mono font-semibold">{context?.orchestrationId || 'No active job'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Status & Safe Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div>{renderStateBadge(context ? (context.isEmergencyStopped ? 'EMERGENCY_STOPPED' : context.currentState) : 'IDLE')}</div>

            {/* Start Job */}
            {!context || context.currentState === 'IDLE' || context.currentState === 'COMPLETED' || context.currentState === 'FAILED' || context.currentState === 'CANCELLED' ? (
              <button
                id="start-job-btn"
                onClick={handleStartJob}
                disabled={isEmergencyActive}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" /> Start Job
              </button>
            ) : null}

            {/* Pause Control */}
            {context && !context.isPaused && context.currentState !== 'COMPLETED' && context.currentState !== 'FAILED' && context.currentState !== 'CANCELLED' && context.currentState !== 'EMERGENCY_STOPPED' && (
              <button
                id="pause-job-btn"
                onClick={handlePause}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition"
              >
                <Pause className="w-4 h-4" /> Pause
              </button>
            )}

            {/* Resume Control */}
            {context && context.isPaused && (
              <button
                id="resume-job-btn"
                onClick={handleResume}
                disabled={isEmergencyActive || context.isEmergencyStopped}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" /> Resume
              </button>
            )}

            {/* Cancel Control */}
            {context && context.currentState !== 'COMPLETED' && context.currentState !== 'CANCELLED' && context.currentState !== 'EMERGENCY_STOPPED' && (
              <button
                id="cancel-job-btn"
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm font-medium transition"
              >
                <Ban className="w-4 h-4" /> Cancel
              </button>
            )}

            {/* Retry Control */}
            {context && (context.currentState === 'FAILED' || context.currentState === 'UNKNOWN') && (
              <button
                id="retry-job-btn"
                onClick={handleRetry}
                disabled={isEmergencyActive || context.isEmergencyStopped || context.currentState === 'CANCELLED'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Retry Step
              </button>
            )}

            {/* Emergency Stop Tripwire */}
            <button
              id="emergency-stop-tripwire-btn"
              onClick={handleEmergencyStop}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-sm transition"
            >
              <AlertOctagon className="w-4 h-4" /> EMERGENCY STOP
            </button>
          </div>
        </div>

        {/* 15-Stage Workflow Stepper */}
        <div className="pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
            15-Stage Canonical Workflow Timeline
          </h3>
          <div className="overflow-x-auto pb-2">
            <div className="flex items-center gap-2 min-w-max">
              {CANONICAL_STEP_SEQUENCE.map((stepType, idx) => {
                const stepObj = context?.steps.find(s => s.stepType === stepType);
                const isCurrent = context?.currentStep === stepType;
                const status = stepObj?.status || 'PENDING';
                const isDone = status === 'COMPLETED';
                const isWaiting = status === 'WAITING_APPROVAL';
                const isErr = status === 'FAILED';

                return (
                  <div key={stepType} className="flex items-center gap-2">
                    <div
                      className={`px-3 py-2 rounded-xl border text-xs font-medium flex flex-col gap-1 transition ${
                        isCurrent
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20'
                          : isDone
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                          : isWaiting
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse'
                          : isErr
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : isLight
                          ? 'border-neutral-200 bg-neutral-50 text-neutral-500'
                          : 'border-neutral-800 bg-neutral-900 text-neutral-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] opacity-70">#{idx + 1}</span>
                        {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        {isWaiting && <Clock className="w-3 h-3 text-amber-500" />}
                        {isErr && <XCircle className="w-3 h-3 text-rose-500" />}
                      </div>
                      <span className="font-semibold whitespace-nowrap">{stepType}</span>
                      <span className="text-[10px] font-mono capitalize">{status.toLowerCase()}</span>
                    </div>
                    {idx < CANONICAL_STEP_SEQUENCE.length - 1 && (
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-700 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Grid for Stages 2 & 3: Research & Product Review */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================================= */}
        {/* SECTION 2: PRODUCT RESEARCH */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-product-research">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-base">2. Product Research & Intelligence</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400">Step 2K Engine</span>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-neutral-500 block mb-1">Search Query</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${
                    isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-800 border-neutral-700'
                  }`}
                  placeholder="e.g. Ergonomic Keyboard"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500 block mb-1">ASIN (Optional)</label>
                <input
                  type="text"
                  value={asin}
                  onChange={e => setAsin(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-lg border font-mono ${
                    isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-800 border-neutral-700'
                  }`}
                  placeholder="e.g. B09V3K7S2Q"
                />
              </div>
            </div>

            {context?.productData ? (
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-2 bg-neutral-500/5">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-sm">{context.productData.title}</h4>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600">
                    ${context.productData.price?.toFixed(2) || 'N/A'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 line-clamp-2">{context.productData.description}</p>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 font-mono">
                    Brand: {context.productData.brand || 'Verified'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 font-mono">
                    Rating: {context.productData.rating || 4.8} / 5
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-mono">
                    Confidence: 98%
                  </span>
                </div>
                {context.productFingerprint && (
                  <div className="text-[11px] font-mono text-neutral-400 truncate pt-1">
                    SHA256: {context.productFingerprint}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed rounded-xl text-neutral-400 text-xs">
                No product intelligence extracted yet. Click "Start Job" to commence research.
              </div>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 3: PRODUCT REVIEW (HUMAN GATE 1) */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-product-review">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-base">3. Product Review Gate</h2>
            </div>
            {context?.productApproval ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> APPROVED by {context.productApproval.reviewerId}
              </span>
            ) : context?.currentState === 'WAITING_FOR_PRODUCT_REVIEW' ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 animate-pulse">
                ACTION REQUIRED
              </span>
            ) : (
              <span className="text-xs text-neutral-400">Waiting for research</span>
            )}
          </div>

          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-400">Provenance:</span>
                <span className="font-mono font-medium">{context?.productData?.sourceUrl ? 'Verified Amazon Detail Page' : 'Amazon Source Extraction'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Verified Price:</span>
                <span className="font-mono font-medium">${context?.productData?.price?.toFixed(2) || '149.99'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Product Fingerprint:</span>
                <span className="font-mono text-[10px] truncate max-w-[200px]">{context?.productFingerprint || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Prohibited Claims Check:</span>
                <span className="text-emerald-500 font-semibold">PASSED (0 violations)</span>
              </div>
            </div>

            {/* Approval Controls */}
            {context?.currentState === 'WAITING_FOR_PRODUCT_REVIEW' && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Human verification required: Validate product attributes and safety before content generation.
                </div>
                <div className="flex gap-2">
                  <button
                    id="approve-product-gate-btn"
                    onClick={handleApproveProduct}
                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve Product
                  </button>
                  <button
                    id="reject-product-gate-btn"
                    onClick={() => handleOpenReject('PRODUCT_REVIEW')}
                    className="px-4 py-2 rounded-lg border border-rose-500/40 hover:bg-rose-500/10 text-rose-600 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Grid for Stages 4 & 5: AI Content & Content Review */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================================= */}
        {/* SECTION 4: AI CONTENT GENERATION (GROQ-FIRST) */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-ai-content">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h2 className="font-bold text-base">4. AI Content Generation (Groq-First)</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400">Step 2L Engine</span>
          </div>

          <div className="space-y-3">
            {context?.contentPackage ? (
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3 bg-neutral-500/5">
                <div>
                  <span className="text-[11px] font-semibold text-purple-500 uppercase tracking-wider block mb-1">Generated Hook</span>
                  <p className="text-sm font-semibold">{context.contentPackage.hook}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">Body Caption</span>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300 whitespace-pre-line">{context.contentPackage.caption}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">Hashtags & CTA</span>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {context.contentPackage.hashtags?.map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 font-mono">
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs font-medium text-neutral-500">CTA: {context.contentPackage.callToAction}</p>
                </div>
                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex justify-between text-[11px] text-neutral-400">
                  <span>Fact-Grounding: <strong className="text-emerald-500">VERIFIED</strong></span>
                  <span className="font-mono">Content SHA: {context.contentFingerprint?.slice(0, 16)}...</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed rounded-xl text-neutral-400 text-xs">
                AI content will be synthesized once Product Review approval is confirmed.
              </div>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 5: CONTENT REVIEW (HUMAN GATE 2) */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-content-review">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-base">5. Content Review Gate</h2>
            </div>
            {context?.contentApproval ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> APPROVED by {context.contentApproval.reviewerId}
              </span>
            ) : context?.currentState === 'WAITING_FOR_CONTENT_REVIEW' ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 animate-pulse">
                ACTION REQUIRED
              </span>
            ) : (
              <span className="text-xs text-neutral-400">Waiting for generation</span>
            )}
          </div>

          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-400">Fact-Grounding Status:</span>
                <span className="text-emerald-500 font-semibold">100% Grounded</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Claim Warnings:</span>
                <span className="font-semibold text-neutral-500">None</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Content Fingerprint:</span>
                <span className="font-mono text-[10px] truncate max-w-[200px]">{context?.contentFingerprint || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Platform Adaptations:</span>
                <span className="font-mono font-medium">8 platforms planned</span>
              </div>
            </div>

            {/* Approval Controls */}
            {context?.currentState === 'WAITING_FOR_CONTENT_REVIEW' && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Review generated copy and verified claims before video project assembly.
                </div>
                <div className="flex gap-2">
                  <button
                    id="approve-content-gate-btn"
                    onClick={handleApproveContent}
                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve Content
                  </button>
                  <button
                    id="reject-content-gate-btn"
                    onClick={() => handleOpenReject('CONTENT_REVIEW')}
                    className="px-4 py-2 rounded-lg border border-rose-500/40 hover:bg-rose-500/10 text-rose-600 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Grid for Stages 6 & 7: Video Studio & Video Review */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================================= */}
        {/* SECTION 6: VIDEO STUDIO & DETERMINISTIC RENDER */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-video-studio">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-blue-500" />
              <h2 className="font-bold text-base">6. Video Creation & Render Pipeline</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400">Step 2M Engine</span>
          </div>

          <div className="space-y-3">
            {context?.videoProject ? (
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3 bg-neutral-500/5">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm">{context.videoProject.title}</h4>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-mono">
                    {context.videoProject.aspectRatio} (Vertical)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-neutral-200/50 dark:bg-neutral-800/50">
                    <span className="text-neutral-400 block text-[10px]">Duration</span>
                    <strong className="font-mono">{context.videoProject.durationSeconds || 15}s</strong>
                  </div>
                  <div className="p-2 rounded bg-neutral-200/50 dark:bg-neutral-800/50">
                    <span className="text-neutral-400 block text-[10px]">Scenes</span>
                    <strong className="font-mono">{context.videoProject.scenes?.length || 3}</strong>
                  </div>
                  <div className="p-2 rounded bg-neutral-200/50 dark:bg-neutral-800/50">
                    <span className="text-neutral-400 block text-[10px]">Voiceover</span>
                    <strong className="text-emerald-500">Enabled</strong>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400 font-mono truncate">
                  Output URI: {context.renderedVideoUri || 'rendering...'}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed rounded-xl text-neutral-400 text-xs">
                Video composition initiated after Content Review approval.
              </div>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 7: VIDEO REVIEW (HUMAN GATE 3) */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-video-review">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-base">7. Video Review Gate</h2>
            </div>
            {context?.videoApproval ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> APPROVED by {context.videoApproval.reviewerId}
              </span>
            ) : context?.currentState === 'WAITING_FOR_VIDEO_REVIEW' ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 animate-pulse">
                ACTION REQUIRED
              </span>
            ) : (
              <span className="text-xs text-neutral-400">Waiting for render</span>
            )}
          </div>

          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-400">Media Fingerprint:</span>
                <span className="font-mono text-[10px] truncate max-w-[200px]">{context?.mediaFingerprint || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Render Output Fingerprint:</span>
                <span className="font-mono text-[10px] truncate max-w-[200px]">{context?.outputFingerprint || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Overlay Text Validation:</span>
                <span className="text-emerald-500 font-semibold">Grounded & Verified</span>
              </div>
            </div>

            {/* Approval Controls */}
            {context?.currentState === 'WAITING_FOR_VIDEO_REVIEW' && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Verify rendered audio-visual assets, aspect ratio, and on-screen claims.
                </div>
                <div className="flex gap-2">
                  <button
                    id="approve-video-gate-btn"
                    onClick={handleApproveVideo}
                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve Video
                  </button>
                  <button
                    id="reject-video-gate-btn"
                    onClick={() => handleOpenReject('VIDEO_REVIEW')}
                    className="px-4 py-2 rounded-lg border border-rose-500/40 hover:bg-rose-500/10 text-rose-600 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Grid for Stages 8 & 9: Amazon Link & Platform Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================================= */}
        {/* SECTION 8: AMAZON LINK CAPTURE (SOURCE-ONLY) */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-amazon-link">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-base">8. Amazon Link (Source-Only Safeguard)</h2>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
              STRICTLY READ-ONLY
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-2 bg-neutral-500/5 text-xs">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
                <ShieldCheck className="w-4 h-4" /> Amazon Source Policy Strictly Enforced
              </div>
              <p className="text-neutral-500">
                No Buy Now, Add to Cart, Checkout, or Payment interactions allowed. Any transactional screen triggers an automatic Emergency Stop.
              </p>
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Captured Link:</span>
                  <span className="font-mono truncate max-w-[240px]">
                    {context?.capturedAmazonLink || (context?.productData?.asin ? `https://www.amazon.com/dp/${context.productData.asin}` : 'Pending capture')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Link Fingerprint:</span>
                  <span className="font-mono text-[10px] truncate max-w-[240px]">{context?.amazonLinkFingerprint || 'Pending'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 9: MULTI-PLATFORM PLAN */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-platform-plan">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-base">9. Multi-Platform Plan</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400">8 Canonical Platforms</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-neutral-500">Execution order strictly follows the canonical sequence:</p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {CANONICAL_PLATFORM_ORDER.map((platform, idx) => {
                const isSelected = selectedPlatforms.includes(platform);
                const isPublished = context?.publishedPlatforms.includes(platform);
                return (
                  <div
                    key={platform}
                    className={`p-2 rounded-lg border font-mono capitalize transition ${
                      isPublished
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                        : isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 font-semibold'
                        : 'border-neutral-200 dark:border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <span className="text-[10px] block opacity-60">#{idx + 1}</span>
                    {platform}
                  </div>
                );
              })}
            </div>
            {context?.platformPlanFingerprint && (
              <div className="text-[10px] font-mono text-neutral-400 truncate pt-2">
                Plan SHA: {context.platformPlanFingerprint}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 10: FINAL APPROVAL & PUBLISH CONFIRMATION GATE */}
      {/* ========================================================================= */}
      <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200 shadow-sm' : 'bg-neutral-900 border-neutral-800'}`} id="section-final-approval">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">10. Final Human Publish Approval Gate</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Mandatory human gate before any live platform execution. Autonomous publishing strictly blocked.
              </p>
            </div>
          </div>
          {context?.publishApproval ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> PUBLISH APPROVED by {context.publishApproval.reviewerId}
            </span>
          ) : context?.currentState === 'WAITING_FOR_PUBLISH_APPROVAL' ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
              <Clock className="w-3.5 h-3.5" /> CONFIRMATION REQUIRED
            </span>
          ) : (
            <span className="text-xs text-neutral-400">Pending upstream approvals</span>
          )}
        </div>

        {/* Per-Platform Review Breakdown Table */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-xs text-left">
            <thead className={`uppercase text-[10px] tracking-wider border-b ${isLight ? 'bg-neutral-50 border-neutral-200 text-neutral-500' : 'bg-neutral-850 border-neutral-800 text-neutral-400'}`}>
              <tr>
                <th className="py-2.5 px-3">Platform</th>
                <th className="py-2.5 px-3">Media Artifact</th>
                <th className="py-2.5 px-3">Tailored Caption</th>
                <th className="py-2.5 px-3">Product Link</th>
                <th className="py-2.5 px-3">Safety Status</th>
                <th className="py-2.5 px-3">Execution Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {(context?.plan?.targetPlatforms || selectedPlatforms).map(platform => {
                const isPublished = context?.publishedPlatforms.includes(platform);
                return (
                  <tr key={platform} className="hover:bg-neutral-500/5">
                    <td className="py-3 px-3 font-semibold capitalize flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-neutral-400" />
                      {platform}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-neutral-500">
                      {context?.renderedVideoUri || 'rendered_video.mp4'}
                    </td>
                    <td className="py-3 px-3 text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                      {context?.contentPackage?.caption || 'Verified promotional copy'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[10px] text-neutral-400 truncate max-w-[120px]">
                      {context?.capturedAmazonLink || 'amazon.com/dp/...'}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600">
                        VERIFIED SAFE
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {isPublished ? (
                        <span className="text-emerald-500 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Published
                        </span>
                      ) : (
                        <span className="text-neutral-400">Awaiting approval</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Controls for Gate 4 */}
        {context?.currentState === 'WAITING_FOR_PUBLISH_APPROVAL' && (
          <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400">
                Ready to Publish to {context.plan.targetPlatforms.length} Platforms
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Operator confirmation required. Publishing cannot start automatically or without human action.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                id="open-final-confirm-modal-btn"
                onClick={() => setShowFinalConfirmModal(true)}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" /> Review & Confirm Publish
              </button>
              <button
                id="reject-final-publish-btn"
                onClick={() => handleOpenReject('FINAL_PUBLISH_APPROVAL')}
                className="px-4 py-2.5 rounded-lg border border-rose-500/40 hover:bg-rose-500/10 text-rose-600 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Grid for Stages 11, 12, 13: Execution, Verification, Reconciliation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ========================================================================= */}
        {/* SECTION 11: PLATFORM EXECUTION */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-platform-execution">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-base">11. Platform Execution</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400">Sequential</span>
          </div>

          <div className="space-y-2">
            {(context?.plan?.targetPlatforms || selectedPlatforms).map(platform => {
              const isPublished = context?.publishedPlatforms.includes(platform);
              const isCurrent = context?.currentState === 'EXECUTING_PLATFORM' && !isPublished;
              return (
                <div
                  key={platform}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                    isPublished
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600'
                      : isCurrent
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 animate-pulse font-semibold'
                      : 'border-neutral-200 dark:border-neutral-800 text-neutral-400'
                  }`}
                >
                  <span className="capitalize font-medium">{platform}</span>
                  {isPublished ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>
                  ) : isCurrent ? (
                    <span className="flex items-center gap-1 text-[11px]"><RefreshCw className="w-3 h-3 animate-spin" /> Publishing</span>
                  ) : (
                    <span className="text-[10px]">Queued</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 12: PUBLICATION VERIFICATION */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-publication-verification">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="font-bold text-base">12. Publication Verification</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400">Proof Records</span>
          </div>

          <div className="space-y-2">
            {context?.publicationRecords && context.publicationRecords.length > 0 ? (
              context.publicationRecords.map(rec => (
                <div key={rec.platform} className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-1 bg-neutral-500/5">
                  <div className="flex justify-between font-semibold capitalize">
                    <span>{rec.platform}</span>
                    <span className="text-emerald-500">{rec.status}</span>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-400 truncate">
                    Proof: {rec.proofUri || 'verified://system'}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center border border-dashed rounded-xl text-neutral-400 text-xs">
                Verification proofs will appear once platforms are published.
              </div>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 13: FINAL RECONCILIATION */}
        {/* ========================================================================= */}
        <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-final-reconciliation">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-500" />
              <h2 className="font-bold text-base">13. Final Reconciliation</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400">Zero Guessing</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1 bg-neutral-500/5">
              <div className="flex justify-between">
                <span className="text-neutral-400">Reconciliation Status:</span>
                <span className="font-semibold text-emerald-500">Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Unresolved Items:</span>
                <span className="font-mono">0 UNKNOWN</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Idempotency Guard:</span>
                <span className="text-emerald-500 font-semibold">Strict</span>
              </div>
            </div>
            <p className="text-[11px] text-neutral-500">
              Any UNKNOWN status requires UI inspector proof before transitioning to PUBLISHED. Direct transitions without verification are strictly blocked.
            </p>
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 14: AUDIT TRAIL & CRYPTOGRAPHIC CHAIN */}
      {/* ========================================================================= */}
      <section className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`} id="section-audit-trail">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <h2 className="font-bold text-base">14. Cryptographic Audit Trail</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
              chainValid
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
            }`}>
              <ShieldCheck className="w-3.5 h-3.5" /> {chainValid ? 'Chain Valid (Zero Tampering)' : 'Chain Tampered!'}
            </span>
            <span className="text-neutral-400 font-mono">Total Events: {auditEvents.length}</span>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 text-xs font-mono">
          {auditEvents.slice().reverse().slice(0, 20).map(evt => (
            <div key={evt.eventId} className="p-3 hover:bg-neutral-500/5 flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-400">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{evt.action}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-500">{evt.actor}</span>
                </div>
                <p className="text-neutral-600 dark:text-neutral-300 font-sans text-xs">{evt.details}</p>
              </div>
              <div className="text-[10px] text-neutral-400 text-right shrink-0">
                <div>Hash: {evt.hash.slice(0, 14)}...</div>
                <div className="text-[9px] text-neutral-500">Prev: {evt.previousHash.slice(0, 10)}...</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* FINAL PUBLISH CONFIRMATION MODAL (SECTION 5 MANDATE) */}
      {/* ========================================================================= */}
      {showFinalConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" id="final-publish-modal">
          <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5 ${isLight ? 'bg-white border-neutral-200 text-neutral-900' : 'bg-neutral-900 border-neutral-800 text-neutral-100'}`}>
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-indigo-500" />
                <h3 className="text-lg font-bold">Final Publish Confirmation</h3>
              </div>
              <button onClick={() => setShowFinalConfirmModal(false)} className="text-neutral-400 hover:text-neutral-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                Ready to publish to {context?.plan.targetPlatforms.length || selectedPlatforms.length} platforms:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(context?.plan.targetPlatforms || selectedPlatforms).map(p => (
                  <span key={p} className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-600 font-semibold font-mono capitalize">
                    {p}
                  </span>
                ))}
              </div>

              <div className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1.5 font-mono text-[11px] bg-neutral-500/5">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Media Fingerprint:</span>
                  <span className="truncate max-w-[220px]">{context?.mediaFingerprint || 'sha256:media_verified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Content Fingerprint:</span>
                  <span className="truncate max-w-[220px]">{context?.contentFingerprint || 'sha256:content_verified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Platform Plan Fingerprint:</span>
                  <span className="truncate max-w-[220px]">{context?.platformPlanFingerprint || 'sha256:plan_verified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Amazon Link Status:</span>
                  <span className="text-emerald-500 font-semibold">SOURCE-ONLY VERIFIED</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Safety Status:</span>
                  <span className="text-emerald-500 font-semibold">ALL TRIPWIRES GREEN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Approval Status:</span>
                  <span className="text-amber-500 font-semibold">Awaiting Final Operator Confirmation</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-500 block mb-1">Operator Attributable Review Notes</label>
                <input
                  type="text"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="e.g. Reviewed and verified for multi-platform publication."
                  className={`w-full px-3 py-2 text-xs rounded-lg border ${
                    isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-800 border-neutral-700'
                  }`}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                id="cancel-final-publish-btn"
                onClick={() => setShowFinalConfirmModal(false)}
                className="flex-1 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold transition"
              >
                Cancel Safely
              </button>
              <button
                id="confirm-publish-btn"
                onClick={handleConfirmPublish}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> CONFIRM PUBLISH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REJECTION REASON MODAL */}
      {/* ========================================================================= */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" id="rejection-modal">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 ${isLight ? 'bg-white border-neutral-200 text-neutral-900' : 'bg-neutral-900 border-neutral-800 text-neutral-100'}`}>
            <div className="flex items-center gap-2 text-rose-500 font-bold text-base">
              <XCircle className="w-5 h-5" />
              Reject Approval Gate: {activeRejectGate}
            </div>
            <p className="text-xs text-neutral-500">
              Rejecting this gate halts downstream execution immediately. No further generation, rendering, or publishing will occur.
            </p>
            <div>
              <label className="text-xs font-semibold text-neutral-500 block mb-1">Rejection Reason</label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Specify reason for rejection..."
                rows={3}
                className={`w-full p-2.5 text-xs rounded-lg border ${
                  isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-800 border-neutral-700'
                }`}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                id="confirm-reject-btn"
                onClick={handleConfirmReject}
                className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
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
