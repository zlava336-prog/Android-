/**
 * Phone Agent - Core Types and Models
 * Strict safety definitions and job execution states.
 */

export type JobState =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'OPENING_APP'
  | 'WAITING_FOR_READY'
  | 'SELECTING_MEDIA'
  | 'ENTERING_METADATA'
  | 'VERIFYING_PREVIEW'
  | 'WAITING_FOR_APPROVAL'
  | 'PUBLISHING'
  | 'VERIFYING_RESULT'
  | 'COMPLETED'
  | 'FAILED'
  | 'STOPPED';

export type SupportedPlatform =
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'x'
  | 'threads'
  | 'linkedin'
  | 'amazon';

export type JobAction =
  | 'publish_reel'
  | 'publish_short'
  | 'publish_post'
  | 'publish_video'
  | 'publish_pin'
  | 'publish_thread'
  | 'extract_product_link';

export interface JobModel {
  jobId: string;
  platform: SupportedPlatform;
  action: JobAction;
  videoUri?: string;
  imageUri?: string;
  caption?: string;
  title?: string;
  description?: string;
  board?: string;
  hashtags?: string[];
  coverUri?: string;
  productSearchQuery?: string;
  productUrl?: string;
  requiresApproval: boolean;
  timestamp?: number;
  extractedUrl?: string;
}

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR' | 'SECURITY' | 'ACTION';

export interface ActionLog {
  id: string;
  timestamp: number;
  jobId?: string;
  platform?: SupportedPlatform;
  action: string;
  details: string;
  nodeId?: string;
  severity: LogSeverity;
  safetyCheckPassed: boolean;
}

export interface UiNode {
  id: string;
  text?: string;
  contentDescription?: string;
  className: string;
  isClickable: boolean;
  isEditable?: boolean;
  isVisible: boolean;
  packageName: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface SecurityTripwireResult {
  tripped: boolean;
  reason?: string;
  detectedElement?: string;
}

export interface BackendConfig {
  apiBaseUrl: string;
  websocketUrl: string;
  deviceId: string;
  authToken: string;
  connected: boolean;
  heartbeatIntervalSec: number;
}

export type PlatformJobStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'READY'
  | 'WAITING_FOR_APPROVAL'
  | 'RUNNING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type ApprovalLevel = 'JOB_APPROVAL' | 'PLATFORM_APPROVAL';

export interface NormalizedContentPayload {
  text?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  mediaUri?: string;
  imageUri?: string;
  videoUri?: string;
  coverUri?: string;
  metadata?: Record<string, unknown>;
}

export interface MultiPlatformJob {
  jobId: string;
  mediaUri?: string;
  imageUri?: string;
  videoUri?: string;
  contentPayload: NormalizedContentPayload;
  selectedPlatforms: SupportedPlatform[];
  perPlatformStatus: Partial<Record<SupportedPlatform, PlatformJobStatus>>;
  approvalLevel: ApprovalLevel;
  approvalState: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdTimestamp: number;
  auditMetadata: Record<string, unknown>;
}

export interface PlannerError {
  platform?: string;
  field?: string;
  code: string;
  message: string;
}

export interface PlatformExecutionStep {
  platform: SupportedPlatform;
  adapterId: string;
  action: JobAction;
  payload: NormalizedContentPayload;
  requiresApproval: boolean;
  status: PlatformJobStatus;
  fingerprint: string;
  error?: string;
  publishedAt?: number;
  message?: string;
}

export interface MultiPlatformExecutionPlan {
  jobId: string;
  fingerprint: string;
  steps: PlatformExecutionStep[];
  approvalLevel: ApprovalLevel;
  createdTimestamp: number;
}

