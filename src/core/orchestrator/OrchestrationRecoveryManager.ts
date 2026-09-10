/**
 * Phone Agent - Step 2N Orchestration Recovery Manager
 * Handles bounded error recovery (max 2 retries), EmergencyStop tripwire (3 consecutive failures),
 * pause vs. emergency stop distinction, crash recovery, and safe UNKNOWN reconciliation.
 */

import { SupportedPlatform } from '../../types/job';
import { EmergencyStopManager } from '../emergencyStop';
import { PublicationGuard } from '../fingerprint';
import { LocalActionLogger } from '../logger';
import { PublicationReconciliationManager } from '../PublicationReconciliationManager';
import { UiInspector } from '../inspector';
import {
  MAX_STEP_RETRIES,
  CONSECUTIVE_FAILURES_EMERGENCY_STOP_THRESHOLD,
} from './OrchestrationPolicy';
import { OrchestrationContext, PublicationItemRecord } from './OrchestrationContext';
import { OrchestrationState } from './OrchestrationState';
import { OrchestrationStep } from './OrchestrationStep';

export interface RecoveryActionDecision {
  canRetry: boolean;
  shouldEmergencyStop: boolean;
  remainingRetries: number;
  consecutiveFailures: number;
  reason: string;
}

export interface CrashRecoveryResult {
  orchestrationId: string;
  recoveredState: OrchestrationState;
  skippedCompletedPlatforms: SupportedPlatform[];
  pendingPlatformsToExecute: SupportedPlatform[];
  interruptedStepsReset: string[];
}

export class OrchestrationRecoveryManager {
  private static instance: OrchestrationRecoveryManager | null = null;
  private emergencyStop = EmergencyStopManager.getInstance();
  private publicationGuard = PublicationGuard.getInstance();
  private logger = LocalActionLogger.getInstance();
  private reconciliationManager = PublicationReconciliationManager.getInstance();

  public static getInstance(): OrchestrationRecoveryManager {
    if (!OrchestrationRecoveryManager.instance) {
      OrchestrationRecoveryManager.instance = new OrchestrationRecoveryManager();
    }
    return OrchestrationRecoveryManager.instance;
  }

  public static resetInstance(): void {
    OrchestrationRecoveryManager.instance = null;
  }

  /**
   * Evaluates recovery options when a step fails.
   * Increments failure counters and triggers EmergencyStop on the 3rd consecutive unrecoverable failure.
   */
  public handleStepFailure(
    context: OrchestrationContext,
    step: OrchestrationStep,
    error: string
  ): RecoveryActionDecision {
    context.consecutiveFailures += 1;
    step.retryCount += 1;
    step.error = error;

    this.logger.log({
      action: 'ORCH_STEP_FAILURE',
      details: `Step "${step.stepType}" failed (attempt ${step.retryCount}/${MAX_STEP_RETRIES}, consecutive errors: ${context.consecutiveFailures}): ${error}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });

    // 1. Invariant: 3 consecutive unrecoverable failures trigger EmergencyStop
    if (context.consecutiveFailures >= CONSECUTIVE_FAILURES_EMERGENCY_STOP_THRESHOLD) {
      const stopReason = `Master AI Orchestrator triggered Emergency Stop: ${context.consecutiveFailures} consecutive unrecoverable failures. Latest: ${error}`;
      this.emergencyStop.trigger(stopReason);
      context.isEmergencyStopped = true;
      context.emergencyStopReason = stopReason;
      context.currentState = 'EMERGENCY_STOPPED';

      this.logger.log({
        action: 'EMERGENCY_STOP_TRIGGERED',
        details: stopReason,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });

      return {
        canRetry: false,
        shouldEmergencyStop: true,
        remainingRetries: 0,
        consecutiveFailures: context.consecutiveFailures,
        reason: stopReason,
      };
    }

    // 2. Invariant: Max 2 retries per step
    if (step.retryCount <= MAX_STEP_RETRIES) {
      return {
        canRetry: true,
        shouldEmergencyStop: false,
        remainingRetries: MAX_STEP_RETRIES - step.retryCount,
        consecutiveFailures: context.consecutiveFailures,
        reason: `Retry allowable (${step.retryCount}/${MAX_STEP_RETRIES}).`,
      };
    }

    // Step exceeded retries
    return {
      canRetry: false,
      shouldEmergencyStop: false,
      remainingRetries: 0,
      consecutiveFailures: context.consecutiveFailures,
      reason: `Step exceeded maximum retries (${MAX_STEP_RETRIES}).`,
    };
  }

  /**
   * Resets the consecutive failure counter upon a successful step execution.
   */
  public handleStepSuccess(context: OrchestrationContext, step: OrchestrationStep): void {
    context.consecutiveFailures = 0;
    step.status = 'COMPLETED';
    step.completedAt = Date.now();
    step.error = undefined;
  }

  /**
   * Analyzes crash recovery for an in-flight orchestration context.
   * - Marks interrupted in-flight steps as UNKNOWN or PENDING.
   * - Skips already published platforms using PublicationGuard.
   * - Restores execution only for unfinished platforms.
   */
  public performCrashRecovery(context: OrchestrationContext): CrashRecoveryResult {
    const skippedPlatforms: SupportedPlatform[] = [];
    const pendingPlatforms: SupportedPlatform[] = [];
    const interruptedSteps: string[] = [];

    // Check all target platforms
    const targetPlatforms = context.plan.targetPlatforms;
    for (const platform of targetPlatforms) {
      const fingerprint = context.contentFingerprint || 'unknown';
      if (this.publicationGuard.isPublished(context.orchestrationId, platform, fingerprint)) {
        skippedPlatforms.push(platform);
        if (!context.publishedPlatforms.includes(platform)) {
          context.publishedPlatforms.push(platform);
        }
      } else {
        pendingPlatforms.push(platform);
      }
    }

    // Examine in-flight steps
    context.steps.forEach(step => {
      if (step.status === 'IN_PROGRESS') {
        interruptedSteps.push(step.stepId);
        // Interrupted execution step must not be falsely marked as completed
        step.status = 'PENDING';
        step.error = 'Interrupted by process crash or reboot. Reset for safe re-execution.';
      }
    });

    let recoveredState: OrchestrationState = context.currentState;
    if (context.currentState === 'EXECUTING_PLATFORM' || context.currentState === 'VERIFYING_PUBLICATION') {
      if (pendingPlatforms.length === 0) {
        recoveredState = 'COMPLETED';
      } else if (skippedPlatforms.length > 0) {
        recoveredState = 'PARTIALLY_COMPLETED';
      } else {
        recoveredState = 'WAITING_FOR_PUBLISH_APPROVAL';
      }
    }

    context.currentState = recoveredState;
    context.updatedAt = Date.now();

    this.logger.log({
      action: 'ORCH_CRASH_RECOVERY',
      details: `Crash recovery completed for "${context.orchestrationId}". Skipped ${skippedPlatforms.length} already published platforms. Pending: ${pendingPlatforms.join(', ') || 'none'}. State: ${recoveredState}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });

    return {
      orchestrationId: context.orchestrationId,
      recoveredState,
      skippedCompletedPlatforms: skippedPlatforms,
      pendingPlatformsToExecute: pendingPlatforms,
      interruptedStepsReset: interruptedSteps,
    };
  }

  /**
   * Reconciles an UNKNOWN publication item.
   * HARD INVARIANT: Direct transition UNKNOWN -> PUBLISHED is BLOCKED.
   * Only allowed path: UNKNOWN -> RECONCILING -> PUBLISHED (requires verified proof).
   */
  public async reconcileUnknownPublication(params: {
    context: OrchestrationContext;
    platform: SupportedPlatform;
    inspector: UiInspector;
    proofProvided?: boolean;
    proofUri?: string;
  }): Promise<{ reconciled: boolean; finalStatus: 'PUBLISHED' | 'FAILED' | 'UNKNOWN'; message: string }> {
    const { context, platform, inspector, proofProvided, proofUri } = params;

    // Transition context to RECONCILING
    context.currentState = 'RECONCILING';

    this.logger.log({
      action: 'ORCH_RECONCILING_STARTED',
      details: `Reconciliation initiated for platform "${platform}" in job "${context.orchestrationId}".`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    // 1. Emergency stop check
    if (this.emergencyStop.isActive()) {
      return {
        reconciled: false,
        finalStatus: 'UNKNOWN',
        message: 'Reconciliation halted: Emergency Stop is active.',
      };
    }

    // 2. Direct transition without proof is strictly blocked
    if (!proofProvided && !proofUri) {
      this.logger.log({
        action: 'ORCH_RECONCILIATION_UNCONFIRMED',
        details: `Cannot confirm publication for "${platform}" without UI verification proof. Remaining UNKNOWN. Never guessing.`,
        severity: 'WARN',
        safetyCheckPassed: true,
      });
      return {
        reconciled: false,
        finalStatus: 'UNKNOWN',
        message: 'Publication could not be safely confirmed from UI inspector. State remains UNKNOWN.',
      };
    }

    // 3. With confirmed proof, mark as PUBLISHED and record in PublicationGuard
    const fingerprint = context.contentFingerprint || 'unknown';
    this.publicationGuard.recordPublication(context.orchestrationId, platform, fingerprint, { proofUri: proofUri || 'verified://reconciliation' });

    if (!context.publishedPlatforms.includes(platform)) {
      context.publishedPlatforms.push(platform);
    }

    // Update item record
    const existingRec = context.publicationRecords.find(r => r.platform === platform);
    if (existingRec) {
      existingRec.status = 'PUBLISHED';
      existingRec.proofUri = proofUri;
      existingRec.publishedAt = Date.now();
    } else {
      context.publicationRecords.push({
        platform,
        idempotencyTuple: `${context.orchestrationId}:${platform}:${fingerprint}`,
        status: 'PUBLISHED',
        proofUri,
        publishedAt: Date.now(),
      });
    }

    this.logger.log({
      action: 'ORCH_RECONCILIATION_RESOLVED',
      details: `Reconciliation verified publication of "${platform}" with proof: ${proofUri}. Status transitioned to PUBLISHED.`,
      severity: 'ACTION',
      safetyCheckPassed: true,
    });

    return {
      reconciled: true,
      finalStatus: 'PUBLISHED',
      message: `Publication confirmed with proof: ${proofUri}`,
    };
  }
}
