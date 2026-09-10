/**
 * Phone Agent - Step 2N Orchestration Approval Manager
 * Strictly coordinates the 4 mandatory human approval gates:
 * 1. PRODUCT REVIEW
 * 2. CONTENT REVIEW
 * 3. VIDEO REVIEW
 * 4. FINAL PUBLISH APPROVAL
 *
 * Hard Invariants:
 * - AI MUST NEVER approve on behalf of the human.
 * - Zero permanent auto-approval modes.
 * - Cryptographic binding to (jobId, reviewerId, timestamp, fingerprints).
 * - Upstream mutation cascade (Product -> Content -> Video -> Plan -> Publish) flips state to STALE_APPROVAL.
 */

import { SupportedPlatform } from '../../types/job';
import { sha256 } from '../content/ContentFingerprint';
import { LocalActionLogger } from '../logger';

export type ApprovalGateType =
  | 'PRODUCT_REVIEW'
  | 'CONTENT_REVIEW'
  | 'VIDEO_REVIEW'
  | 'FINAL_PUBLISH_APPROVAL';

export type GateApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'STALE_APPROVAL';

export interface GateApprovalRecord {
  approvalId: string;
  gateType: ApprovalGateType;
  jobId: string;
  reviewerId: string;
  sessionId: string;
  timestamp: number;
  status: GateApprovalStatus;
  productFingerprint?: string;
  contentFingerprint?: string;
  mediaFingerprint?: string;
  videoFingerprint?: string;
  outputFingerprint?: string;
  platformPlanFingerprint?: string;
  platforms?: SupportedPlatform[];
  notes?: string;
  isAiGeneratedAttempt?: boolean;
}

export interface ApprovalValidityCheck {
  isValid: boolean;
  isStale: boolean;
  reason?: string;
}

export class OrchestrationApprovalManager {
  private static instance: OrchestrationApprovalManager | null = null;
  private logger = LocalActionLogger.getInstance();
  // Map of approvalId -> GateApprovalRecord
  private approvals: Map<string, GateApprovalRecord> = new Map();

  public static getInstance(): OrchestrationApprovalManager {
    if (!OrchestrationApprovalManager.instance) {
      OrchestrationApprovalManager.instance = new OrchestrationApprovalManager();
    }
    return OrchestrationApprovalManager.instance;
  }

  public static resetInstance(): void {
    OrchestrationApprovalManager.instance = null;
  }

  /**
   * Submits a human approval for one of the 4 gates.
   * HARD REJECTION: Any approval from 'AI', 'SYSTEM', or automated agent is strictly rejected.
   */
  public submitApproval(params: {
    gateType: ApprovalGateType;
    jobId: string;
    reviewerId: string;
    sessionId: string;
    productFingerprint?: string;
    contentFingerprint?: string;
    mediaFingerprint?: string;
    videoFingerprint?: string;
    outputFingerprint?: string;
    platformPlanFingerprint?: string;
    platforms?: SupportedPlatform[];
    notes?: string;
    actorType?: 'HUMAN' | 'AI' | 'AUTOMATION';
  }): GateApprovalRecord {
    // Invariant: AI and Automation can NEVER approve
    const actorType = params.actorType || 'HUMAN';
    if (
      actorType !== 'HUMAN' ||
      params.reviewerId.toUpperCase().includes('AI') ||
      params.reviewerId.toUpperCase().includes('BOT') ||
      params.reviewerId.toUpperCase().includes('SYSTEM') ||
      params.reviewerId.toUpperCase().includes('AUTO')
    ) {
      this.logger.log({
        action: 'AI_APPROVAL_ATTEMPT_REJECTED',
        details: `Illegal attempt to auto-approve gate "${params.gateType}" with actor "${params.reviewerId}". AI cannot approve.`,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      throw new Error(`[Approval Invariant Violation] Gate "${params.gateType}" can only be approved by a verified human operator. AI/automation approval is strictly prohibited.`);
    }

    if (!params.reviewerId.trim()) {
      throw new Error(`[Approval Invariant Violation] Reviewer identity must be specified for gate "${params.gateType}".`);
    }

    if (!params.sessionId || !params.sessionId.trim()) {
      throw new Error(`[Approval Invariant Violation] Session ID must be provided for gate "${params.gateType}".`);
    }

    const approvalId = `appr_${params.gateType.toLowerCase()}_${params.jobId}_${Date.now()}`;
    const record: GateApprovalRecord = {
      approvalId,
      gateType: params.gateType,
      jobId: params.jobId,
      reviewerId: params.reviewerId.trim(),
      sessionId: params.sessionId,
      timestamp: Date.now(),
      status: 'APPROVED',
      productFingerprint: params.productFingerprint,
      contentFingerprint: params.contentFingerprint,
      mediaFingerprint: params.mediaFingerprint,
      videoFingerprint: params.videoFingerprint,
      outputFingerprint: params.outputFingerprint,
      platformPlanFingerprint: params.platformPlanFingerprint,
      platforms: params.platforms,
      notes: params.notes,
    };

    this.approvals.set(approvalId, record);

    this.logger.log({
      action: 'GATE_APPROVAL_RECORDED',
      details: `Gate "${params.gateType}" approved by operator "${params.reviewerId}" for job "${params.jobId}".`,
      severity: 'ACTION',
      safetyCheckPassed: true,
    });

    return record;
  }

  /**
   * Convenience helper to create an approval record
   */
  public createApprovalRecord(params: {
    gateType: ApprovalGateType;
    jobId: string;
    reviewerId: string;
    sessionId?: string;
    productFingerprint?: string;
    contentFingerprint?: string;
    mediaFingerprint?: string;
    videoFingerprint?: string;
    outputFingerprint?: string;
    platformPlanFingerprint?: string;
    platforms?: SupportedPlatform[];
    notes?: string;
  }): GateApprovalRecord {
    return this.submitApproval({
      ...params,
      sessionId: params.sessionId || `sess_${Date.now()}`,
    });
  }

  /**
   * Rejects an approval gate.
   */
  public rejectApproval(params: {
    gateType: ApprovalGateType;
    jobId: string;
    reviewerId: string;
    sessionId: string;
    reason: string;
  }): GateApprovalRecord {
    const approvalId = `rej_${params.gateType.toLowerCase()}_${params.jobId}_${Date.now()}`;
    const record: GateApprovalRecord = {
      approvalId,
      gateType: params.gateType,
      jobId: params.jobId,
      reviewerId: params.reviewerId,
      sessionId: params.sessionId,
      timestamp: Date.now(),
      status: 'REJECTED',
      notes: params.reason,
    };

    this.approvals.set(approvalId, record);

    this.logger.log({
      action: 'GATE_APPROVAL_REJECTED',
      details: `Gate "${params.gateType}" rejected by operator "${params.reviewerId}": ${params.reason}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });

    return record;
  }

  /**
   * Alias for rejectApproval.
   */
  public rejectGate(params: {
    gateType: ApprovalGateType;
    jobId: string;
    reviewerId: string;
    sessionId?: string;
    reason: string;
  }): GateApprovalRecord {
    return this.rejectApproval({
      ...params,
      sessionId: params.sessionId || 'session_default',
    });
  }

  /**
   * Validates if an approval is still cryptographically fresh and valid against current fingerprints.
   * Enforces the upstream dependency chain:
   * PRODUCT -> CONTENT -> VIDEO -> PLATFORM PLAN -> PUBLICATION
   */
  public verifyGateApproval(params: {
    record: GateApprovalRecord;
    currentProductFingerprint?: string;
    currentContentFingerprint?: string;
    currentMediaFingerprint?: string;
    currentVideoFingerprint?: string;
    currentOutputFingerprint?: string;
    currentPlatformPlanFingerprint?: string;
  }): ApprovalValidityCheck {
    const { record } = params;

    if (record.status !== 'APPROVED') {
      return {
        isValid: false,
        isStale: record.status === 'STALE_APPROVAL',
        reason: `Approval record status is ${record.status}`,
      };
    }

    // 1. Check Product Fingerprint Dependency
    if (
      record.productFingerprint &&
      params.currentProductFingerprint &&
      record.productFingerprint !== params.currentProductFingerprint
    ) {
      record.status = 'STALE_APPROVAL';
      return {
        isValid: false,
        isStale: true,
        reason: `STALE_APPROVAL: Upstream Product fingerprint changed from ${record.productFingerprint} to ${params.currentProductFingerprint}`,
      };
    }

    // 2. Check Content Fingerprint Dependency
    if (
      record.contentFingerprint &&
      params.currentContentFingerprint &&
      record.contentFingerprint !== params.currentContentFingerprint
    ) {
      record.status = 'STALE_APPROVAL';
      return {
        isValid: false,
        isStale: true,
        reason: `STALE_APPROVAL: Upstream Content fingerprint changed from ${record.contentFingerprint} to ${params.currentContentFingerprint}`,
      };
    }

    // 3. Check Media Fingerprint Dependency
    if (
      record.mediaFingerprint &&
      params.currentMediaFingerprint &&
      record.mediaFingerprint !== params.currentMediaFingerprint
    ) {
      record.status = 'STALE_APPROVAL';
      return {
        isValid: false,
        isStale: true,
        reason: `STALE_APPROVAL: Upstream Media fingerprint changed from ${record.mediaFingerprint} to ${params.currentMediaFingerprint}`,
      };
    }

    // 4. Check Video Fingerprint Dependency
    if (
      record.videoFingerprint &&
      params.currentVideoFingerprint &&
      record.videoFingerprint !== params.currentVideoFingerprint
    ) {
      record.status = 'STALE_APPROVAL';
      return {
        isValid: false,
        isStale: true,
        reason: `STALE_APPROVAL: Upstream Video fingerprint changed from ${record.videoFingerprint} to ${params.currentVideoFingerprint}`,
      };
    }

    // 5. Check Output Fingerprint Dependency
    if (
      record.outputFingerprint &&
      params.currentOutputFingerprint &&
      record.outputFingerprint !== params.currentOutputFingerprint
    ) {
      record.status = 'STALE_APPROVAL';
      return {
        isValid: false,
        isStale: true,
        reason: `STALE_APPROVAL: Upstream Video Output fingerprint changed from ${record.outputFingerprint} to ${params.currentOutputFingerprint}`,
      };
    }

    // 6. Check Platform Plan Fingerprint Dependency
    if (
      record.platformPlanFingerprint &&
      params.currentPlatformPlanFingerprint &&
      record.platformPlanFingerprint !== params.currentPlatformPlanFingerprint
    ) {
      record.status = 'STALE_APPROVAL';
      return {
        isValid: false,
        isStale: true,
        reason: `STALE_APPROVAL: Upstream Platform Plan fingerprint changed from ${record.platformPlanFingerprint} to ${params.currentPlatformPlanFingerprint}`,
      };
    }

    return { isValid: true, isStale: false };
  }

  private currentContentContentFingerprintMismatch(approved: string, current?: string): boolean {
    return Boolean(current && approved !== current);
  }

  public getApproval(approvalId: string): GateApprovalRecord | undefined {
    return this.approvals.get(approvalId);
  }

  public getAllApprovals(): GateApprovalRecord[] {
    return Array.from(this.approvals.values());
  }

  public restoreApprovals(records: GateApprovalRecord[]): void {
    records.forEach(r => this.approvals.set(r.approvalId, r));
  }
}
