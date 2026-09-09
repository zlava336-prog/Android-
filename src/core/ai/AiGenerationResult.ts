/**
 * Phone Agent - Step 2L AI Generation Result
 * Deterministic, structured output contracts for AI generation operations.
 */

export type AiGenerationStatus =
  | 'SUCCESS'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'FAILED'
  | 'BLOCKED_BY_POLICY'
  | 'BLOCKED_BY_FACT_CHECK'
  | 'TIMEOUT';

export interface GeneratedContentPayload {
  hook?: string;
  title?: string;
  baseCaption?: string;
  description?: string;
  hashtags?: string[];
  callToAction?: string;
  shortScript?: string;
  productHighlights?: string[];
  rawOutput?: string;
}

export interface AiGenerationResult {
  generationId: string;
  provider: string; // e.g. 'Groq', 'DeterministicSafeEngine'
  model: string; // e.g. 'llama-3.3-70b-versatile'
  inputFingerprint: string; // gfp_<sha256>
  outputFingerprint: string; // gout_<sha256>
  generatedAt: number;
  status: AiGenerationStatus;
  content: GeneratedContentPayload;
  warnings: string[];
  confidence: number; // 0.0 to 1.0
  errorMessage?: string;
  retryCount?: number;
}
