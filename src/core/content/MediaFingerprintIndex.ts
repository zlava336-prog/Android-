/**
 * Phone Agent - Step 2J Media Fingerprint Index & Duplicate Publication Detector
 * Tracks cryptographic media fingerprints and content combinations to detect duplicate assets
 * and duplicate publication candidates. Integrated with PublicationGuard.
 */

import { MediaAsset } from './ContentPackage';
import { PublicationGuard } from '../fingerprint';
import { LocalActionLogger } from '../logger';

export type MediaDuplicateWarningType = 'DUPLICATE_MEDIA' | 'DUPLICATE_PUBLICATION_CANDIDATE';

export interface MediaDuplicateWarning {
  type: MediaDuplicateWarningType;
  mediaSha256: string;
  assetId?: string;
  message: string;
  existingJobId?: string;
  existingPlatform?: string;
}

export interface MediaIndexRecord {
  sha256: string;
  assetId: string;
  jobId: string;
  platform?: string;
  registeredAt: number;
  contentFingerprint?: string;
}

export class MediaFingerprintIndex {
  private static instance: MediaFingerprintIndex | null = null;
  private recordsBySha: Map<string, MediaIndexRecord[]> = new Map();
  private publicationGuard: PublicationGuard;

  constructor(guard?: PublicationGuard) {
    this.publicationGuard = guard || PublicationGuard.getInstance();
  }

  public static getInstance(): MediaFingerprintIndex {
    if (!MediaFingerprintIndex.instance) {
      MediaFingerprintIndex.instance = new MediaFingerprintIndex();
    }
    return MediaFingerprintIndex.instance;
  }

  public static resetInstance(): void {
    MediaFingerprintIndex.instance = null;
  }

  public clear(): void {
    this.recordsBySha.clear();
  }

  /**
   * Registers a media asset associated with a job.
   */
  public registerMedia(params: {
    mediaAsset: MediaAsset;
    jobId: string;
    platform?: string;
    contentFingerprint?: string;
  }): void {
    const sha = (params.mediaAsset.sha256 || '').trim().toLowerCase();
    if (!sha) return;

    const list = this.recordsBySha.get(sha) || [];
    list.push({
      sha256: sha,
      assetId: params.mediaAsset.assetId,
      jobId: params.jobId,
      platform: params.platform,
      registeredAt: Date.now(),
      contentFingerprint: params.contentFingerprint,
    });
    this.recordsBySha.set(sha, list);
  }

  /**
   * Checks for duplicate media within a job or previously published duplicates.
   */
  public checkForDuplicates(params: {
    mediaAssets: MediaAsset[];
    jobId: string;
    contentFingerprint: string;
    platforms?: string[];
  }): MediaDuplicateWarning[] {
    const warnings: MediaDuplicateWarning[] = [];
    const seenInJob = new Set<string>();

    for (const asset of params.mediaAssets) {
      const sha = (asset.sha256 || '').trim().toLowerCase();
      if (!sha) continue;

      // 1. Same media reused twice within the same job
      if (seenInJob.has(sha)) {
        warnings.push({
          type: 'DUPLICATE_MEDIA',
          mediaSha256: sha,
          assetId: asset.assetId,
          message: `Media asset with SHA-256 "${sha.slice(0, 8)}..." is duplicated within the same content package.`,
        });
      }
      seenInJob.add(sha);

      // 2. Exact same media + same content fingerprint already published on any selected platform
      if (params.platforms && params.platforms.length > 0) {
        for (const platform of params.platforms) {
          const isPublished = this.publicationGuard.isPublished(
            params.jobId,
            platform,
            params.contentFingerprint
          );
          if (isPublished) {
            warnings.push({
              type: 'DUPLICATE_PUBLICATION_CANDIDATE',
              mediaSha256: sha,
              assetId: asset.assetId,
              existingJobId: params.jobId,
              existingPlatform: platform,
              message: `Duplicate publication candidate: Job "${params.jobId}" has already been published to ${platform} with fingerprint "${params.contentFingerprint}". Idempotency guard prevents double-posting.`,
            });
          }
        }
      }

      // 3. Exact duplicate media previously registered in other jobs (informative warning)
      const existing = this.recordsBySha.get(sha);
      if (existing) {
        const otherJobs = existing.filter(r => r.jobId !== params.jobId);
        if (otherJobs.length > 0) {
          const prev = otherJobs[0];
          warnings.push({
            type: 'DUPLICATE_MEDIA',
            mediaSha256: sha,
            assetId: asset.assetId,
            existingJobId: prev.jobId,
            existingPlatform: prev.platform,
            message: `Media asset previously utilized in job "${prev.jobId}". Verify intended reuse.`,
          });
        }
      }
    }

    if (warnings.length > 0) {
      LocalActionLogger.getInstance().log({
        action: 'MEDIA_DUPLICATE_DETECTED',
        details: `Detected ${warnings.length} duplicate media warning(s) for job "${params.jobId}": ${warnings.map(w => `[${w.type}] ${w.message}`).join('; ')}`,
        severity: 'WARN',
        safetyCheckPassed: true,
      });
    }

    return warnings;
  }
}
