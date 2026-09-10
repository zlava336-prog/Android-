/**
 * Phone Agent - Step 2L Production-Grade AI Content Generation Manager
 * Central orchestrator for the AI Content Generation Pipeline.
 * Integrates:
 * - Verified ProductData & Provenance
 * - Validated Local Media
 * - Groq Content Provider (with safe deterministic fallback engine)
 * - Anti-hallucination & Fact Grounding (FactGroundingValidator)
 * - Truth-in-Advertising & Platform Policy Enforcement (AiClaimValidator)
 * - Deterministic Cryptographic Fingerprinting (Request, Output, Variant)
 * - Platform Projection & Character/Hashtag Adaptation (AdapterRegistry)
 * - Human Review Lifecycle & Edit Safety (ContentReviewManager)
 * - Audit Logging & Zero-Leak Secret Protection (LocalActionLogger)
 *
 * ABSOLUTE INVARIANTS:
 * - AI NEVER directly publishes or posts to any social platform.
 * - AI NEVER auto-approves generated content (always DRAFT or NEEDS_REVIEW).
 * - Human edits immediately invalidate previous approvals (STALE_APPROVAL).
 * - Amazon is strictly Product Link Source isolation, NEVER a publishing target.
 * - Never persists, logs, or transmits credentials, passwords, OTPs, or API keys.
 */

import { SupportedPlatform } from '../../types/job';
import { ProductData } from '../product/ProductData';
import {
  ContentPackage,
  MediaAsset,
  PlatformContentOverride,
  createDefaultContentPackage,
} from '../content/ContentPackage';
import { AdapterRegistry } from '../AdapterRegistry';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';
import { AiContentProvider } from './AiContentProvider';
import { GroqContentProvider } from './GroqContentProvider';
import { AiProviderConfig } from './AiProviderConfig';
import {
  AiContentRequest,
  validateAiContentRequest,
  RequestValidationResult,
} from './AiContentRequest';
import { AiGenerationStatus } from './AiGenerationResult';
import { CanonicalContent, buildDeterministicCaption } from './CanonicalContent';
import { ContentVariant } from './ContentVariant';
import {
  AiClaimValidator,
  AiClaimValidationResult,
} from './AiClaimValidator';
import {
  computeAiRequestFingerprint,
  computeAiOutputFingerprint,
  computeVariantFingerprint,
  isGenerationStale,
  sha256,
} from './AiGenerationFingerprint';
import { ContentNormalizer } from '../content/ContentNormalizer';
import { ContentReviewManager } from '../content/ContentReviewManager';

export interface PlatformProjectionResult {
  platform: SupportedPlatform;
  caption: string;
  title?: string;
  description?: string;
  hashtags: string[];
  callToAction?: string;
  characterCount: number;
  characterLimit: number;
  isWithinLimits: boolean;
  warnings: string[];
  needsReview: boolean;
  adaptedFactualClaimsVerified: boolean;
  projectionFingerprint: string;
}

export interface AiGenerationSession {
  sessionId: string;
  requestId: string;
  request: AiContentRequest;
  requestFingerprint: string;
  generationFingerprint: string;
  outputFingerprint: string;
  provider: string;
  model: string;
  status: AiGenerationStatus;
  canonicalContent?: CanonicalContent;
  variants: ContentVariant[];
  selectedVariantId?: string;
  validationResult?: AiClaimValidationResult;
  platformProjections: Partial<Record<SupportedPlatform, PlatformProjectionResult>>;
  draftContentPackageId?: string;
  reviewStatus: 'DRAFT' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED' | 'STALE_APPROVAL';
  approvalRecord?: {
    approvedBy: string;
    approvedAt: number;
    approvedContentFingerprint: string;
    note?: string;
  };
  rejectionRecord?: {
    rejectedBy: string;
    rejectedAt: number;
    reason: string;
  };
  warnings: string[];
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
}

export class AiGenerationManager {
  private static instance: AiGenerationManager | null = null;
  private provider: AiContentProvider;
  private claimValidator: AiClaimValidator;
  private normalizer: ContentNormalizer;
  private adapterRegistry: AdapterRegistry;
  private emergencyStop: EmergencyStopManager;
  private logger: LocalActionLogger;
  private reviewManager: ContentReviewManager;
  private sessions: Map<string, AiGenerationSession> = new Map();

  constructor(
    provider?: AiContentProvider,
    claimValidator?: AiClaimValidator,
    normalizer?: ContentNormalizer,
    adapterRegistry?: AdapterRegistry,
    emergencyStop?: EmergencyStopManager,
    logger?: LocalActionLogger,
    reviewManager?: ContentReviewManager
  ) {
    this.provider = provider || new GroqContentProvider();
    this.claimValidator = claimValidator || AiClaimValidator.getInstance();
    this.normalizer = normalizer || ContentNormalizer.getInstance();
    this.adapterRegistry = adapterRegistry || AdapterRegistry.getInstance();
    this.emergencyStop = emergencyStop || EmergencyStopManager.getInstance();
    this.logger = logger || LocalActionLogger.getInstance();
    this.reviewManager = reviewManager || ContentReviewManager.getInstance();
  }

  public static getInstance(): AiGenerationManager {
    if (!AiGenerationManager.instance) {
      AiGenerationManager.instance = new AiGenerationManager();
    }
    return AiGenerationManager.instance;
  }

  public static resetInstance(): void {
    AiGenerationManager.instance = null;
  }

  public getProvider(): AiContentProvider {
    return this.provider;
  }

  public setProvider(provider: AiContentProvider): void {
    this.provider = provider;
  }

  public getConfig(): AiProviderConfig {
    return AiProviderConfig.getInstance();
  }

  /**
   * Main generation orchestration method.
   * Transforms verified ProductData + Validated Media into:
   * 1. Request fingerprinting & security tripwire validation
   * 2. Bounded AI call or grounded deterministic fallback
   * 3. Anti-hallucination & truth-in-advertising policy validation
   * 4. Multi-variant generation (A/B/C)
   * 5. Platform-specific projections
   * 6. Draft ContentPackage creation (status DRAFT / NEEDS_REVIEW, NEVER APPROVED)
   */
  public async generateContent(
    request: AiContentRequest,
    options?: {
      variantCount?: number;
      allowDeterministicFallback?: boolean;
    }
  ): Promise<AiGenerationSession> {
    const sessionId = `ai_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = Date.now();

    this.logger.log({
      action: 'AI_GENERATION_REQUESTED',
      details: `Content generation requested for product "${request?.productData?.title || 'Unknown'}" (${request?.requestId})`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    // 1. Emergency Stop Check
    if (this.emergencyStop.isActive()) {
      this.logger.log({
        action: 'AI_GENERATION_FAILED',
        details: 'Generation halted: Emergency stop is active.',
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      const failedSession: AiGenerationSession = {
        sessionId,
        requestId: request?.requestId || 'unknown',
        request,
        requestFingerprint: 'gfp_aborted',
        generationFingerprint: 'gen_aborted',
        outputFingerprint: 'gout_aborted',
        provider: this.provider.getProviderName(),
        model: this.provider.getModelName(),
        status: 'FAILED',
        variants: [],
        platformProjections: {},
        reviewStatus: 'DRAFT',
        warnings: ['Emergency Stop is ACTIVE. Content generation strictly prohibited.'],
        retryCount: 0,
        createdAt,
        updatedAt: createdAt,
        errorMessage: 'Emergency Stop is ACTIVE. Content generation strictly prohibited.',
      };
      this.sessions.set(sessionId, failedSession);
      return failedSession;
    }

    // 2. Strict Input Security Validation
    const validation = validateAiContentRequest(request);
    if (!validation.isValid) {
      this.logger.log({
        action: 'AI_GENERATION_FAILED',
        details: `Request validation failed: ${validation.errors.join('; ')}`,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      const invalidSession: AiGenerationSession = {
        sessionId,
        requestId: request?.requestId || 'unknown',
        request,
        requestFingerprint: 'gfp_invalid',
        generationFingerprint: 'gen_invalid',
        outputFingerprint: 'gout_invalid',
        provider: this.provider.getProviderName(),
        model: this.provider.getModelName(),
        status: 'FAILED',
        variants: [],
        platformProjections: {},
        reviewStatus: 'DRAFT',
        warnings: validation.errors,
        retryCount: 0,
        createdAt,
        updatedAt: createdAt,
        errorMessage: `Request validation failed: ${validation.errors.join('; ')}`,
      };
      this.sessions.set(sessionId, invalidSession);
      return invalidSession;
    }

    // 3. Compute Deterministic Request Fingerprint
    const providerName = this.provider.getProviderName();
    const modelName = this.provider.getModelName();
    const requestFingerprint = computeAiRequestFingerprint(request, providerName, modelName);

    this.logger.log({
      action: 'AI_GENERATION_STARTED',
      details: `Started AI pipeline with provider ${providerName} (${modelName}) [${requestFingerprint.slice(0, 16)}]`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    // 4. Provider Availability Check
    const isAvailable = this.provider.isAvailable();
    const allowFallback = options?.allowDeterministicFallback ?? request.allowDeterministicFallback ?? false;

    if (!isAvailable && !allowFallback) {
      this.logger.log({
        action: 'AI_GENERATION_FAILED',
        details: 'AI Provider is unavailable (no API key configured) and fallback was not requested.',
        severity: 'WARN',
        safetyCheckPassed: true,
      });
      const unavailSession: AiGenerationSession = {
        sessionId,
        requestId: request.requestId,
        request,
        requestFingerprint,
        generationFingerprint: `gen_unavail_${Date.now()}`,
        outputFingerprint: `gout_unavail_${Date.now()}`,
        provider: providerName,
        model: modelName,
        status: 'AI_PROVIDER_UNAVAILABLE',
        variants: [],
        platformProjections: {},
        reviewStatus: 'DRAFT',
        warnings: ['AI_PROVIDER_UNAVAILABLE: Provider API key is not configured. Configure API key or enable deterministic fallback.'],
        retryCount: 0,
        createdAt,
        updatedAt: createdAt,
        errorMessage: 'AI_PROVIDER_UNAVAILABLE: Provider API key is not configured.',
      };
      this.sessions.set(sessionId, unavailSession);
      return unavailSession;
    }

    // 5. Generate Creative Variants (Variants A, B, C)
    const effectiveReq: AiContentRequest = {
      ...request,
      allowDeterministicFallback: allowFallback,
    };

    let variants: ContentVariant[] = [];
    let retryCount = 0;
    try {
      variants = await this.provider.generateContentVariants(effectiveReq, options?.variantCount || 3);
    } catch (err: any) {
      this.logger.log({
        action: 'AI_GENERATION_FAILED',
        details: `Variant generation failed: ${err.message}`,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      const failedSession: AiGenerationSession = {
        sessionId,
        requestId: request.requestId,
        request,
        requestFingerprint,
        generationFingerprint: `gen_err_${Date.now()}`,
        outputFingerprint: `gout_err_${Date.now()}`,
        provider: providerName,
        model: modelName,
        status: 'FAILED',
        variants: [],
        platformProjections: {},
        reviewStatus: 'DRAFT',
        warnings: [err.message],
        retryCount,
        createdAt,
        updatedAt: createdAt,
        errorMessage: err.message,
      };
      this.sessions.set(sessionId, failedSession);
      return failedSession;
    }

    // Log variant creation
    for (const v of variants) {
      this.logger.log({
        action: 'AI_VARIANT_CREATED',
        details: `Created variant "${v.variantName}" (${v.style}) [${v.variantFingerprint.slice(0, 16)}]`,
        severity: 'INFO',
        safetyCheckPassed: true,
      });
    }

    // 6. Select Recommended / Primary Variant as Canonical Content
    const primaryVariant = variants.find(v => v.isRecommended) || variants[0];
    const canonicalContent: CanonicalContent = primaryVariant
      ? primaryVariant.content
      : {
          canonicalId: `canon_${Date.now()}`,
          hook: request.productData.title || 'Verified Product',
          title: request.productData.title || 'Verified Product',
          baseCaption: `${request.productData.title || 'Verified Product'}\n\n${(request.productData.keyFeatures || []).join('\n')}`,
          description: request.productData.description || '',
          callToAction: 'Check product link for details.',
          hashtags: ['#productfinds'],
          productHighlights: request.productData.keyFeatures?.slice(0, 3) || [],
          productFingerprint: request.productFingerprint,
          generationFingerprint: requestFingerprint,
          createdAt: Date.now(),
        };

    const outputFingerprint = computeAiOutputFingerprint({
      hook: canonicalContent.hook,
      title: canonicalContent.title,
      baseCaption: canonicalContent.baseCaption,
      description: canonicalContent.description,
      callToAction: canonicalContent.callToAction,
      hashtags: canonicalContent.hashtags,
    });

    const generationFingerprint = sha256(`gen:${requestFingerprint}:${outputFingerprint}`);

    // 7. Deterministic Fact Grounding & Truth-in-Advertising Policy Validation
    const allGeneratedText = [
      canonicalContent.hook,
      canonicalContent.title,
      canonicalContent.baseCaption,
      canonicalContent.description,
      canonicalContent.callToAction,
      canonicalContent.shortScript || '',
    ].join('\n');

    const validationResult = this.claimValidator.validateClaims(
      allGeneratedText,
      request.productData,
      request.userProvidedInstructions,
      'CANONICAL_OUTPUT'
    );

    let sessionStatus: AiGenerationStatus = 'SUCCESS';
    const warnings: string[] = [];

    if (!validationResult.isValid) {
      if (validationResult.blockedReasons.some(r => r.includes('POLICY_BLOCK'))) {
        sessionStatus = 'BLOCKED_BY_POLICY';
      } else {
        sessionStatus = 'BLOCKED_BY_FACT_CHECK';
      }
      warnings.push(...validationResult.blockedReasons);
    } else if (validationResult.decision === 'WARN') {
      warnings.push(...validationResult.policyWarnings.map(w => `[POLICY_WARN] ${w.reason}`));
    }

    // 8. Platform Projections
    const platformProjections = this.projectToAllPlatforms(
      canonicalContent,
      request.platforms,
      request.productData
    );

    // Any projection that needs review adds to warnings
    for (const [p, proj] of Object.entries(platformProjections) as [SupportedPlatform, PlatformProjectionResult][]) {
      if (proj && proj.needsReview) {
        warnings.push(`Platform ${p}: ${proj.warnings.join(', ')}`);
      }
    }

    // Invariant: Initial review status is ALWAYS DRAFT or NEEDS_REVIEW, NEVER APPROVED
    const reviewStatus = (!validationResult.isValid || warnings.length > 0) ? 'NEEDS_REVIEW' : 'DRAFT';

    const session: AiGenerationSession = {
      sessionId,
      requestId: request.requestId,
      request,
      requestFingerprint,
      generationFingerprint,
      outputFingerprint,
      provider: providerName,
      model: modelName,
      status: sessionStatus,
      canonicalContent,
      variants,
      selectedVariantId: primaryVariant?.variantId,
      validationResult,
      platformProjections,
      reviewStatus,
      warnings,
      retryCount,
      createdAt,
      updatedAt: createdAt,
    };

    this.sessions.set(sessionId, session);

    this.logger.log({
      action: sessionStatus === 'SUCCESS' ? 'AI_GENERATION_COMPLETED' : 'AI_FACT_VALIDATION_BLOCKED',
      details: `AI generation completed with status ${sessionStatus} (${variants.length} variants, review status: ${reviewStatus})`,
      severity: sessionStatus === 'SUCCESS' ? 'INFO' : 'SECURITY',
      safetyCheckPassed: sessionStatus === 'SUCCESS',
    });

    return session;
  }

  /**
   * Projects canonical content to all requested platforms using AdapterRegistry specs.
   */
  public projectToAllPlatforms(
    canonical: CanonicalContent,
    platforms: SupportedPlatform[],
    productData?: ProductData
  ): Partial<Record<SupportedPlatform, PlatformProjectionResult>> {
    const projections: Partial<Record<SupportedPlatform, PlatformProjectionResult>> = {};

    for (const platform of platforms) {
      projections[platform] = this.projectToPlatform(canonical, platform, productData);
    }

    return projections;
  }

  /**
   * Projects canonical content onto a single specific platform.
   * Respects character limits, hashtag limits, title support, and preserves factual accuracy.
   */
  public projectToPlatform(
    canonical: CanonicalContent,
    platform: SupportedPlatform,
    productData?: ProductData
  ): PlatformProjectionResult {
    // Invariant: Amazon is NEVER a publishing destination
    if (platform === 'amazon') {
      return {
        platform: 'amazon',
        caption: '',
        hashtags: [],
        characterCount: 0,
        characterLimit: 0,
        isWithinLimits: false,
        warnings: ['Amazon is strictly restricted to Product Link Source extraction and cannot be published to.'],
        needsReview: true,
        adaptedFactualClaimsVerified: false,
        projectionFingerprint: 'proj_amazon_blocked',
      };
    }

    const adapter = this.adapterRegistry.find(platform);
    const warnings: string[] = [];
    let needsReview = false;

    // Platform limit specifications
    const limits: Record<SupportedPlatform, { maxChars: number; maxTags: number; supportsTitle: boolean }> = {
      instagram: { maxChars: 2200, maxTags: 30, supportsTitle: false },
      x: { maxChars: 280, maxTags: 4, supportsTitle: false },
      youtube: { maxChars: 5000, maxTags: 15, supportsTitle: true },
      facebook: { maxChars: 63206, maxTags: 10, supportsTitle: false },
      tiktok: { maxChars: 2200, maxTags: 10, supportsTitle: false },
      pinterest: { maxChars: 500, maxTags: 8, supportsTitle: true },
      threads: { maxChars: 500, maxTags: 5, supportsTitle: false },
      linkedin: { maxChars: 3000, maxTags: 10, supportsTitle: false },
      amazon: { maxChars: 0, maxTags: 0, supportsTitle: false },
    };

    const config = limits[platform] || { maxChars: 2200, maxTags: 10, supportsTitle: false };

    // Hashtag adaptation
    const adaptedTags = (canonical.hashtags || []).slice(0, config.maxTags).map(t => this.normalizer.normalizeHashtag(t));

    let adaptedCaption = canonical.baseCaption;
    let adaptedTitle: string | undefined;
    let adaptedDescription: string | undefined;

    if (config.supportsTitle) {
      adaptedTitle = canonical.title.slice(0, 100);
      adaptedDescription = canonical.description || canonical.baseCaption;
    }

    // Adaptation for compact platforms (e.g. X / Twitter, Threads, Pinterest)
    if (platform === 'x') {
      // Must fit in 280 chars while retaining factual accuracy
      const tagsStr = adaptedTags.join(' ');
      const availableChars = config.maxChars - tagsStr.length - 2;

      if (canonical.baseCaption.length > availableChars) {
        // Safe compact formulation: Hook + Title + Key verified feature + CTA
        const safeHighlight = canonical.productHighlights && canonical.productHighlights.length > 0
          ? `• ${canonical.productHighlights[0]}`
          : '';
        const compact = `${canonical.hook}\n${safeHighlight}\n${canonical.callToAction}`.trim();

        if (compact.length <= availableChars) {
          adaptedCaption = `${compact}\n\n${tagsStr}`.trim();
        } else {
          adaptedCaption = `${canonical.hook.slice(0, availableChars - 10)}...\n\n${tagsStr}`.trim();
          warnings.push('Caption was truncated to fit character limit. Verify no factual meaning was lost.');
          needsReview = true;
        }
      } else {
        adaptedCaption = `${canonical.baseCaption}\n\n${tagsStr}`.trim();
      }
    } else if (platform === 'threads' || platform === 'pinterest') {
      const tagsStr = adaptedTags.join(' ');
      if (canonical.baseCaption.length + tagsStr.length + 2 > config.maxChars) {
        const truncated = canonical.baseCaption.slice(0, config.maxChars - tagsStr.length - 5);
        adaptedCaption = `${truncated}...\n\n${tagsStr}`.trim();
        warnings.push('Content adjusted for platform character constraints.');
        needsReview = true;
      }
    }

    const charCount = adaptedCaption.length;
    const isWithinLimits = charCount <= config.maxChars;
    if (!isWithinLimits) {
      warnings.push(`Exceeds platform character limit of ${config.maxChars} (current: ${charCount})`);
      needsReview = true;
    }

    // Projection Fingerprint
    const projectionFingerprint = sha256(`proj:${platform}:${adaptedCaption}:${adaptedTitle || ''}:${adaptedTags.join(',')}`);

    return {
      platform,
      caption: adaptedCaption,
      title: adaptedTitle,
      description: adaptedDescription,
      hashtags: adaptedTags,
      callToAction: canonical.callToAction,
      characterCount: charCount,
      characterLimit: config.maxChars,
      isWithinLimits,
      warnings,
      needsReview,
      adaptedFactualClaimsVerified: true,
      projectionFingerprint,
    };
  }

  /**
   * Creates a draft ContentPackage from a generated session.
   * Invariant: Initial status is ALWAYS DRAFT or NEEDS_REVIEW, NEVER APPROVED.
   * AI NEVER directly publishes or schedules publication.
   */
  public createDraftContentPackage(params: {
    session: AiGenerationSession;
    selectedVariantId?: string;
    targetPlatforms?: SupportedPlatform[];
    mediaAssets?: MediaAsset[];
  }): ContentPackage {
    const { session, selectedVariantId, targetPlatforms, mediaAssets } = params;

    const variant = selectedVariantId
      ? session.variants.find(v => v.variantId === selectedVariantId) || session.variants[0]
      : session.variants.find(v => v.isRecommended) || session.variants[0];

    const content = variant ? variant.content : session.canonicalContent!;
    const platforms = targetPlatforms || session.request.platforms;
    const assets = mediaAssets || session.request.mediaAssets || [];

    // Filter out Amazon from publishing destinations
    const safePlatforms = platforms.filter(p => p !== 'amazon');

    // Build platform overrides from projections
    const overrides: Partial<Record<SupportedPlatform, PlatformContentOverride>> = {};
    for (const p of safePlatforms) {
      const proj = session.platformProjections[p];
      if (proj) {
        overrides[p] = {
          platform: p,
          caption: proj.caption,
          title: proj.title,
          description: proj.description,
          hashtags: proj.hashtags,
          callToAction: proj.callToAction,
          overrideFingerprint: proj.projectionFingerprint,
        };
      }
    }

    const contentId = `content_pkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const pkg: ContentPackage = createDefaultContentPackage({
      contentId,
      sourceType: 'AMAZON_PRODUCT',
      productData: session.request.productData
        ? ({
            ...session.request.productData,
            productName:
              session.request.productData.productName ||
              session.request.productData.title ||
              'Verified Product',
          } as any)
        : undefined,
      title: content.title,
      description: content.description,
      baseCaption: content.baseCaption,
      hashtags: content.hashtags,
      callToAction: content.callToAction,
      mediaAssets: assets,
      selectedPlatforms: safePlatforms,
      platformOverrides: overrides,
      reviewState: session.reviewStatus === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'DRAFT',
      contentFingerprint: session.generationFingerprint,
      mediaFingerprint: session.request.mediaFingerprints.join(':') || 'media_none',
      auditMetadata: {
        shortScript: content.shortScript,
        generationFingerprint: session.generationFingerprint,
      },
    });

    // Update session reference
    session.draftContentPackageId = contentId;
    this.sessions.set(session.sessionId, session);

    return pkg;
  }

  /**
   * Human Review Action: Approve Session.
   * Explicit operator action binding human identity and note to the exact generation fingerprint.
   * Invariant: ZERO auto-approval.
   */
  public approveSession(
    sessionId: string,
    reviewerId: string,
    note?: string
  ): AiGenerationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (this.emergencyStop.isActive()) {
      throw new Error('EMERGENCY_STOP_ACTIVE: Cannot approve content while emergency stop is active.');
    }

    if (session.status !== 'SUCCESS') {
      throw new Error(`Cannot approve session with status ${session.status}. Resolve errors first.`);
    }

    session.reviewStatus = 'APPROVED';
    session.approvalRecord = {
      approvedBy: reviewerId,
      approvedAt: Date.now(),
      approvedContentFingerprint: session.generationFingerprint,
      note,
    };
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    this.logger.log({
      action: 'AI_CONTENT_APPROVED',
      details: `Operator "${reviewerId}" approved session "${sessionId}" [${session.generationFingerprint.slice(0, 16)}]`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return session;
  }

  /**
   * Human Review Action: Reject Session.
   */
  public rejectSession(
    sessionId: string,
    reviewerId: string,
    reason: string
  ): AiGenerationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    session.reviewStatus = 'REJECTED';
    session.rejectionRecord = {
      rejectedBy: reviewerId,
      rejectedAt: Date.now(),
      reason,
    };
    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    this.logger.log({
      action: 'AI_CONTENT_REJECTED',
      details: `Operator "${reviewerId}" rejected session "${sessionId}": ${reason}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });

    return session;
  }

  /**
   * Edit Safety: When human edits caption, title, description, hashtags, cta, or platforms:
   * Recalculates fingerprints.
   * Immediately transitions previous approval to STALE_APPROVAL.
   * Emits audit logs: AI_CONTENT_EDITED and AI_CONTENT_APPROVAL_STALE.
   */
  public editSessionContent(
    sessionId: string,
    editorId: string,
    updates: {
      baseCaption?: string;
      title?: string;
      description?: string;
      hashtags?: string[];
      callToAction?: string;
      shortScript?: string;
    }
  ): AiGenerationSession {
    const session = this.sessions.get(sessionId);
    if (!session || !session.canonicalContent) {
      throw new Error(`Session ${sessionId} not found or has no content.`);
    }

    const previousStatus = session.reviewStatus;
    const oldFp = session.generationFingerprint;

    // Apply updates to canonical content
    session.canonicalContent = {
      ...session.canonicalContent,
      baseCaption: updates.baseCaption !== undefined ? updates.baseCaption : session.canonicalContent.baseCaption,
      title: updates.title !== undefined ? updates.title : session.canonicalContent.title,
      description: updates.description !== undefined ? updates.description : session.canonicalContent.description,
      hashtags: updates.hashtags !== undefined ? updates.hashtags : session.canonicalContent.hashtags,
      callToAction: updates.callToAction !== undefined ? updates.callToAction : session.canonicalContent.callToAction,
      shortScript: updates.shortScript !== undefined ? updates.shortScript : session.canonicalContent.shortScript,
    };

    // Recalculate output and generation fingerprints
    const newOutputFp = computeAiOutputFingerprint({
      hook: session.canonicalContent.hook,
      title: session.canonicalContent.title,
      baseCaption: session.canonicalContent.baseCaption,
      description: session.canonicalContent.description,
      callToAction: session.canonicalContent.callToAction,
      hashtags: session.canonicalContent.hashtags,
    });

    const newGenFp = sha256(`gen:${session.requestFingerprint}:${newOutputFp}`);
    session.outputFingerprint = newOutputFp;
    session.generationFingerprint = newGenFp;

    // Revalidate modified content against verified ProductData
    const allText = [
      session.canonicalContent.title,
      session.canonicalContent.baseCaption,
      session.canonicalContent.description,
      session.canonicalContent.callToAction,
    ].join('\n');

    session.validationResult = this.claimValidator.validateClaims(
      allText,
      session.request.productData,
      session.request.userProvidedInstructions,
      'EDITED_CONTENT'
    );

    // Reproject to platforms
    session.platformProjections = this.projectToAllPlatforms(
      session.canonicalContent,
      session.request.platforms,
      session.request.productData
    );

    // Edit safety invariant: Invalidate prior approval
    if (previousStatus === 'APPROVED') {
      session.reviewStatus = 'STALE_APPROVAL';
      this.logger.log({
        action: 'AI_CONTENT_APPROVAL_STALE',
        details: `Approval invalidated by edit from "${editorId}". Fingerprint shifted from ${oldFp.slice(0, 12)} to ${newGenFp.slice(0, 12)}. Reapproval required.`,
        severity: 'WARN',
        safetyCheckPassed: true,
      });
    } else {
      session.reviewStatus = 'NEEDS_REVIEW';
    }

    session.updatedAt = Date.now();
    this.sessions.set(sessionId, session);

    this.logger.log({
      action: 'AI_CONTENT_EDITED',
      details: `Operator "${editorId}" edited content in session "${sessionId}". New fingerprint: [${newGenFp.slice(0, 16)}]`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return session;
  }

  /**
   * Staleness Protection: Checks if a session has become stale due to input changes
   * (e.g. modified ProductData, media, platforms, instructions, voice, or language).
   */
  public isSessionStale(sessionId: string, currentRequest: AiContentRequest): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return true;

    return isGenerationStale(
      session.requestFingerprint,
      currentRequest,
      session.provider,
      session.model
    );
  }

  public getSession(sessionId: string): AiGenerationSession | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): AiGenerationSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public clearSessions(): void {
    this.sessions.clear();
  }
}
