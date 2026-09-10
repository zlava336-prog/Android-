/**
 * Phone Agent - Step 2M Video Project Model
 * Complete deterministic video project specification, standard output profiles,
 * and review status lifecycle.
 */

import { ProductData } from '../content/ContentPackage';
import { VideoScene } from './VideoScene';
import { VideoTimeline, VideoTimelineValidator, MAX_PROJECT_DURATION_MS } from './VideoTimeline';
import { AudioTrackConfig, AudioAssetValidator } from './AudioAsset';
import { TextOverlay, TextOverlayValidator } from './TextOverlay';
import { SubtitleTrack, SubtitleTrackValidator } from './SubtitleTrack';
import { VideoFingerprintComputer } from './VideoFingerprint';

export type VideoFormatType = 'VERTICAL_SHORT' | 'SQUARE' | 'LANDSCAPE' | 'CUSTOM';
export type AspectRatioType = '9:16' | '1:1' | '16:9' | 'CUSTOM';
export type VideoContainerType = 'mp4' | 'webm' | 'mov';

export interface VideoOutputSpec {
  format: VideoFormatType;
  width: number;
  height: number;
  aspectRatio: AspectRatioType;
  fps: number;
  maxDurationMs: number;
  container: VideoContainerType;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
}

export const VIDEO_OUTPUT_PRESETS: Record<Exclude<VideoFormatType, 'CUSTOM'>, VideoOutputSpec> = {
  VERTICAL_SHORT: {
    format: 'VERTICAL_SHORT',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    fps: 30,
    maxDurationMs: 60 * 1000, // 60s
    container: 'mp4',
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
  },
  SQUARE: {
    format: 'SQUARE',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    fps: 30,
    maxDurationMs: 60 * 1000,
    container: 'mp4',
    videoBitrateKbps: 6000,
    audioBitrateKbps: 192,
  },
  LANDSCAPE: {
    format: 'LANDSCAPE',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    fps: 30,
    maxDurationMs: 300 * 1000, // 5 min
    container: 'mp4',
    videoBitrateKbps: 10000,
    audioBitrateKbps: 192,
  },
};

export type VideoReviewStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'STALE_APPROVAL'
  | 'REJECTED';

export interface VideoApprovalRecord {
  approvalId: string;
  projectId: string;
  reviewerId: string;
  approvedAt: number;
  projectFingerprint: string;
  renderedMediaFingerprint: string;
  contentFingerprint: string;
  productFingerprint: string;
  notes?: string;
}

export interface VideoProject {
  projectId: string;
  title: string;
  contentPackageId?: string;
  productData?: ProductData;
  productFingerprint: string;
  mediaFingerprint: string;
  contentFingerprint: string;
  scenes: VideoScene[];
  timeline: VideoTimeline;
  audioTrack?: AudioTrackConfig;
  overlays: TextOverlay[];
  subtitles?: SubtitleTrack;
  outputSpec: VideoOutputSpec;
  createdAt: number;
  updatedAt: number;
  projectFingerprint: string; // vpf_<sha256>
  reviewStatus: VideoReviewStatus;
  approvalRecord?: VideoApprovalRecord;
  metadata?: Record<string, unknown>;
}

export class VideoProjectValidator {
  public static validateOutputSpec(spec: VideoOutputSpec): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!spec) {
      return { valid: false, errors: ['outputSpec is required.'] };
    }

    if (spec.width <= 0 || !Number.isInteger(spec.width)) {
      errors.push(`Width must be positive integer, got: ${spec.width}.`);
    }

    if (spec.height <= 0 || !Number.isInteger(spec.height)) {
      errors.push(`Height must be positive integer, got: ${spec.height}.`);
    }

    if (spec.fps <= 0 || spec.fps > 120) {
      errors.push(`FPS must be between 1 and 120, got: ${spec.fps}.`);
    }

    if (spec.maxDurationMs <= 0) {
      errors.push(`maxDurationMs must be greater than 0, got: ${spec.maxDurationMs}.`);
    }

    const allowedContainers: VideoContainerType[] = ['mp4', 'webm', 'mov'];
    if (!allowedContainers.includes(spec.container)) {
      errors.push(`Unsupported container: ${spec.container}. Allowed: ${allowedContainers.join(', ')}.`);
    }

    // Aspect ratio consistency check
    if (spec.aspectRatio === '9:16' && spec.width >= spec.height) {
      errors.push(`Format is 9:16 but width (${spec.width}) is >= height (${spec.height}).`);
    }
    if (spec.aspectRatio === '16:9' && spec.height >= spec.width) {
      errors.push(`Format is 16:9 but height (${spec.height}) is >= width (${spec.width}).`);
    }
    if (spec.aspectRatio === '1:1' && spec.width !== spec.height) {
      errors.push(`Format is 1:1 but width (${spec.width}) != height (${spec.height}).`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public static validateProject(project: VideoProject): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!project) {
      return { valid: false, errors: ['Project is null or undefined.'], warnings: [] };
    }

    if (!project.projectId || project.projectId.trim().length === 0) {
      errors.push('projectId is required.');
    }

    if (!project.title || project.title.trim().length === 0) {
      errors.push('project title is required.');
    }

    if (!project.productFingerprint || !project.productFingerprint.startsWith('pfp_')) {
      errors.push('Missing or invalid productFingerprint (must start with pfp_).');
    }

    if (!project.mediaFingerprint || !project.mediaFingerprint.startsWith('mfp_')) {
      errors.push('Missing or invalid mediaFingerprint (must start with mfp_).');
    }

    if (!project.contentFingerprint || !project.contentFingerprint.startsWith('cfp_')) {
      errors.push('Missing or invalid contentFingerprint (must start with cfp_).');
    }

    // Output spec validation
    const specCheck = this.validateOutputSpec(project.outputSpec);
    if (!specCheck.valid) {
      errors.push(...specCheck.errors);
    }

    // Timeline and scenes validation
    const timelineCheck = VideoTimelineValidator.validateTimeline(
      project.scenes,
      project.productData,
      project.outputSpec.maxDurationMs || MAX_PROJECT_DURATION_MS
    );
    if (!timelineCheck.valid) {
      errors.push(...timelineCheck.errors);
    }
    if (timelineCheck.warnings.length > 0) {
      warnings.push(...timelineCheck.warnings);
    }

    // Audio track validation
    const audioCheck = AudioAssetValidator.validateAudioTrackConfig(project.audioTrack);
    if (!audioCheck.valid) {
      errors.push(...audioCheck.errors);
    }

    // Subtitles validation
    const subtitleCheck = SubtitleTrackValidator.validateTrack(project.subtitles);
    if (!subtitleCheck.valid) {
      errors.push(...subtitleCheck.errors);
    }

    // Global overlays validation
    if (project.overlays && project.overlays.length > 0) {
      const overlaysCheck = TextOverlayValidator.validateOverlays(project.overlays, project.productData);
      if (!overlaysCheck.valid) {
        errors.push(...overlaysCheck.errors);
      }
      if (overlaysCheck.warnings.length > 0) {
        warnings.push(...overlaysCheck.warnings);
      }
    }

    // Project fingerprint validation
    if (!project.projectFingerprint || !project.projectFingerprint.startsWith('vpf_')) {
      errors.push('Missing or invalid projectFingerprint (must start with vpf_).');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
