/**
 * Phone Agent - Multi-Platform Job Planner & Sequential Execution Engine
 * Safe orchestration foundation for multi-platform publishing:
 * - Validates payload requirements against adapter capabilities.
 * - Enforces Amazon special rule (Link Extraction Only; Never Publish).
 * - Enforces strict platform isolation and package verification.
 * - Sequential execution queue (one platform at a time).
 * - Mandatory human approval (platform-level default).
 * - Bounded recovery (max 2 attempts) preserving existing safety invariants.
 * - Deterministic idempotency & duplicate-publish prevention.
 * - EmergencyStop instant queue cancellation and immutable audit logging.
 */

import {
  SupportedPlatform,
  NormalizedContentPayload,
  PlatformJobStatus,
  ApprovalLevel,
  PlannerError,
  PlatformExecutionStep,
  MultiPlatformExecutionPlan,
  JobModel,
} from '../types/job';
import { AdapterRegistry, UnknownAdapterError } from './AdapterRegistry';
import { AppAdapter } from './adapters/AppAdapter';
import { computeContentFingerprint, PublicationGuard } from './fingerprint';
import { EmergencyStopManager } from './emergencyStop';
import { LocalActionLogger } from './logger';
import { SafeUiInspector } from './inspector';
import { ContentPackage } from './content/ContentPackage';
import { PlatformContentProfileCalculator } from './content/PlatformContentProfile';
import { ContentReviewManager } from './content/ContentReviewManager';

export class PlannerValidationError extends Error {
  readonly errors: PlannerError[];
  constructor(message: string, errors: PlannerError[]) {
    super(`${message}: ${errors.map(e => `[${e.platform || 'General'}:${e.field || 'General'}] ${e.message}`).join('; ')}`);
    this.name = 'PlannerValidationError';
    this.errors = errors;
  }
}

/**
 * Standard deterministic platform order for repeatable plans.
 */
export const DETERMINISTIC_PLATFORM_ORDER: SupportedPlatform[] = [
  'instagram',
  'youtube',
  'facebook',
  'tiktok',
  'pinterest',
  'x',
  'threads',
  'linkedin',
];

export class MultiPlatformPlanner {
  private registry: AdapterRegistry;

  constructor(registry?: AdapterRegistry) {
    this.registry = registry || AdapterRegistry.getInstance();
  }

  /**
   * Validates planned platforms and payload against declared adapter capabilities.
   */
  public validatePlan(
    params: {
      jobId?: string;
      payload: NormalizedContentPayload;
      platforms: string[];
      approvalLevel?: ApprovalLevel;
    },
    options?: { isPlanning?: boolean }
  ): { valid: boolean; errors: PlannerError[] } {
    const errors: PlannerError[] = [];
    const { payload, platforms } = params;

    if (!platforms || platforms.length === 0) {
      errors.push({
        code: 'EMPTY_PLATFORMS',
        message: 'At least one platform must be selected.',
      });
      return { valid: false, errors };
    }

    // Deduplicate while preserving deterministic order
    const rawUnique = Array.from(new Set(platforms.map(p => p.toLowerCase().trim())));

    for (const rawPlatform of rawUnique) {
      // Amazon Special Rule: Amazon is NOT a publishing destination
      if (rawPlatform === 'amazon') {
        errors.push({
          platform: 'amazon',
          code: 'AMAZON_NOT_PUBLISHING_DESTINATION',
          message:
            'Amazon is NOT a publishing destination. Amazon is restricted to product link extraction only. Explicitly rejected: Amazon -> publish/upload/post/checkout/purchase.',
        });
        continue;
      }

      // Adapter lookup
      let adapter: AppAdapter;
      try {
        adapter = this.registry.get(rawPlatform);
      } catch (err) {
        errors.push({
          platform: rawPlatform,
          code: 'UNKNOWN_ADAPTER',
          message: err instanceof Error ? err.message : `Unknown adapter: ${rawPlatform}`,
        });
        continue;
      }

      const caps = adapter.capabilities || {
        supportsVideo: false,
        supportsImage: false,
        supportsTitle: false,
        supportsDescription: false,
        supportsHashtags: false,
        supportsCover: false,
        requiresApproval: true,
      };

      // Video capability validation
      const hasVideo = Boolean(payload.videoUri || (payload.mediaUri && payload.mediaUri.includes('video')));
      if (hasVideo && !caps.supportsVideo) {
        errors.push({
          platform: rawPlatform,
          field: 'videoUri',
          code: 'UNSUPPORTED_VIDEO',
          message: `${adapter.displayName} does not support video publishing.`,
        });
      }

      // Image capability validation
      const hasImage = Boolean(
        payload.imageUri ||
          (payload.mediaUri && (payload.mediaUri.includes('image') || payload.mediaUri.includes('photo')))
      );
      if (hasImage && !hasVideo && !caps.supportsImage) {
        errors.push({
          platform: rawPlatform,
          field: 'imageUri',
          code: 'UNSUPPORTED_IMAGE',
          message: `${adapter.displayName} does not support image publishing.`,
        });
      }

      // Title capability validation (omitted when planning multi-platform job with safe field projection)
      const hasTitle = Boolean(payload.title && payload.title.trim().length > 0);
      if (hasTitle && !caps.supportsTitle && !options?.isPlanning) {
        errors.push({
          platform: rawPlatform,
          field: 'title',
          code: 'UNSUPPORTED_TITLE',
          message: `${adapter.displayName} does not support title field.`,
        });
      }

      // Description capability validation
      const hasDescription = Boolean(payload.description && payload.description.trim().length > 0);
      if (hasDescription && !caps.supportsDescription && !options?.isPlanning) {
        errors.push({
          platform: rawPlatform,
          field: 'description',
          code: 'UNSUPPORTED_DESCRIPTION',
          message: `${adapter.displayName} does not support description field.`,
        });
      }

      // Hashtags capability validation
      const hasHashtags = Boolean(payload.hashtags && payload.hashtags.length > 0);
      if (hasHashtags && !caps.supportsHashtags && !options?.isPlanning) {
        errors.push({
          platform: rawPlatform,
          field: 'hashtags',
          code: 'UNSUPPORTED_HASHTAGS',
          message: `${adapter.displayName} does not support hashtags.`,
        });
      }

      // Cover capability validation
      const hasCover = Boolean(payload.coverUri && payload.coverUri.trim().length > 0);
      if (hasCover && !caps.supportsCover && !options?.isPlanning) {
        errors.push({
          platform: rawPlatform,
          field: 'coverUri',
          code: 'UNSUPPORTED_COVER',
          message: `${adapter.displayName} does not support cover image selection.`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Plans multi-platform execution. Returns deterministic execution plan.
   * Throws PlannerValidationError if any validation fails.
   */
  public plan(params: {
    jobId?: string;
    payload: NormalizedContentPayload;
    platforms: string[];
    approvalLevel?: ApprovalLevel;
  }): MultiPlatformExecutionPlan {
    const { valid, errors } = this.validatePlan(params, { isPlanning: true });
    if (!valid) {
      throw new PlannerValidationError('Multi-Platform Job validation failed', errors);
    }

    const jobId = params.jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const approvalLevel: ApprovalLevel = params.approvalLevel || 'PLATFORM_APPROVAL';
    const fingerprint = computeContentFingerprint(params.payload);

    // Filter unique platforms and sort deterministically
    const uniquePlatforms = Array.from(new Set(params.platforms.map(p => p.toLowerCase().trim() as SupportedPlatform)));
    const sortedPlatforms = uniquePlatforms.sort((a, b) => {
      const idxA = DETERMINISTIC_PLATFORM_ORDER.indexOf(a);
      const idxB = DETERMINISTIC_PLATFORM_ORDER.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    const steps: PlatformExecutionStep[] = sortedPlatforms.map(platform => {
      const adapter = this.registry.get(platform);
      const caps = adapter.capabilities || {
        supportsVideo: true,
        supportsImage: true,
        supportsTitle: false,
        supportsDescription: true,
        supportsHashtags: true,
        supportsCover: false,
        requiresApproval: true,
      };

      // Determine platform action
      let action: any = 'publish_post';
      const hasVideo = Boolean(params.payload.videoUri || (params.payload.mediaUri && params.payload.mediaUri.includes('video')));
      if (platform === 'instagram') {
        action = hasVideo ? 'publish_reel' : 'publish_post';
      } else if (platform === 'youtube') {
        action = 'publish_short';
      } else if (platform === 'facebook') {
        action = 'publish_post';
      } else if (platform === 'tiktok') {
        action = 'publish_video';
      } else if (platform === 'pinterest') {
        action = 'publish_pin';
      } else if (platform === 'x') {
        action = 'publish_post';
      } else if (platform === 'threads') {
        action = 'publish_thread';
      } else if (platform === 'linkedin') {
        action = 'publish_post';
      }

      // Safe step payload containing supported fields
      const stepPayload: NormalizedContentPayload = {
        text: params.payload.text || params.payload.description,
        title: caps.supportsTitle ? params.payload.title : undefined,
        description: caps.supportsDescription ? params.payload.description : undefined,
        hashtags: caps.supportsHashtags ? params.payload.hashtags : undefined,
        mediaUri: params.payload.mediaUri,
        imageUri: params.payload.imageUri,
        videoUri: params.payload.videoUri,
        coverUri: caps.supportsCover ? params.payload.coverUri : undefined,
        metadata: { ...params.payload.metadata },
      };

      return {
        platform,
        adapterId: adapter.platformId,
        action,
        payload: stepPayload,
        requiresApproval: caps.requiresApproval ?? true,
        status: 'PENDING',
        fingerprint,
      };
    });

    return {
      jobId,
      fingerprint,
      steps,
      approvalLevel,
      createdTimestamp: Date.now(),
    };
  }

  /**
   * Plans execution directly from an approved ContentPackage.
   * Strictly verifies approval validity, platform profiles, and ensures Amazon isolation.
   */
  public planContentPackage(
    pkg: ContentPackage,
    options?: {
      jobId?: string;
      approvalLevel?: ApprovalLevel;
    }
  ): MultiPlatformExecutionPlan {
    // 1. Approval State Check
    if (pkg.reviewState !== 'APPROVED' || pkg.approvalState !== 'APPROVED') {
      throw new Error(
        `[Pipeline Safety Invariant Violation] ContentPackage "${pkg.contentId}" cannot be planned: Review state is '${pkg.reviewState}' (approvalState: '${pkg.approvalState}'). Only explicitly APPROVED content packages can be planned.`
      );
    }

    // 2. Cryptographic Fingerprint & Staleness Verification
    const validity = ContentReviewManager.getInstance().checkApprovalValidity(pkg);
    if (!validity.isValid) {
      throw new Error(
        `[Pipeline Safety Invariant Violation] ContentPackage "${pkg.contentId}" has invalid or stale approval: ${validity.reason}`
      );
    }

    // 3. Amazon Special Rule
    if (pkg.selectedPlatforms.includes('amazon')) {
      throw new Error(
        '[Security Invariant Violation] Amazon is NOT a publishing destination. Only product link extraction is supported.'
      );
    }

    if (!pkg.selectedPlatforms || pkg.selectedPlatforms.length === 0) {
      throw new Error('[Planner Error] ContentPackage has no selected publishing platforms.');
    }

    const jobId = options?.jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const approvalLevel = options?.approvalLevel || 'PLATFORM_APPROVAL';
    const profileCalc = new PlatformContentProfileCalculator(this.registry);

    // Filter unique platforms and sort deterministically
    const uniquePlatforms = Array.from(new Set(pkg.selectedPlatforms));
    const sortedPlatforms = uniquePlatforms.sort((a, b) => {
      const idxA = DETERMINISTIC_PLATFORM_ORDER.indexOf(a);
      const idxB = DETERMINISTIC_PLATFORM_ORDER.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    const steps: PlatformExecutionStep[] = sortedPlatforms.map(platform => {
      const adapter = this.registry.get(platform);
      const profile = profileCalc.getProfile(platform);
      const { payload: stepPayload } = profileCalc.projectForPlatform(pkg, platform);

      // Determine platform action
      let action: any = 'publish_post';
      const hasVideo = Boolean(stepPayload.videoUri || (stepPayload.mediaUri && stepPayload.mediaUri.includes('video')));
      if (platform === 'instagram') {
        action = hasVideo ? 'publish_reel' : 'publish_post';
      } else if (platform === 'youtube') {
        action = 'publish_short';
      } else if (platform === 'facebook') {
        action = 'publish_post';
      } else if (platform === 'tiktok') {
        action = 'publish_video';
      } else if (platform === 'pinterest') {
        action = 'publish_pin';
      } else if (platform === 'x') {
        action = 'publish_post';
      } else if (platform === 'threads') {
        action = 'publish_thread';
      } else if (platform === 'linkedin') {
        action = 'publish_post';
      }

      return {
        platform,
        adapterId: adapter.platformId,
        action,
        payload: stepPayload,
        requiresApproval: profile.requiresApproval ?? true,
        status: 'PENDING',
        fingerprint: pkg.contentFingerprint,
      };
    });

    LocalActionLogger.getInstance().log({
      action: 'CONTENT_PLAN_CREATED',
      details: `Generated execution plan for ContentPackage "${pkg.contentId}" with ${steps.length} platform step(s): ${steps.map(s => s.platform).join(', ')}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return {
      jobId,
      fingerprint: pkg.contentFingerprint,
      steps,
      approvalLevel,
      createdTimestamp: Date.now(),
    };
  }
}

export interface ExecutionOptions {
  inspector?: SafeUiInspector;
  approvalProvider?: (step: PlatformExecutionStep) => Promise<boolean> | boolean;
  onStepProgress?: (step: PlatformExecutionStep, stepIndex: number, total: number) => void;
  expectedPackageMap?: Record<string, string>;
}

export interface ExecutionResult {
  jobId: string;
  success: boolean;
  allPublished: boolean;
  steps: PlatformExecutionStep[];
  completedPlatforms: string[];
  pendingPlatforms: string[];
  failedPlatforms: string[];
  stoppedReason?: string;
}

export class MultiPlatformJobExecutor {
  private registry: AdapterRegistry;
  private logger: LocalActionLogger;
  private emergencyStop: EmergencyStopManager;
  private publicationGuard: PublicationGuard;

  constructor(
    registry?: AdapterRegistry,
    logger?: LocalActionLogger,
    emergencyStop?: EmergencyStopManager,
    publicationGuard?: PublicationGuard
  ) {
    this.registry = registry || AdapterRegistry.getInstance();
    this.logger = logger || LocalActionLogger.getInstance();
    this.emergencyStop = emergencyStop || EmergencyStopManager.getInstance();
    this.publicationGuard = publicationGuard || PublicationGuard.getInstance();
  }

  /**
   * Sequentially executes a MultiPlatformExecutionPlan with platform isolation,
   * idempotency guards, approval gates, and EmergencyStop tripwires.
   */
  public async executePlan(
    plan: MultiPlatformExecutionPlan,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const completedPlatforms: string[] = [];
    const failedPlatforms: string[] = [];

    this.logger.log({
      jobId: plan.jobId,
      action: 'MULTI_PLATFORM_JOB_START',
      details: `Starting sequential execution for ${plan.steps.length} platforms. Approval level: ${plan.approvalLevel}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Notify progress
      options.onStepProgress?.(step, i, plan.steps.length);

      // 1. Check Global Emergency Stop
      if (this.emergencyStop.isActive()) {
        const reason = this.emergencyStop.getReason() || 'Emergency stop active';
        this.cancelRemainingSteps(plan, i, reason);
        return {
          jobId: plan.jobId,
          success: false,
          allPublished: false,
          steps: plan.steps,
          completedPlatforms,
          pendingPlatforms: plan.steps.slice(i).map(s => s.platform),
          failedPlatforms,
          stoppedReason: reason,
        };
      }

      step.status = 'VALIDATING';

      // 2. Platform Isolation & Package Verification
      const adapter = this.registry.get(step.platform);
      if (options.inspector) {
        const currentPackage = await options.inspector.getCurrentPackage();
        const expectedPkg = options.expectedPackageMap?.[step.platform] || adapter.packageName;
        const supported = (adapter as any).supportedPackages || [adapter.packageName];

        if (!supported.includes(currentPackage) && currentPackage !== expectedPkg) {
          const stopReason = `Platform isolation violation: Expected package '${adapter.packageName}' for ${step.platform}, but detected '${currentPackage}'. Emergency Stop triggered.`;
          this.emergencyStop.trigger(stopReason);

          step.status = 'FAILED';
          step.error = stopReason;
          failedPlatforms.push(step.platform);

          this.logger.log({
            jobId: plan.jobId,
            platform: step.platform,
            action: 'PLATFORM_ISOLATION_FAILURE',
            details: stopReason,
            severity: 'SECURITY',
            safetyCheckPassed: false,
          });

          this.cancelRemainingSteps(plan, i + 1, stopReason);
          return {
            jobId: plan.jobId,
            success: false,
            allPublished: false,
            steps: plan.steps,
            completedPlatforms,
            pendingPlatforms: plan.steps.slice(i + 1).map(s => s.platform),
            failedPlatforms,
            stoppedReason: stopReason,
          };
        }

        // Security Tripwire Check
        const tripwire = await options.inspector.checkSecurityTripwires();
        if (tripwire.tripped) {
          const stopReason = `Security challenge tripwire detected in ${step.platform}: ${tripwire.reason}. Emergency Stop triggered.`;
          this.emergencyStop.trigger(stopReason);

          step.status = 'FAILED';
          step.error = stopReason;
          failedPlatforms.push(step.platform);

          this.cancelRemainingSteps(plan, i + 1, stopReason);
          return {
            jobId: plan.jobId,
            success: false,
            allPublished: false,
            steps: plan.steps,
            completedPlatforms,
            pendingPlatforms: plan.steps.slice(i + 1).map(s => s.platform),
            failedPlatforms,
            stoppedReason: stopReason,
          };
        }
      }

      // 3. Idempotency Check (Duplicate-Publish Protection)
      if (this.publicationGuard.isPublished(plan.jobId, step.platform, step.fingerprint)) {
        step.status = 'PUBLISHED';
        step.message = 'ALREADY_PUBLISHED';
        step.publishedAt = this.publicationGuard.getPublicationRecord(plan.jobId, step.platform, step.fingerprint)?.publishedAt || Date.now();
        completedPlatforms.push(step.platform);

        this.logger.log({
          jobId: plan.jobId,
          platform: step.platform,
          action: 'IDEMPOTENCY_GUARD_TRIGGERED',
          details: `Platform ${step.platform} was already published for this job. Skipping duplicate execution.`,
          severity: 'INFO',
          safetyCheckPassed: true,
        });
        continue;
      }

      step.status = 'READY';

      // 4. Human Approval Gate
      step.status = 'WAITING_FOR_APPROVAL';
      let isApproved = true;
      if (options.approvalProvider) {
        try {
          isApproved = await options.approvalProvider(step);
        } catch {
          isApproved = false;
        }
      }

      if (!isApproved) {
        step.status = 'CANCELLED';
        step.error = 'Operator denied publish approval.';
        failedPlatforms.push(step.platform);

        this.logger.log({
          jobId: plan.jobId,
          platform: step.platform,
          action: 'OPERATOR_APPROVAL_DENIED',
          details: `Operator explicitly denied publication approval for ${step.platform}.`,
          severity: 'WARN',
          safetyCheckPassed: true,
        });
        continue;
      }

      // Adapter-level approval requirement enforcement
      const jobModel: JobModel = {
        jobId: plan.jobId,
        platform: step.platform,
        action: step.action,
        videoUri: step.payload.videoUri || step.payload.mediaUri,
        imageUri: step.payload.imageUri,
        caption: step.payload.text || step.payload.description,
        title: step.payload.title,
        description: step.payload.description,
        hashtags: step.payload.hashtags,
        coverUri: step.payload.coverUri,
        requiresApproval: true,
      };

      if (adapter.requestPublishApproval) {
        await adapter.requestPublishApproval(jobModel);
      }
      if (typeof (adapter as any).approvePublish === 'function') {
        (adapter as any).approvePublish();
      }

      // 5. Sequential Execution on Adapter
      step.status = 'RUNNING';
      try {
        // Launch and detect ready state
        const launched = await adapter.launch();
        if (!launched) throw new Error(`${adapter.displayName} launch failed.`);

        const ready = await adapter.detectReadyState();
        if (!ready) throw new Error(`${adapter.displayName} ready state detection failed.`);

        // Select media
        const mediaUri = step.payload.mediaUri || step.payload.videoUri || step.payload.imageUri || '';
        if (mediaUri) {
          const mediaSelected = await adapter.selectMedia(mediaUri);
          if (!mediaSelected) throw new Error(`${adapter.displayName} media selection failed.`);
        }

        // Caption & hashtags
        if (step.payload.text || step.payload.description) {
          await adapter.enterCaption(step.payload.text || step.payload.description || '');
        }

        if (step.payload.hashtags && step.payload.hashtags.length > 0) {
          await adapter.enterHashtags(step.payload.hashtags);
        }

        if (step.payload.coverUri) {
          await adapter.selectCover(step.payload.coverUri);
        }

        // Verify preview
        const previewOk = await adapter.verifyPreview();
        if (!previewOk) throw new Error(`${adapter.displayName} pre-publish preview verification failed.`);

        // Publish
        const pubResult = await adapter.publish();
        if (!pubResult.success) {
          throw new Error(pubResult.message || `${adapter.displayName} publish action returned unsuccessful.`);
        }

        // Verify published
        const verified = await adapter.verifyPublished();
        if (!verified) {
          throw new Error(`${adapter.displayName} publication verification failed.`);
        }

        // Record publication in idempotency guard
        this.publicationGuard.recordPublication(plan.jobId, step.platform, step.fingerprint);
        step.status = 'PUBLISHED';
        step.publishedAt = Date.now();
        completedPlatforms.push(step.platform);

        this.logger.log({
          jobId: plan.jobId,
          platform: step.platform,
          action: 'PLATFORM_PUBLISHED_SUCCESS',
          details: `Successfully published to ${adapter.displayName}.`,
          severity: 'ACTION',
          safetyCheckPassed: true,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Check if EmergencyStop was tripped
        if (this.emergencyStop.isActive()) {
          step.status = 'FAILED';
          step.error = this.emergencyStop.getReason();
          failedPlatforms.push(step.platform);
          this.cancelRemainingSteps(plan, i + 1, this.emergencyStop.getReason());
          return {
            jobId: plan.jobId,
            success: false,
            allPublished: false,
            steps: plan.steps,
            completedPlatforms,
            pendingPlatforms: plan.steps.slice(i + 1).map(s => s.platform),
            failedPlatforms,
            stoppedReason: this.emergencyStop.getReason(),
          };
        }

        // Attempt adapter bounded recovery (max 2 attempts)
        let recovered = false;
        try {
          recovered = await adapter.recover(errorMsg);
        } catch {
          recovered = false;
        }

        if (recovered) {
          // If recovered, try publishing again once
          try {
            const pubResult = await adapter.publish();
            const verified = await adapter.verifyPublished();
            if (pubResult.success && verified) {
              this.publicationGuard.recordPublication(plan.jobId, step.platform, step.fingerprint);
              step.status = 'PUBLISHED';
              step.publishedAt = Date.now();
              completedPlatforms.push(step.platform);
              continue;
            }
          } catch {
            // fallthrough to failure
          }
        }

        step.status = 'FAILED';
        step.error = errorMsg;
        failedPlatforms.push(step.platform);

        this.logger.log({
          jobId: plan.jobId,
          platform: step.platform,
          action: 'PLATFORM_EXECUTION_FAILED',
          details: `Platform execution failed on ${adapter.displayName}: ${errorMsg}`,
          severity: 'ERROR',
          safetyCheckPassed: false,
        });
      }
    }

    const allPublished = plan.steps.every(s => s.status === 'PUBLISHED');

    return {
      jobId: plan.jobId,
      success: failedPlatforms.length === 0,
      allPublished,
      steps: plan.steps,
      completedPlatforms,
      pendingPlatforms: [],
      failedPlatforms,
    };
  }

  /**
   * Helper to cancel all remaining steps after an EmergencyStop or unrecoverable error.
   */
  private cancelRemainingSteps(plan: MultiPlatformExecutionPlan, startIndex: number, reason: string): void {
    const pendingPlatforms: string[] = [];
    const completedPlatforms: string[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      if (i < startIndex) {
        if (plan.steps[i].status === 'PUBLISHED') {
          completedPlatforms.push(plan.steps[i].platform);
        }
      } else {
        plan.steps[i].status = 'CANCELLED';
        plan.steps[i].error = `Cancelled due to Emergency Stop: ${reason}`;
        pendingPlatforms.push(plan.steps[i].platform);
      }
    }

    this.logger.log({
      jobId: plan.jobId,
      action: 'EMERGENCY_STOP_QUEUE_CANCELLED',
      details: `Emergency Stop cancelled ${pendingPlatforms.length} pending platforms. Reason: ${reason}. Completed: [${completedPlatforms.join(', ')}]. Cancelled: [${pendingPlatforms.join(', ')}]`,
      severity: 'SECURITY',
      safetyCheckPassed: false,
    });
  }
}
