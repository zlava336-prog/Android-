/**
 * Phone Agent - Step 2L AI Claim & Policy Integrated Safety Validator
 * Unifies FactGroundingValidator with ContentClaimValidator and ProductPolicyValidator.
 * Guarantees that AI generated content violates zero medical, financial, or deceptive policies.
 */

import { ClaimWarning } from '../content/ContentPackage';
import { ContentClaimValidator } from '../content/ContentClaimValidator';
import { ProductPolicyValidator } from '../product/ProductPolicyValidator';
import { ProductData } from '../product/ProductData';
import { LocalActionLogger } from '../logger';
import { FactGroundingValidator, FactValidationResult, GroundedClaim } from './FactGroundingValidator';

export interface AiClaimValidationResult {
  isValid: boolean;
  decision: 'PASS' | 'WARN' | 'BLOCK';
  groundingResult: FactValidationResult;
  policyWarnings: ClaimWarning[];
  blockedReasons: string[];
  evaluatedAt: number;
}

export class AiClaimValidator {
  private static instance: AiClaimValidator | null = null;
  private groundingValidator: FactGroundingValidator;
  private claimValidator: ContentClaimValidator;
  private policyValidator: ProductPolicyValidator;
  private logger: LocalActionLogger;

  private constructor() {
    this.groundingValidator = FactGroundingValidator.getInstance();
    this.claimValidator = ContentClaimValidator.getInstance();
    this.policyValidator = ProductPolicyValidator.getInstance();
    this.logger = LocalActionLogger.getInstance();
  }

  public static getInstance(): AiClaimValidator {
    if (!AiClaimValidator.instance) {
      AiClaimValidator.instance = new AiClaimValidator();
    }
    return AiClaimValidator.instance;
  }

  /**
   * Evaluates text for both factual grounding against ProductData and compliance policies.
   */
  public validateGeneratedContent(
    text: string,
    productData: ProductData,
    location: string = 'ai_output',
    userInstructions?: string
  ): AiClaimValidationResult {
    const blockedReasons: string[] = [];

    // 1. Fact Grounding Validation
    const groundingResult = this.groundingValidator.validate(text, productData, location, userInstructions);
    if (!groundingResult.isValid) {
      for (const claim of groundingResult.claims) {
        if (claim.severity === 'BLOCK') {
          blockedReasons.push(`[${claim.claimType} ${claim.classification}] ${claim.reason}`);
        }
      }
      this.logger.log({
        action: 'AI_FACT_VALIDATION_BLOCKED',
        details: `Fact check failed for ${location}: ${blockedReasons.join('; ')}`,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
    } else {
      this.logger.log({
        action: 'AI_FACT_VALIDATION_PASSED',
        details: `Fact check passed for ${location}: ${groundingResult.summary}`,
        severity: 'INFO',
        safetyCheckPassed: true,
      });
    }

    // 2. Truth-in-Advertising & Medical/Financial Policy Validation
    const rawWarnings = this.claimValidator.scanClaims([{ location, text }]);
    const policyResult = this.policyValidator.validateText(text, location);
    
    // Combine and deduplicate warnings
    const combinedWarningsMap = new Map<string, ClaimWarning>();
    for (const w of [...rawWarnings, ...policyResult.warnings]) {
      const key = `${w.category}:${w.flaggedText}:${w.location}`;
      if (!combinedWarningsMap.has(key)) {
        combinedWarningsMap.set(key, w);
      }
    }
    const policyWarnings = Array.from(combinedWarningsMap.values());

    for (const w of policyWarnings) {
      if (w.severity === 'BLOCK') {
        blockedReasons.push(`[POLICY_BLOCK: ${w.category}] ${w.reason} (flagged: "${w.flaggedText}")`);
        this.logger.log({
          action: 'AI_POLICY_BLOCK',
          details: `Policy violation in ${location}: ${w.reason} ("${w.flaggedText}")`,
          severity: 'SECURITY',
          safetyCheckPassed: false,
        });
      } else {
        this.logger.log({
          action: 'AI_POLICY_WARNING',
          details: `Policy warning in ${location}: ${w.reason} ("${w.flaggedText}")`,
          severity: 'WARN',
          safetyCheckPassed: true,
        });
      }
    }

    // Determine final decision
    let decision: 'PASS' | 'WARN' | 'BLOCK' = 'PASS';
    if (blockedReasons.length > 0) {
      decision = 'BLOCK';
    } else if (policyWarnings.length > 0) {
      decision = 'WARN';
    }

    return {
      isValid: decision !== 'BLOCK',
      decision,
      groundingResult,
      policyWarnings,
      blockedReasons,
      evaluatedAt: Date.now(),
    };
  }
}
