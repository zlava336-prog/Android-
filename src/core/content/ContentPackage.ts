/**
 * Phone Agent - Step 2J Production-Grade Content Package & Pipeline Types
 * Deterministic data contracts for local media, product link source data,
 * validation states, platform overrides, and cryptographic approval bindings.
 * Zero secrets persisted.
 */

import { SupportedPlatform } from '../../types/job';

export const CONTENT_PACKAGE_SCHEMA_VERSION = 1;

export type MediaContentType = 'IMAGE' | 'VIDEO';

export interface MediaAsset {
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

export type ProductSourceType = 'AMAZON' | 'MANUAL' | 'EXTERNAL';

export interface ProductData {
  title?: string;
  productName: string;
  productUrl?: string;
  sourceUrl?: string;
  sourceUrlFingerprint?: string;
  source: ProductSourceType;
  price?: number;
  currency?: string;
  priceQualifier?: string;
  availability?: string;
  rating?: number;
  reviewCount?: number;
  productId?: string;
  category?: string;
  brand?: string;
  description?: string;
  keyFeatures?: string[];
  benefits?: string[];
  specifications?: Record<string, string>;
  imageAssets?: MediaAsset[];
  affiliateLink?: string;
  sourceTimestamp: number;
  dataFingerprint?: string;
  researchSessionId?: string;
  overallConfidence?: number;
  validationStatus?: 'VALID' | 'NEEDS_REVIEW' | 'INVALID' | 'CONFLICT';
  fieldProvenance?: any[];
  conflicts?: any[];
}

export interface PlatformContentOverride {
  platform: SupportedPlatform;
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  callToAction?: string;
  coverUri?: string;
  mediaAssetId?: string;
  overrideFingerprint?: string;
}

export type ContentValidationState =
  | 'DRAFT'
  | 'VALIDATING'
  | 'NEEDS_REVIEW'
  | 'VALID'
  | 'VALIDATION_FAILED';

export type ContentReviewState =
  | 'DRAFT'
  | 'VALIDATING'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'STALE_APPROVAL';

export type ContentApprovalState =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'STALE'
  | 'REVOKED';

export type ContentPipelineState =
  | 'DRAFT'
  | 'VALIDATING'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'PLANNED'
  | 'WAITING_FOR_APPROVAL'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'VALIDATION_FAILED'
  | 'REJECTED'
  | 'STALE_APPROVAL'
  | 'CANCELLED';

export type ClaimCategory =
  | 'MEDICAL_CLAIM'
  | 'GUARANTEED_RESULT'
  | 'GUARANTEED_EARNINGS'
  | 'UNSUPPORTED_CERTIFICATION'
  | 'FABRICATED_REVIEW'
  | 'FABRICATED_RATING'
  | 'FABRICATED_SCARCITY'
  | 'FABRICATED_DISCOUNT'
  | 'FABRICATED_TESTIMONIAL';

export interface ClaimWarning {
  id: string;
  category: ClaimCategory;
  flaggedText: string;
  reason: string;
  severity: 'WARN' | 'BLOCK';
  location: string;
}

export interface ContentValidationResult {
  valid: boolean;
  needsReview: boolean;
  errors: string[];
  warnings: string[];
  claimWarnings: ClaimWarning[];
  mediaErrors: string[];
  validatedAt: number;
}

export interface ContentApproval {
  approvalId: string;
  approvalSessionId: string;
  approvedAt: number;
  approvedBy?: string;
  contentFingerprint: string;
  mediaFingerprint: string;
  selectedPlatforms: SupportedPlatform[];
  platformOverrideFingerprints: Record<string, string>;
  isRevoked: boolean;
  revocationReason?: string;
}

export type ContentSourceType = 'MANUAL' | 'AMAZON_PRODUCT' | 'PRODUCT_LINK' | 'LOCAL_MEDIA';

export interface ContentPackage {
  contentId: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  sourceType: ContentSourceType;
  sourceReference?: string;
  mediaAssets: MediaAsset[];
  productData?: ProductData;
  baseCaption?: string;
  title?: string;
  description?: string;
  hashtags: string[];
  callToAction?: string;
  selectedPlatforms: SupportedPlatform[];
  platformOverrides: Partial<Record<SupportedPlatform, PlatformContentOverride>>;
  contentFingerprint: string;
  mediaFingerprint: string;
  validationState: ContentValidationState;
  reviewState: ContentReviewState;
  approvalState: ContentApprovalState;
  currentApproval?: ContentApproval;
  lastValidationResult?: ContentValidationResult;
  auditMetadata: Record<string, unknown>;
}

/**
 * Creates an empty or pre-filled ContentPackage in initial DRAFT state.
 */
export function createDefaultContentPackage(partial?: Partial<ContentPackage>): ContentPackage {
  const now = Date.now();
  return {
    contentId: partial?.contentId || `pkg_${now}_${Math.random().toString(36).slice(2, 7)}`,
    schemaVersion: CONTENT_PACKAGE_SCHEMA_VERSION,
    createdAt: partial?.createdAt || now,
    updatedAt: partial?.updatedAt || now,
    sourceType: partial?.sourceType || 'MANUAL',
    sourceReference: partial?.sourceReference,
    mediaAssets: partial?.mediaAssets ? [...partial.mediaAssets] : [],
    productData: partial?.productData ? { ...partial.productData } : undefined,
    baseCaption: partial?.baseCaption || '',
    title: partial?.title || '',
    description: partial?.description || '',
    hashtags: partial?.hashtags ? [...partial.hashtags] : [],
    callToAction: partial?.callToAction || '',
    selectedPlatforms: partial?.selectedPlatforms ? [...partial.selectedPlatforms] : ['threads', 'instagram'],
    platformOverrides: partial?.platformOverrides ? { ...partial.platformOverrides } : {},
    contentFingerprint: partial?.contentFingerprint || '',
    mediaFingerprint: partial?.mediaFingerprint || '',
    validationState: partial?.validationState || 'DRAFT',
    reviewState: partial?.reviewState || 'DRAFT',
    approvalState: partial?.approvalState || 'PENDING',
    currentApproval: partial?.currentApproval,
    lastValidationResult: partial?.lastValidationResult,
    auditMetadata: partial?.auditMetadata || {
      version: '1.0.0',
      client: 'PhoneAgentContentPipeline',
    },
  };
}
