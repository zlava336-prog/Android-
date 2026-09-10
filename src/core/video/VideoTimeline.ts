/**
 * Phone Agent - Step 2M Video Timeline System
 * Deterministic timeline ordering, duration calculations, gap/overlap validation, and rebuilders.
 */

import { VideoScene, VideoSceneValidator } from './VideoScene';
import { ProductData } from '../content/ContentPackage';

export interface VideoTimeline {
  totalDurationMs: number;
  sceneCount: number;
  scenes: VideoScene[];
}

export const MAX_PROJECT_DURATION_MS = 10 * 60 * 1000; // 10 minutes max for video projects
export const MIN_PROJECT_DURATION_MS = 1000; // 1 second min

export class VideoTimelineValidator {
  /**
   * Strictly validates that the timeline scenes are ordered, contiguous, and non-overlapping.
   */
  public static validateTimeline(
    scenes: VideoScene[],
    productData?: ProductData | null,
    maxAllowedDurationMs: number = MAX_PROJECT_DURATION_MS
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    totalDurationMs: number;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return {
        valid: false,
        errors: ['Timeline contains zero scenes. At least one scene is required.'],
        warnings: [],
        totalDurationMs: 0,
      };
    }

    let expectedStartTime = 0;
    let totalDurationMs = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];

      // Validate scene individually
      const sceneCheck = VideoSceneValidator.validateScene(scene, productData);
      if (!sceneCheck.valid) {
        errors.push(...sceneCheck.errors.map(e => `Scene #${i} (${scene.sceneId}): ${e}`));
      }
      if (sceneCheck.warnings.length > 0) {
        warnings.push(...sceneCheck.warnings.map(w => `Scene #${i} (${scene.sceneId}): ${w}`));
      }

      // Check sequence index
      if (scene.sceneIndex !== i) {
        errors.push(`Scene #${i} has sceneIndex=${scene.sceneIndex}, expected ${i}.`);
      }

      // Check continuity and overlap
      if (i === 0 && scene.startTimeMs !== 0) {
        errors.push(`First scene must start at timestamp 0ms, got: ${scene.startTimeMs}ms.`);
      } else if (i > 0) {
        if (scene.startTimeMs < expectedStartTime) {
          errors.push(
            `Scene #${i} (${scene.sceneId}) overlaps previous scene! Starts at ${scene.startTimeMs}ms but previous ended at ${expectedStartTime}ms.`
          );
        } else if (scene.startTimeMs > expectedStartTime) {
          errors.push(
            `Timeline gap detected before Scene #${i} (${scene.sceneId}): gap from ${expectedStartTime}ms to ${scene.startTimeMs}ms.`
          );
        }
      }

      expectedStartTime = scene.endTimeMs;
      totalDurationMs += scene.durationMs;
    }

    if (totalDurationMs < MIN_PROJECT_DURATION_MS) {
      errors.push(
        `Total timeline duration (${totalDurationMs}ms) is less than minimum required (${MIN_PROJECT_DURATION_MS}ms).`
      );
    }

    if (totalDurationMs > maxAllowedDurationMs) {
      errors.push(
        `Total timeline duration (${totalDurationMs}ms) exceeds maximum allowed (${maxAllowedDurationMs}ms).`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalDurationMs,
    };
  }

  /**
   * Rebuilds a contiguous timeline from an array of scenes, normalizing start and end times.
   */
  public static rebuildContiguousTimeline(scenes: VideoScene[]): VideoTimeline {
    let currentStart = 0;
    const contiguousScenes = scenes.map((scene, idx) => {
      const duration = Math.max(500, scene.durationMs || (scene.endTimeMs - scene.startTimeMs) || 3000);
      const startTimeMs = currentStart;
      const endTimeMs = currentStart + duration;
      currentStart = endTimeMs;

      return {
        ...scene,
        sceneIndex: idx,
        startTimeMs,
        endTimeMs,
        durationMs: duration,
      };
    });

    return {
      totalDurationMs: currentStart,
      sceneCount: contiguousScenes.length,
      scenes: contiguousScenes,
    };
  }
}
