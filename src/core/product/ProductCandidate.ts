/**
 * Phone Agent - Step 2K Product Candidate Model
 * Represents a visible product candidate discovered on the Amazon search results screen.
 * Strictly source-backed from accessibility UI nodes; zero fabricated metrics.
 */

export interface ProductCandidate {
  candidateId: string;
  title: string;
  visiblePrice?: number;
  priceQualifier?: string; // e.g. "with coupon", "after discount", "starting at"
  currency?: string;
  rating?: number;
  reviewCount?: number;
  thumbnailUri?: string; // Local media URI only (e.g. content://, file://)
  productUrl?: string;
  sourcePosition: number;
  sourceFingerprint: string;
  confidence: number;
  rawTextSnippet?: string;
  isSponsored?: boolean;
}

export interface ProductResearchRequest {
  requestId: string;
  query: string;
  category?: string;
  priceRange?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  desiredAttributes?: string[];
  maximumCandidates?: number;
  createdAt: number;
}
