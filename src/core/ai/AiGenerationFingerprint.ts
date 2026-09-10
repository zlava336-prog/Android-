/**
 * Phone Agent - Step 2L AI Generation Cryptographic Fingerprinting
 * Deterministic SHA-256 fingerprinting for AI content generation requests,
 * generated outputs, creative variants, and staleness detection.
 */

import { sha256 } from '../content/ContentFingerprint';
export { sha256 };
import { AiContentRequest } from './AiContentRequest';
import { CanonicalContent } from './CanonicalContent';

/**
 * Computes deterministic request fingerprint: gfp_<sha256>
 * Encodes all inputs: product fingerprint, media fingerprints, objective,
 * target audience, brand voice, language, platforms, requested content types,
 * user instructions, constraints, and provider/model config.
 */
export function computeAiRequestFingerprint(
  request: AiContentRequest,
  provider: string,
  model: string
): string {
  const canonicalParts = [
    `prod_fp:${request.productFingerprint || ''}`,
    `prod_title:${request.productData?.title || ''}`,
    `prod_price:${request.productData?.price ?? ''}`,
    `media_fps:${[...(request.mediaFingerprints || [])].sort().join(',')}`,
    `objective:${request.contentObjective}`,
    `audience:${request.targetAudience.trim().toLowerCase()}`,
    `voice:${request.brandVoice}`,
    `lang:${request.language.trim().toLowerCase()}`,
    `platforms:${[...request.platforms].sort().join(',')}`,
    `types:${[...request.requestedContentTypes].sort().join(',')}`,
    `instructions:${(request.userProvidedInstructions || '').trim()}`,
    `constraints:${JSON.stringify(request.generationConstraints || {})}`,
    `provider:${provider.trim().toLowerCase()}`,
    `model:${model.trim().toLowerCase()}`,
  ];

  const canonicalString = canonicalParts.join('|');
  return `gfp_${sha256(canonicalString)}`;
}

/**
 * Computes deterministic output fingerprint: gout_<sha256>
 * Encodes generated canonical text fields: hook, title, caption, description,
 * CTA, and hashtags.
 */
export function computeAiOutputFingerprint(content: Partial<CanonicalContent>): string {
  const canonicalParts = [
    `hook:${(content.hook || '').trim()}`,
    `title:${(content.title || '').trim()}`,
    `caption:${(content.baseCaption || '').trim()}`,
    `desc:${(content.description || '').trim()}`,
    `cta:${(content.callToAction || '').trim()}`,
    `tags:${(content.hashtags || []).map(t => t.trim().toLowerCase()).sort().join(',')}`,
  ];

  const canonicalString = canonicalParts.join('|');
  return `gout_${sha256(canonicalString)}`;
}

/**
 * Computes deterministic variant fingerprint: varfp_<sha256>
 */
export function computeVariantFingerprint(
  style: string,
  outputFingerprint: string,
  requestFingerprint: string
): string {
  const canonicalString = `var:${style.trim().toLowerCase()}|out:${outputFingerprint}|req:${requestFingerprint}`;
  return `varfp_${sha256(canonicalString)}`;
}

/**
 * Determines whether existing generated content is stale relative to current inputs.
 */
export function isGenerationStale(
  originalRequestFingerprint: string,
  currentRequest: AiContentRequest,
  provider: string,
  model: string
): boolean {
  const currentFp = computeAiRequestFingerprint(currentRequest, provider, model);
  return originalRequestFingerprint !== currentFp;
}

/**
 * Determines whether human edits have invalidated previous approval.
 */
export function isApprovalStaleAfterEdit(
  approvedContentFingerprint: string,
  currentContentFingerprint: string
): boolean {
  return approvedContentFingerprint !== currentContentFingerprint;
}
