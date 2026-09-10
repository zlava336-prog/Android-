/**
 * Phone Agent - Step 2M Video Scene System
 * Scene-based editing model supporting images, videos, mixed media, and timeline validation.
 */

import { VideoAssetSource, VideoAssetValidator } from './VideoAsset';
import { VideoTransition, validateTransition, DEFAULT_TRANSITION } from './Transition';
import { TextOverlay, TextOverlayValidator } from './TextOverlay';
import { SubtitleSegment } from './SubtitleTrack';
import { VideoClip } from './VideoClip';
import { ProductData } from '../content/ContentPackage';

export type SceneRole =
  | 'HOOK'
  | 'PROBLEM'
  | 'PRODUCT'
  | 'KEY_BENEFITS'
  | 'DEMONSTRATION'
  | 'CTA'
  | 'CUSTOM';

export type SceneCropMode = 'COVER' | 'CONTAIN' | 'FIT';
export type SceneScaleMode = 'ORIGINAL' | 'FILL_16_9' | 'FILL_9_16' | 'FILL_1_1';

export interface VideoScene {
  sceneId: string;
  sceneIndex: number;
  role: SceneRole;
  mediaAsset: VideoAssetSource;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  cropMode: SceneCropMode;
  scaleMode: SceneScaleMode;
  transition: VideoTransition;
  textOverlays: TextOverlay[];
  subtitleSegments: SubtitleSegment[];
  clip?: VideoClip;
  metadata?: Record<string, unknown>;
}

export class VideoSceneValidator {
  public static validateScene(
    scene: VideoScene,
    productData?: ProductData | null
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!scene) {
      return { valid: false, errors: ['VideoScene is null or undefined.'], warnings: [] };
    }

    if (!scene.sceneId || scene.sceneId.trim().length === 0) {
      errors.push('sceneId is required.');
    }

    if (typeof scene.sceneIndex !== 'number' || scene.sceneIndex < 0) {
      errors.push(`sceneIndex must be non-negative integer, got: ${scene.sceneIndex}.`);
    }

    // Media asset validation
    const mediaCheck = VideoAssetValidator.validateAsset(scene.mediaAsset);
    if (!mediaCheck.valid) {
      errors.push(...mediaCheck.errors.map(e => `[MediaAsset] ${e}`));
    }

    // Duration and timeline checks
    if (typeof scene.startTimeMs !== 'number' || scene.startTimeMs < 0) {
      errors.push(`startTimeMs must be non-negative, got: ${scene.startTimeMs}.`);
    }

    if (typeof scene.endTimeMs !== 'number' || scene.endTimeMs <= scene.startTimeMs) {
      errors.push(
        `endTimeMs (${scene.endTimeMs}) must be strictly greater than startTimeMs (${scene.startTimeMs}). Negative or zero duration is forbidden.`
      );
    }

    const calculatedDuration = scene.endTimeMs - scene.startTimeMs;
    if (scene.durationMs !== calculatedDuration) {
      errors.push(
        `durationMs (${scene.durationMs}) does not match endTimeMs - startTimeMs (${calculatedDuration}).`
      );
    }

    if (scene.durationMs <= 0) {
      errors.push(`Scene duration must be strictly positive, got: ${scene.durationMs}ms.`);
    }

    // Transition validation
    const transCheck = validateTransition(scene.transition);
    if (!transCheck.valid && transCheck.error) {
      errors.push(`[Transition] ${transCheck.error}`);
    }

    if (scene.transition && scene.transition.durationMs >= scene.durationMs) {
      errors.push(
        `Transition duration (${scene.transition.durationMs}ms) cannot exceed or equal scene duration (${scene.durationMs}ms).`
      );
    }

    // Text overlays validation
    if (scene.textOverlays && Array.isArray(scene.textOverlays)) {
      const overlaysCheck = TextOverlayValidator.validateOverlays(scene.textOverlays, productData);
      if (!overlaysCheck.valid) {
        errors.push(...overlaysCheck.errors);
      }
      if (overlaysCheck.warnings.length > 0) {
        warnings.push(...overlaysCheck.warnings);
      }

      // Check that overlays fit inside this scene's timeline
      scene.textOverlays.forEach((ov, idx) => {
        if (ov.startTimeMs < scene.startTimeMs || ov.endTimeMs > scene.endTimeMs) {
          warnings.push(
            `Overlay #${idx} timeline [${ov.startTimeMs}ms - ${ov.endTimeMs}ms] extends outside scene timeline [${scene.startTimeMs}ms - ${scene.endTimeMs}ms].`
          );
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
