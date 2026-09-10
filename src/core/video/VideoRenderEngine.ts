/**
 * Phone Agent - Step 2M Video Render Engine Abstraction
 * Supports native Android rendering (Media3/FFmpeg) and deterministic local simulation.
 * Never fakes real production rendering: simulation results are explicitly marked.
 */

import { VideoProject } from './VideoProject';
import { VideoRenderJob, VideoRenderResult } from './VideoRenderJob';
import { VideoFingerprintComputer } from './VideoFingerprint';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';

export interface IVideoRenderEngine {
  readonly engineId: string;
  isAvailable(): Promise<boolean>;
  render(
    project: VideoProject,
    job: VideoRenderJob,
    onProgress?: (percent: number) => void
  ): Promise<VideoRenderResult>;
}

export class LocalDeterministicRenderEngine implements IVideoRenderEngine {
  public readonly engineId = 'local-deterministic-engine';
  private logger = LocalActionLogger.getInstance();
  private emergencyStop = EmergencyStopManager.getInstance();

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async render(
    project: VideoProject,
    job: VideoRenderJob,
    onProgress?: (percent: number) => void
  ): Promise<VideoRenderResult> {
    // 1. Invariant: Emergency Stop check
    if (this.emergencyStop.isActive()) {
      const reason = `Render halted: Emergency Stop is active (${this.emergencyStop.getReason()}).`;
      this.logger.log({
        action: 'VIDEO_RENDER_FAILED',
        details: reason,
        severity: 'ERROR',
        safetyCheckPassed: false,
      });
      throw new Error(reason);
    }

    this.logger.log({
      action: 'VIDEO_RENDER_STARTED',
      details: `Deterministic simulation render started for project "${project.projectId}", format ${project.outputSpec.format}.`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    // 2. Simulate progress ticks
    if (onProgress) {
      onProgress(25);
      onProgress(50);
      onProgress(75);
      onProgress(100);
    }

    const durationMs = project.timeline.totalDurationMs;
    const spec = project.outputSpec;
    const outputUri = `file:///storage/emulated/0/PhoneAgent/renders/${job.jobId}.${spec.container}`;

    // Calculate realistic file size based on duration and bitrate
    const bitrateKbps = spec.videoBitrateKbps || 8000;
    const sizeBytes = Math.round((durationMs / 1000) * (bitrateKbps * 128)); // bits to bytes approx

    const outputFingerprint = VideoFingerprintComputer.computeOutputFingerprint(
      outputUri,
      sizeBytes,
      durationMs,
      job.renderFingerprint
    );

    const mimeType =
      spec.container === 'mp4'
        ? 'video/mp4'
        : spec.container === 'webm'
        ? 'video/webm'
        : 'video/quicktime';

    const result: VideoRenderResult = {
      success: true,
      outputUri,
      outputFingerprint,
      durationMs,
      width: spec.width,
      height: spec.height,
      sizeBytes,
      mimeType,
      isSimulation: true,
      renderedAt: Date.now(),
    };

    this.logger.log({
      action: 'VIDEO_RENDER_COMPLETED',
      details: `Deterministic simulation render finished for project "${project.projectId}". Output: ${outputUri}, Fingerprint: ${outputFingerprint}.`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return result;
  }
}

export class AndroidRenderEngine implements IVideoRenderEngine {
  public readonly engineId = 'android-native-media3-engine';

  public async isAvailable(): Promise<boolean> {
    // True only when running inside actual Android runtime with native bridge
    return (
      typeof window !== 'undefined' &&
      typeof (window as any).AndroidVideoBridge !== 'undefined'
    );
  }

  public async render(
    project: VideoProject,
    job: VideoRenderJob,
    onProgress?: (percent: number) => void
  ): Promise<VideoRenderResult> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'AndroidRenderEngine: Native Android Media3 video bridge is unavailable in this environment.'
      );
    }

    // Call bridge if present
    const bridge = (window as any).AndroidVideoBridge;
    const jsonStr = bridge.renderVideo(JSON.stringify({ project, job }));
    return JSON.parse(jsonStr) as VideoRenderResult;
  }
}
