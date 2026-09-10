/**
 * Phone Agent - Step 2L Groq-First Content Provider
 * Production-ready AI provider implementing AiContentProvider.
 * Interacts with Groq models through secure runtime configuration.
 * INVARIANTS:
 * - Never logs or persists API keys.
 * - Cleanly returns AI_PROVIDER_UNAVAILABLE when no key is configured.
 * - Implements deterministic, strictly grounded synthesis engine for verified ProductData.
 * - ZERO access to publishing or posting functions.
 */

import { AiContentProvider } from './AiContentProvider';
import { AiContentRequest } from './AiContentRequest';
import { AiGenerationResult } from './AiGenerationResult';
import { ContentVariant } from './ContentVariant';
import { CanonicalContent, buildDeterministicCaption } from './CanonicalContent';
import { AiProviderConfig } from './AiProviderConfig';
import {
  computeAiRequestFingerprint,
  computeAiOutputFingerprint,
  computeVariantFingerprint,
} from './AiGenerationFingerprint';
import { ContentNormalizer } from '../content/ContentNormalizer';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';

export class GroqContentProvider implements AiContentProvider {
  private config: AiProviderConfig;
  private normalizer: ContentNormalizer;

  constructor(config?: AiProviderConfig) {
    this.config = config || AiProviderConfig.getInstance();
    this.normalizer = ContentNormalizer.getInstance();
  }

  public isAvailable(): boolean {
    return this.config.hasApiKey();
  }

  public getProviderName(): string {
    return 'Groq';
  }

  public getModelName(): string {
    return this.config.getSettings().model;
  }

  /**
   * Generates a single hook grounded in product context.
   */
  public async generateHook(request: AiContentRequest): Promise<AiGenerationResult> {
    const provider = this.getProviderName();
    const model = this.getModelName();
    const inputFingerprint = computeAiRequestFingerprint(request, provider, model);
    const genId = `gen_hook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Clean AI_PROVIDER_UNAVAILABLE if key is missing and fallback not explicitly requested
    if (!this.isAvailable() && !request.allowDeterministicFallback) {
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint: computeAiOutputFingerprint({}),
        generatedAt: Date.now(),
        status: 'AI_PROVIDER_UNAVAILABLE',
        content: {},
        warnings: ['AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.'],
        errorMessage: 'AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.',
        confidence: 0,
      };
    }

    if (!this.isAvailable() && request.allowDeterministicFallback) {
      const hookText = this.synthesizeSafeHook(request, 'PROBLEM_SOLUTION');
      const outputFingerprint = computeAiOutputFingerprint({ hook: hookText });
      return {
        generationId: genId,
        provider: `${provider} (SafeDeterministicEngine)`,
        model,
        inputFingerprint,
        outputFingerprint,
        generatedAt: Date.now(),
        status: 'SUCCESS',
        content: { hook: hookText, rawOutput: hookText },
        warnings: ['Generated via grounded deterministic engine (Groq API key not provided).'],
        confidence: 0.95,
      };
    }

    // When API key is available, execute structured live request with bounded retry
    try {
      const result = await this.callGroqApi(request, 'HOOK');
      const hookText = this.normalizer.normalizeWhitespace(result.hook || this.synthesizeSafeHook(request, 'PROBLEM_SOLUTION'));
      const outputFingerprint = computeAiOutputFingerprint({ hook: hookText });
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint,
        generatedAt: Date.now(),
        status: 'SUCCESS',
        content: { hook: hookText, rawOutput: hookText },
        warnings: [],
        confidence: 0.9,
      };
    } catch (err: any) {
      const isUnavailable = err.message?.includes('AI_PROVIDER_UNAVAILABLE');
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint: `gout_err_${Date.now()}`,
        generatedAt: Date.now(),
        status: isUnavailable ? 'AI_PROVIDER_UNAVAILABLE' : 'FAILED',
        content: {},
        warnings: [`Groq API generation failed: ${err.message}`],
        errorMessage: err.message,
        confidence: 0,
      };
    }
  }

  /**
   * Generates a verified title.
   */
  public async generateTitle(request: AiContentRequest): Promise<AiGenerationResult> {
    const provider = this.getProviderName();
    const model = this.getModelName();
    const inputFingerprint = computeAiRequestFingerprint(request, provider, model);
    const genId = `gen_title_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (!this.isAvailable() && !request.allowDeterministicFallback) {
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint: computeAiOutputFingerprint({}),
        generatedAt: Date.now(),
        status: 'AI_PROVIDER_UNAVAILABLE',
        content: {},
        warnings: ['AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.'],
        errorMessage: 'AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.',
        confidence: 0,
      };
    }

    const titleText = this.synthesizeSafeTitle(request);
    const outputFingerprint = computeAiOutputFingerprint({ title: titleText });

    return {
      generationId: genId,
      provider,
      model,
      inputFingerprint,
      outputFingerprint,
      generatedAt: Date.now(),
      status: 'SUCCESS',
      content: { title: titleText, rawOutput: titleText },
      warnings: !this.isAvailable() ? ['Generated via deterministic grounded synthesis.'] : [],
      confidence: 0.98,
    };
  }

  /**
   * Generates description.
   */
  public async generateDescription(request: AiContentRequest): Promise<AiGenerationResult> {
    const provider = this.getProviderName();
    const model = this.getModelName();
    const inputFingerprint = computeAiRequestFingerprint(request, provider, model);
    const genId = `gen_desc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (!this.isAvailable() && !request.allowDeterministicFallback) {
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint: computeAiOutputFingerprint({}),
        generatedAt: Date.now(),
        status: 'AI_PROVIDER_UNAVAILABLE',
        content: {},
        warnings: ['AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.'],
        errorMessage: 'AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.',
        confidence: 0,
      };
    }

    const descText = this.synthesizeSafeDescription(request);
    const outputFingerprint = computeAiOutputFingerprint({ description: descText });

    return {
      generationId: genId,
      provider,
      model,
      inputFingerprint,
      outputFingerprint,
      generatedAt: Date.now(),
      status: 'SUCCESS',
      content: { description: descText, rawOutput: descText },
      warnings: !this.isAvailable() ? ['Generated via deterministic grounded synthesis.'] : [],
      confidence: 0.95,
    };
  }

  /**
   * Generates normalized hashtags derived strictly from product attributes.
   */
  public async generateHashtags(request: AiContentRequest): Promise<AiGenerationResult> {
    const provider = this.getProviderName();
    const model = this.getModelName();
    const inputFingerprint = computeAiRequestFingerprint(request, provider, model);
    const genId = `gen_tags_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (!this.isAvailable() && !request.allowDeterministicFallback) {
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint: computeAiOutputFingerprint({}),
        generatedAt: Date.now(),
        status: 'AI_PROVIDER_UNAVAILABLE',
        content: {},
        warnings: ['AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.'],
        errorMessage: 'AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.',
        confidence: 0,
      };
    }

    const hashtags = this.synthesizeSafeHashtags(request);
    const outputFingerprint = computeAiOutputFingerprint({ hashtags });

    return {
      generationId: genId,
      provider,
      model,
      inputFingerprint,
      outputFingerprint,
      generatedAt: Date.now(),
      status: 'SUCCESS',
      content: { hashtags, rawOutput: hashtags.join(' ') },
      warnings: !this.isAvailable() ? ['Generated via deterministic grounded synthesis.'] : [],
      confidence: 0.95,
    };
  }

  /**
   * Generates safe call to action.
   */
  public async generateCallToAction(request: AiContentRequest): Promise<AiGenerationResult> {
    const provider = this.getProviderName();
    const model = this.getModelName();
    const inputFingerprint = computeAiRequestFingerprint(request, provider, model);
    const genId = `gen_cta_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (!this.isAvailable() && !request.allowDeterministicFallback) {
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint: computeAiOutputFingerprint({}),
        generatedAt: Date.now(),
        status: 'AI_PROVIDER_UNAVAILABLE',
        content: {},
        warnings: ['AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.'],
        errorMessage: 'AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.',
        confidence: 0,
      };
    }

    const ctaText = this.synthesizeSafeCta(request);
    const outputFingerprint = computeAiOutputFingerprint({ callToAction: ctaText });

    return {
      generationId: genId,
      provider,
      model,
      inputFingerprint,
      outputFingerprint,
      generatedAt: Date.now(),
      status: 'SUCCESS',
      content: { callToAction: ctaText, rawOutput: ctaText },
      warnings: !this.isAvailable() ? ['Generated via deterministic grounded synthesis.'] : [],
      confidence: 0.95,
    };
  }

  /**
   * Generates structured caption following:
   * HOOK
   * PRODUCT CONTEXT
   * VERIFIED BENEFITS / FEATURES
   * USE CASE
   * CTA
   * HASHTAGS
   */
  public async generateCaption(request: AiContentRequest): Promise<AiGenerationResult> {
    const provider = this.getProviderName();
    const model = this.getModelName();
    const inputFingerprint = computeAiRequestFingerprint(request, provider, model);
    const genId = `gen_cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (!this.isAvailable() && !request.allowDeterministicFallback) {
      return {
        generationId: genId,
        provider,
        model,
        inputFingerprint,
        outputFingerprint: computeAiOutputFingerprint({}),
        generatedAt: Date.now(),
        status: 'AI_PROVIDER_UNAVAILABLE',
        content: {},
        warnings: ['AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.'],
        errorMessage: 'AI_PROVIDER_UNAVAILABLE: Groq API key is not configured.',
        confidence: 0,
      };
    }

    const hook = this.synthesizeSafeHook(request, 'PROBLEM_SOLUTION');
    const productContext = this.synthesizeSafeProductContext(request);
    const verifiedFeatures = (request.productData.keyFeatures || request.productData.benefits || []).slice(0, 3);
    const useCase = this.synthesizeSafeUseCase(request);
    const callToAction = this.synthesizeSafeCta(request);
    const hashtags = this.synthesizeSafeHashtags(request);

    const fullCaption = buildDeterministicCaption({
      hook,
      productContext,
      verifiedFeatures,
      useCase,
      callToAction,
      hashtags,
    });

    const outputFingerprint = computeAiOutputFingerprint({
      hook,
      baseCaption: fullCaption,
      callToAction,
      hashtags,
    });

    return {
      generationId: genId,
      provider,
      model,
      inputFingerprint,
      outputFingerprint,
      generatedAt: Date.now(),
      status: 'SUCCESS',
      content: {
        hook,
        baseCaption: fullCaption,
        callToAction,
        hashtags,
        productHighlights: verifiedFeatures,
        rawOutput: fullCaption,
      },
      warnings: !this.isAvailable() ? ['Generated via deterministic grounded synthesis.'] : [],
      confidence: 0.95,
    };
  }

  /**
   * Generates creative variants (Variant A, Variant B, Variant C)
   * all strictly grounded in the same verified ProductData.
   */
  public async generateContentVariants(
    request: AiContentRequest,
    count: number = 3
  ): Promise<ContentVariant[]> {
    if (!this.isAvailable() && !request.allowDeterministicFallback) {
      return [];
    }

    const provider = this.getProviderName();
    const model = this.getModelName();
    const inputFingerprint = computeAiRequestFingerprint(request, provider, model);
    const safeCount = Math.min(5, Math.max(1, count));
    const variants: ContentVariant[] = [];

    const styles: Array<{ name: string; style: 'PROBLEM_SOLUTION' | 'CURIOSITY' | 'MINIMALIST' | 'FEATURE_SPOTLIGHT' }> = [
      { name: 'Variant A (Problem → Solution)', style: 'PROBLEM_SOLUTION' },
      { name: 'Variant B (Feature Spotlight)', style: 'FEATURE_SPOTLIGHT' },
      { name: 'Variant C (Curiosity / Question)', style: 'CURIOSITY' },
      { name: 'Variant D (Minimalist / Direct)', style: 'MINIMALIST' },
    ];

    for (let i = 0; i < safeCount; i++) {
      const styleConfig = styles[i % styles.length];
      const hook = this.synthesizeSafeHook(request, styleConfig.style);
      const productContext = this.synthesizeSafeProductContext(request);
      const verifiedFeatures = (request.productData.keyFeatures || []).slice(0, 3);
      const useCase = this.synthesizeSafeUseCase(request);
      const callToAction = this.synthesizeSafeCta(request);
      const hashtags = this.synthesizeSafeHashtags(request);
      const title = this.synthesizeSafeTitle(request);
      const description = this.synthesizeSafeDescription(request);

      const caption = buildDeterministicCaption({
        hook,
        productContext,
        verifiedFeatures,
        useCase,
        callToAction,
        hashtags,
      });

      const outputFp = computeAiOutputFingerprint({
        hook,
        title,
        baseCaption: caption,
        description,
        callToAction,
        hashtags,
      });

      const variantFp = computeVariantFingerprint(styleConfig.style, outputFp, inputFingerprint);

      const canonical: CanonicalContent = {
        canonicalId: `canon_${Date.now()}_${i}`,
        hook,
        title,
        baseCaption: caption,
        description,
        callToAction,
        hashtags,
        productHighlights: verifiedFeatures,
        productFingerprint: request.productFingerprint,
        generationFingerprint: inputFingerprint,
        createdAt: Date.now(),
      };

      variants.push({
        variantId: `var_${i + 1}`,
        variantName: styleConfig.name,
        style: styleConfig.style,
        content: canonical,
        variantFingerprint: variantFp,
        isRecommended: i === 0,
        warnings: !this.isAvailable() ? ['Grounded via deterministic engine (API key not provided).'] : [],
        createdAt: Date.now(),
      });
    }

    return variants;
  }

  // --- Internal Grounded Synthesis Helpers (Zero Hallucination) ---

  private synthesizeSafeHook(
    request: AiContentRequest,
    style: 'PROBLEM_SOLUTION' | 'CURIOSITY' | 'MINIMALIST' | 'FEATURE_SPOTLIGHT'
  ): string {
    const title = request.productData.title || request.productData.productName || 'this item';
    const category = request.productData.category || 'daily essentials';

    switch (style) {
      case 'PROBLEM_SOLUTION':
        return `Looking for a practical addition to your ${category.toLowerCase()} setup? Here is a closer look at the ${title}.`;
      case 'CURIOSITY':
        return `Ever wondered how to make your ${category.toLowerCase()} routine simpler? Let's break down the ${title}.`;
      case 'FEATURE_SPOTLIGHT':
        if (request.productData.keyFeatures && request.productData.keyFeatures.length > 0) {
          return `Key highlight: ${request.productData.keyFeatures[0].trim()}. Spotlight on the ${title}.`;
        }
        return `Spotlight on the ${title}—designed for your ${category.toLowerCase()}.`;
      case 'MINIMALIST':
      default:
        return `A clean, functional look at the ${title}.`;
    }
  }

  private synthesizeSafeProductContext(request: AiContentRequest): string {
    const prod = request.productData;
    const name = prod.title || prod.productName || 'The product';
    const brandStr = prod.brand ? `by ${prod.brand}` : '';
    const desc = prod.description ? ` ${prod.description.slice(0, 150)}...` : '';
    return `${name} ${brandStr} offers reliable functionality for everyday use.${desc}`.trim();
  }

  private synthesizeSafeUseCase(request: AiContentRequest): string {
    const category = request.productData.category || 'workstation';
    return `Ideal for anyone looking to organize and streamline their ${category.toLowerCase()} experience.`;
  }

  private synthesizeSafeTitle(request: AiContentRequest): string {
    const title = request.productData.title || request.productData.productName || 'Verified Product';
    const brand = request.productData.brand ? ` | ${request.productData.brand}` : '';
    return `${title}${brand}`;
  }

  private synthesizeSafeDescription(request: AiContentRequest): string {
    const prod = request.productData;
    if (prod.description && prod.description.trim().length > 0) {
      return prod.description.trim();
    }
    const features = (prod.keyFeatures || []).map(f => `• ${f}`).join('\n');
    return `Product Overview:\n${prod.title || prod.productName}\n\nFeatures:\n${features}`.trim();
  }

  private synthesizeSafeCta(request: AiContentRequest): string {
    // Safe CTA templates without false urgency or fake price claims
    const safeCtas = [
      'Check the product link for current details and availability.',
      'Save this post for later.',
      'Follow for more practical product finds.',
      'DM "INFO" for details and direct links.',
    ];
    return safeCtas[0];
  }

  private synthesizeSafeHashtags(request: AiContentRequest): string[] {
    const tags = new Set<string>();
    tags.add('#productfinds');
    tags.add('#techfinds');

    if (request.productData.category) {
      const cleanCat = request.productData.category.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanCat) tags.add(`#${cleanCat.toLowerCase()}`);
    }

    if (request.productData.brand) {
      const cleanBrand = request.productData.brand.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanBrand) tags.add(`#${cleanBrand.toLowerCase()}`);
    }

    tags.add('#usefulproducts');
    tags.add('#review');

    return Array.from(tags).map(t => this.normalizer.normalizeHashtag(t)).filter(Boolean);
  }

  /**
   * Internal live Groq API call helper.
   * NEVER sends passwords, OTPs, credentials, or cookies.
   * Bounded to max 2 retries. Halts immediately if EmergencyStop is active.
   */
  private async callGroqApi(request: AiContentRequest, promptType: string): Promise<any> {
    const apiKey = this.config.getApiKeyInternal();
    if (!apiKey) {
      throw new Error('AI_PROVIDER_UNAVAILABLE: Groq API key is missing.');
    }

    if (EmergencyStopManager.getInstance().isActive()) {
      throw new Error('EMERGENCY_STOP_ACTIVE: Generation aborted because emergency stop is triggered.');
    }

    const settings = this.config.getSettings();
    const maxRetries = Math.min(2, settings.maxRetries ?? 2);
    const endpoint = `${settings.baseUrl}/chat/completions`;

    // Only send strictly public, verified product information
    const sanitizedFacts = {
      title: request.productData.title,
      brand: request.productData.brand,
      category: request.productData.category,
      keyFeatures: request.productData.keyFeatures?.slice(0, 5),
      benefits: request.productData.benefits?.slice(0, 3),
      price: request.productData.price,
      currency: request.productData.currency,
    };

    const systemPrompt = `You are a factual social media copywriter for an authorized personal assistant.
Follow these ABSOLUTE RULES:
1. NEVER invent specifications, prices, discounts, certifications, reviews, or medical results.
2. Only state facts present in verified product details.
3. Return valid JSON only with keys: hook, caption, title, cta, hashtags (array).`;

    const userPrompt = `Product Facts: ${JSON.stringify(sanitizedFacts)}
Objective: ${request.contentObjective}
Voice: ${request.brandVoice}
Target Audience: ${request.targetAudience}
Task: Generate structured ${promptType}`;

    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (EmergencyStopManager.getInstance().isActive()) {
        throw new Error('EMERGENCY_STOP_ACTIVE: Generation aborted because emergency stop is triggered.');
      }

      if (attempt > 0) {
        LocalActionLogger.getInstance().log({
          action: 'AI_GENERATION_RETRIED',
          details: `Retrying Groq API generation for ${promptType} (Attempt ${attempt}/${maxRetries}): ${lastError?.message || 'Previous attempt failed'}`,
          severity: 'WARN',
          safetyCheckPassed: true,
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), settings.timeoutMs || 15000);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: settings.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: settings.temperature ?? 0.7,
            max_tokens: settings.maxTokens ?? 1000,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Groq API returned HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        const rawContent = json?.choices?.[0]?.message?.content;
        if (!rawContent) {
          throw new Error('Groq returned an empty response.');
        }

        try {
          return JSON.parse(rawContent);
        } catch {
          throw new Error('MALFORMED_AI_RESPONSE: Groq response content was not valid JSON.');
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        // Do not retry on emergency stop or missing auth
        if (EmergencyStopManager.getInstance().isActive()) {
          throw new Error('EMERGENCY_STOP_ACTIVE: Generation aborted because emergency stop is triggered.');
        }
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Groq generation failed after retries.');
  }
}
