/**
 * Phone Agent - Step 2K Product Quality & Content Suitability Scorer
 * Calculates a deterministic advisory score (0 - 100) based strictly on observed source evidence.
 * NEVER scores based on fabricated or inferred data.
 * STRICT INVARIANT: Advisory only. Never auto-approves or auto-publishes.
 */

import { ProductData } from './ProductData';
import { ProductPolicyResult } from './ProductPolicyValidator';
import { DuplicateCheckResult } from './ProductFingerprintIndex';

export interface ProductScoreBreakdown {
  hasValidSource: boolean; // max 15 pts
  hasTitle: boolean; // max 15 pts
  hasPrice: boolean; // max 15 pts
  hasUsableMedia: boolean; // max 15 pts
  hasDescription: boolean; // max 10 pts
  hasFeatures: boolean; // max 10 pts
  hasSpecifications: boolean; // max 10 pts
  dataCompleteness: number; // 0 - 10 pts
  policyPenalty: number; // deducted
  duplicatePenalty: number; // deducted
  finalScore: number; // 0 - 100
  recommendation: 'EXCELLENT' | 'GOOD' | 'NEEDS_COMPLETION' | 'HIGH_RISK_BLOCKED';
}

export class ProductScorer {
  /**
   * Deterministically calculates content suitability score for a researched product.
   */
  public static calculateScore(
    product: ProductData,
    policy?: ProductPolicyResult,
    duplicateCheck?: DuplicateCheckResult
  ): ProductScoreBreakdown {
    let score = 0;

    // 1. Source validity (15 pts)
    const hasValidSource = Boolean(
      product.sourceUrl &&
      product.sourceUrl.trim().length > 0 &&
      (product.sourceUrl.startsWith('https://') || product.sourceUrl.startsWith('http://'))
    );
    if (hasValidSource) score += 15;

    // 2. Title presence & quality (15 pts)
    const titleLen = (product.title || product.productName || '').trim().length;
    const hasTitle = titleLen >= 5;
    if (hasTitle) {
      score += titleLen >= 15 ? 15 : 10;
    }

    // 3. Price presence (15 pts)
    const hasPrice = product.price !== undefined && product.price > 0 && Boolean(product.currency);
    if (hasPrice) score += 15;

    // 4. Usable local media (15 pts)
    const hasUsableMedia = Boolean(product.imageAssets && product.imageAssets.length > 0);
    if (hasUsableMedia) {
      score += Math.min(15, (product.imageAssets?.length || 0) * 5);
    }

    // 5. Description presence (10 pts)
    const descLen = (product.description || '').trim().length;
    const hasDescription = descLen >= 20;
    if (hasDescription) {
      score += descLen >= 60 ? 10 : 5;
    }

    // 6. Bullet features (10 pts)
    const featureCount = (product.keyFeatures || []).length;
    const hasFeatures = featureCount > 0;
    if (hasFeatures) {
      score += Math.min(10, featureCount * 3);
    }

    // 7. Specifications (10 pts)
    const specCount = Object.keys(product.specifications || {}).length;
    const hasSpecifications = specCount > 0;
    if (hasSpecifications) {
      score += Math.min(10, specCount * 2);
    }

    // 8. Completeness index (0 - 10 pts)
    let presentCoreFields = 0;
    const totalCoreFields = 7;
    if (hasValidSource) presentCoreFields++;
    if (hasTitle) presentCoreFields++;
    if (hasPrice) presentCoreFields++;
    if (hasUsableMedia) presentCoreFields++;
    if (hasDescription) presentCoreFields++;
    if (hasFeatures) presentCoreFields++;
    if (hasSpecifications) presentCoreFields++;
    const dataCompleteness = Math.round((presentCoreFields / totalCoreFields) * 10);
    score += dataCompleteness;

    // Penalties
    let policyPenalty = 0;
    if (policy) {
      if (policy.verdict === 'BLOCK') {
        policyPenalty = 40 + policy.blockedCount * 10;
      } else if (policy.verdict === 'WARN') {
        policyPenalty = policy.warnCount * 5;
      }
    }

    let duplicatePenalty = 0;
    if (duplicateCheck?.isDuplicate) {
      duplicatePenalty = duplicateCheck.hasConflict ? 35 : 15;
    }

    const rawFinal = score - policyPenalty - duplicatePenalty;
    const finalScore = Math.max(0, Math.min(100, rawFinal));

    let recommendation: 'EXCELLENT' | 'GOOD' | 'NEEDS_COMPLETION' | 'HIGH_RISK_BLOCKED' = 'NEEDS_COMPLETION';
    if (policy?.verdict === 'BLOCK') {
      recommendation = 'HIGH_RISK_BLOCKED';
    } else if (finalScore >= 75) {
      recommendation = 'EXCELLENT';
    } else if (finalScore >= 50) {
      recommendation = 'GOOD';
    } else {
      recommendation = 'NEEDS_COMPLETION';
    }

    return {
      hasValidSource,
      hasTitle,
      hasPrice,
      hasUsableMedia,
      hasDescription,
      hasFeatures,
      hasSpecifications,
      dataCompleteness,
      policyPenalty,
      duplicatePenalty,
      finalScore,
      recommendation,
    };
  }
}
