/**
 * Phone Agent - Step 2K Product Data Model
 * Deterministic, source-backed product information extracted from the visible Amazon UI.
 * Field-level provenance, confidence scoring, explicit nullable values, and zero guessing.
 */

import { MediaAsset, ProductSourceType } from '../content/ContentPackage';
import { ProductFieldProvenance, ProductFieldConflict } from './ProductFieldProvenance';

export type ProductValidationStatus = 'VALID' | 'NEEDS_REVIEW' | 'INVALID' | 'CONFLICT';

export interface ProductPriceStructure {
  amount?: number;
  currency?: string;
  qualifier?: string; // e.g. "with coupon", "starting at", "per count"
  isDiscounted?: boolean;
  originalAmount?: number;
  extractedFromText?: string;
  timestamp: number;
}

export interface ProductData {
  // Core Identifiers
  productId?: string;
  source: ProductSourceType;
  sourceUrl?: string;
  sourceUrlFingerprint?: string;
  productUrl?: string; // Synchronized alias of sourceUrl

  // Title / Name (Synchronized for backward compatibility)
  title: string;
  productName?: string;

  // Product Classification
  brand?: string;
  category?: string;

  // Pricing
  price?: number;
  currency?: string;
  priceQualifier?: string;
  priceStructure?: ProductPriceStructure;

  // Availability & Seller
  availability?: string; // e.g. "In Stock", "Only 2 left in stock", "Currently unavailable"

  // Social Proof (strictly observed, never synthesized)
  rating?: number;
  reviewCount?: number;

  // Content Details
  description?: string;
  keyFeatures?: string[];
  benefits?: string[];
  specifications?: Record<string, string>;

  // Media (strictly local references only: content://, file://)
  imageAssets?: MediaAsset[];

  // Meta & Provenance
  sourceTimestamp: number;
  dataFingerprint?: string; // pfp_<sha256>
  researchSessionId?: string;
  overallConfidence: number; // 0.0 to 1.0
  validationStatus: ProductValidationStatus;
  fieldProvenance: ProductFieldProvenance[];
  conflicts?: ProductFieldConflict[];

  // Optional Monetization
  affiliateLink?: string;
}

/**
 * Creates a default ProductData object with explicit nullables and synchronized fields.
 */
export function createDefaultProductData(params: Partial<ProductData> & { title: string }): ProductData {
  const title = params.title.trim();
  const productName = params.productName?.trim() || title;
  const effectiveUrl = params.sourceUrl || params.productUrl;

  return {
    productId: params.productId,
    source: params.source || 'AMAZON',
    sourceUrl: effectiveUrl,
    productUrl: effectiveUrl,
    sourceUrlFingerprint: params.sourceUrlFingerprint,
    title,
    productName,
    brand: params.brand,
    category: params.category,
    price: params.price,
    currency: params.currency || 'USD',
    priceQualifier: params.priceQualifier,
    priceStructure: params.priceStructure,
    availability: params.availability,
    rating: params.rating,
    reviewCount: params.reviewCount,
    description: params.description,
    keyFeatures: params.keyFeatures ? [...params.keyFeatures] : [],
    benefits: params.benefits ? [...params.benefits] : [],
    specifications: params.specifications ? { ...params.specifications } : {},
    imageAssets: params.imageAssets ? [...params.imageAssets] : [],
    sourceTimestamp: params.sourceTimestamp || Date.now(),
    dataFingerprint: params.dataFingerprint,
    researchSessionId: params.researchSessionId,
    overallConfidence: params.overallConfidence !== undefined ? params.overallConfidence : 1.0,
    validationStatus: params.validationStatus || 'NEEDS_REVIEW',
    fieldProvenance: params.fieldProvenance ? [...params.fieldProvenance] : [],
    conflicts: params.conflicts ? [...params.conflicts] : [],
    affiliateLink: params.affiliateLink,
  };
}
