/**
 * Phone Agent - Step 2L Canonical Content Model
 * Represents the single canonical source of truth for AI generated content
 * prior to platform-specific projection and human review.
 */

export interface CanonicalContent {
  canonicalId: string;
  hook: string;
  title: string;
  baseCaption: string;
  description: string;
  callToAction: string;
  hashtags: string[];
  shortScript?: string;
  productHighlights?: string[];
  productFingerprint: string;
  generationFingerprint: string;
  createdAt: number;
}

export interface AssembleCaptionParams {
  hook?: string;
  productContext?: string;
  verifiedFeatures?: string[];
  useCase?: string;
  callToAction?: string;
  hashtags?: string[];
}

/**
 * Builds deterministic caption following the required structure:
 * HOOK
 * 
 * PRODUCT CONTEXT
 * 
 * VERIFIED BENEFITS / FEATURES
 * 
 * USE CASE
 * 
 * CTA
 * 
 * HASHTAGS
 */
export function buildDeterministicCaption(params: AssembleCaptionParams): string {
  const sections: string[] = [];

  if (params.hook && params.hook.trim()) {
    sections.push(params.hook.trim());
  }

  if (params.productContext && params.productContext.trim()) {
    sections.push(params.productContext.trim());
  }

  if (params.verifiedFeatures && params.verifiedFeatures.length > 0) {
    const featuresList = params.verifiedFeatures
      .slice(0, 4)
      .map(f => `• ${f.trim()}`)
      .join('\n');
    sections.push(featuresList);
  }

  if (params.useCase && params.useCase.trim()) {
    sections.push(params.useCase.trim());
  }

  if (params.callToAction && params.callToAction.trim()) {
    sections.push(params.callToAction.trim());
  }

  if (params.hashtags && params.hashtags.length > 0) {
    const tagsString = params.hashtags
      .map(t => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
    sections.push(tagsString);
  }

  return sections.join('\n\n').trim();
}
