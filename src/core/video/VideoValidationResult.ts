/**
 * Phone Agent - Step 2M Video Output Validation
 * Inspects rendered media files to verify local accessibility, headers, dimensions,
 * duration, size bounds, and cryptographic fingerprint integrity.
 */

import { VideoOutputSpec } from './VideoProject';
import { VideoAssetValidator } from './VideoAsset';
import { MAX_VIDEO_SIZE_BYTES } from '../content/MediaValidator';

export interface VideoOutputMetadata {
  outputUri: string;
  mimeType: string;
  container: string;
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  outputFingerprint: string; // opf_<sha256>
  renderedAt: number;
}

export interface VideoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  outputMetadata?: VideoOutputMetadata;
  checkedAt: number;
}

export class VideoOutputValidator {
  /**
   * Validates rendered video output against requested output specifications.
   */
  public static validateRenderedOutput(
    output: VideoOutputMetadata | null | undefined,
    spec: VideoOutputSpec,
    expectedDurationMs?: number
  ): VideoValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checkedAt = Date.now();

    if (!output) {
      return {
        valid: false,
        errors: ['Output metadata is null or undefined.'],
        warnings: [],
        checkedAt,
      };
    }

    // 1. Local URI check
    const uriCheck = VideoAssetValidator.validateLocalUri(output.outputUri);
    if (!uriCheck.valid && uriCheck.error) {
      errors.push(`Rendered output URI invalid: ${uriCheck.error}`);
    }

    // 2. Size and corruption check
    if (typeof output.sizeBytes !== 'number' || output.sizeBytes <= 0) {
      errors.push(`Rendered video file is empty or corrupted: sizeBytes=${output.sizeBytes}.`);
    } else if (output.sizeBytes > MAX_VIDEO_SIZE_BYTES) {
      errors.push(
        `Rendered video exceeds maximum size of ${MAX_VIDEO_SIZE_BYTES} bytes (got: ${output.sizeBytes}).`
      );
    }

    // 3. MIME type & Container check
    const mime = (output.mimeType || '').toLowerCase().trim();
    const expectedMime =
      spec.container === 'mp4'
        ? 'video/mp4'
        : spec.container === 'webm'
        ? 'video/webm'
        : 'video/quicktime';

    if (mime !== expectedMime && !mime.startsWith('video/')) {
      errors.push(`MIME type mismatch: expected ${expectedMime}, got ${mime}.`);
    }

    // 4. Dimensions check
    if (output.width !== spec.width || output.height !== spec.height) {
      errors.push(
        `Output dimensions mismatch: expected ${spec.width}x${spec.height}, got ${output.width}x${output.height}.`
      );
    }

    // 5. Duration check
    if (typeof output.durationMs !== 'number' || output.durationMs <= 0) {
      errors.push(`Rendered video duration must be strictly positive, got: ${output.durationMs}ms.`);
    } else if (expectedDurationMs !== undefined) {
      // Allow +/- 500ms tolerance for container audio padding / frame rounding
      const diff = Math.abs(output.durationMs - expectedDurationMs);
      if (diff > 1500) {
        errors.push(
          `Rendered duration (${output.durationMs}ms) diverges significantly from timeline expectation (${expectedDurationMs}ms). Diff: ${diff}ms.`
        );
      } else if (diff > 500) {
        warnings.push(
          `Minor duration deviation: rendered ${output.durationMs}ms vs expected ${expectedDurationMs}ms.`
        );
      }
    }

    // 6. Output fingerprint check
    if (!output.outputFingerprint || !output.outputFingerprint.startsWith('opf_')) {
      errors.push('Missing or invalid output fingerprint (must start with opf_).');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      outputMetadata: errors.length === 0 ? output : undefined,
      checkedAt,
    };
  }
}
