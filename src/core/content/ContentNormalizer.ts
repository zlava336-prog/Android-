/**
 * Phone Agent - Step 2J Deterministic Content Normalizer
 * Normalizes whitespace, preserves Unicode and emojis verbatim, deduplicates hashtags,
 * normalizes CTAs without mutating factual product data, and flags incomplete records.
 * Never invents prices, specifications, reviews, or guarantees.
 */

import { ContentPackage, ProductData, ContentValidationResult } from './ContentPackage';
import { ContentClaimValidator } from './ContentClaimValidator';
import { LocalActionLogger } from '../logger';

export interface NormalizationOptions {
  stripRedundantHashtagsFromText?: boolean;
}

export class ContentNormalizer {
  private static instance: ContentNormalizer | null = null;
  private claimValidator: ContentClaimValidator;

  constructor(claimValidator?: ContentClaimValidator) {
    this.claimValidator = claimValidator || ContentClaimValidator.getInstance();
  }

  public static getInstance(): ContentNormalizer {
    if (!ContentNormalizer.instance) {
      ContentNormalizer.instance = new ContentNormalizer();
    }
    return ContentNormalizer.instance;
  }

  /**
   * Normalizes whitespace while preserving all Unicode and Emoji codepoints intact.
   */
  public normalizeWhitespace(text: string): string {
    if (!text || typeof text !== 'string') return '';

    return text
      // Normalize Windows CRLF to standard LF
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Collapse horizontal spaces and tabs into a single space
      .replace(/[^\S\n]+/g, ' ')
      // Collapse 3 or more consecutive newlines into 2 (one blank line)
      .replace(/\n{3,}/g, '\n\n')
      // Trim leading and trailing whitespace
      .trim();
  }

  /**
   * Normalizes an individual hashtag:
   * - Ensures single leading '#'
   * - Strips invalid punctuation/spaces while preserving Unicode/alphanumeric characters
   */
  public normalizeHashtag(tag: string): string {
    if (!tag || typeof tag !== 'string') return '';
    const trimmed = tag.trim();
    if (!trimmed) return '';

    // Strip leading '#' characters
    let cleaned = trimmed.replace(/^#+/, '');
    // Remove whitespace and invalid punctuation inside tag (keep letters, digits, underscores, and unicode chars)
    cleaned = cleaned.replace(/[^\p{L}\p{N}_]/gu, '');

    if (!cleaned) return '';
    return `#${cleaned}`;
  }

  /**
   * Deduplicates a list of hashtags case-insensitively while preserving first occurrence casing.
   */
  public deduplicateHashtags(hashtags: string[]): string[] {
    if (!hashtags || !Array.isArray(hashtags)) return [];

    const seenLower = new Set<string>();
    const result: string[] = [];

    for (const raw of hashtags) {
      const normalized = this.normalizeHashtag(raw);
      if (!normalized) continue;
      const lower = normalized.toLowerCase();
      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        result.push(normalized);
      }
    }

    return result;
  }

  /**
   * Extracts all hashtag words present directly within text body.
   */
  public extractHashtagsFromText(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/#[\p{L}\p{N}_]+/gu);
    if (!matches) return [];
    return this.deduplicateHashtags(matches);
  }

  /**
   * Removes hashtag duplication between text body and hashtags array.
   * If a hashtag is already present in the caption text, it is omitted from the trailing hashtag list.
   */
  public filterHashtagsAlreadyInText(text: string, hashtags: string[]): string[] {
    const textTags = new Set(this.extractHashtagsFromText(text).map(t => t.toLowerCase()));
    return this.deduplicateHashtags(hashtags).filter(t => !textTags.has(t.toLowerCase()));
  }

  /**
   * Normalizes Call To Action text and ensures product/affiliate link consistency.
   */
  public normalizeCta(cta?: string, productData?: ProductData): string {
    if (!cta && !productData?.affiliateLink && !productData?.productUrl) {
      return '';
    }

    let normalized = this.normalizeWhitespace(cta || '');

    // If CTA is empty but product URL / affiliate link is present, prepare a clean CTA
    if (!normalized && (productData?.affiliateLink || productData?.productUrl)) {
      const link = productData.affiliateLink || productData.productUrl;
      normalized = `Check it out: ${link}`;
    }

    return normalized;
  }

  /**
   * Validates product data completeness.
   * If product data is provided but missing essential factual fields, flags as NEEDS_REVIEW.
   */
  public validateProductDataCompleteness(product?: ProductData): {
    isComplete: boolean;
    missingFields: string[];
    warnings: string[];
  } {
    if (!product) {
      return { isComplete: true, missingFields: [], warnings: [] };
    }

    const missingFields: string[] = [];
    const warnings: string[] = [];

    if (!product.productName || product.productName.trim().length === 0) {
      missingFields.push('productName');
      warnings.push('Product name is missing or empty.');
    }

    if (!product.productUrl || product.productUrl.trim().length === 0) {
      missingFields.push('productUrl');
      warnings.push('Product URL is missing. Product Link Source requires a valid source link.');
    }

    if (product.source === 'AMAZON') {
      // Amazon special rule: Amazon is strictly Product Link Source
      if (product.price !== undefined && product.price <= 0) {
        warnings.push('Amazon product price is non-positive. Verify current live listing.');
      }
      if (!product.productId && (!product.productUrl || !product.productUrl.includes('/dp/'))) {
        warnings.push('Amazon product ASIN or standard /dp/ link could not be identified.');
      }
    }

    return {
      isComplete: missingFields.length === 0,
      missingFields,
      warnings,
    };
  }

  /**
   * Normalizes an entire ContentPackage deterministically:
   * - Whitespace cleaned
   * - Unicode/emojis preserved
   * - Hashtags normalized and deduplicated
   * - Claims validated and flagged
   * - Product completeness checked
   */
  public normalize(
    pkg: ContentPackage,
    options?: NormalizationOptions
  ): {
    normalizedPackage: ContentPackage;
    validationResult: ContentValidationResult;
  } {
    const baseCaption = this.normalizeWhitespace(pkg.baseCaption || '');
    const title = this.normalizeWhitespace(pkg.title || '');
    const description = this.normalizeWhitespace(pkg.description || '');

    // Hashtags: normalize & optionally omit those already in caption
    let cleanHashtags = this.deduplicateHashtags(pkg.hashtags || []);
    if (options?.stripRedundantHashtagsFromText !== false) {
      cleanHashtags = this.filterHashtagsAlreadyInText(baseCaption, cleanHashtags);
    }

    // CTA
    const callToAction = this.normalizeCta(pkg.callToAction, pkg.productData);

    // Product completeness
    const productCheck = this.validateProductDataCompleteness(pkg.productData);

    // Scan for deceptive / medical / exaggerated claims
    const claimBlocks = [
      { location: 'baseCaption', text: baseCaption },
      { location: 'title', text: title },
      { location: 'description', text: description },
      { location: 'callToAction', text: callToAction },
      ...(pkg.productData?.keyFeatures || []).map((f, i) => ({
        location: `productData.keyFeatures[${i}]`,
        text: f,
      })),
      ...(pkg.productData?.benefits || []).map((b, i) => ({
        location: `productData.benefits[${i}]`,
        text: b,
      })),
    ];
    const claimWarnings = this.claimValidator.scanClaims(claimBlocks);

    const errors: string[] = [];
    const warnings: string[] = [...productCheck.warnings];

    if (!baseCaption && !title && !description) {
      errors.push('Content package has no caption, title, or description text.');
    }

    if (pkg.mediaAssets.length === 0) {
      warnings.push('No media assets attached to content package.');
    }

    // Determine state
    const hasBlockingClaims = claimWarnings.some(c => c.severity === 'BLOCK');
    const hasWarnings = warnings.length > 0 || claimWarnings.length > 0;
    const needsReview = hasBlockingClaims || hasWarnings || !productCheck.isComplete;
    const valid = errors.length === 0 && !hasBlockingClaims;

    const validationResult: ContentValidationResult = {
      valid,
      needsReview,
      errors,
      warnings,
      claimWarnings,
      mediaErrors: [],
      validatedAt: Date.now(),
    };

    const normalizedPackage: ContentPackage = {
      ...pkg,
      baseCaption,
      title,
      description,
      hashtags: cleanHashtags,
      callToAction,
      validationState: valid ? (needsReview ? 'NEEDS_REVIEW' : 'VALID') : 'VALIDATION_FAILED',
      reviewState: valid ? (needsReview ? 'NEEDS_REVIEW' : 'READY_FOR_REVIEW') : 'DRAFT',
      lastValidationResult: validationResult,
      updatedAt: Date.now(),
    };

    LocalActionLogger.getInstance().log({
      action: 'CONTENT_NORMALIZED',
      details: `Normalized ContentPackage "${pkg.contentId}": status=${normalizedPackage.validationState}, claims=${claimWarnings.length}, hashtags=${cleanHashtags.length}`,
      severity: 'INFO',
      safetyCheckPassed: valid,
    });

    return {
      normalizedPackage,
      validationResult,
    };
  }
}
