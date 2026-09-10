/**
 * Phone Agent - Step 2N Orchestration Context
 * Unified, serializable runtime and persistent state model for a workflow execution.
 */

import { SupportedPlatform } from '../../types/job';
import { MultiPlatformExecutionPlan } from '../../types/job';
import { ProductData } from '../product/ProductData';
import { ContentPackage } from '../content/ContentPackage';
import { VideoProject } from '../video/VideoProject';
import { VideoRenderJob } from '../video/VideoRenderJob';
import { OrchestrationState } from './OrchestrationState';
import { OrchestrationStep, OrchestrationStepType, createInitialWorkflowSteps } from './OrchestrationStep';
import { OrchestrationPlan } from './OrchestrationPlan';
import { GateApprovalRecord } from './OrchestrationApprovalManager';

export interface PublicationItemRecord {
  platform: SupportedPlatform;
  idempotencyTuple: string; // e.g. "jobId:platform:fingerprint"
  status: 'PUBLISHED' | 'FAILED' | 'UNKNOWN' | 'PENDING';
  publishedAt?: number;
  proofUri?: string;
  errorMessage?: string;
}

export interface OrchestrationContext {
  orchestrationId: string;
  currentState: OrchestrationState;
  currentStep: OrchestrationStepType;
  steps: OrchestrationStep[];
  plan: OrchestrationPlan;

  // Artifacts & Fingerprints
  productData?: ProductData;
  productFingerprint?: string;

  contentPackage?: ContentPackage;
  contentFingerprint?: string;
  mediaFingerprint?: string;

  videoProject?: VideoProject;
  videoRenderJob?: VideoRenderJob;
  videoFingerprint?: string;
  outputFingerprint?: string;
  renderedVideoUri?: string;

  capturedAmazonLink?: string;
  amazonLinkFingerprint?: string;

  platformPlan?: MultiPlatformExecutionPlan;
  platformPlanFingerprint?: string;

  // Approvals
  productApproval?: GateApprovalRecord;
  contentApproval?: GateApprovalRecord;
  videoApproval?: GateApprovalRecord;
  publishApproval?: GateApprovalRecord;

  // Execution & Publication Tracking
  publishedPlatforms: SupportedPlatform[];
  publicationRecords: PublicationItemRecord[];

  // Safety & Recovery
  consecutiveFailures: number;
  isPaused: boolean;
  pauseReason?: string;
  isEmergencyStopped: boolean;
  emergencyStopReason?: string;
  isCancelled?: boolean;
  cancelReason?: string;

  createdAt: number;
  updatedAt: number;
}

export function createInitialContext(plan: OrchestrationPlan): OrchestrationContext {
  const steps = createInitialWorkflowSteps();
  return {
    orchestrationId: plan.planId,
    currentState: 'IDLE',
    currentStep: 'START',
    steps,
    plan,
    publishedPlatforms: [],
    publicationRecords: [],
    consecutiveFailures: 0,
    isPaused: false,
    isEmergencyStopped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
