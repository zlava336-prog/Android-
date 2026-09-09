/**
 * Phone Agent - Step 2J Platform Content Profile & Normalization Engine
 * Derives platform-specific publication constraints using AdapterRegistry as the single
 * source of truth. Sanitizes unsupported fields deterministically and applies platform overrides.
 * Strictly enforces that Amazon is NOT a publishing destination.
 */

import { SupportedPlatform, NormalizedContentPayload } from '../../types/job';
import { AdapterRegistry } from '../AdapterRegistry';
import { ContentPackage, PlatformContentOverride } from './ContentPackage';

export interface PlatformLimits {
  maxTextLength: number;
  maxTitleLength?: number;
  maxDescriptionLength?: number;
  maxHashtags?: number;
}

export interface PlatformProfile {
  platform: SupportedPlatform;
  displayName: string;
  supportsVideo: boolean;
  supportsImage: boolean;
  supportsTitle: boolean;
  supportsDescription: boolean;
  supportsHashtags: boolean;
  supportsCover: boolean;
  requiresApproval: boolean;
  limits: PlatformLimits;
  requiredFields: string[];
  unsupportedFields: string[];
}

export const PLATFORM_LIMITS_MAP: Record<SupportedPlatform, PlatformLimits> = {
  instagram: {
    maxTextLength: 2200,
    maxHashtags: 30,
  },
  youtube: {
    maxTextLength: 5000,
    maxTitleLength: 100,
    maxDescriptionLength: 5000,
    maxHashtags: 15,
  },
  facebook: {
    maxTextLength: 5000,
    maxHashtags: 30,
  },
  tiktok: {
    maxTextLength: 2200,
    maxHashtags: 20,
  },
  pinterest: {
    maxTextLength: 500,
    maxTitleLength: 100,
    maxDescriptionLength: 500,
    maxHashtags: 20,
  },
  x: {
    maxTextLength: 280,
    maxHashtags: 10,
  },
  threads: {
    maxTextLength: 500,
    maxHashtags: 10,
  },
  linkedin: {
    maxTextLength: 3000,
    maxTitleLength: 120,
    maxDescriptionLength: 3000,
    maxHashtags: 15,
  },
  amazon: {
    maxTextLength: 0, // Not a publishing destination
  },
};

export class PlatformContentProfileCalculator {
  private registry: AdapterRegistry;

  constructor(registry?: AdapterRegistry) {
    this.registry = registry || AdapterRegistry.getInstance();
  }

  /**
   * Retrieves the comprehensive PlatformProfile for a given platform.
   * Derives capabilities directly from AdapterRegistry.
   */
  public getProfile(platform: SupportedPlatform): PlatformProfile {
    if (platform === 'amazon') {
      return {
        platform: 'amazon',
        displayName: 'Amazon Product Link Source',
        supportsVideo: false,
        supportsImage: false,
        supportsTitle: false,
        supportsDescription: false,
        supportsHashtags: false,
        supportsCover: false,
        requiresApproval: true,
        limits: PLATFORM_LIMITS_MAP.amazon,
        requiredFields: ['productUrl'],
        unsupportedFields: ['publish', 'post', 'checkout', 'purchase', 'addToCart'],
      };
    }

    const adapter = this.registry.get(platform);
    const caps = adapter.capabilities || {
      supportsVideo: true,
      supportsImage: true,
      supportsTitle: false,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false,
      requiresApproval: true,
    };

    const limits = PLATFORM_LIMITS_MAP[platform] || { maxTextLength: 2000 };

    const requiredFields: string[] = [];
    if (platform === 'youtube') {
      requiredFields.push('title', 'video');
    } else if (platform === 'pinterest') {
      requiredFields.push('title', 'media');
    } else if (platform === 'tiktok') {
      requiredFields.push('video');
    }

    const unsupportedFields: string[] = [];
    if (!caps.supportsTitle) unsupportedFields.push('title');
    if (!caps.supportsDescription) unsupportedFields.push('description');
    if (!caps.supportsHashtags) unsupportedFields.push('hashtags');
    if (!caps.supportsCover) unsupportedFields.push('coverUri');
    if (!caps.supportsImage) unsupportedFields.push('image');
    if (!caps.supportsVideo) unsupportedFields.push('video');

    return {
      platform,
      displayName: adapter.displayName,
      supportsVideo: caps.supportsVideo,
      supportsImage: caps.supportsImage,
      supportsTitle: caps.supportsTitle,
      supportsDescription: caps.supportsDescription,
      supportsHashtags: caps.supportsHashtags,
      supportsCover: caps.supportsCover,
      requiresApproval: caps.requiresApproval ?? true,
      limits,
      requiredFields,
      unsupportedFields,
    };
  }

  /**
   * Projects and normalizes a ContentPackage into a platform-ready NormalizedContentPayload.
   * - Applies platform override if defined
   * - Strips unsupported fields deterministically
   * - Formats text with hashtags according to platform limits
   * - Strictly rejects Amazon
   */
  public projectForPlatform(
    pkg: ContentPackage,
    platform: SupportedPlatform
  ): {
    payload: NormalizedContentPayload;
    warnings: string[];
    unsupportedOmissions: string[];
  } {
    if (platform === 'amazon') {
      throw new Error(
        '[Security Invariant Violation] Amazon is NOT a publishing destination. Only product link extraction is supported.'
      );
    }

    const profile = this.getProfile(platform);
    const override: PlatformContentOverride | undefined = pkg.platformOverrides[platform];
    const warnings: string[] = [];
    const unsupportedOmissions: string[] = [];

    // Base vs Override selection
    const rawCaption = override?.caption !== undefined ? override.caption : pkg.baseCaption || '';
    const rawTitle = override?.title !== undefined ? override.title : pkg.title || '';
    const rawDesc = override?.description !== undefined ? override.description : pkg.description || '';
    const rawHashtags = override?.hashtags !== undefined ? override.hashtags : pkg.hashtags || [];
    const rawCta = override?.callToAction !== undefined ? override.callToAction : pkg.callToAction || '';

    // Determine media URIs
    let mediaUri: string | undefined;
    let imageUri: string | undefined;
    let videoUri: string | undefined;

    if (override?.mediaAssetId) {
      const asset = pkg.mediaAssets.find(a => a.assetId === override.mediaAssetId);
      if (asset) {
        mediaUri = asset.localUri;
        if (asset.mediaType === 'VIDEO') videoUri = asset.localUri;
        if (asset.mediaType === 'IMAGE') imageUri = asset.localUri;
      }
    } else if (pkg.mediaAssets.length > 0) {
      const primary = pkg.mediaAssets[0];
      mediaUri = primary.localUri;
      if (primary.mediaType === 'VIDEO') videoUri = primary.localUri;
      if (primary.mediaType === 'IMAGE') imageUri = primary.localUri;
    }

    // Media support validation
    if (videoUri && !profile.supportsVideo) {
      unsupportedOmissions.push('video');
      warnings.push(`${profile.displayName} does not support video publishing.`);
    }
    if (imageUri && !videoUri && !profile.supportsImage) {
      unsupportedOmissions.push('image');
      warnings.push(`${profile.displayName} does not support image publishing.`);
    }

    // Compose primary text body
    let bodyText = rawCaption || rawDesc;
    if (rawCta && !bodyText.includes(rawCta)) {
      bodyText = bodyText ? `${bodyText}\n\n${rawCta}` : rawCta;
    }

    // Hashtags projection
    let projectedHashtags: string[] | undefined = undefined;
    if (profile.supportsHashtags && rawHashtags.length > 0) {
      const limit = profile.limits.maxHashtags || rawHashtags.length;
      projectedHashtags = rawHashtags.slice(0, limit);

      // On platforms where hashtags are embedded in the text (e.g. X, Threads),
      // append hashtags if not already present
      if (['x', 'threads', 'tiktok', 'linkedin', 'facebook'].includes(platform)) {
        const missingTags = projectedHashtags.filter(
          tag => !bodyText.toLowerCase().includes(tag.toLowerCase())
        );
        if (missingTags.length > 0) {
          const tagString = missingTags.join(' ');
          bodyText = bodyText ? `${bodyText}\n\n${tagString}` : tagString;
        }
      }
    } else if (rawHashtags.length > 0 && !profile.supportsHashtags) {
      unsupportedOmissions.push('hashtags');
    }

    // Title projection
    let projectedTitle: string | undefined = undefined;
    if (profile.supportsTitle && rawTitle) {
      const titleLimit = profile.limits.maxTitleLength || 100;
      projectedTitle = rawTitle.slice(0, titleLimit);
    } else if (rawTitle && !profile.supportsTitle) {
      unsupportedOmissions.push('title');
      // If platform has no title, fold title into description/body if body is empty
      if (!bodyText) {
        bodyText = rawTitle;
      }
    }

    // Description projection
    let projectedDesc: string | undefined = undefined;
    if (profile.supportsDescription) {
      projectedDesc = rawDesc || bodyText;
      if (profile.limits.maxDescriptionLength) {
        projectedDesc = projectedDesc.slice(0, profile.limits.maxDescriptionLength);
      }
    } else if (rawDesc && !profile.supportsDescription) {
      unsupportedOmissions.push('description');
    }

    // Cover URI projection
    let projectedCover: string | undefined = undefined;
    const coverUri = override?.coverUri;
    if (profile.supportsCover && coverUri) {
      projectedCover = coverUri;
    } else if (coverUri && !profile.supportsCover) {
      unsupportedOmissions.push('coverUri');
    }

    // Length check against platform character limits
    if (bodyText.length > profile.limits.maxTextLength) {
      warnings.push(
        `Text length (${bodyText.length}) exceeds ${profile.displayName} character limit (${profile.limits.maxTextLength}).`
      );
    }

    const payload: NormalizedContentPayload = {
      text: bodyText,
      title: projectedTitle,
      description: projectedDesc,
      hashtags: projectedHashtags,
      mediaUri,
      imageUri,
      videoUri,
      coverUri: projectedCover,
      metadata: {
        platform,
        sourceType: pkg.sourceType,
        sourceReference: pkg.sourceReference,
        hasOverride: Boolean(override),
        contentId: pkg.contentId,
      },
    };

    return {
      payload,
      warnings,
      unsupportedOmissions,
    };
  }
}
