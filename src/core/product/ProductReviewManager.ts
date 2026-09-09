/**
 * Phone Agent - Step 2K Product Review Manager & Cryptographic Approval System
 * Manages human approval for researched products before they can enter the Step 2J Content Pipeline.
 * Cryptographically binds product fingerprint, source URL fingerprint, research session,
 * and policy results to operator approval.
 * HARD SAFETY INVARIANT: Any modification to product data transitions state to STALE_APPROVAL.
 * Zero auto-approval, zero silent re-approval.
 */

import { ProductData } from './ProductData';
import { computeProductFingerprint, computeProductUrlFingerprint } from './ProductFingerprint';
import { ProductPolicyResult, ProductPolicyValidator } from './ProductPolicyValidator';
import { ProductFingerprintIndex } from './ProductFingerprintIndex';
import { sha256 } from '../content/ContentFingerprint';
import { LocalActionLogger } from '../logger';
import { ContentPackage, createDefaultContentPackage } from '../content/ContentPackage';

export type ProductReviewState =
  | 'NEEDS_REVIEW'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'STALE_APPROVAL';

export interface ProductApprovalRecord {
  approvalId: string;
  researchSessionId: string;
  reviewerId: string;
  approvedAt: number;
  productFingerprint: string;
  sourceUrlFingerprint: string;
  policyFingerprint: string;
  isRevoked: boolean;
  revocationReason?: string;
}

export class ProductReviewManager {
  private static instance: ProductReviewManager | null = null;
  private policyValidator: ProductPolicyValidator;
  private fingerprintIndex: ProductFingerprintIndex;

  // Key: approvalId -> ProductApprovalRecord
  private approvals: Map<string, ProductApprovalRecord> = new Map();

  constructor(
    policyValidator?: ProductPolicyValidator,
    fingerprintIndex?: ProductFingerprintIndex
  ) {
    this.policyValidator = policyValidator || ProductPolicyValidator.getInstance();
    this.fingerprintIndex = fingerprintIndex || ProductFingerprintIndex.getInstance();
  }

  public static getInstance(): ProductReviewManager {
    if (!ProductReviewManager.instance) {
      ProductReviewManager.instance = new ProductReviewManager();
    }
    return ProductReviewManager.instance;
  }

  public static resetInstance(): void {
    ProductReviewManager.instance = null;
  }

  /**
   * Verifies if a product has a valid, untampered approval.
   */
  public verifyApprovalStatus(
    product: ProductData,
    approval?: ProductApprovalRecord
  ): {
    state: ProductReviewState;
    isApproved: boolean;
    reason?: string;
  } {
    if (!approval) {
      return { state: 'NEEDS_REVIEW', isApproved: false, reason: 'No approval record provided.' };
    }

    if (approval.isRevoked) {
      return {
        state: 'REJECTED',
        isApproved: false,
        reason: `Approval revoked: ${approval.revocationReason || 'Operator revocation'}`,
      };
    }

    // Check product fingerprint match
    const currentPfp = computeProductFingerprint(product);
    if (currentPfp !== approval.productFingerprint) {
      return {
        state: 'STALE_APPROVAL',
        isApproved: false,
        reason: `Product data was modified after approval. Expected ${approval.productFingerprint.slice(0, 10)}, got ${currentPfp.slice(0, 10)}. Re-approval required.`,
      };
    }

    // Check source URL fingerprint match
    const currentUrlFp = product.sourceUrl ? computeProductUrlFingerprint(product.sourceUrl) : '';
    if (currentUrlFp !== approval.sourceUrlFingerprint) {
      return {
        state: 'STALE_APPROVAL',
        isApproved: false,
        reason: 'Product source URL was modified after approval. Re-approval required.',
      };
    }

    // Re-verify policy verdict has not become blocked
    const currentPolicy = this.policyValidator.evaluateProduct(product);
    if (currentPolicy.verdict === 'BLOCK') {
      return {
        state: 'STALE_APPROVAL',
        isApproved: false,
        reason: 'Current product data triggers a prohibited policy BLOCK. Approval invalidated.',
      };
    }

    return { state: 'APPROVED', isApproved: true };
  }

  /**
   * Evaluates product readiness for review.
   */
  public prepareForReview(product: ProductData): {
    state: ProductReviewState;
    policyResult: ProductPolicyResult;
    canApprove: boolean;
    blockers: string[];
  } {
    const blockers: string[] = [];

    if (!product.title || product.title.trim().length === 0) {
      blockers.push('Product title is missing.');
    }

    if (!product.sourceUrl || product.sourceUrl.trim().length === 0) {
      blockers.push('Product source URL is missing. Amazon is Product Link Source.');
    }

    const policy = this.policyValidator.evaluateProduct(product);
    if (policy.verdict === 'BLOCK') {
      blockers.push(`Prohibited claims detected (${policy.blockedCount} block issue(s)). Must resolve before approval.`);
    }

    if (product.conflicts && product.conflicts.some(c => !c.resolved)) {
      blockers.push('Unresolved visible data conflicts detected.');
    }

    const canApprove = blockers.length === 0;
    const state: ProductReviewState = canApprove ? 'READY_FOR_REVIEW' : 'NEEDS_REVIEW';

    return {
      state,
      policyResult: policy,
      canApprove,
      blockers,
    };
  }

  /**
   * Approves a researched product.
   * Cryptographically binds approval record to product fingerprint and policy result.
   */
  public approveProduct(
    product: ProductData,
    sessionId: string,
    reviewerId: string
  ): {
    approvedProduct: ProductData;
    approvalRecord: ProductApprovalRecord;
  } {
    const { canApprove, blockers, policyResult } = this.prepareForReview(product);
    if (!canApprove) {
      const reason = `Approval rejected: ${blockers.join('; ')}`;
      LocalActionLogger.getInstance().log({
        platform: 'amazon',
        action: 'PRODUCT_APPROVAL_REJECTED',
        details: reason,
        severity: 'WARN',
        safetyCheckPassed: false,
      });
      throw new Error(reason);
    }

    const pfp = computeProductFingerprint(product);
    const urlFp = product.sourceUrl ? computeProductUrlFingerprint(product.sourceUrl) : '';
    const now = Date.now();
    const approvalId = `prod_appr_${sha256(`${pfp}:${reviewerId}:${now}`)}`;

    const approvalRecord: ProductApprovalRecord = {
      approvalId,
      researchSessionId: sessionId,
      reviewerId,
      approvedAt: now,
      productFingerprint: pfp,
      sourceUrlFingerprint: urlFp,
      policyFingerprint: policyResult.policyFingerprint,
      isRevoked: false,
    };

    this.approvals.set(approvalId, approvalRecord);

    const approvedProduct: ProductData = {
      ...product,
      dataFingerprint: pfp,
      sourceUrlFingerprint: urlFp,
      validationStatus: 'VALID',
    };

    // Index product for duplicate detection
    this.fingerprintIndex.indexProduct(approvedProduct, sessionId);

    LocalActionLogger.getInstance().log({
      platform: 'amazon',
      action: 'PRODUCT_APPROVED',
      details: `Product "${product.title}" approved by "${reviewerId}". Fingerprint: ${pfp.slice(0, 14)}...`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return { approvedProduct, approvalRecord };
  }

  /**
   * Rejects a researched product.
   */
  public rejectProduct(
    product: ProductData,
    sessionId: string,
    reviewerId: string,
    reason: string
  ): ProductApprovalRecord {
    const pfp = computeProductFingerprint(product);
    const now = Date.now();
    const approvalId = `prod_rej_${sha256(`${pfp}:${reviewerId}:${now}`)}`;

    const record: ProductApprovalRecord = {
      approvalId,
      researchSessionId: sessionId,
      reviewerId,
      approvedAt: now,
      productFingerprint: pfp,
      sourceUrlFingerprint: product.sourceUrlFingerprint || '',
      policyFingerprint: '',
      isRevoked: true,
      revocationReason: reason,
    };

    this.approvals.set(approvalId, record);

    LocalActionLogger.getInstance().log({
      platform: 'amazon',
      action: 'PRODUCT_REJECTED',
      details: `Product "${product.title}" rejected by "${reviewerId}": ${reason}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });

    return record;
  }

  /**
   * Creates a Step 2J ContentPackage from an approved ProductData record.
   * Strictly enforces that unapproved product data cannot enter ContentPackage.
   */
  public createContentPackageFromApprovedProduct(
    approvedProduct: ProductData,
    approval: ProductApprovalRecord,
    options?: {
      baseCaption?: string;
      title?: string;
      description?: string;
      hashtags?: string[];
      callToAction?: string;
      selectedPlatforms?: any[];
    }
  ): ContentPackage {
    const status = this.verifyApprovalStatus(approvedProduct, approval);
    if (!status.isApproved) {
      const msg = `Cannot create ContentPackage: ProductData is not approved (${status.state}): ${status.reason}`;
      LocalActionLogger.getInstance().log({
        platform: 'amazon',
        action: 'CONTENT_PACKAGE_CREATION_DENIED',
        details: msg,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      throw new Error(msg);
    }

    const defaultTitle = options?.title || approvedProduct.title;
    const defaultCaption =
      options?.baseCaption ||
      `${approvedProduct.title}\n\n${approvedProduct.description || ''}`.trim();

    return createDefaultContentPackage({
      contentId: `pkg_${approvedProduct.productId || Date.now()}`,
      sourceType: 'AMAZON_PRODUCT',
      sourceReference: approvedProduct.sourceUrl,
      productData: {
        ...approvedProduct,
        productName: approvedProduct.productName || approvedProduct.title,
        productUrl: approvedProduct.productUrl || approvedProduct.sourceUrl,
      },
      title: defaultTitle,
      baseCaption: defaultCaption,
      description: options?.description || approvedProduct.description,
      hashtags: options?.hashtags || ['#AmazonFinds', '#ProductReview'],
      callToAction: options?.callToAction || 'Tap link in bio to check current price on Amazon.',
      selectedPlatforms: options?.selectedPlatforms || ['instagram', 'threads'],
      mediaAssets: approvedProduct.imageAssets || [],
    });
  }

  public getApproval(approvalId: string): ProductApprovalRecord | undefined {
    return this.approvals.get(approvalId);
  }
}
