/**
 * Phone Agent - Step 2M Local Video Asset Abstraction
 * Enforces strictly local-only media, MIME type constraints, and cryptographic integrity.
 * Rejects all remote URLs, CDNs, and dangerous URI schemes.
 */

import { MediaAsset, MediaContentType } from '../content/ContentPackage';
import { MediaValidator } from '../content/MediaValidator';

export interface VideoAssetSource {
  assetId: string;
  localUri: string;
  mimeType: string;
  mediaType: MediaContentType;
  sizeBytes: number;
  width: number;
  height: number;
  durationMs?: number;
  sha256: string;
  createdAt: number;
}

export class VideoAssetValidator {
  /**
   * Strictly validates local URI schemes.
   * Allowed: content://, file://, approved Android storage paths (/storage/emulated/0/, /data/user/0/, /sdcard/).
   * Rejected: http://, https://, ftp://, blob:, data:, smb:, rtsp:, etc.
   */
  public static validateLocalUri(uri: string): { valid: boolean; error?: string } {
    if (!uri || typeof uri !== 'string' || uri.trim().length === 0) {
      return { valid: false, error: 'Asset URI cannot be empty.' };
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
      lower.startsWith('blob:') ||
      lower.startsWith('smb:') ||
      lower.startsWith('rtsp:')
    ) {
      return {
        valid: false,
        error: `Remote and network URIs are strictly forbidden: "${trimmed}". Video engine uses local Android media only.`,
      };
    }

    // Check for directory traversal attempts
    if (trimmed.includes('../') || trimmed.includes('..\\')) {
      return {
        valid: false,
        error: `Directory traversal sequence detected in URI: "${trimmed}".`,
      };
    }

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
        error: `Invalid local URI: "${trimmed}". Must start with content://, file://, or an approved local storage path.`,
      };
    }

    return { valid: true };
  }

  /**
   * Validates a complete media asset against local security and dimension boundaries.
   */
  public static validateAsset(asset: VideoAssetSource | MediaAsset): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!asset) {
      return { valid: false, errors: ['Asset is null or undefined.'] };
    }

    if (!asset.assetId || asset.assetId.trim().length === 0) {
      errors.push('Asset ID is required.');
    }

    const uriCheck = this.validateLocalUri(asset.localUri);
    if (!uriCheck.valid && uriCheck.error) {
      errors.push(uriCheck.error);
    }

    const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedVideoMimes = ['video/mp4', 'video/quicktime', 'video/webm'];
    const mime = (asset.mimeType || '').toLowerCase().trim();

    if (asset.mediaType === 'IMAGE') {
      if (!allowedImageMimes.includes(mime)) {
        errors.push(`Unsupported image MIME type: "${mime}". Allowed: ${allowedImageMimes.join(', ')}.`);
      }
    } else if (asset.mediaType === 'VIDEO') {
      if (!allowedVideoMimes.includes(mime)) {
        errors.push(`Unsupported video MIME type: "${mime}". Allowed: ${allowedVideoMimes.join(', ')}.`);
      }
      if (asset.durationMs !== undefined && asset.durationMs <= 0) {
        errors.push(`Video asset duration must be greater than 0ms, got: ${asset.durationMs}ms.`);
      }
    } else {
      errors.push(`Unsupported mediaType: "${asset.mediaType}". Must be IMAGE or VIDEO.`);
    }

    if (asset.width <= 0 || asset.height <= 0) {
      errors.push(`Asset dimensions must be positive integers: ${asset.width}x${asset.height}.`);
    }

    if (asset.sizeBytes <= 0) {
      errors.push(`Asset sizeBytes must be greater than 0, got: ${asset.sizeBytes}.`);
    }

    if (!asset.sha256 || asset.sha256.trim().length === 0) {
      errors.push('Cryptographic SHA-256 fingerprint is required.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Converts a validated MediaAsset to a VideoAssetSource.
   */
  public static fromMediaAsset(mediaAsset: MediaAsset): VideoAssetSource {
    const check = this.validateAsset(mediaAsset);
    if (!check.valid) {
      throw new Error(`MediaAsset failed local video validation: ${check.errors.join('; ')}`);
    }

    return {
      assetId: mediaAsset.assetId,
      localUri: mediaAsset.localUri,
      mimeType: mediaAsset.mimeType,
      mediaType: mediaAsset.mediaType,
      sizeBytes: mediaAsset.sizeBytes,
      width: mediaAsset.width,
      height: mediaAsset.height,
      durationMs: mediaAsset.durationMs,
      sha256: mediaAsset.sha256,
      createdAt: mediaAsset.createdAt,
    };
  }
}
