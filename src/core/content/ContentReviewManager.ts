/**
 * Phone Agent - Step 2J Production-Grade Human Review & Approval Manager
 * Binds explicit human approvals to cryptographic content and media fingerprints.
 * Strictly guarantees that any modifications to media, captions, hashtags, platform selection,
 * or platform overrides immediately transition approval to STALE_APPROVAL.
 * Zero auto-approval.
 */

import { SupportedPlatform } from '../../types/job';
import {
  ContentPackage,
  ContentApproval,
  ContentValidationResult,
  PlatformContentOverride,
} from './ContentPackage';
import { MediaValidator } from './MediaValidator';
import { ContentNormalizer } from './ContentNormalizer';
import {
  computeDeterministicContentFingerprint,
  computeMediaCollectionFingerprint,
  computePlatformOverrideFingerprint,
} from './ContentFingerprint';
import { MediaFingerprintIndex } from './MediaFingerprintIndex';
import { LocalActionLogger } from '../logger';

export class ContentReviewManager {
  private static instance: ContentReviewManager | null = null;
  private mediaValidator: MediaValidator;
  private contentNormalizer: ContentNormalizer;
  private mediaIndex: MediaFingerprintIndex;

  constructor(
    mediaValidator?: MediaValidator,
    contentNormalizer?: ContentNormalizer,
    mediaIndex?: MediaFingerprintIndex
  ) {
    this.mediaValidator = mediaValidator || MediaValidator.getInstance();
    this.contentNormalizer = contentNormalizer || ContentNormalizer.getInstance();
    this.mediaIndex = mediaIndex || MediaFingerprintIndex.getInstance();
  }

  public static getInstance(): ContentReviewManager {
    if (!ContentReviewManager.instance) {
      ContentReviewManager.instance = new ContentReviewManager();
    }
    return ContentReviewManager.instance;
  }

  /**
   * Comprehensive validation and fingerprint generation of a ContentPackage.
   */
  public validate(pkg: ContentPackage): {
    pkg: ContentPackage;
    validationResult: ContentValidationResult;
  } {
    LocalActionLogger.getInstance().log({
      action: 'CONTENT_REVIEW_STARTED',
      details: `Started validation and review for ContentPackage "${pkg.contentId}"`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    const mediaErrors: string[] = [];
    const mediaWarnings: string[] = [];

    // 1. Validate all media assets
    for (const asset of pkg.mediaAssets) {
      const res = this.mediaValidator.validateMediaAsset(asset);
      if (!res.valid) {
        mediaErrors.push(...res.errors.map(e => `[Asset ${asset.assetId}] ${e.message}`));
      }
    }

    // 2. Validate platform selection (Amazon rule: never publishing destination)
    const errors: string[] = [];
    if (pkg.selectedPlatforms.includes('amazon')) {
      errors.push(
        'Amazon is NOT a publishing destination. Amazon is restricted to Product Link Source data only.'
      );
    }
    if (pkg.selectedPlatforms.length === 0) {
      errors.push('At least one publishing platform must be selected.');
    }

    // 3. Compute deterministic media fingerprint
    const mediaFingerprint = computeMediaCollectionFingerprint(pkg.mediaAssets);

    // 4. Compute platform override fingerprints
    const updatedOverrides: Partial<Record<SupportedPlatform, PlatformContentOverride>> = {};
    const overrideFps: Record<string, string> = {};

    for (const [platform, override] of Object.entries(pkg.platformOverrides) as [
      SupportedPlatform,
      PlatformContentOverride
    ][]) {
      if (override) {
        const ofp = computePlatformOverrideFingerprint(override);
        updatedOverrides[platform] = {
          ...override,
          overrideFingerprint: ofp,
        };
        overrideFps[platform] = ofp;
      }
    }

    // 5. Normalize text, deduplicate hashtags, scan claims
    const { normalizedPackage, validationResult } = this.contentNormalizer.normalize(pkg);

    // 6. Compute deterministic content fingerprint
    const contentFingerprint = computeDeterministicContentFingerprint({
      baseCaption: normalizedPackage.baseCaption,
      title: normalizedPackage.title,
      description: normalizedPackage.description,
      hashtags: normalizedPackage.hashtags,
      callToAction: normalizedPackage.callToAction,
      selectedPlatforms: normalizedPackage.selectedPlatforms,
      productData: normalizedPackage.productData,
      mediaFingerprint,
      platformOverrides: updatedOverrides,
    });

    // 7. Media duplicate index check
    const dupWarnings = this.mediaIndex.checkForDuplicates({
      mediaAssets: pkg.mediaAssets,
      jobId: pkg.contentId,
      contentFingerprint,
      platforms: pkg.selectedPlatforms,
    });

    for (const dw of dupWarnings) {
      mediaWarnings.push(`[${dw.type}] ${dw.message}`);
    }

    // Combine validation results
    const allErrors = [...errors, ...mediaErrors, ...validationResult.errors];
    const allWarnings = [...mediaWarnings, ...validationResult.warnings];
    const valid = allErrors.length === 0 && !validationResult.claimWarnings.some(c => c.severity === 'BLOCK');
    const needsReview =
      !valid ||
      validationResult.needsReview ||
      allWarnings.length > 0 ||
      validationResult.claimWarnings.length > 0;

    const mergedValidationResult: ContentValidationResult = {
      valid,
      needsReview,
      errors: allErrors,
      warnings: allWarnings,
      claimWarnings: validationResult.claimWarnings,
      mediaErrors,
      validatedAt: Date.now(),
    };

    // Determine updated state
    let validationState = pkg.validationState;
    let reviewState = pkg.reviewState;

    if (!valid) {
      validationState = 'VALIDATION_FAILED';
      reviewState = 'DRAFT';
    } else if (needsReview) {
      validationState = 'NEEDS_REVIEW';
      reviewState = 'NEEDS_REVIEW';
    } else {
      validationState = 'VALID';
      reviewState = 'READY_FOR_REVIEW';
    }

    // If previously approved, verify if fingerprints changed
    let approvalState = pkg.approvalState;
    let currentApproval = pkg.currentApproval;

    if (pkg.approvalState === 'APPROVED' && pkg.currentApproval) {
      const isContentMatch = pkg.currentApproval.contentFingerprint === contentFingerprint;
      const isMediaMatch = pkg.currentApproval.mediaFingerprint === mediaFingerprint;
      if (!isContentMatch || !isMediaMatch) {
        approvalState = 'STALE';
        reviewState = 'STALE_APPROVAL';
        currentApproval = {
          ...pkg.currentApproval,
          isRevoked: true,
          revocationReason: 'Content or media modified after approval. Fingerprint mismatch.',
        };
        LocalActionLogger.getInstance().log({
          action: 'APPROVAL_INVALIDATED',
          details: `Approval for ContentPackage "${pkg.contentId}" invalidated due to fingerprint modification.`,
          severity: 'WARN',
          safetyCheckPassed: false,
        });
      }
    }

    const updatedPackage: ContentPackage = {
      ...normalizedPackage,
      mediaAssets: [...pkg.mediaAssets],
      selectedPlatforms: [...pkg.selectedPlatforms],
      platformOverrides: updatedOverrides,
      mediaFingerprint,
      contentFingerprint,
      validationState,
      reviewState,
      approvalState,
      currentApproval,
      lastValidationResult: mergedValidationResult,
      updatedAt: Date.now(),
    };

    return {
      pkg: updatedPackage,
      validationResult: mergedValidationResult,
    };
  }

  /**
   * Explicitly approves the entire content job.
   * NEVER triggered automatically. Must be invoked via explicit human operator action.
   */
  public approveJob(
    pkg: ContentPackage,
    approvalSessionId: string,
    approvedBy: string = 'Operator'
  ): ContentPackage {
    if (!approvalSessionId || approvalSessionId.trim().length === 0) {
      throw new Error('[Approval Security Violation] Approval requires a non-empty approvalSessionId.');
    }

    // First ensure package is fully validated
    const { pkg: validatedPkg, validationResult } = this.validate(pkg);

    if (!validationResult.valid) {
      throw new Error(
        `[Approval Rejected] Cannot approve ContentPackage "${pkg.contentId}" with validation errors: ${validationResult.errors.join('; ')}`
      );
    }

    // Amazon check
    if (validatedPkg.selectedPlatforms.includes('amazon')) {
      throw new Error(
        '[Security Invariant Violation] Cannot approve publication with Amazon in selected platforms. Amazon is strictly Product Link Source.'
      );
    }

    const now = Date.now();
    const overrideFps: Record<string, string> = {};
    for (const [p, o] of Object.entries(validatedPkg.platformOverrides)) {
      if (o) {
        overrideFps[p] = o.overrideFingerprint || computePlatformOverrideFingerprint(o);
      }
    }

    const approval: ContentApproval = {
      approvalId: `appr_${now}_${Math.random().toString(36).slice(2, 7)}`,
      approvalSessionId,
      approvedAt: now,
      approvedBy,
      contentFingerprint: validatedPkg.contentFingerprint,
      mediaFingerprint: validatedPkg.mediaFingerprint,
      selectedPlatforms: [...validatedPkg.selectedPlatforms],
      platformOverrideFingerprints: overrideFps,
      isRevoked: false,
    };

    const approvedPackage: ContentPackage = {
      ...validatedPkg,
      reviewState: 'APPROVED',
      approvalState: 'APPROVED',
      currentApproval: approval,
      updatedAt: now,
    };

    // Register media in index
    for (const media of approvedPackage.mediaAssets) {
      this.mediaIndex.registerMedia({
        mediaAsset: media,
        jobId: approvedPackage.contentId,
        contentFingerprint: approvedPackage.contentFingerprint,
      });
    }

    LocalActionLogger.getInstance().log({
      action: 'CONTENT_APPROVED',
      details: `Operator "${approvedBy}" explicitly approved ContentPackage "${pkg.contentId}" (Session: ${approvalSessionId}). CFP:${approval.contentFingerprint.slice(0, 12)} MFP:${approval.mediaFingerprint.slice(0, 12)} Platforms:${approval.selectedPlatforms.join(',')}`,
      severity: 'ACTION',
      safetyCheckPassed: true,
    });

    return approvedPackage;
  }

  /**
   * Explicitly approves a single platform within the content package.
   */
  public approvePlatform(
    pkg: ContentPackage,
    platform: SupportedPlatform,
    approvalSessionId: string,
    approvedBy: string = 'Operator'
  ): ContentPackage {
    if (platform === 'amazon') {
      throw new Error('[Security Invariant Violation] Amazon cannot be approved for publishing.');
    }
    if (!pkg.selectedPlatforms.includes(platform)) {
      throw new Error(`Platform "${platform}" is not in selectedPlatforms of package "${pkg.contentId}".`);
    }

    return this.approveJob(pkg, approvalSessionId, `${approvedBy} [Platform: ${platform}]`);
  }

  /**
   * Explicitly rejects content package.
   */
  public rejectContent(
    pkg: ContentPackage,
    reason: string,
    operator: string = 'Operator'
  ): ContentPackage {
    const now = Date.now();
    const rejectedPkg: ContentPackage = {
      ...pkg,
      reviewState: 'REJECTED',
      approvalState: 'REJECTED',
      currentApproval: pkg.currentApproval
        ? {
            ...pkg.currentApproval,
            isRevoked: true,
            revocationReason: reason,
          }
        : undefined,
      updatedAt: now,
    };

    LocalActionLogger.getInstance().log({
      action: 'CONTENT_REJECTED',
      details: `Operator "${operator}" rejected ContentPackage "${pkg.contentId}". Reason: ${reason}`,
      severity: 'WARN',
      safetyCheckPassed: false,
    });

    return rejectedPkg;
  }

  /**
   * Verifies if existing approval matches current content state.
   */
  public checkApprovalValidity(pkg: ContentPackage): { isValid: boolean; reason?: string } {
    if (pkg.approvalState !== 'APPROVED' || !pkg.currentApproval) {
      return { isValid: false, reason: 'Content has not been approved.' };
    }

    if (pkg.currentApproval.isRevoked) {
      return {
        isValid: false,
        reason: `Approval revoked: ${pkg.currentApproval.revocationReason || 'Revoked by operator'}`,
      };
    }

    // Re-derive fingerprints
    const currentMediaFp = computeMediaCollectionFingerprint(pkg.mediaAssets);
    const currentContentFp = computeDeterministicContentFingerprint({
      baseCaption: pkg.baseCaption,
      title: pkg.title,
      description: pkg.description,
      hashtags: pkg.hashtags,
      callToAction: pkg.callToAction,
      selectedPlatforms: pkg.selectedPlatforms,
      productData: pkg.productData,
      mediaFingerprint: currentMediaFp,
      platformOverrides: pkg.platformOverrides,
    });

    if (currentMediaFp !== pkg.currentApproval.mediaFingerprint) {
      return {
        isValid: false,
        reason: `Media fingerprint mismatch: expected "${pkg.currentApproval.mediaFingerprint}", but media has "${currentMediaFp}".`,
      };
    }

    if (currentContentFp !== pkg.currentApproval.contentFingerprint) {
      return {
        isValid: false,
        reason: `Content fingerprint mismatch: expected "${pkg.currentApproval.contentFingerprint}", but content has "${currentContentFp}".`,
      };
    }

    // Check platform selection match
    const approvedPlatforms = [...pkg.currentApproval.selectedPlatforms].sort().join(',');
    const currentPlatforms = [...pkg.selectedPlatforms].sort().join(',');
    if (approvedPlatforms !== currentPlatforms) {
      return {
        isValid: false,
        reason: `Platform selection changed from "${approvedPlatforms}" to "${currentPlatforms}".`,
      };
    }

    return { isValid: true };
  }

  /**
   * Checks package and automatically invalidates stale approval if any modification occurred.
   */
  public checkAndInvalidateIfModified(pkg: ContentPackage): ContentPackage {
    const validity = this.checkApprovalValidity(pkg);
    if (!validity.isValid && (pkg.approvalState === 'APPROVED' || pkg.reviewState === 'APPROVED')) {
      const invalidated: ContentPackage = {
        ...pkg,
        reviewState: 'STALE_APPROVAL',
        approvalState: 'STALE',
        currentApproval: pkg.currentApproval
          ? {
              ...pkg.currentApproval,
              isRevoked: true,
              revocationReason: validity.reason || 'Stale approval detected.',
            }
          : undefined,
        updatedAt: Date.now(),
      };

      LocalActionLogger.getInstance().log({
        action: 'APPROVAL_INVALIDATED',
        details: `Approval for ContentPackage "${pkg.contentId}" marked STALE: ${validity.reason}`,
        severity: 'WARN',
        safetyCheckPassed: false,
      });

      return invalidated;
    }
    return pkg;
  }
}
