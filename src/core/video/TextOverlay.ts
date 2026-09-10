/**
 * Phone Agent - Step 2M Safe Text Overlays
 * Enforces fact-grounding, policy compliance, and layout validation on on-screen text.
 * Rejects unverified factual claims, medical claims, guaranteed earnings, and fake promotions.
 */

import { ProductData } from '../content/ContentPackage';
import { FactGroundingValidator } from '../ai/FactGroundingValidator';
import { AiClaimValidator } from '../ai/AiClaimValidator';
import { ContentClaimValidator } from '../content/ContentClaimValidator';

export type TextOverlayType =
  | 'HEADLINE'
  | 'HOOK'
  | 'PRODUCT_FEATURE'
  | 'CTA'
  | 'PRICE'
  | 'PROMOTION'
  | 'BADGE'
  | 'DISCLAIMER'
  | 'CUSTOM';

export type TextOverlayPosition =
  | 'TOP'
  | 'CENTER'
  | 'BOTTOM'
  | 'LOWER_THIRD'
  | 'UPPER_THIRD'
  | 'CUSTOM';

export interface TextOverlayStyle {
  fontSize?: number; // pt or px
  fontColor?: string; // hex
  backgroundColor?: string; // hex with alpha
  fontWeight?: 'NORMAL' | 'BOLD' | 'EXTRA_BOLD';
  alignment?: 'LEFT' | 'CENTER' | 'RIGHT';
  paddingPx?: number;
  borderRadiusPx?: number;
}

export interface TextOverlay {
  overlayId: string;
  type: TextOverlayType;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  position: TextOverlayPosition;
  style?: TextOverlayStyle;
  isFactualClaim?: boolean;
  metadata?: Record<string, unknown>;
}

export class TextOverlayValidator {
  private static factValidator = FactGroundingValidator.getInstance();
  private static claimValidator = ContentClaimValidator.getInstance();

  /**
   * Validates a single text overlay for timeline integrity and policy compliance.
   */
  public static validateOverlay(
    overlay: TextOverlay,
    productData?: ProductData | null
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!overlay) {
      return { valid: false, errors: ['TextOverlay is null or undefined.'], warnings: [] };
    }

    if (!overlay.overlayId || overlay.overlayId.trim().length === 0) {
      errors.push('TextOverlay overlayId is required.');
    }

    if (!overlay.text || overlay.text.trim().length === 0) {
      errors.push('TextOverlay text cannot be empty.');
    } else if (overlay.text.length > 120) {
      errors.push(`TextOverlay text exceeds maximum limit of 120 characters (${overlay.text.length}).`);
    }

    if (typeof overlay.startTimeMs !== 'number' || overlay.startTimeMs < 0) {
      errors.push(`startTimeMs must be non-negative, got: ${overlay.startTimeMs}.`);
    }

    if (typeof overlay.endTimeMs !== 'number' || overlay.endTimeMs <= overlay.startTimeMs) {
      errors.push(`endTimeMs (${overlay.endTimeMs}) must be strictly greater than startTimeMs (${overlay.startTimeMs}).`);
    }

    // Policy and Truth-In-Advertising safety check
    if (overlay.text) {
      const scannedWarnings = this.claimValidator.scanClaims([{ location: 'overlay', text: overlay.text }]);
      for (const item of scannedWarnings) {
        if (item.severity === 'BLOCK') {
          errors.push(`[POLICY_VIOLATION_BLOCK] ${item.category}: ${item.reason}`);
        } else {
          warnings.push(`[POLICY_WARNING] ${item.category}: ${item.reason}`);
        }
      }
    }

    // Fact grounding check if marked as factual or if it contains price/features
    const isFactual = overlay.isFactualClaim || overlay.type === 'PRICE' || overlay.type === 'PRODUCT_FEATURE';
    if (isFactual) {
      if (!productData) {
        errors.push(
          `Factual text overlay "${overlay.text}" requires verified ProductData for grounding, but none was provided.`
        );
      } else {
        const factResult = this.factValidator.validate(overlay.text, productData as any, 'overlay');
        if (!factResult.isValid) {
          for (const claim of factResult.claims) {
            if (claim.classification === 'UNSUPPORTED' || claim.classification === 'CONTRADICTED') {
              errors.push(
                `[UNGROUNDED_FACT_BLOCK] [${claim.claimType}] Claim "${claim.claimText}" is ${claim.classification}: ${claim.reason}`
              );
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates an array of text overlays.
   */
  public static validateOverlays(
    overlays: TextOverlay[],
    productData?: ProductData | null
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    if (!Array.isArray(overlays)) {
      return { valid: true, errors: [], warnings: [] };
    }

    overlays.forEach((overlay, idx) => {
      const res = this.validateOverlay(overlay, productData);
      if (!res.valid) {
        allErrors.push(...res.errors.map(e => `Overlay #${idx} (${overlay.type}): ${e}`));
      }
      if (res.warnings.length > 0) {
        allWarnings.push(...res.warnings.map(w => `Overlay #${idx} (${overlay.type}): ${w}`));
      }
    });

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }
}
