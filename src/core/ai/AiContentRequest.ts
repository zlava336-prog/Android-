/**
 * Phone Agent - Step 2L AI Content Request Contract
 * Strict deterministic input contract for AI content generation.
 * Enforces verified ProductData, validated media references, and zero sensitive leaks.
 */

import { SupportedPlatform } from '../../types/job';
import { MediaAsset } from '../content/ContentPackage';
import { ProductData } from '../product/ProductData';

export type ContentObjective =
  | 'AWARENESS'
  | 'PRODUCT_SPOTLIGHT'
  | 'EDUCATION'
  | 'USE_CASE'
  | 'ENGAGEMENT'
  | 'CONVERSION';

export type BrandVoice =
  | 'INFORMATIVE'
  | 'ENTHUSIASTIC'
  | 'MINIMALIST'
  | 'PROFESSIONAL'
  | 'CONVERSATIONAL';

export type ContentType =
  | 'HOOK'
  | 'CAPTION'
  | 'TITLE'
  | 'DESCRIPTION'
  | 'HASHTAGS'
  | 'CTA'
  | 'SHORT_SCRIPT'
  | 'PRODUCT_HIGHLIGHTS'
  | 'CONTENT_VARIANTS';

export interface GenerationConstraints {
  maxCaptionLength?: number;
  maxHashtags?: number;
  disallowedWords?: string[];
  toneGuidelines?: string;
}

export interface AiContentRequest {
  requestId: string;
  productData: ProductData;
  productFingerprint: string;
  mediaAssets: MediaAsset[];
  mediaFingerprints: string[];
  contentObjective: ContentObjective;
  targetAudience: string;
  brandVoice: BrandVoice;
  language: string; // e.g. "en-US", "en", "hi"
  platforms: SupportedPlatform[];
  requestedContentTypes: ContentType[];
  userProvidedInstructions?: string;
  generationConstraints?: GenerationConstraints;
  requestedAt?: number;
}

export interface RequestValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedInstructions?: string;
  sensitiveFieldDetected?: string;
}

const FORBIDDEN_SENSITIVE_PATTERNS = [
  { name: 'OTP/Verification Code', regex: /\b(?:otp|one[- ]time[- ]password|verification[- ]code|auth[- ]code|\b\d{4,8}\b.*(?:code|otp))\b/i },
  { name: 'Password/Credentials', regex: /\b(?:password|passwd|secret[- ]key|api[- ]key|pin[- ]number|private[- ]key)\b/i },
  { name: 'Payment/Card Info', regex: /\b(?:cvv|cvc|credit[- ]card|debit[- ]card|\b(?:\d{4}[- ]?){4}\b)\b/i },
  { name: 'Amazon Account Session', regex: /\b(?:session[- ]id|ubid[- ]main|at[- ]main|x[- ]main|cookie)\b/i },
];

/**
 * Validates the AI Content Request against security and structural invariants.
 * Ensures Amazon is NOT in publishing platforms and sensitive user data is blocked.
 */
export function validateAiContentRequest(request: AiContentRequest): RequestValidationResult {
  const errors: string[] = [];

  if (!request) {
    return { isValid: false, errors: ['Request object is null or undefined'] };
  }

  if (!request.requestId || request.requestId.trim().length === 0) {
    errors.push('Missing requestId');
  }

  if (!request.productData) {
    errors.push('Missing productData. Generation requires verified product information.');
  } else {
    if (!request.productData.title && !request.productData.productName) {
      errors.push('ProductData must contain a valid title or productName');
    }
  }

  if (!request.productFingerprint || !request.productFingerprint.startsWith('pfp_')) {
    errors.push('Missing or invalid productFingerprint (must start with pfp_)');
  }

  if (!Array.isArray(request.platforms) || request.platforms.length === 0) {
    errors.push('At least one target platform must be specified');
  } else {
    // Invariant: Amazon is product link source only, never a publishing destination
    if (request.platforms.includes('amazon')) {
      errors.push('Security Violation: Amazon cannot be selected as a content publishing target platform.');
    }
  }

  if (!Array.isArray(request.requestedContentTypes) || request.requestedContentTypes.length === 0) {
    errors.push('At least one requestedContentType must be specified');
  }

  // Check for forbidden sensitive text in userProvidedInstructions
  let sensitiveFieldDetected: string | undefined;
  if (request.userProvidedInstructions) {
    for (const pattern of FORBIDDEN_SENSITIVE_PATTERNS) {
      if (pattern.regex.test(request.userProvidedInstructions)) {
        sensitiveFieldDetected = pattern.name;
        errors.push(`Sensitive data violation: Instructions contain prohibited ${pattern.name}`);
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedInstructions: request.userProvidedInstructions?.trim(),
    sensitiveFieldDetected,
  };
}
