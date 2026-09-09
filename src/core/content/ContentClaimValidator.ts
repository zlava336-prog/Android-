/**
 * Phone Agent - Step 2J Content Claim & Truth-In-Advertising Safety Validator
 * Detects unsubstantiated medical claims, guaranteed outcomes, fabricated scarcity,
 * and deceptive reviews. Never silently alters claims; flags strictly for human review.
 */

import { ClaimWarning, ClaimCategory } from './ContentPackage';
import { LocalActionLogger } from '../logger';

interface ClaimPattern {
  category: ClaimCategory;
  regex: RegExp;
  reason: string;
  severity: 'WARN' | 'BLOCK';
}

export class ContentClaimValidator {
  private static instance: ContentClaimValidator | null = null;

  private patterns: ClaimPattern[] = [
    // 1. Medical Claims
    {
      category: 'MEDICAL_CLAIM',
      regex: /\b(?:cures?|permanently\s+removes?|permanently\s+cures?|heals?|treats?)\s+(?:acne|cancer|disease|illness|diabetes|infection|depression|anxiety|baldness|hypertension)\b/i,
      reason: 'Unsubstantiated medical treatment or cure claim detected. Health/medical claims require verified clinical authorization and human operator sign-off.',
      severity: 'BLOCK',
    },
    {
      category: 'MEDICAL_CLAIM',
      regex: /\b(?:fda\s+approved|medical\s+grade|miracle\s+cure|clinically\s+proven\s+to\s+cure)\b/i,
      reason: 'Unverified medical certification or miracle cure phrasing detected.',
      severity: 'BLOCK',
    },

    // 2. Guaranteed Results
    {
      category: 'GUARANTEED_RESULT',
      regex: /\b(?:100%\s+guaranteed(?:\s+results?)?|guaranteed\s+results?|guaranteed\s+to\s+work|risk-?free\s+guarantee)\b/i,
      reason: 'Absolute outcome guarantee detected without documented terms or operator verification.',
      severity: 'WARN',
    },

    // 3. Guaranteed Earnings
    {
      category: 'GUARANTEED_EARNINGS',
      regex: /\b(?:guaranteed\s+(?:income|earnings|wealth|returns)|make\s+\$\d+[\d,]*\s*(?:\/day|\/week|\/month|\s+per\s+day)\s+guaranteed|get\s+rich\s+quick)\b/i,
      reason: 'Deceptive financial or guaranteed earnings claim detected.',
      severity: 'BLOCK',
    },

    // 4. Unsupported Certifications
    {
      category: 'UNSUPPORTED_CERTIFICATION',
      regex: /\b(?:government\s+certified|officially\s+certified\s+by\s+fbi|certified\s+authentic\s+by\s+police)\b/i,
      reason: 'Unverified regulatory or governmental certification claim detected.',
      severity: 'BLOCK',
    },

    // 5. Fabricated Reviews & Consensus
    {
      category: 'FABRICATED_REVIEW',
      regex: /\b(?:everyone\s+loves\s+this|voted\s+#1\s+in\s+the\s+world|100%\s+of\s+(?:users|customers)\s+agree|best\s+seller\s+in\s+the\s+world)\b/i,
      reason: 'Unsubstantiated universal consensus or unverified superlative claim detected.',
      severity: 'WARN',
    },

    // 6. Fabricated Ratings
    {
      category: 'FABRICATED_RATING',
      regex: /\b(?:rated\s+(?:5\.0|5\/5|perfect\s+5)\s+by\s+millions|perfect\s+5-star\s+rating\s+everywhere)\b/i,
      reason: 'Fabricated or ungrounded global review rating detected.',
      severity: 'WARN',
    },

    // 7. Fabricated Scarcity & Urgency
    {
      category: 'FABRICATED_SCARCITY',
      regex: /\b(?:only\s+\d+\s+left(?:\s+in\s+stock)?(?!\s+according\s+to)|act\s+fast\s+before\s+(?:it\'?s\s+)?gone|closing\s+down\s+sale|hurry\s+almost\s+sold\s+out)\b/i,
      reason: 'High-pressure scarcity phrasing detected. Verify inventory facts with product source.',
      severity: 'WARN',
    },

    // 8. Fabricated Discounts
    {
      category: 'FABRICATED_DISCOUNT',
      regex: /\b(?:99%\s+off\s+today\s+only|free\s+money|everything\s+100%\s+free\s+forever)\b/i,
      reason: 'Suspected misleading discount or predatory price claim detected.',
      severity: 'WARN',
    },

    // 9. Fabricated Testimonials
    {
      category: 'FABRICATED_TESTIMONIAL',
      regex: /\b(?:john\s+from\s+[a-z\s]+\s+says\s+it\s+changed\s+his\s+life|dr\.\s+[a-z]+\s+personally\s+endorses\s+this)\b/i,
      reason: 'Unverified anecdotal testimonial phrasing detected without explicit source linkage.',
      severity: 'WARN',
    },
  ];

  public static getInstance(): ContentClaimValidator {
    if (!ContentClaimValidator.instance) {
      ContentClaimValidator.instance = new ContentClaimValidator();
    }
    return ContentClaimValidator.instance;
  }

  /**
   * Scans text fields in content package for deceptive, medical, or absolute claims.
   * Returns a list of ClaimWarnings. Never alters the underlying text.
   */
  public scanClaims(textBlocks: { location: string; text?: string }[]): ClaimWarning[] {
    const warnings: ClaimWarning[] = [];

    for (const block of textBlocks) {
      if (!block.text || block.text.trim().length === 0) continue;
      const text = block.text;

      for (const pattern of this.patterns) {
        const match = text.match(pattern.regex);
        if (match) {
          const warning: ClaimWarning = {
            id: `claim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: pattern.category,
            flaggedText: match[0],
            reason: pattern.reason,
            severity: pattern.severity,
            location: block.location,
          };
          warnings.push(warning);

          LocalActionLogger.getInstance().log({
            action: 'CLAIM_FLAGGED',
            details: `[${warning.category}] Flagged phrase "${warning.flaggedText}" in ${warning.location}: ${warning.reason}`,
            severity: warning.severity === 'BLOCK' ? 'SECURITY' : 'WARN',
            safetyCheckPassed: false,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Convenience method to scan a single text string.
   */
  public validateText(text: string, location: string = 'text'): ClaimWarning[] {
    return this.scanClaims([{ location, text }]);
  }
}
