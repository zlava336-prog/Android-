/**
 * Phone Agent - Step 2L Fact Grounding & Anti-Hallucination Validator
 * Strictly compares generated content against verified ProductData.
 * Detects invented prices, discounts, specifications, materials, certifications,
 * warranties, ratings, review counts, testimonials, and scarcity.
 * Classification: SUPPORTED, USER_PROVIDED, UNSUPPORTED, CONTRADICTED, UNKNOWN.
 */

import { ProductData } from '../product/ProductData';

export type ClaimClassification =
  | 'SUPPORTED'
  | 'USER_PROVIDED'
  | 'UNSUPPORTED'
  | 'CONTRADICTED'
  | 'UNKNOWN';

export interface GroundedClaim {
  id: string;
  claimType:
    | 'PRICE'
    | 'DISCOUNT'
    | 'SPECIFICATION'
    | 'MATERIAL'
    | 'CERTIFICATION'
    | 'WARRANTY'
    | 'RATING'
    | 'REVIEW_COUNT'
    | 'SCARCITY'
    | 'TESTIMONIAL'
    | 'FEATURE';
  claimText: string;
  classification: ClaimClassification;
  verifiedValue?: string | number;
  reason: string;
  location: string;
  severity: 'PASS' | 'BLOCK';
}

export interface FactValidationResult {
  isValid: boolean;
  claims: GroundedClaim[];
  unsupportedCount: number;
  contradictedCount: number;
  unknownCount: number;
  supportedCount: number;
  userProvidedCount: number;
  summary: string;
}

export class FactGroundingValidator {
  private static instance: FactGroundingValidator | null = null;

  public static getInstance(): FactGroundingValidator {
    if (!FactGroundingValidator.instance) {
      FactGroundingValidator.instance = new FactGroundingValidator();
    }
    return FactGroundingValidator.instance;
  }

  /**
   * Validates generated text against verified ProductData and optional user instructions.
   */
  public validate(
    text: string,
    productData: ProductData,
    location: string = 'content',
    userInstructions?: string
  ): FactValidationResult {
    const claims: GroundedClaim[] = [];
    if (!text || text.trim().length === 0) {
      return {
        isValid: true,
        claims: [],
        unsupportedCount: 0,
        contradictedCount: 0,
        unknownCount: 0,
        supportedCount: 0,
        userProvidedCount: 0,
        summary: 'Empty text passed validation.',
      };
    }

    const lowerText = text.toLowerCase();
    const lowerInstructions = (userInstructions || '').toLowerCase();
    const verifiedSpecs = productData.specifications || {};
    const verifiedFeatures = (productData.keyFeatures || []).map(f => f.toLowerCase());
    const verifiedBenefits = (productData.benefits || []).map(b => b.toLowerCase());
    const allVerifiedText = [
      productData.title,
      productData.productName,
      productData.description,
      ...verifiedFeatures,
      ...verifiedBenefits,
      ...Object.entries(verifiedSpecs).map(([k, v]) => `${k} ${v}`),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Helper to check if text exists in user instructions
    const isUserProvided = (fragment: string) =>
      lowerInstructions.length > 0 && lowerInstructions.includes(fragment.toLowerCase().trim());

    // 1. PRICE VALIDATION
    // Detect prices like $29.99, $29, USD 29, ₹1499, Rs 1499, 29.99 dollars
    const priceRegex = /(?:[\$₹£€]\s*(\d+(?:[.,]\d{2})?)|(\d+(?:[.,]\d{2})?)\s*(?:dollars?|rupees?|inr|usd|eur|gbp))/gi;
    let priceMatch: RegExpExecArray | null;
    while ((priceMatch = priceRegex.exec(text)) !== null) {
      const detectedAmountStr = priceMatch[1] || priceMatch[2];
      const detectedAmount = parseFloat(detectedAmountStr.replace(',', '.'));
      const fullMatch = priceMatch[0];

      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_price_${claims.length}`,
          claimType: 'PRICE',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Price specified in user instructions.',
          location,
          severity: 'PASS',
        });
      } else if (productData.price === undefined || productData.price === null) {
        claims.push({
          id: `claim_price_${claims.length}`,
          claimType: 'PRICE',
          claimText: fullMatch,
          classification: 'UNKNOWN',
          reason: `Invented price "${fullMatch}": Product price is UNKNOWN in verified ProductData.`,
          location,
          severity: 'BLOCK',
        });
      } else {
        const verifiedPrice = productData.price;
        // Allow within small epsilon for rounding
        const diff = Math.abs(detectedAmount - verifiedPrice);
        if (diff < 0.05) {
          claims.push({
            id: `claim_price_${claims.length}`,
            claimType: 'PRICE',
            claimText: fullMatch,
            classification: 'SUPPORTED',
            verifiedValue: verifiedPrice,
            reason: `Price "${fullMatch}" matches verified product price (${verifiedPrice}).`,
            location,
            severity: 'PASS',
          });
        } else {
          claims.push({
            id: `claim_price_${claims.length}`,
            claimType: 'PRICE',
            claimText: fullMatch,
            classification: 'CONTRADICTED',
            verifiedValue: verifiedPrice,
            reason: `Contradicted price "${fullMatch}": Verified price is ${verifiedPrice}.`,
            location,
            severity: 'BLOCK',
          });
        }
      }
    }

    // 2. DISCOUNT VALIDATION
    // Detect "50% off", "save $10", "save 20%"
    const discountRegex = /\b(?:(\d{1,2})%\s+off|save\s+(?:[\$₹£€]\s*(\d+)|(\d+)%))\b/gi;
    let discMatch: RegExpExecArray | null;
    while ((discMatch = discountRegex.exec(text)) !== null) {
      const fullMatch = discMatch[0];
      const isDiscountedVerified = productData.priceStructure?.isDiscounted || allVerifiedText.includes('discount') || allVerifiedText.includes('% off');

      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_disc_${claims.length}`,
          claimType: 'DISCOUNT',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Discount specified in user instructions.',
          location,
          severity: 'PASS',
        });
      } else if (!isDiscountedVerified) {
        claims.push({
          id: `claim_disc_${claims.length}`,
          claimType: 'DISCOUNT',
          claimText: fullMatch,
          classification: 'UNSUPPORTED',
          reason: `Invented discount claim "${fullMatch}": No verified discount recorded in ProductData.`,
          location,
          severity: 'BLOCK',
        });
      } else {
        claims.push({
          id: `claim_disc_${claims.length}`,
          claimType: 'DISCOUNT',
          claimText: fullMatch,
          classification: 'SUPPORTED',
          reason: `Discount claim "${fullMatch}" is grounded in verified product data.`,
          location,
          severity: 'PASS',
        });
      }
    }

    // 3. SPECIFICATIONS VALIDATION (Capacity, battery, weight, speed)
    // e.g. "1L capacity", "1000ml", "10 hour battery", "5000mah"
    const capacityRegex = /\b(\d+(?:\.\d+)?\s*(?:l|liter|litres|ml|oz|ounces|gallon|gallons|qt|quarts))\s+(?:capacity|bottle|mug|jug|container)?\b/gi;
    let capMatch: RegExpExecArray | null;
    while ((capMatch = capacityRegex.exec(text)) !== null) {
      const fullMatch = capMatch[0];
      const matchUnit = capMatch[1].toLowerCase().replace(/\s+/g, '');
      const hasCapInVerified = allVerifiedText.replace(/\s+/g, '').includes(matchUnit);

      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_cap_${claims.length}`,
          claimType: 'SPECIFICATION',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Specification from user instructions.',
          location,
          severity: 'PASS',
        });
      } else if (hasCapInVerified) {
        claims.push({
          id: `claim_cap_${claims.length}`,
          claimType: 'SPECIFICATION',
          claimText: fullMatch,
          classification: 'SUPPORTED',
          reason: `Capacity spec "${fullMatch}" matches verified product data.`,
          location,
          severity: 'PASS',
        });
      } else {
        // If product has no capacity verified, it is UNKNOWN
        const capacityInSpecs = Object.keys(verifiedSpecs).some(k => k.toLowerCase().includes('capacity'));
        claims.push({
          id: `claim_cap_${claims.length}`,
          claimType: 'SPECIFICATION',
          claimText: fullMatch,
          classification: capacityInSpecs ? 'CONTRADICTED' : 'UNKNOWN',
          reason: `Invented capacity specification "${fullMatch}": capacity is ${capacityInSpecs ? 'contradicted' : 'UNKNOWN'} in verified ProductData.`,
          location,
          severity: 'BLOCK',
        });
      }
    }

    // 4. MATERIAL VALIDATION
    const materialPatterns = [
      'genuine leather',
      'titanium',
      'ceramic',
      'stainless steel',
      'carbon fiber',
      '100% cotton',
      'organic cotton',
      'solid wood',
      'bamboo',
    ];
    for (const mat of materialPatterns) {
      if (lowerText.includes(mat)) {
        if (isUserProvided(mat)) {
          claims.push({
            id: `claim_mat_${claims.length}`,
            claimType: 'MATERIAL',
            claimText: mat,
            classification: 'USER_PROVIDED',
            reason: 'Material specified in user instructions.',
            location,
            severity: 'PASS',
          });
        } else if (allVerifiedText.includes(mat)) {
          claims.push({
            id: `claim_mat_${claims.length}`,
            claimType: 'MATERIAL',
            claimText: mat,
            classification: 'SUPPORTED',
            reason: `Material "${mat}" matches verified product attributes.`,
            location,
            severity: 'PASS',
          });
        } else {
          claims.push({
            id: `claim_mat_${claims.length}`,
            claimType: 'MATERIAL',
            claimText: mat,
            classification: 'UNSUPPORTED',
            reason: `Invented material "${mat}": Not documented in verified ProductData.`,
            location,
            severity: 'BLOCK',
          });
        }
      }
    }

    // 5. CERTIFICATION VALIDATION
    const certPatterns = [
      'fda approved',
      'iso certified',
      'ce certified',
      'usda organic',
      'dermatologist tested',
      'pediatrician recommended',
      'clinically tested',
      'certified organic',
    ];
    for (const cert of certPatterns) {
      if (lowerText.includes(cert)) {
        if (isUserProvided(cert)) {
          claims.push({
            id: `claim_cert_${claims.length}`,
            claimType: 'CERTIFICATION',
            claimText: cert,
            classification: 'USER_PROVIDED',
            reason: 'Certification specified in user instructions.',
            location,
            severity: 'PASS',
          });
        } else if (allVerifiedText.includes(cert)) {
          claims.push({
            id: `claim_cert_${claims.length}`,
            claimType: 'CERTIFICATION',
            claimText: cert,
            classification: 'SUPPORTED',
            reason: `Certification "${cert}" verified in product data.`,
            location,
            severity: 'PASS',
          });
        } else {
          claims.push({
            id: `claim_cert_${claims.length}`,
            claimType: 'CERTIFICATION',
            claimText: cert,
            classification: 'UNSUPPORTED',
            reason: `Invented certification "${cert}": No regulatory certification verified in ProductData.`,
            location,
            severity: 'BLOCK',
          });
        }
      }
    }

    // 6. WARRANTY VALIDATION
    const warrantyRegex = /\b(?:(\d+)[- ]year\s+warranty|lifetime\s+warranty|money[- ]back\s+guarantee)\b/gi;
    let warMatch: RegExpExecArray | null;
    while ((warMatch = warrantyRegex.exec(text)) !== null) {
      const fullMatch = warMatch[0];
      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_war_${claims.length}`,
          claimType: 'WARRANTY',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Warranty specified in user instructions.',
          location,
          severity: 'PASS',
        });
      } else if (allVerifiedText.includes(fullMatch.toLowerCase())) {
        claims.push({
          id: `claim_war_${claims.length}`,
          claimType: 'WARRANTY',
          claimText: fullMatch,
          classification: 'SUPPORTED',
          reason: `Warranty claim "${fullMatch}" matches verified product data.`,
          location,
          severity: 'PASS',
        });
      } else {
        claims.push({
          id: `claim_war_${claims.length}`,
          claimType: 'WARRANTY',
          claimText: fullMatch,
          classification: 'UNSUPPORTED',
          reason: `Invented warranty claim "${fullMatch}": No such warranty verified in ProductData.`,
          location,
          severity: 'BLOCK',
        });
      }
    }

    // 7. RATING & REVIEW COUNT VALIDATION
    const ratingRegex = /\b(?:(\d(?:\.\d)?)\s*(?:stars?|\/5(?:\s*stars?)?|star\s+rating))\b/gi;
    let ratMatch: RegExpExecArray | null;
    while ((ratMatch = ratingRegex.exec(text)) !== null) {
      const fullMatch = ratMatch[0];
      const detectedRating = parseFloat(ratMatch[1]);
      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_rat_${claims.length}`,
          claimType: 'RATING',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Rating specified in user instructions.',
          location,
          severity: 'PASS',
        });
      } else if (productData.rating === undefined || productData.rating === null) {
        claims.push({
          id: `claim_rat_${claims.length}`,
          claimType: 'RATING',
          claimText: fullMatch,
          classification: 'UNKNOWN',
          reason: `Invented rating claim "${fullMatch}": Product rating is UNKNOWN in verified ProductData.`,
          location,
          severity: 'BLOCK',
        });
      } else {
        const verifiedRating = productData.rating;
        if (Math.abs(detectedRating - verifiedRating) <= 0.2) {
          claims.push({
            id: `claim_rat_${claims.length}`,
            claimType: 'RATING',
            claimText: fullMatch,
            classification: 'SUPPORTED',
            verifiedValue: verifiedRating,
            reason: `Rating claim "${fullMatch}" matches verified rating (${verifiedRating}).`,
            location,
            severity: 'PASS',
          });
        } else {
          claims.push({
            id: `claim_rat_${claims.length}`,
            claimType: 'RATING',
            claimText: fullMatch,
            classification: 'CONTRADICTED',
            verifiedValue: verifiedRating,
            reason: `Contradicted rating claim "${fullMatch}": Verified rating is ${verifiedRating}.`,
            location,
            severity: 'BLOCK',
          });
        }
      }
    }

    const reviewCountRegex = /\b(?:(\d{1,3}(?:,\d{3})+|\d+)\+?\s*(?:reviews|customer\s+reviews|ratings|happy\s+customers))\b/gi;
    let revMatch: RegExpExecArray | null;
    while ((revMatch = reviewCountRegex.exec(text)) !== null) {
      const fullMatch = revMatch[0];
      const detectedCount = parseInt(revMatch[1].replace(/,/g, ''), 10);
      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_rev_${claims.length}`,
          claimType: 'REVIEW_COUNT',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Review count in user instructions.',
          location,
          severity: 'PASS',
        });
      } else if (productData.reviewCount === undefined || productData.reviewCount === null) {
        claims.push({
          id: `claim_rev_${claims.length}`,
          claimType: 'REVIEW_COUNT',
          claimText: fullMatch,
          classification: 'UNKNOWN',
          reason: `Invented review count "${fullMatch}": Review count is UNKNOWN in verified ProductData.`,
          location,
          severity: 'BLOCK',
        });
      } else {
        const verifiedCount = productData.reviewCount;
        // Allow within 10%
        if (Math.abs(detectedCount - verifiedCount) / (verifiedCount || 1) <= 0.15) {
          claims.push({
            id: `claim_rev_${claims.length}`,
            claimType: 'REVIEW_COUNT',
            claimText: fullMatch,
            classification: 'SUPPORTED',
            verifiedValue: verifiedCount,
            reason: `Review count "${fullMatch}" aligns with verified count (${verifiedCount}).`,
            location,
            severity: 'PASS',
          });
        } else {
          claims.push({
            id: `claim_rev_${claims.length}`,
            claimType: 'REVIEW_COUNT',
            claimText: fullMatch,
            classification: 'CONTRADICTED',
            verifiedValue: verifiedCount,
            reason: `Contradicted review count "${fullMatch}": Verified review count is ${verifiedCount}.`,
            location,
            severity: 'BLOCK',
          });
        }
      }
    }

    // 8. SCARCITY / INVENTORY VALIDATION
    const scarcityRegex = /\b(?:only\s+(\d+)\s+left(?:\s+in\s+stock)?|limited\s+stock|almost\s+sold\s+out|last\s+chance\s+to\s+buy)\b/gi;
    let scarMatch: RegExpExecArray | null;
    while ((scarMatch = scarcityRegex.exec(text)) !== null) {
      const fullMatch = scarMatch[0];
      const verifiedAvail = (productData.availability || '').toLowerCase();
      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_scar_${claims.length}`,
          claimType: 'SCARCITY',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Scarcity statement in user instructions.',
          location,
          severity: 'PASS',
        });
      } else if (verifiedAvail.includes('only') || verifiedAvail.includes('left in stock')) {
        claims.push({
          id: `claim_scar_${claims.length}`,
          claimType: 'SCARCITY',
          claimText: fullMatch,
          classification: 'SUPPORTED',
          reason: `Scarcity claim "${fullMatch}" matches verified availability "${productData.availability}".`,
          location,
          severity: 'PASS',
        });
      } else {
        claims.push({
          id: `claim_scar_${claims.length}`,
          claimType: 'SCARCITY',
          claimText: fullMatch,
          classification: 'UNSUPPORTED',
          reason: `Invented scarcity "${fullMatch}": ProductData availability is "${productData.availability || 'UNKNOWN'}".`,
          location,
          severity: 'BLOCK',
        });
      }
    }

    // 9. TESTIMONIAL VALIDATION
    const testimonialRegex = /\b(?:(?:[A-Z][a-z]+)\s+from\s+[A-Z][a-z]+\s+(?:says|states|wrote)|customer\s+(?:[A-Z][a-z]+)\s+verified)\b/g;
    let testMatch: RegExpExecArray | null;
    while ((testMatch = testimonialRegex.exec(text)) !== null) {
      const fullMatch = testMatch[0];
      if (isUserProvided(fullMatch)) {
        claims.push({
          id: `claim_test_${claims.length}`,
          claimType: 'TESTIMONIAL',
          claimText: fullMatch,
          classification: 'USER_PROVIDED',
          reason: 'Testimonial provided in user instructions.',
          location,
          severity: 'PASS',
        });
      } else {
        claims.push({
          id: `claim_test_${claims.length}`,
          claimType: 'TESTIMONIAL',
          claimText: fullMatch,
          classification: 'UNSUPPORTED',
          reason: `Invented anecdotal testimonial "${fullMatch}": No customer testimonials present in verified ProductData.`,
          location,
          severity: 'BLOCK',
        });
      }
    }

    // Compute stats
    const unsupportedCount = claims.filter(c => c.classification === 'UNSUPPORTED').length;
    const contradictedCount = claims.filter(c => c.classification === 'CONTRADICTED').length;
    const unknownCount = claims.filter(c => c.classification === 'UNKNOWN').length;
    const supportedCount = claims.filter(c => c.classification === 'SUPPORTED').length;
    const userProvidedCount = claims.filter(c => c.classification === 'USER_PROVIDED').length;

    const isValid = unsupportedCount === 0 && contradictedCount === 0 && unknownCount === 0;
    const summary = isValid
      ? `Grounded: ${supportedCount} supported facts, ${userProvidedCount} user-provided facts, 0 hallucinations.`
      : `Hallucination Block: ${unsupportedCount} unsupported, ${contradictedCount} contradicted, ${unknownCount} unknown claims detected.`;

    return {
      isValid,
      claims,
      unsupportedCount,
      contradictedCount,
      unknownCount,
      supportedCount,
      userProvidedCount,
      summary,
    };
  }
}
