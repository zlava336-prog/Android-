/**
 * Phone Agent - Step 2K Field-Level Provenance & Evidence Contracts
 * Tracks strict provenance, confidence, source screens, and timestamps for every
 * product field extracted from the Amazon UI or provided by the user.
 * Prohibits AI hallucinations, guesses, or unverified claims.
 */

export type ProvenanceSourceType =
  | 'AMAZON_VISIBLE_UI'
  | 'USER_PROVIDED'
  | 'LOCAL_MEDIA'
  | 'SYSTEM_DERIVED'
  | 'UNKNOWN';

export interface ProductFieldProvenance {
  fieldName: string;
  sourceType: ProvenanceSourceType;
  sourceScreen?: string;
  sourceText?: string;
  extractedValue: any;
  extractedAt: number;
  confidence: number; // 0.0 to 1.0
  fingerprint?: string;
  isVerified: boolean;
  notes?: string;
}

export interface ProductFieldConflict {
  fieldName: string;
  valueA: any;
  sourceA: string;
  valueB: any;
  sourceB: string;
  detectedAt: number;
  resolved: boolean;
  resolvedValue?: any;
}

/**
 * Validates whether a given source type is allowed for factual claims.
 * Rejects AI_GUESS, INFERRED_FROM_INTERNET, UNVERIFIED.
 */
export function isValidProvenanceSource(source: string): boolean {
  const allowed: ProvenanceSourceType[] = [
    'AMAZON_VISIBLE_UI',
    'USER_PROVIDED',
    'LOCAL_MEDIA',
    'SYSTEM_DERIVED',
    'UNKNOWN',
  ];
  return allowed.includes(source as ProvenanceSourceType);
}

/**
 * Creates a standard field provenance record.
 */
export function createFieldProvenance(params: {
  fieldName: string;
  sourceType: ProvenanceSourceType;
  sourceScreen?: string;
  sourceText?: string;
  extractedValue: any;
  confidence?: number;
  notes?: string;
}): ProductFieldProvenance {
  const validSource = isValidProvenanceSource(params.sourceType) ? params.sourceType : 'UNKNOWN';
  const confidence = params.confidence !== undefined ? Math.max(0, Math.min(1, params.confidence)) : 1.0;

  return {
    fieldName: params.fieldName,
    sourceType: validSource,
    sourceScreen: params.sourceScreen,
    sourceText: params.sourceText,
    extractedValue: params.extractedValue,
    extractedAt: Date.now(),
    confidence,
    isVerified: validSource === 'AMAZON_VISIBLE_UI' || validSource === 'USER_PROVIDED',
    notes: params.notes,
  };
}
