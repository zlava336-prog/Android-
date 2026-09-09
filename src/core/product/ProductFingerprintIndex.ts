/**
 * Phone Agent - Step 2K Product Duplicate Detection & Indexing
 * Detects duplicate research candidates, repeated product selections, identical URLs,
 * and canonical product fingerprint collisions across research sessions.
 * Never merges conflicting product data automatically; flags for human review.
 */

import { ProductData } from './ProductData';
import { ProductCandidate } from './ProductCandidate';
import { computeProductFingerprint, computeProductUrlFingerprint } from './ProductFingerprint';

export interface IndexedProductEntry {
  productId?: string;
  productFingerprint: string;
  urlFingerprint: string;
  sourceUrl?: string;
  title: string;
  firstSeenAt: number;
  lastSeenAt: number;
  researchSessionIds: string[];
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType?: 'EXACT_FINGERPRINT' | 'IDENTICAL_URL' | 'ASIN_MATCH' | 'CANDIDATE_TITLE_MATCH';
  existingEntry?: IndexedProductEntry;
  reason?: string;
  hasConflict: boolean;
  conflictDetails?: string;
}

export class ProductFingerprintIndex {
  private static instance: ProductFingerprintIndex | null = null;

  // Key: productFingerprint
  private fingerprintMap: Map<string, IndexedProductEntry> = new Map();
  // Key: urlFingerprint
  private urlMap: Map<string, string> = new Map(); // urlFingerprint -> productFingerprint
  // Key: ASIN / ProductId
  private asinMap: Map<string, string> = new Map(); // asin -> productFingerprint
  // Key: Canonical normalized title
  private titleMap: Map<string, string> = new Map(); // normalized title -> productFingerprint

  public static getInstance(): ProductFingerprintIndex {
    if (!ProductFingerprintIndex.instance) {
      ProductFingerprintIndex.instance = new ProductFingerprintIndex();
    }
    return ProductFingerprintIndex.instance;
  }

  public static resetInstance(): void {
    ProductFingerprintIndex.instance = null;
  }

  private normalizeTitle(title: string): string {
    return (title || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Checks if a candidate is a duplicate of an existing indexed product.
   */
  public checkCandidateDuplicate(candidate: ProductCandidate): DuplicateCheckResult {
    if (candidate.productUrl) {
      const urlFp = computeProductUrlFingerprint(candidate.productUrl);
      if (this.urlMap.has(urlFp)) {
        const pfp = this.urlMap.get(urlFp)!;
        const entry = this.fingerprintMap.get(pfp);
        return {
          isDuplicate: true,
          duplicateType: 'IDENTICAL_URL',
          existingEntry: entry,
          reason: `Candidate URL matches previously researched product: "${entry?.title || pfp}"`,
          hasConflict: false,
        };
      }
    }

    const normTitle = this.normalizeTitle(candidate.title);
    if (normTitle && this.titleMap.has(normTitle)) {
      const pfp = this.titleMap.get(normTitle)!;
      const entry = this.fingerprintMap.get(pfp);
      return {
        isDuplicate: true,
        duplicateType: 'CANDIDATE_TITLE_MATCH',
        existingEntry: entry,
        reason: `Candidate title matches previously researched product: "${entry?.title || pfp}"`,
        hasConflict: false,
      };
    }

    return { isDuplicate: false, hasConflict: false };
  }

  /**
   * Checks if a full ProductData record is a duplicate or has conflicts with indexed products.
   */
  public checkProductDuplicate(product: ProductData): DuplicateCheckResult {
    const pfp = product.dataFingerprint || computeProductFingerprint(product);

    // 1. Exact fingerprint match
    if (this.fingerprintMap.has(pfp)) {
      const entry = this.fingerprintMap.get(pfp)!;
      return {
        isDuplicate: true,
        duplicateType: 'EXACT_FINGERPRINT',
        existingEntry: entry,
        reason: `Exact product fingerprint match (${pfp.slice(0, 14)}...).`,
        hasConflict: false,
      };
    }

    // 2. URL match with different fingerprint -> Conflict!
    if (product.sourceUrl) {
      const urlFp = product.sourceUrlFingerprint || computeProductUrlFingerprint(product.sourceUrl);
      if (this.urlMap.has(urlFp)) {
        const existingPfp = this.urlMap.get(urlFp)!;
        const entry = this.fingerprintMap.get(existingPfp);
        return {
          isDuplicate: true,
          duplicateType: 'IDENTICAL_URL',
          existingEntry: entry,
          reason: 'Same source URL previously extracted with different product details.',
          hasConflict: true,
          conflictDetails: `URL matches "${entry?.title}", but data fingerprint differs (${existingPfp.slice(0, 10)} vs ${pfp.slice(0, 10)}). Review required.`,
        };
      }
    }

    // 3. ASIN match with different fingerprint -> Conflict!
    if (product.productId) {
      const asin = product.productId.trim().toUpperCase();
      if (this.asinMap.has(asin)) {
        const existingPfp = this.asinMap.get(asin)!;
        const entry = this.fingerprintMap.get(existingPfp);
        return {
          isDuplicate: true,
          duplicateType: 'ASIN_MATCH',
          existingEntry: entry,
          reason: `Same Product ID/ASIN (${asin}) previously researched.`,
          hasConflict: true,
          conflictDetails: `ASIN ${asin} already registered to "${entry?.title}". Requires manual review.`,
        };
      }
    }

    return { isDuplicate: false, hasConflict: false };
  }

  /**
   * Indexes an approved product record.
   */
  public indexProduct(product: ProductData, researchSessionId?: string): IndexedProductEntry {
    const pfp = product.dataFingerprint || computeProductFingerprint(product);
    const urlFp = product.sourceUrl ? computeProductUrlFingerprint(product.sourceUrl) : '';
    const now = Date.now();

    const existing = this.fingerprintMap.get(pfp);
    if (existing) {
      existing.lastSeenAt = now;
      if (researchSessionId && !existing.researchSessionIds.includes(researchSessionId)) {
        existing.researchSessionIds.push(researchSessionId);
      }
      return existing;
    }

    const entry: IndexedProductEntry = {
      productId: product.productId,
      productFingerprint: pfp,
      urlFingerprint: urlFp,
      sourceUrl: product.sourceUrl,
      title: product.title || product.productName || 'Untitled Product',
      firstSeenAt: now,
      lastSeenAt: now,
      researchSessionIds: researchSessionId ? [researchSessionId] : [],
    };

    this.fingerprintMap.set(pfp, entry);
    if (urlFp) {
      this.urlMap.set(urlFp, pfp);
    }
    if (product.productId) {
      this.asinMap.set(product.productId.trim().toUpperCase(), pfp);
    }
    const normTitle = this.normalizeTitle(product.title || product.productName || '');
    if (normTitle) {
      this.titleMap.set(normTitle, pfp);
    }

    return entry;
  }

  public getEntry(productFingerprint: string): IndexedProductEntry | undefined {
    return this.fingerprintMap.get(productFingerprint);
  }

  public getAllEntries(): IndexedProductEntry[] {
    return Array.from(this.fingerprintMap.values());
  }

  public clear(): void {
    this.fingerprintMap.clear();
    this.urlMap.clear();
    this.asinMap.clear();
    this.titleMap.clear();
  }
}
