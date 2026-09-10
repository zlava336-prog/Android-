/**
 * Phone Agent - Step 2M Video Review Manager
 * Controls human video approval, cryptographic fingerprint binding, and stale approval detection.
 * Invariant: Video generation can NEVER approve itself.
 * If project, media, or product fingerprints mutate post-approval, status flips to STALE_APPROVAL.
 */

import { VideoProject, VideoApprovalRecord } from './VideoProject';
import { ApprovedVideoArtifact } from './ApprovedVideoArtifact';
import { VideoRenderJob } from './VideoRenderJob';
import { SupportedPlatform } from '../../types/job';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';

export class VideoReviewManager {
  private static instance: VideoReviewManager | null = null;
  private logger = LocalActionLogger.getInstance();
  private emergencyStop = EmergencyStopManager.getInstance();
  private approvedArtifacts: Map<string, ApprovedVideoArtifact> = new Map();

  public static getInstance(): VideoReviewManager {
    if (!VideoReviewManager.instance) {
      VideoReviewManager.instance = new VideoReviewManager();
    }
    return VideoReviewManager.instance;
  }

  public static resetInstance(): void {
    VideoReviewManager.instance = null;
  }

  /**
   * Evaluates if a previously approved project is now stale due to mutations in inputs.
   */
  public checkStaleness(
    project: VideoProject,
    currentOutputFingerprint?: string
  ): { isStale: boolean; reason?: string } {
    if (project.reviewStatus !== 'APPROVED') {
      return { isStale: false };
    }

    if (!project.approvalRecord) {
      return { isStale: true, reason: 'Approved project missing approval record binding.' };
    }

    const rec = project.approvalRecord;

    if (rec.projectFingerprint !== project.projectFingerprint) {
      return {
        isStale: true,
        reason: `Project fingerprint mismatch: approved with ${rec.projectFingerprint}, current is ${project.projectFingerprint}.`,
      };
    }

    if (rec.productFingerprint !== project.productFingerprint) {
      return {
        isStale: true,
        reason: `Product fingerprint mismatch: approved with ${rec.productFingerprint}, current is ${project.productFingerprint}.`,
      };
    }

    if (rec.contentFingerprint !== project.contentFingerprint) {
      return {
        isStale: true,
        reason: `Content fingerprint mismatch: approved with ${rec.contentFingerprint}, current is ${project.contentFingerprint}.`,
      };
    }

    if (currentOutputFingerprint && rec.renderedMediaFingerprint !== currentOutputFingerprint) {
      return {
        isStale: true,
        reason: `Rendered media fingerprint mismatch: approved with ${rec.renderedMediaFingerprint}, current is ${currentOutputFingerprint}.`,
      };
    }

    return { isStale: false };
  }

  /**
   * Applies staleness protection: if stale, mutates status to STALE_APPROVAL and logs audit event.
   */
  public invalidateIfStale(project: VideoProject, currentOutputFingerprint?: string): boolean {
    const staleness = this.checkStaleness(project, currentOutputFingerprint);
    if (staleness.isStale) {
      project.reviewStatus = 'STALE_APPROVAL';
      this.approvedArtifacts.delete(project.projectId);

      this.logger.log({
        action: 'VIDEO_APPROVAL_STALE',
        details: `Approval invalidated for project "${project.projectId}". Reason: ${staleness.reason}`,
        severity: 'WARN',
        safetyCheckPassed: true,
      });
      return true;
    }
    return false;
  }

  /**
   * Human operator approves the rendered video project.
   * Creates an immutable ApprovedVideoArtifact for downstream planning.
   */
  public approve(
    project: VideoProject,
    renderJob: VideoRenderJob,
    reviewerId: string,
    targetPlatforms: SupportedPlatform[] = ['instagram', 'tiktok', 'youtube'],
    notes?: string
  ): ApprovedVideoArtifact {
    // 1. Emergency Stop Check
    if (this.emergencyStop.isActive()) {
      const msg = `Approval blocked: Emergency Stop is active (${this.emergencyStop.getReason()}).`;
      this.logger.log({
        action: 'VIDEO_REVIEW_BLOCKED',
        details: msg,
        severity: 'ERROR',
        safetyCheckPassed: false,
      });
      throw new Error(msg);
    }

    // 2. Validate render output state
    if (renderJob.status !== 'READY_FOR_REVIEW' && renderJob.status !== 'APPROVED') {
      throw new Error(
        `Cannot approve project: render job status must be READY_FOR_REVIEW, got "${renderJob.status}".`
      );
    }

    if (!renderJob.outputResult || !renderJob.outputResult.outputFingerprint) {
      throw new Error('Cannot approve project: rendered output media is missing.');
    }

    if (!reviewerId || reviewerId.trim().length === 0) {
      throw new Error('Human reviewer identity is required for approval.');
    }

    // Filter out forbidden platforms (e.g. Amazon)
    const sanitizedPlatforms = targetPlatforms.filter(p => (p as string) !== 'amazon');
    if (sanitizedPlatforms.length === 0) {
      throw new Error('Target platforms list cannot be empty or contain only Amazon.');
    }

    const now = Date.now();
    const outputFingerprint = renderJob.outputResult.outputFingerprint;

    const approvalRecord: VideoApprovalRecord = {
      approvalId: `vapp_${now}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.projectId,
      reviewerId: reviewerId.trim(),
      approvedAt: now,
      projectFingerprint: project.projectFingerprint,
      renderedMediaFingerprint: outputFingerprint,
      contentFingerprint: project.contentFingerprint,
      productFingerprint: project.productFingerprint,
      notes,
    };

    project.approvalRecord = approvalRecord;
    project.reviewStatus = 'APPROVED';
    renderJob.status = 'APPROVED';

    const artifact: ApprovedVideoArtifact = {
      artifactId: `art_${now}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.projectId,
      artifactUri: renderJob.outputResult.outputUri,
      outputFingerprint,
      contentFingerprint: project.contentFingerprint,
      productFingerprint: project.productFingerprint,
      projectFingerprint: project.projectFingerprint,
      approvedPlatformTargets: sanitizedPlatforms,
      approvedBy: reviewerId.trim(),
      approvedAt: now,
      durationMs: renderJob.outputResult.durationMs,
      dimensions: {
        width: renderJob.outputResult.width,
        height: renderJob.outputResult.height,
      },
      notes,
    };

    this.approvedArtifacts.set(project.projectId, artifact);

    this.logger.log({
      action: 'VIDEO_REVIEW_APPROVED',
      details: `Project "${project.projectId}" approved by "${reviewerId}". Platforms: [${sanitizedPlatforms.join(', ')}]. OutputFP=${outputFingerprint}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return artifact;
  }

  /**
   * Human operator rejects the project.
   */
  public reject(project: VideoProject, renderJob: VideoRenderJob, reviewerId: string, reason: string): void {
    if (!reviewerId || reviewerId.trim().length === 0) {
      throw new Error('Reviewer ID required to reject.');
    }

    project.reviewStatus = 'REJECTED';
    renderJob.status = 'FAILED';
    renderJob.error = `Rejected by reviewer ${reviewerId}: ${reason}`;
    this.approvedArtifacts.delete(project.projectId);

    this.logger.log({
      action: 'VIDEO_REVIEW_REJECTED',
      details: `Project "${project.projectId}" rejected by "${reviewerId}". Reason: ${reason}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });
  }

  public getApprovedArtifact(projectId: string): ApprovedVideoArtifact | undefined {
    return this.approvedArtifacts.get(projectId);
  }

  public clear(): void {
    this.approvedArtifacts.clear();
  }
}
