/**
 * Phone Agent - Step 2M Deterministic Video Render Queue
 * Manages the sequential rendering lifecycle:
 * QUEUED -> VALIDATING -> RENDERING -> RENDERED -> VALIDATING_OUTPUT -> READY_FOR_REVIEW -> APPROVED -> FAILED -> CANCELLED -> UNKNOWN.
 * Strictly enforces:
 * - No render after EmergencyStop
 * - No automatic approval
 * - No automatic publishing
 * - Max 2 recovery attempts; 3rd unrecoverable failure triggers EmergencyStop.
 */

import { VideoProject, VideoProjectValidator } from './VideoProject';
import { VideoRenderJob, VideoRenderStatus, VideoRenderResult } from './VideoRenderJob';
import { VideoOutputValidator, VideoOutputMetadata } from './VideoValidationResult';
import { VideoFingerprintComputer } from './VideoFingerprint';
import { IVideoRenderEngine, LocalDeterministicRenderEngine } from './VideoRenderEngine';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';

export class VideoRenderQueue {
  private static instance: VideoRenderQueue | null = null;
  private jobs: Map<string, VideoRenderJob> = new Map();
  private projects: Map<string, VideoProject> = new Map();
  private engine: IVideoRenderEngine;
  private logger = LocalActionLogger.getInstance();
  private emergencyStop = EmergencyStopManager.getInstance();
  private consecutiveFailures: number = 0;

  constructor(engine?: IVideoRenderEngine) {
    this.engine = engine || new LocalDeterministicRenderEngine();
  }

  public static getInstance(engine?: IVideoRenderEngine): VideoRenderQueue {
    if (!VideoRenderQueue.instance) {
      VideoRenderQueue.instance = new VideoRenderQueue(engine);
    }
    return VideoRenderQueue.instance;
  }

  public static resetInstance(): void {
    VideoRenderQueue.instance = null;
  }

  public setEngine(engine: IVideoRenderEngine): void {
    this.engine = engine;
  }

  /**
   * Enqueues a project for rendering.
   */
  public enqueue(project: VideoProject): VideoRenderJob {
    if (this.emergencyStop.isActive()) {
      const msg = `Cannot enqueue render job: Emergency Stop is active (${this.emergencyStop.getReason()}).`;
      this.logger.log({
        action: 'VIDEO_RENDER_REJECTED',
        details: msg,
        severity: 'ERROR',
        safetyCheckPassed: false,
      });
      throw new Error(msg);
    }

    const jobId = `vrj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const renderFingerprint = VideoFingerprintComputer.computeRenderFingerprint(
      project.projectFingerprint,
      project.outputSpec,
      this.engine.engineId
    );

    const job: VideoRenderJob = {
      jobId,
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint,
      status: 'QUEUED',
      outputSpec: { ...project.outputSpec },
      progress: 0,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.projects.set(project.projectId, project);

    this.logger.log({
      action: 'VIDEO_RENDER_QUEUED',
      details: `Video render job ${jobId} queued for project ${project.projectId}. RenderFP=${renderFingerprint}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return job;
  }

  /**
   * Processes an enqueued job through the full validation and rendering pipeline.
   */
  public async processJob(jobId: string): Promise<VideoRenderJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Render job not found: ${jobId}`);
    }

    const project = this.projects.get(job.projectId);
    if (!project) {
      job.status = 'FAILED';
      job.error = `Referenced project "${job.projectId}" not found in queue.`;
      return job;
    }

    // Check Emergency Stop
    if (this.emergencyStop.isActive()) {
      job.status = 'FAILED';
      job.error = `Emergency Stop is active: ${this.emergencyStop.getReason()}`;
      return job;
    }

    // Stage 1: VALIDATING
    job.status = 'VALIDATING';
    job.startedAt = Date.now();
    const projCheck = VideoProjectValidator.validateProject(project);
    if (!projCheck.valid) {
      job.status = 'FAILED';
      job.error = `Project validation failed: ${projCheck.errors.join('; ')}`;
      this.handleFailure(job);
      return job;
    }

    // Stage 2: RENDERING
    job.status = 'RENDERING';
    job.progress = 10;

    let renderResult: VideoRenderResult;
    try {
      renderResult = await this.engine.render(project, job, percent => {
        job.progress = 10 + Math.round((percent / 100) * 80);
      });
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = `Render engine failed: ${err.message || String(err)}`;
      this.handleFailure(job);
      return job;
    }

    job.outputResult = renderResult;
    job.status = 'RENDERED';
    job.progress = 90;

    // Stage 3: VALIDATING_OUTPUT
    job.status = 'VALIDATING_OUTPUT';
    const outputMetadata: VideoOutputMetadata = {
      outputUri: renderResult.outputUri,
      mimeType: renderResult.mimeType,
      container: project.outputSpec.container,
      width: renderResult.width,
      height: renderResult.height,
      durationMs: renderResult.durationMs,
      sizeBytes: renderResult.sizeBytes,
      outputFingerprint: renderResult.outputFingerprint,
      renderedAt: renderResult.renderedAt,
    };

    const valResult = VideoOutputValidator.validateRenderedOutput(
      outputMetadata,
      project.outputSpec,
      project.timeline.totalDurationMs
    );
    job.validationResult = valResult;

    if (!valResult.valid) {
      job.status = 'FAILED';
      job.error = `Output validation failed: ${valResult.errors.join('; ')}`;
      this.logger.log({
        action: 'VIDEO_OUTPUT_VALIDATION_FAILED',
        details: `Job ${jobId} failed output validation: ${valResult.errors.join('; ')}`,
        severity: 'ERROR',
        safetyCheckPassed: false,
      });
      this.handleFailure(job);
      return job;
    }

    // Stage 4: READY_FOR_REVIEW
    // Mandatory invariant: No auto-approval! Must transition to READY_FOR_REVIEW for human approval.
    job.status = 'READY_FOR_REVIEW';
    job.progress = 100;
    job.completedAt = Date.now();
    this.consecutiveFailures = 0; // reset consecutive failure counter on success

    this.logger.log({
      action: 'VIDEO_OUTPUT_VALIDATED',
      details: `Render output validated for job ${jobId}. Status advanced to READY_FOR_REVIEW. OutputFP=${renderResult.outputFingerprint}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return job;
  }

  /**
   * Attempts recovery on a failed job.
   * Invariant: Max 2 recovery attempts allowed.
   */
  public async retryJob(jobId: string): Promise<VideoRenderJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found.`);
    }

    if (this.emergencyStop.isActive()) {
      throw new Error(`Cannot retry job: Emergency Stop active (${this.emergencyStop.getReason()}).`);
    }

    if (job.recoveryAttempts >= 2) {
      const msg = `Maximum recovery attempts (2) reached for job ${jobId}. Further automatic retries are blocked.`;
      this.logger.log({
        action: 'VIDEO_RECOVERY_EXHAUSTED',
        details: msg,
        severity: 'WARN',
        safetyCheckPassed: false,
      });
      throw new Error(msg);
    }

    job.recoveryAttempts++;
    job.status = 'QUEUED';
    job.error = undefined;

    this.logger.log({
      action: 'VIDEO_RECOVERY_ATTEMPTED',
      details: `Retrying job ${jobId} (attempt #${job.recoveryAttempts}).`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return this.processJob(jobId);
  }

  /**
   * Cancels a queued or in-flight job.
   */
  public cancelJob(jobId: string, reason: string = 'User cancelled'): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'READY_FOR_REVIEW' || job.status === 'APPROVED') {
      return false; // Cannot cancel finished jobs
    }

    job.status = 'CANCELLED';
    job.cancellationReason = reason;

    this.logger.log({
      action: 'VIDEO_RENDER_CANCELLED',
      details: `Job ${jobId} cancelled. Reason: ${reason}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });

    return true;
  }

  /**
   * Reconciles an UNKNOWN job state after crash or restart.
   * Invariant: UNKNOWN cannot automatically become RENDERED or APPROVED without physical verification!
   */
  public reconcileUnknownJob(jobId: string, outputMetadata?: VideoOutputMetadata): VideoRenderJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found.`);
    }

    const project = this.projects.get(job.projectId);
    if (!project) {
      job.status = 'FAILED';
      job.error = 'Project record missing during UNKNOWN reconciliation.';
      return job;
    }

    if (!outputMetadata) {
      // No output artifacts found on disk -> mark FAILED
      job.status = 'FAILED';
      job.error = 'No valid output artifact found on disk during crash reconciliation.';
      this.logger.log({
        action: 'VIDEO_RECONCILIATION_FAILED',
        details: `Job ${jobId} reconciled as FAILED: output file absent.`,
        severity: 'WARN',
        safetyCheckPassed: true,
      });
      return job;
    }

    // Verify artifact physically
    const valResult = VideoOutputValidator.validateRenderedOutput(
      outputMetadata,
      project.outputSpec,
      project.timeline.totalDurationMs
    );

    if (valResult.valid) {
      job.status = 'READY_FOR_REVIEW';
      job.validationResult = valResult;
      this.logger.log({
        action: 'VIDEO_RECONCILIATION_SUCCESS',
        details: `Job ${jobId} successfully reconciled to READY_FOR_REVIEW. Output verified.`,
        severity: 'INFO',
        safetyCheckPassed: true,
      });
    } else {
      job.status = 'FAILED';
      job.error = `Reconciliation failed: corrupted output: ${valResult.errors.join('; ')}`;
    }

    return job;
  }

  private handleFailure(job: VideoRenderJob): void {
    this.consecutiveFailures++;
    this.logger.log({
      action: 'VIDEO_RENDER_FAILED',
      details: `Job ${job.jobId} failed. Consecutive failures: ${this.consecutiveFailures}. Error: ${job.error}`,
      severity: 'ERROR',
      safetyCheckPassed: false,
    });

    // Invariant: Third consecutive unrecoverable failure triggers EmergencyStop
    if (this.consecutiveFailures >= 3) {
      this.emergencyStop.trigger(
        `Video rendering pipeline triggered Emergency Stop: 3 consecutive unrecoverable render failures.`
      );
      this.logger.log({
        action: 'VIDEO_EMERGENCY_STOP_TRIGGERED',
        details: 'Emergency stop activated due to 3 consecutive render failures.',
        severity: 'ERROR',
        safetyCheckPassed: false,
      });
    }
  }

  public getJob(jobId: string): VideoRenderJob | undefined {
    return this.jobs.get(jobId);
  }

  public getAllJobs(): VideoRenderJob[] {
    return Array.from(this.jobs.values());
  }

  public getProject(projectId: string): VideoProject | undefined {
    return this.projects.get(projectId);
  }

  public registerProject(project: VideoProject): void {
    this.projects.set(project.projectId, project);
  }
}
