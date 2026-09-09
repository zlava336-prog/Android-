/**
 * Phone Agent - Crash Recovery Engine (Step 2I)
 * Detects interrupted jobs and platforms on startup, marks running platforms as UNKNOWN,
 * preserves PUBLISHED states, and prevents automatic republishing without human approval.
 */

import { JobStoreRepository } from './PersistentJobStore';
import { PersistentJob, PlatformExecutionState } from '../types/persistence';
import { EmergencyStopManager } from './emergencyStop';

export interface RecoveryScanResult {
  totalJobsScanned: number;
  interruptedJobsFound: number;
  platformsMarkedUnknown: Array<{
    jobId: string;
    platform: string;
    lastCheckpoint?: string;
  }>;
  preservedPublishedCount: number;
  emergencyStopEnforced: boolean;
}

export class CrashRecoveryManager {
  private static instance: CrashRecoveryManager | null = null;
  private repository: JobStoreRepository;
  private isRecovering: boolean = false;

  constructor(repository?: JobStoreRepository) {
    this.repository = repository || JobStoreRepository.getInstance();
  }

  public static getInstance(repository?: JobStoreRepository): CrashRecoveryManager {
    if (!CrashRecoveryManager.instance) {
      CrashRecoveryManager.instance = new CrashRecoveryManager(repository);
    }
    return CrashRecoveryManager.instance;
  }

  public static resetInstance(): void {
    CrashRecoveryManager.instance = null;
  }

  /**
   * Primary entry point called on application / service startup.
   * Scans all persisted jobs, detects in-flight interrupted executions,
   * converts them to UNKNOWN, and enforces safety invariants.
   */
  public performStartupRecovery(): RecoveryScanResult {
    if (this.isRecovering) {
      throw new Error('[CrashRecoveryManager] Recovery scan already in progress');
    }

    this.isRecovering = true;
    const emergencyStopActive = EmergencyStopManager.getInstance().isActive();

    this.repository.recordAuditEvent({
      jobId: 'SYSTEM',
      eventType: 'RECOVERY_STARTED',
      details: `Crash recovery scan initiated. EmergencyStop=${emergencyStopActive}`,
    });

    const allJobs = this.repository.listJobs();
    const result: RecoveryScanResult = {
      totalJobsScanned: allJobs.length,
      interruptedJobsFound: 0,
      platformsMarkedUnknown: [],
      preservedPublishedCount: 0,
      emergencyStopEnforced: emergencyStopActive,
    };

    for (const job of allJobs) {
      let jobWasInterrupted = false;

      // Count preserved published platforms
      for (const [platform, state] of Object.entries(job.platformExecutionStates)) {
        if (state.status === 'PUBLISHED') {
          result.preservedPublishedCount++;
        }

        // Detect crash during RUNNING or stale execution
        if (state.status === 'RUNNING') {
          jobWasInterrupted = true;
          // Mark interrupted platform as UNKNOWN
          this.repository.markPlatformUnknown(
            job.jobId,
            platform as any,
            'Platform execution interrupted by process death/unexpected shutdown. Reconciliation required.',
            state.lastSafeCheckpoint
          );

          result.platformsMarkedUnknown.push({
            jobId: job.jobId,
            platform,
            lastCheckpoint: state.lastSafeCheckpoint,
          });
        }
      }

      // Check if job-level status was RUNNING
      if (job.status === 'RUNNING') {
        jobWasInterrupted = true;
        job.status = 'UNKNOWN';
        job.retryMetadata.interruptedAt = Date.now();
        this.repository.updateJob(job);
      }

      if (jobWasInterrupted) {
        result.interruptedJobsFound++;
        // Invalidate any existing approved state because execution was disrupted
        if (job.approvalRecord && job.approvalRecord.approvalState === 'APPROVED') {
          this.repository.invalidateApproval(job.jobId, 'Execution interrupted by process crash. Re-approval required.');
        }
      }
    }

    this.repository.recordAuditEvent({
      jobId: 'SYSTEM',
      eventType: 'RECOVERY_COMPLETED',
      details: `Recovery finished. Scanned=${result.totalJobsScanned}, InterruptedJobs=${result.interruptedJobsFound}, UnknownPlatforms=${result.platformsMarkedUnknown.length}`,
    });

    this.isRecovering = false;
    return result;
  }

  /**
   * Validates if a job is in a safe state to proceed.
   * Strict Rule: UNKNOWN platforms can NEVER be executed or re-run directly.
   */
  public canProceedWithJob(jobId: string): { allowed: boolean; reason?: string } {
    if (EmergencyStopManager.getInstance().isActive()) {
      return { allowed: false, reason: 'EmergencyStop is active. All execution is blocked.' };
    }

    const job = this.repository.getJob(jobId);
    if (!job) {
      return { allowed: false, reason: `Job "${jobId}" not found.` };
    }

    if (job.status === 'UNKNOWN') {
      return {
        allowed: false,
        reason: 'Job contains UNKNOWN platform state. Safe reconciliation must be performed before any further actions.',
      };
    }

    if (job.status === 'PUBLISHED') {
      return { allowed: false, reason: 'Job is already fully published.' };
    }

    // Check if any platform is UNKNOWN
    for (const [platform, state] of Object.entries(job.platformExecutionStates)) {
      if (state.status === 'UNKNOWN') {
        return {
          allowed: false,
          reason: `Platform "${platform}" is in UNKNOWN state. Reconcile publication status before proceeding.`,
        };
      }
    }

    return { allowed: true };
  }
}
