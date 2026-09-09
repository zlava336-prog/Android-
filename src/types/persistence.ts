/**
 * Phone Agent - Step 2I Persistent Job Store & Crash Recovery Types
 * Strict typing for durable local job states, audit trails, and reconciliation.
 */

import { SupportedPlatform, NormalizedContentPayload, ApprovalLevel } from './job';

export const CURRENT_SCHEMA_VERSION = 2;

export type PersistentJobStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'READY'
  | 'WAITING_FOR_APPROVAL'
  | 'RUNNING'
  | 'PUBLISHED'
  | 'PARTIALLY_PUBLISHED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type PlatformExecutionStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'READY'
  | 'WAITING_FOR_APPROVAL'
  | 'RUNNING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type PersistentApprovalState =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'INVALIDATED';

export type SafeCheckpoint =
  | 'PACKAGE_VERIFIED'
  | 'READY_STATE_VERIFIED'
  | 'MEDIA_SELECTED'
  | 'CONTENT_ENTERED'
  | 'FINAL_SCREEN_VERIFIED'
  | 'APPROVAL_GRANTED'
  | 'PUBLISH_ACTION_STARTED'
  | 'PUBLICATION_VERIFICATION_STARTED'
  | 'PUBLICATION_CONFIRMED';

export type PublicationVerificationState =
  | 'UNVERIFIED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'FAILED_VERIFICATION';

export type ReconciliationOutcome =
  | 'CONFIRMED_PUBLISHED'
  | 'CONFIRMED_NOT_PUBLISHED'
  | 'STILL_UNKNOWN'
  | 'SECURITY_BLOCKED';

export interface PersistentApprovalRecord {
  approvalLevel: ApprovalLevel;
  approvalState: PersistentApprovalState;
  approvalTimestamp: number;
  approvedJobFingerprint: string;
  approvedPlatform?: SupportedPlatform;
  approvalSessionId: string;
  approvedBy?: string;
  invalidationReason?: string;
}

export interface PlatformExecutionState {
  platform: SupportedPlatform;
  status: PlatformExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  approvalState: PersistentApprovalState;
  expectedPackage: string;
  contentFingerprint: string;
  attemptCount: number;
  lastErrorCode?: string;
  lastSafeCheckpoint?: SafeCheckpoint;
  publicationVerificationState: PublicationVerificationState;
  errorMessage?: string;
  reconciliationNotes?: string;
}

export interface ExecutionLease {
  jobId: string;
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface PersistentJob {
  jobId: string;
  createdAt: number;
  updatedAt: number;
  status: PersistentJobStatus;
  approvalLevel: ApprovalLevel;
  approvalRecord?: PersistentApprovalRecord;
  mediaReference?: string;
  normalizedBasePayload: NormalizedContentPayload;
  selectedPlatforms: SupportedPlatform[];
  platformExecutionStates: Record<SupportedPlatform, PlatformExecutionState>;
  currentPlatform?: SupportedPlatform | null;
  executionSequence: SupportedPlatform[];
  contentFingerprint: string;
  mediaFingerprint?: string;
  contentPackageId?: string;
  contentValidationState?: string;
  contentReviewState?: string;
  platformOverrideFingerprints?: Record<string, string>;
  contentPackageSnapshot?: Record<string, unknown>;
  retryMetadata: {
    totalAttempts: number;
    maxAttempts: number;
    lastAttemptTimestamp?: number;
    interruptedAt?: number;
  };
  emergencyStopState: {
    isActive: boolean;
    reason?: string;
    stoppedAt?: number;
  };
  auditMetadata: {
    clientVersion: string;
    deviceIdentifier?: string;
    creationSource: string;
    checksum: string;
  };
  schemaVersion: number;
}

export interface PersistentAuditEvent {
  id: string;
  timestamp: number;
  jobId: string;
  platform?: SupportedPlatform;
  previousState?: string;
  newState?: string;
  eventType:
    | 'JOB_CREATED'
    | 'JOB_UPDATED'
    | 'STATE_TRANSITION'
    | 'PLATFORM_STARTED'
    | 'PLATFORM_COMPLETED'
    | 'PLATFORM_FAILED'
    | 'PLATFORM_UNKNOWN'
    | 'CHECKPOINT_REACHED'
    | 'RECOVERY_STARTED'
    | 'RECOVERY_COMPLETED'
    | 'RECONCILIATION_STARTED'
    | 'RECONCILIATION_RESULT'
    | 'APPROVAL_CREATED'
    | 'APPROVAL_INVALIDATED'
    | 'EMERGENCY_STOP_PERSISTED'
    | 'EMERGENCY_STOP_CLEARED'
    | 'LEASE_ACQUIRED'
    | 'LEASE_RELEASED'
    | 'LEASE_EXPIRED'
    | 'JOB_CANCELLED'
    | 'JOB_ARCHIVED';
  contentFingerprint?: string;
  reason?: string;
  details?: string;
  integrityHash: string;
}

export interface StorageSchema {
  version: number;
  jobs: Record<string, PersistentJob>;
  auditLogs: PersistentAuditEvent[];
  leases: Record<string, ExecutionLease>;
  emergencyStop: {
    active: boolean;
    reason?: string;
    timestamp?: number;
  };
  migratedAt?: number;
  // Step 2K Product Research Persistence
  researchSessions?: Record<string, any>;
  products?: Record<string, any>;
  productApprovals?: Record<string, any>;
  indexedProducts?: any[];
  // Step 2L AI Content Generation Persistence
  aiGenerations?: Record<string, any>;
}
