/**
 * Phone Agent - Step 2L AI Content Provider Abstraction
 * Defines the contract that all AI content providers (Groq, etc.) must satisfy.
 * INVARIANT: This interface has ZERO publishing methods (no publish, post, upload, send, etc.).
 */

import { AiContentRequest } from './AiContentRequest';
import { AiGenerationResult } from './AiGenerationResult';
import { ContentVariant } from './ContentVariant';

export interface AiContentProvider {
  /**
   * Returns true if the provider is currently available and configured.
   */
  isAvailable(): boolean;

  /**
   * Returns human-readable provider identifier (e.g. "Groq", "DeterministicSafeEngine").
   */
  getProviderName(): string;

  /**
   * Returns active model identifier (e.g. "llama-3.3-70b-versatile").
   */
  getModelName(): string;

  /**
   * Generates a single hook based strictly on verified product context.
   */
  generateHook(request: AiContentRequest): Promise<AiGenerationResult>;

  /**
   * Generates a title grounded in verified ProductData.
   */
  generateTitle(request: AiContentRequest): Promise<AiGenerationResult>;

  /**
   * Generates a structured caption following standard multi-section layout.
   */
  generateCaption(request: AiContentRequest): Promise<AiGenerationResult>;

  /**
   * Generates product description.
   */
  generateDescription(request: AiContentRequest): Promise<AiGenerationResult>;

  /**
   * Generates normalized hashtags derived from category and attributes.
   */
  generateHashtags(request: AiContentRequest): Promise<AiGenerationResult>;

  /**
   * Generates a safe, non-deceptive call-to-action.
   */
  generateCallToAction(request: AiContentRequest): Promise<AiGenerationResult>;

  /**
   * Generates multiple creative variants (Variant A, Variant B, Variant C)
   * all sharing the identical verified factual source.
   */
  generateContentVariants(request: AiContentRequest, count?: number): Promise<ContentVariant[]>;
}
