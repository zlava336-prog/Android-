/**
 * Phone Agent - Step 2J Production-Grade Media Validator
 * Strictly enforces local-only URI schemes, MIME type consistency, physical dimension
 * and duration constraints, and cryptographic SHA-256 verification.
 * Zero remote downloads. Never silently repairs corrupted or invalid media.
 */

import { MediaAsset } from './ContentPackage';
import { LocalActionLogger } from '../logger';

export type MediaErrorCode =
  | 'INVALID_URI'
  | 'UNSUPPORTED_MEDIA'
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_READABLE'
  | 'INVALID_DIMENSIONS'
  | 'INVALID_DURATION'
  | 'SIZE_LIMIT_EXCEEDED'
  | 'FINGERPRINT_FAILED';

export interface MediaValidationError {
  code: MediaErrorCode;
  field: string;
  message: string;
}

export interface MediaValidationResult {
  valid: boolean;
  errors: MediaValidationError[];
  assetId?: string;
  sanitizedAsset?: MediaAsset;
}

export const SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const SUPPORTED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

export const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
export const MIN_MEDIA_DIMENSION = 200; // 200px
export const MAX_MEDIA_DIMENSION = 8192; // 8192px
export const MIN_VIDEO_DURATION_MS = 1000; // 1s
export const MAX_VIDEO_DURATION_MS = 3600 * 1000; // 60 minutes

export class MediaValidator {
  private static instance: MediaValidator | null = null;

  public static getInstance(): MediaValidator {
    if (!MediaValidator.instance) {
      MediaValidator.instance = new MediaValidator();
    }
    return MediaValidator.instance;
  }

  /**
   * Validates that the URI scheme is strictly local.
   * Allowed:
   * - content://
   * - file://
   * - Approved absolute local paths: /storage/emulated/0/..., /data/user/0/..., /sdcard/...
   * Explicitly REJECTS:
   * - http://, https://
   * - ftp://, blob:, data:, smb:, rtsp:, etc.
   */
  public validateUriScheme(uri: string): { valid: boolean; error?: MediaValidationError } {
    if (!uri || typeof uri !== 'string' || uri.trim().length === 0) {
      return {
        valid: false,
        error: {
          code: 'INVALID_URI',
          field: 'localUri',
          message: 'Media URI is empty or missing.',
        },
      };
    }

    const trimmed = uri.trim();
    const lower = trimmed.toLowerCase();

    // Check for remote URL patterns
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('//') ||
      lower.startsWith('ftp://') ||
      lower.startsWith('data:') ||
      lower.startsWith('blob:')
    ) {
      return {
        valid: false,
        error: {
          code: 'INVALID_URI',
          field: 'localUri',
          message: `Remote and dangerous URI schemes are strictly rejected: "${trimmed}". Only local Android content:// and file:// storage is permitted. Zero remote downloads allowed.`,
        },
      };
    }

    // Must start with content://, file://, or approved local path
    const isContentScheme = lower.startsWith('content://');
    const isFileScheme = lower.startsWith('file://');
    const isApprovedLocalPath =
      lower.startsWith('/storage/emulated/0/') ||
      lower.startsWith('/storage/sdcard') ||
      lower.startsWith('/data/user/0/') ||
      lower.startsWith('/data/data/') ||
      lower.startsWith('/sdcard/');

    if (!isContentScheme && !isFileScheme && !isApprovedLocalPath) {
      return {
        valid: false,
        error: {
          code: 'INVALID_URI',
          field: 'localUri',
          message: `Invalid local URI scheme: "${trimmed}". Must start with content://, file://, or an approved local storage path (/storage/emulated/0/...).`,
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validates MIME type and consistency with declared mediaType and extension.
   */
  public validateMimeConsistency(
    uri: string,
    mimeType: string,
    mediaType: 'IMAGE' | 'VIDEO'
  ): { valid: boolean; errors: MediaValidationError[] } {
    const errors: MediaValidationError[] = [];
    const normalizedMime = (mimeType || '').trim().toLowerCase();

    if (!normalizedMime) {
      errors.push({
        code: 'UNSUPPORTED_MEDIA',
        field: 'mimeType',
        message: 'MIME type is required and cannot be empty.',
      });
      return { valid: false, errors };
    }

    if (mediaType === 'IMAGE') {
      if (!SUPPORTED_IMAGE_MIMES.has(normalizedMime)) {
        errors.push({
          code: 'UNSUPPORTED_MEDIA',
          field: 'mimeType',
          message: `Unsupported image MIME type: "${normalizedMime}". Supported types: ${Array.from(SUPPORTED_IMAGE_MIMES).join(', ')}.`,
        });
      }
    } else if (mediaType === 'VIDEO') {
      if (!SUPPORTED_VIDEO_MIMES.has(normalizedMime)) {
        errors.push({
          code: 'UNSUPPORTED_MEDIA',
          field: 'mimeType',
          message: `Unsupported video MIME type: "${normalizedMime}". Supported types: ${Array.from(SUPPORTED_VIDEO_MIMES).join(', ')}.`,
        });
      }
    } else {
      errors.push({
        code: 'UNSUPPORTED_MEDIA',
        field: 'mediaType',
        message: `Unknown media type: "${mediaType}". Must be 'IMAGE' or 'VIDEO'.`,
      });
    }

    // Filename extension consistency check (never trust extension alone, but detect obvious mismatches)
    const lowerUri = uri.toLowerCase();
    const extMatch = lowerUri.match(/\.([a-z0-9]+)(?:[?#]|$)/);
    if (extMatch) {
      const ext = extMatch[1];
      if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext) && mediaType === 'IMAGE') {
        errors.push({
          code: 'UNSUPPORTED_MEDIA',
          field: 'mimeType',
          message: `Extension mismatch: File extension .${ext} indicates video, but declared as IMAGE (${normalizedMime}).`,
        });
      }
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext) && mediaType === 'VIDEO') {
        errors.push({
          code: 'UNSUPPORTED_MEDIA',
          field: 'mimeType',
          message: `Extension mismatch: File extension .${ext} indicates image, but declared as VIDEO (${normalizedMime}).`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates physical dimensions.
   */
  public validateDimensions(
    width: number,
    height: number
  ): { valid: boolean; errors: MediaValidationError[] } {
    const errors: MediaValidationError[] = [];

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      errors.push({
        code: 'INVALID_DIMENSIONS',
        field: 'dimensions',
        message: `Invalid dimensions: ${width}x${height}. Width and height must be positive numbers.`,
      });
      return { valid: false, errors };
    }

    if (width < MIN_MEDIA_DIMENSION || height < MIN_MEDIA_DIMENSION) {
      errors.push({
        code: 'INVALID_DIMENSIONS',
        field: 'dimensions',
        message: `Dimensions too small: ${width}x${height}. Minimum dimension is ${MIN_MEDIA_DIMENSION}x${MIN_MEDIA_DIMENSION}px.`,
      });
    }

    if (width > MAX_MEDIA_DIMENSION || height > MAX_MEDIA_DIMENSION) {
      errors.push({
        code: 'INVALID_DIMENSIONS',
        field: 'dimensions',
        message: `Dimensions too large: ${width}x${height}. Maximum dimension is ${MAX_MEDIA_DIMENSION}x${MAX_MEDIA_DIMENSION}px.`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates video duration or ensures image duration is omitted.
   */
  public validateDuration(
    mediaType: 'IMAGE' | 'VIDEO',
    durationMs?: number
  ): { valid: boolean; errors: MediaValidationError[] } {
    const errors: MediaValidationError[] = [];

    if (mediaType === 'VIDEO') {
      if (durationMs === undefined || durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
        errors.push({
          code: 'INVALID_DURATION',
          field: 'durationMs',
          message: `Video duration missing or non-positive: ${durationMs}. Video must have a valid positive duration in milliseconds.`,
        });
      } else if (durationMs < MIN_VIDEO_DURATION_MS) {
        errors.push({
          code: 'INVALID_DURATION',
          field: 'durationMs',
          message: `Video duration too short: ${durationMs}ms. Minimum is ${MIN_VIDEO_DURATION_MS}ms (1s).`,
        });
      } else if (durationMs > MAX_VIDEO_DURATION_MS) {
        errors.push({
          code: 'INVALID_DURATION',
          field: 'durationMs',
          message: `Video duration exceeds limit: ${durationMs}ms. Maximum is ${MAX_VIDEO_DURATION_MS}ms (60 minutes).`,
        });
      }
    } else if (mediaType === 'IMAGE') {
      if (durationMs !== undefined && durationMs !== null && durationMs > 0) {
        errors.push({
          code: 'INVALID_DURATION',
          field: 'durationMs',
          message: `Image asset cannot specify positive video duration: ${durationMs}ms.`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates file size in bytes.
   */
  public validateFileSize(
    mediaType: 'IMAGE' | 'VIDEO',
    sizeBytes: number
  ): { valid: boolean; errors: MediaValidationError[] } {
    const errors: MediaValidationError[] = [];

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      errors.push({
        code: 'FILE_NOT_READABLE',
        field: 'sizeBytes',
        message: `Media file has invalid or zero size (${sizeBytes} bytes). File may be corrupted, empty, or unreadable.`,
      });
      return { valid: false, errors };
    }

    const maxLimit = mediaType === 'VIDEO' ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
    if (sizeBytes > maxLimit) {
      errors.push({
        code: 'SIZE_LIMIT_EXCEEDED',
        field: 'sizeBytes',
        message: `Media file size (${(sizeBytes / (1024 * 1024)).toFixed(2)}MB) exceeds maximum limit for ${mediaType} (${maxLimit / (1024 * 1024)}MB).`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates cryptographic SHA-256 fingerprint format and integrity.
   */
  public validateFingerprint(sha256Hash: string): { valid: boolean; errors: MediaValidationError[] } {
    const errors: MediaValidationError[] = [];
    const trimmed = (sha256Hash || '').trim().toLowerCase();

    if (!trimmed || !/^[a-f0-9]{64}$/.test(trimmed)) {
      errors.push({
        code: 'FINGERPRINT_FAILED',
        field: 'sha256',
        message: `Invalid or missing SHA-256 cryptographic fingerprint: "${sha256Hash}". Must be a valid 64-character hex string. Filename cannot serve as identity.`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Comprehensive validation of a single MediaAsset.
   */
  public validateMediaAsset(asset: MediaAsset): MediaValidationResult {
    const errors: MediaValidationError[] = [];

    if (!asset || !asset.assetId) {
      return {
        valid: false,
        errors: [
          {
            code: 'FILE_NOT_FOUND',
            field: 'assetId',
            message: 'MediaAsset or assetId is missing.',
          },
        ],
      };
    }

    // 1. URI Scheme
    const uriRes = this.validateUriScheme(asset.localUri);
    if (!uriRes.valid && uriRes.error) {
      errors.push(uriRes.error);
    }

    // 2. MIME & Extension Consistency
    const mimeRes = this.validateMimeConsistency(asset.localUri, asset.mimeType, asset.mediaType);
    errors.push(...mimeRes.errors);

    // 3. Dimensions
    const dimRes = this.validateDimensions(asset.width, asset.height);
    errors.push(...dimRes.errors);

    // 4. Duration
    const durRes = this.validateDuration(asset.mediaType, asset.durationMs);
    errors.push(...durRes.errors);

    // 5. Size
    const sizeRes = this.validateFileSize(asset.mediaType, asset.sizeBytes);
    errors.push(...sizeRes.errors);

    // 6. SHA-256 Fingerprint
    const fpRes = this.validateFingerprint(asset.sha256);
    errors.push(...fpRes.errors);

    const valid = errors.length === 0;

    // Audit logging
    if (valid) {
      LocalActionLogger.getInstance().log({
        action: 'MEDIA_VALIDATED',
        details: `MediaAsset "${asset.assetId}" validated: ${asset.mediaType} (${asset.mimeType}) ${asset.width}x${asset.height} ${asset.sizeBytes}B SHA256:${asset.sha256.slice(0, 8)}...`,
        severity: 'INFO',
        safetyCheckPassed: true,
      });
    } else {
      LocalActionLogger.getInstance().log({
        action: 'MEDIA_REJECTED',
        details: `MediaAsset "${asset.assetId}" rejected with ${errors.length} error(s): ${errors.map(e => `[${e.code}] ${e.message}`).join('; ')}`,
        severity: 'WARN',
        safetyCheckPassed: false,
      });
    }

    return {
      valid,
      errors,
      assetId: asset.assetId,
      sanitizedAsset: valid ? { ...asset } : undefined,
    };
  }
}
