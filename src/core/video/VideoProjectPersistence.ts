/**
 * Phone Agent - Step 2M Video Project Persistence & Crash Recovery
 * Persists project state, render queue jobs, approval records, and handles crash recovery safely.
 * Invariant: Never recovers UNKNOWN jobs directly to APPROVED or PUBLISHED.
 */

import { VideoProject } from './VideoProject';
import { VideoRenderJob } from './VideoRenderJob';
import { ApprovedVideoArtifact } from './ApprovedVideoArtifact';
import { VideoRenderQueue } from './VideoRenderQueue';
import { IJobStorageDriver, LocalStorageDriver, MemoryStorageDriver } from '../PersistentJobStore';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';

export interface VideoRecoveryScanResult {
  totalProjectsScanned: number;
  totalJobsScanned: number;
  interruptedRendersFound: number;
  jobsMarkedUnknown: string[];
  emergencyStopEnforced: boolean;
}

export class VideoProjectPersistence {
  private static instance: VideoProjectPersistence | null = null;
  private driver: IJobStorageDriver;
  private logger = LocalActionLogger.getInstance();
  private emergencyStop = EmergencyStopManager.getInstance();

  private readonly PROJECT_PREFIX = 'pa_video_project_';
  private readonly JOB_PREFIX = 'pa_video_job_';
  private readonly ARTIFACT_PREFIX = 'pa_video_artifact_';

  constructor(driver?: IJobStorageDriver) {
    this.driver = driver || new LocalStorageDriver();
  }

  public static getInstance(driver?: IJobStorageDriver): VideoProjectPersistence {
    if (!VideoProjectPersistence.instance) {
      VideoProjectPersistence.instance = new VideoProjectPersistence(driver);
    }
    return VideoProjectPersistence.instance;
  }

  public static resetInstance(): void {
    VideoProjectPersistence.instance = null;
  }

  public saveProject(project: VideoProject): void {
    this.driver.setItem(`${this.PROJECT_PREFIX}${project.projectId}`, JSON.stringify(project));
  }

  public loadProject(projectId: string): VideoProject | null {
    const data = this.driver.getItem(`${this.PROJECT_PREFIX}${projectId}`);
    return data ? JSON.parse(data) : null;
  }

  public getAllProjects(): VideoProject[] {
    const keys = this.driver.getAllKeys();
    const projects: VideoProject[] = [];
    for (const k of keys) {
      if (k.startsWith(this.PROJECT_PREFIX)) {
        const item = this.driver.getItem(k);
        if (item) {
          try {
            projects.push(JSON.parse(item));
          } catch {
            // skip corrupted entry
          }
        }
      }
    }
    return projects;
  }

  public saveRenderJob(job: VideoRenderJob): void {
    this.driver.setItem(`${this.JOB_PREFIX}${job.jobId}`, JSON.stringify(job));
  }

  public loadRenderJob(jobId: string): VideoRenderJob | null {
    const data = this.driver.getItem(`${this.JOB_PREFIX}${jobId}`);
    return data ? JSON.parse(data) : null;
  }

  public getAllRenderJobs(): VideoRenderJob[] {
    const keys = this.driver.getAllKeys();
    const jobs: VideoRenderJob[] = [];
    for (const k of keys) {
      if (k.startsWith(this.JOB_PREFIX)) {
        const item = this.driver.getItem(k);
        if (item) {
          try {
            jobs.push(JSON.parse(item));
          } catch {
            // skip corrupted entry
          }
        }
      }
    }
    return jobs;
  }

  public saveApprovedArtifact(artifact: ApprovedVideoArtifact): void {
    this.driver.setItem(`${this.ARTIFACT_PREFIX}${artifact.projectId}`, JSON.stringify(artifact));
  }

  public loadApprovedArtifact(projectId: string): ApprovedVideoArtifact | null {
    const data = this.driver.getItem(`${this.ARTIFACT_PREFIX}${projectId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Performs crash recovery scan on startup:
   * Finds jobs in VALIDATING or RENDERING states and safely converts them to UNKNOWN.
   */
  public performRecoveryScan(queue?: VideoRenderQueue): VideoRecoveryScanResult {
    const emergencyStopEnforced = this.emergencyStop.isActive();
    const allJobs = this.getAllRenderJobs();
    const jobsMarkedUnknown: string[] = [];
    let interruptedCount = 0;

    allJobs.forEach(job => {
      if (job.status === 'RENDERING' || job.status === 'VALIDATING') {
        interruptedCount++;
        job.status = 'UNKNOWN';
        job.error = 'Job interrupted during system reboot or crash. Marked UNKNOWN for reconciliation.';
        this.saveRenderJob(job);
        jobsMarkedUnknown.push(job.jobId);

        if (queue) {
          queue.enqueue({ ...queue.getProject(job.projectId)! });
        }

        this.logger.log({
          jobId: job.jobId,
          action: 'VIDEO_RECOVERY_MARKED_UNKNOWN',
          details: `In-flight render job ${job.jobId} marked as UNKNOWN. Requires output verification.`,
          severity: 'WARN',
          safetyCheckPassed: true,
        });
      }
    });

    return {
      totalProjectsScanned: this.getAllProjects().length,
      totalJobsScanned: allJobs.length,
      interruptedRendersFound: interruptedCount,
      jobsMarkedUnknown,
      emergencyStopEnforced,
    };
  }
}
