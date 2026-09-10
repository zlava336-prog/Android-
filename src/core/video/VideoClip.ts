/**
 * Phone Agent - Step 2M Video Clip Abstraction
 * Represents a source clip with optional trimming, volume, and playback speed.
 */

import { VideoAssetSource, VideoAssetValidator } from './VideoAsset';

export interface VideoClip {
  clipId: string;
  asset: VideoAssetSource;
  sourceStartMs?: number; // In-point in source video
  sourceEndMs?: number; // Out-point in source video
  playbackSpeed?: number; // 0.5 to 2.0 (default 1.0)
  volume?: number; // 0.0 to 1.0 (default 1.0)
  isMuted?: boolean;
}

export class VideoClipValidator {
  public static validateClip(clip: VideoClip): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!clip) {
      return { valid: false, errors: ['VideoClip is null or undefined.'] };
    }

    if (!clip.clipId || clip.clipId.trim().length === 0) {
      errors.push('clipId is required.');
    }

    const assetCheck = VideoAssetValidator.validateAsset(clip.asset);
    if (!assetCheck.valid) {
      errors.push(...assetCheck.errors);
    }

    if (clip.sourceStartMs !== undefined && clip.sourceStartMs < 0) {
      errors.push(`sourceStartMs must be non-negative, got: ${clip.sourceStartMs}.`);
    }

    if (
      clip.sourceEndMs !== undefined &&
      clip.sourceStartMs !== undefined &&
      clip.sourceEndMs <= clip.sourceStartMs
    ) {
      errors.push(
        `sourceEndMs (${clip.sourceEndMs}) must be greater than sourceStartMs (${clip.sourceStartMs}).`
      );
    }

    if (clip.playbackSpeed !== undefined) {
      if (clip.playbackSpeed < 0.25 || clip.playbackSpeed > 4.0) {
        errors.push(`playbackSpeed must be between 0.25 and 4.0, got: ${clip.playbackSpeed}.`);
      }
    }

    if (clip.volume !== undefined) {
      if (clip.volume < 0.0 || clip.volume > 1.0) {
        errors.push(`volume must be between 0.0 and 1.0, got: ${clip.volume}.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
