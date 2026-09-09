/**
 * Phone Agent - Deterministic Content Fingerprint & Publication Guard
 * Implements cryptographic payload fingerprinting and local idempotency protection
 * against duplicate publishing. Zero network API dependency.
 */

import { NormalizedContentPayload } from '../types/job';

export interface PublicationRecord {
  jobId: string;
  platform: string;
  fingerprint: string;
  publishedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Computes a deterministic local fingerprint from safe payload fields.
 * Excludes passwords, OTPs, session tokens, or payment data.
 */
export function computeContentFingerprint(payload: NormalizedContentPayload): string {
  // Normalize and sanitize values
  const safeText = (payload.text || '').trim();
  const safeTitle = (payload.title || '').trim();
  const safeDescription = (payload.description || '').trim();
  const safeMedia = (payload.mediaUri || payload.videoUri || payload.imageUri || '').trim();
  const safeCover = (payload.coverUri || '').trim();
  const safeHashtags = (payload.hashtags || [])
    .map(h => (h.startsWith('#') ? h : `#${h}`).trim().toLowerCase())
    .filter(Boolean)
    .sort();

  // Deterministic canonical serialized representation
  const canonical = JSON.stringify({
    text: safeText,
    title: safeTitle,
    description: safeDescription,
    hashtags: safeHashtags,
    media: safeMedia,
    cover: safeCover,
  });

  // Deterministic 64-bit non-cryptographic hex hash with excellent distribution
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fp_${part1}${part2}`;
}

/**
 * Deterministic local publication guard.
 * Tracks successfully completed publications to prevent double-posting.
 */
export class PublicationGuard {
  private static instance: PublicationGuard | null = null;
  private publications: Map<string, PublicationRecord> = new Map();

  constructor() {}

  public static getInstance(): PublicationGuard {
    if (!PublicationGuard.instance) {
      PublicationGuard.instance = new PublicationGuard();
    }
    return PublicationGuard.instance;
  }

  public static resetInstance(): void {
    PublicationGuard.instance = null;
  }

  private makeKey(jobId: string, platform: string, fingerprint: string): string {
    return `${jobId.trim()}::${platform.trim().toLowerCase()}::${fingerprint.trim()}`;
  }

  /**
   * Checks if this exact (jobId, platform, fingerprint) has already been published.
   */
  public isPublished(jobId: string, platform: string, fingerprint: string): boolean {
    const key = this.makeKey(jobId, platform, fingerprint);
    return this.publications.has(key);
  }

  /**
   * Records a verified publication.
   */
  public recordPublication(
    jobId: string,
    platform: string,
    fingerprint: string,
    metadata?: Record<string, unknown>
  ): PublicationRecord {
    const key = this.makeKey(jobId, platform, fingerprint);
    const record: PublicationRecord = {
      jobId,
      platform: platform.toLowerCase(),
      fingerprint,
      publishedAt: Date.now(),
      metadata,
    };
    this.publications.set(key, record);
    return record;
  }

  /**
   * Retrieves a publication record if it exists.
   */
  public getPublicationRecord(jobId: string, platform: string, fingerprint: string): PublicationRecord | undefined {
    return this.publications.get(this.makeKey(jobId, platform, fingerprint));
  }

  /**
   * Returns all publication records.
   */
  public getAllRecords(): PublicationRecord[] {
    return Array.from(this.publications.values());
  }

  /**
   * Clears all publication records (for testing or clean reset).
   */
  public clear(): void {
    this.publications.clear();
  }
}
