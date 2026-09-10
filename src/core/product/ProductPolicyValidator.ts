/**
 * Phone Agent - Step 2K Product Policy & Deceptive Claims Validator
 * Analyzes extracted product attributes against compliance and truth-in-advertising guidelines.
 * Flags medical claims, guaranteed outcomes, superlative rankings, and unverified reviews.
 * Classification: BLOCK (prevents approval), WARN (requires human review), PASS.
 */

import { ClaimWarning, ClaimCategory } from '../content/ContentPackage';
import { ContentClaimValidator } from '../content/ContentClaimValidator';
import { ProductData } from './ProductData';
import { sha256 } from '../content/ContentFingerprint';

export type PolicyVerdict = 'PASS' | 'WARN' | 'BLOCK';

export interface ProductPolicyResult {
  verdict: PolicyVerdict;
  blockedCount: number;
  warnCount: number;
  warnings: ClaimWarning[];
  policyFingerprint: string;
  evaluatedAt: number;
  summary: string;
}

interface ProductPolicyRule {
  id: string;
  category: ClaimCategory;
  regex: RegExp;
  reason: string;
  severity: 'WARN' | 'BLOCK';
}

export class ProductPolicyValidator {
  private static instance: ProductPolicyValidator | null = null;
  private contentClaimValidator: ContentClaimValidator;

  private additionalRules: ProductPolicyRule[] = [
    // Weight loss guarantees
    {
      id: 'pol_weight_loss',
      category: 'GUARANTEED_RESULT',
      regex: /\b(?:lose\s+\d+\s*(?:lbs|kg|pounds)|guaranteed\s+weight\s+loss|burn\s+fat\s+overnight|drop\s+\d+\s+sizes\s+in\s+\d+\s+days)\b/i,
      reason: 'Unsubstantiated weight loss or metabolic outcome guarantee detected.',
      severity: 'BLOCK',
    },
    // 100% cure
    {
      id: 'pol_cure_100',
      category: 'MEDICAL_CLAIM',
      regex: /\b(?:100%\s+cure|instant\s+cure|cures\s+all\s+diseases|cure\s+guaranteed)\b/i,
      reason: 'Absolute medical cure assertion detected.',
      severity: 'BLOCK',
    },
    // Superlative unverified claims (e.g. "best in India", "number one in the world")
    {
      id: 'pol_superlatives',
      category: 'UNSUPPORTED_CERTIFICATION',
      regex: /(?:(?:#1|\bnumber\s+(?:one|1))\s+(?:in\s+the\s+world|in\s+india|on\s+amazon)|\bbest\s+(?:in\s+india|in\s+the\s+world)|\bundisputed\s+leader)/i,
      reason: 'Unverified superlative market ranking or geographic leadership claim detected.',
      severity: 'WARN',
    },
    // Risk-free marketing guarantees
    {
      id: 'pol_risk_free',
      category: 'GUARANTEED_RESULT',
      regex: /\b(?:risk-?free(?:\s+trial|\s+guarantee)?|zero\s+risk)\b/i,
      reason: 'Risk-free guarantee phrasing detected. Requires explicit terms verification.',
      severity: 'WARN',
    },
    // Fabricated Review / Rating Claims
    {
      id: 'pol_fake_ratings',
      category: 'FABRICATED_RATING',
      regex: /\b(?:rated\s+5\s+stars?\s+by\s+everyone|flawless\s+5-star\s+rating\s+by\s+all|unanimous\s+5\s+star)\b/i,
      reason: 'Potentially fabricated universal 5-star rating claim detected.',
      severity: 'BLOCK',
    },
  ];

  constructor(contentClaimValidator?: ContentClaimValidator) {
    this.contentClaimValidator = contentClaimValidator || ContentClaimValidator.getInstance();
  }

  public static getInstance(): ProductPolicyValidator {
    if (!ProductPolicyValidator.instance) {
      ProductPolicyValidator.instance = new ProductPolicyValidator();
    }
    return ProductPolicyValidator.instance;
  }

  public static resetInstance(): void {
    ProductPolicyValidator.instance = null;
  }

  /**
   * Evaluates a single text string against policy and truth-in-advertising rules.
   */
  public validateText(text: string, location: string = 'text'): { verdict: PolicyVerdict; warnings: ClaimWarning[] } {
    const allWarnings: ClaimWarning[] = [];

    // 1. Run through base ContentClaimValidator
    const baseWarnings = this.contentClaimValidator.validateText(text, location);
    allWarnings.push(...baseWarnings);

    // 2. Run through product-specific policy rules
    for (const rule of this.additionalRules) {
      if (rule.regex.test(text)) {
        const match = text.match(rule.regex);
        allWarnings.push({
          id: `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          category: rule.category,
          flaggedText: match ? match[0] : text.slice(0, 40),
          reason: rule.reason,
          severity: rule.severity,
          location: location,
        });
      }
    }

    // Deduplicate warnings by location and flaggedText
    const seen = new Set<string>();
    const deduplicatedWarnings: ClaimWarning[] = [];
    for (const w of allWarnings) {
      const key = `${w.location}::${w.category}::${w.flaggedText.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedWarnings.push(w);
      }
    }

    const blockedCount = deduplicatedWarnings.filter(w => w.severity === 'BLOCK').length;
    const warnCount = deduplicatedWarnings.filter(w => w.severity === 'WARN').length;
    let verdict: PolicyVerdict = 'PASS';
    if (blockedCount > 0) {
      verdict = 'BLOCK';
    } else if (warnCount > 0) {
      verdict = 'WARN';
    }

    return {
      verdict,
      warnings: deduplicatedWarnings,
    };
  }

  /**
   * Convenience validator returning boolean allowed flag and prohibited categories.
   */
  public validate(product: ProductData): { isAllowed: boolean; prohibitedCategories: string[] } {
    const result = this.evaluateProduct(product);
    return {
      isAllowed: result.verdict !== 'BLOCK',
      prohibitedCategories: result.warnings.filter(w => w.severity === 'BLOCK').map(w => w.category),
    };
  }

  /**
   * Evaluates all visible product text fields against policy and truth-in-advertising rules.
   */
  public evaluateProduct(product: ProductData): ProductPolicyResult {
    const textCorpus: { location: string; text: string }[] = [];

    if (product.title) textCorpus.push({ location: 'title', text: product.title });
    if (product.productName && product.productName !== product.title) {
      textCorpus.push({ location: 'productName', text: product.productName });
    }
    if (product.description) textCorpus.push({ location: 'description', text: product.description });

    if (product.keyFeatures && product.keyFeatures.length > 0) {
      product.keyFeatures.forEach((feat, idx) => {
        textCorpus.push({ location: `keyFeatures[${idx}]`, text: feat });
      });
    }

    if (product.benefits && product.benefits.length > 0) {
      product.benefits.forEach((b, idx) => {
        textCorpus.push({ location: `benefits[${idx}]`, text: b });
      });
    }

    if (product.specifications) {
      for (const [k, v] of Object.entries(product.specifications)) {
        textCorpus.push({ location: `specifications.${k}`, text: `${k}: ${v}` });
      }
    }

    const allWarnings: ClaimWarning[] = [];

    for (const item of textCorpus) {
      // 1. Run through base ContentClaimValidator
      const baseWarnings = this.contentClaimValidator.validateText(item.text, item.location);
      allWarnings.push(...baseWarnings);

      // 2. Run through product-specific policy rules
      for (const rule of this.additionalRules) {
        if (rule.regex.test(item.text)) {
          const match = item.text.match(rule.regex);
          allWarnings.push({
            id: `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: rule.category,
            flaggedText: match ? match[0] : item.text.slice(0, 40),
            reason: rule.reason,
            severity: rule.severity,
            location: item.location,
          });
        }
      }
    }

    // Deduplicate warnings by location and flaggedText
    const seen = new Set<string>();
    const deduplicatedWarnings: ClaimWarning[] = [];
    for (const w of allWarnings) {
      const key = `${w.location}::${w.category}::${w.flaggedText.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedWarnings.push(w);
      }
    }

    const blockedCount = deduplicatedWarnings.filter(w => w.severity === 'BLOCK').length;
    const warnCount = deduplicatedWarnings.filter(w => w.severity === 'WARN').length;

    let verdict: PolicyVerdict = 'PASS';
    if (blockedCount > 0) {
      verdict = 'BLOCK';
    } else if (warnCount > 0) {
      verdict = 'WARN';
    }

    // Compute deterministic policy fingerprint
    const canonicalIssues = deduplicatedWarnings
      .map(w => `${w.severity}:${w.category}:${w.location}:${w.flaggedText}`)
      .sort()
      .join('|');
    const policyFingerprint = `pol_${sha256(`${verdict}:${canonicalIssues}`)}`;

    const summary =
      verdict === 'PASS'
        ? 'Product data passed all policy and deceptive claim checks.'
        : verdict === 'WARN'
        ? `${warnCount} advisory warning(s) detected. Requires human review.`
        : `${blockedCount} prohibited claim(s) detected. Product cannot be approved until resolved.`;

    return {
      verdict,
      blockedCount,
      warnCount,
      warnings: deduplicatedWarnings,
      policyFingerprint,
      evaluatedAt: Date.now(),
      summary,
    };
  }
}
