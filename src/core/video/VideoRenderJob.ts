/**
 * Phone Agent - Step 2M Video Render Job & Status Definitions
 * Defines render lifecycle states, progress tracking, and render outcome artifacts.
 */

import { VideoOutputSpec } from './VideoProject';
import { VideoValidationResult } from './VideoValidationResult';

export type VideoRenderStatus =
  | 'QUEUED'
  | 'VALIDATING'
  | 'RENDERING'
  | 'RENDERED'
  | 'VALIDATING_OUTPUT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface VideoRenderResult {
  success: boolean;
  outputUri: string;
  outputFingerprint: string; // opf_<sha256>
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
  isSimulation: boolean;
  renderedAt: number;
  error?: string;
}

export interface VideoRenderJob {
  jobId: string;
  projectId: string;
  projectFingerprint: string;
  renderFingerprint: string;
  status: VideoRenderStatus;
  outputSpec: VideoOutputSpec;
  progress: number; // 0 to 100
  recoveryAttempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  outputResult?: VideoRenderResult;
  validationResult?: VideoValidationResult;
  error?: string;
  cancellationReason?: string;
}
