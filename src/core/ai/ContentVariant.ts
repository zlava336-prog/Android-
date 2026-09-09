/**
 * Phone Agent - Step 2L Content Variant Model
 * Supports generating multiple creative expressions (Variant A, Variant B, Variant C)
 * sharing the identical verified ProductData factual foundation.
 * Each variant receives a unique deterministic variantFingerprint and cannot bypass review.
 */

import { CanonicalContent } from './CanonicalContent';

export interface ContentVariant {
  variantId: string;
  variantName: string; // e.g. "Variant A (Problem-Solution)", "Variant B (Feature Spotlight)"
  style: string; // e.g. "Problem-Solution", "Curiosity", "Minimalist"
  content: CanonicalContent;
  variantFingerprint: string; // varfp_<sha256>
  isRecommended?: boolean;
  warnings: string[];
  createdAt: number;
}
