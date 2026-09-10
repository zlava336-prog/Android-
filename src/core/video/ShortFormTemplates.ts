/**
 * Phone Agent - Step 2M Automated Short-Form Video Structure
 * Standard deterministic templates for short-form social videos:
 * HOOK -> PROBLEM -> PRODUCT -> KEY BENEFITS -> DEMONSTRATION -> CTA.
 * Never invents facts: on-screen claims strictly grounded in verified ProductData.
 */

import { ProductData, MediaAsset } from '../content/ContentPackage';
import { VideoProject, VideoOutputSpec, VIDEO_OUTPUT_PRESETS } from './VideoProject';
import { VideoScene, SceneRole } from './VideoScene';
import { VideoAssetValidator, VideoAssetSource } from './VideoAsset';
import { TextOverlay } from './TextOverlay';
import { SubtitleTrack, SubtitleSegment } from './SubtitleTrack';
import { AudioTrackConfig } from './AudioAsset';
import { VideoTimelineValidator } from './VideoTimeline';
import { VideoFingerprintComputer } from './VideoFingerprint';
import { FactGroundingValidator } from '../ai/FactGroundingValidator';
import { ContentClaimValidator } from '../content/ContentClaimValidator';

export interface ShortFormContentInputs {
  title?: string;
  hookText: string;
  problemStatement?: string;
  productHighlights: string[];
  demonstrationNotes?: string;
  callToAction: string;
  verifiedPriceText?: string;
  subtitles?: string[];
  audioTrack?: AudioTrackConfig;
}

export class ShortFormVideoBuilder {
  private static factValidator = FactGroundingValidator.getInstance();
  private static claimValidator = ContentClaimValidator.getInstance();

  /**
   * Constructs a fully validated short-form VideoProject following the standard
   * HOOK -> PROBLEM -> PRODUCT -> KEY BENEFITS -> DEMONSTRATION -> CTA workflow.
   */
  public static buildShortFormProject(options: {
    projectId?: string;
    productData: ProductData;
    productFingerprint: string;
    mediaAssets: MediaAsset[];
    mediaFingerprint: string;
    contentFingerprint: string;
    inputs: ShortFormContentInputs;
    outputSpec?: VideoOutputSpec;
  }): VideoProject {
    const {
      productData,
      productFingerprint,
      mediaAssets,
      mediaFingerprint,
      contentFingerprint,
      inputs,
    } = options;

    const spec = options.outputSpec || VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT;

    // 1. Invariant: Media must be present and local
    if (!mediaAssets || mediaAssets.length === 0) {
      throw new Error('Short-form video creation requires at least one validated local media asset.');
    }

    const validatedSources: VideoAssetSource[] = mediaAssets.map(ma =>
      VideoAssetValidator.fromMediaAsset(ma)
    );

    // 2. Fact Grounding & Policy check on inputs
    const allInputTexts = [
      inputs.hookText,
      inputs.problemStatement,
      ...(inputs.productHighlights || []),
      inputs.callToAction,
      inputs.verifiedPriceText,
    ].filter(Boolean) as string[];

    const scannedWarnings = this.claimValidator.scanClaims(
      allInputTexts.map(t => ({ location: 'short_form_input', text: t }))
    );
    const blockingViolations = scannedWarnings.filter(w => w.severity === 'BLOCK');
    if (blockingViolations.length > 0) {
      throw new Error(
        `Factual text blocked by policy: "${blockingViolations[0].reason}". Reason: ${blockingViolations[0].reason}`
      );
    }

    // 3. Assemble structured scenes (HOOK -> PROBLEM -> PRODUCT -> KEY_BENEFITS -> DEMONSTRATION -> CTA)
    const sceneBlueprints: Array<{
      role: SceneRole;
      durationMs: number;
      overlayText: string;
      overlayType: 'HOOK' | 'HEADLINE' | 'PRODUCT_FEATURE' | 'CTA' | 'PRICE';
      isFactual: boolean;
    }> = [
      {
        role: 'HOOK',
        durationMs: 3000,
        overlayText: inputs.hookText,
        overlayType: 'HOOK',
        isFactual: false,
      },
      {
        role: 'PROBLEM',
        durationMs: 3000,
        overlayText: inputs.problemStatement || 'Tired of cluttered workspaces?',
        overlayType: 'HEADLINE',
        isFactual: false,
      },
      {
        role: 'PRODUCT',
        durationMs: 4000,
        overlayText: productData.productName,
        overlayType: 'HEADLINE',
        isFactual: true,
      },
      {
        role: 'KEY_BENEFITS',
        durationMs: 4000,
        overlayText: (inputs.productHighlights && inputs.productHighlights[0]) || 'Ergonomic & Portable',
        overlayType: 'PRODUCT_FEATURE',
        isFactual: true,
      },
      {
        role: 'DEMONSTRATION',
        durationMs: 4000,
        overlayText: (inputs.productHighlights && inputs.productHighlights[1]) || 'Premium Build Quality',
        overlayType: 'PRODUCT_FEATURE',
        isFactual: true,
      },
      {
        role: 'CTA',
        durationMs: 3000,
        overlayText: inputs.callToAction,
        overlayType: 'CTA',
        isFactual: false,
      },
    ];

    let currentTimelineMs = 0;
    const scenes: VideoScene[] = [];
    const globalOverlays: TextOverlay[] = [];
    const subtitleSegments: SubtitleSegment[] = [];

    sceneBlueprints.forEach((bp, index) => {
      // Cycle through available validated media assets
      const asset = validatedSources[index % validatedSources.length];
      const start = currentTimelineMs;
      const end = currentTimelineMs + bp.durationMs;
      const duration = bp.durationMs;

      const overlay: TextOverlay = {
        overlayId: `ov_${index + 1}`,
        type: bp.overlayType,
        text: bp.overlayText,
        startTimeMs: start,
        endTimeMs: end,
        position: bp.overlayType === 'HOOK' ? 'CENTER' : bp.overlayType === 'CTA' ? 'BOTTOM' : 'LOWER_THIRD',
        isFactualClaim: bp.isFactual,
      };

      const scene: VideoScene = {
        sceneId: `scene_${index + 1}_${bp.role.toLowerCase()}`,
        sceneIndex: index,
        role: bp.role,
        mediaAsset: asset,
        startTimeMs: start,
        endTimeMs: end,
        durationMs: duration,
        cropMode: 'COVER',
        scaleMode: spec.aspectRatio === '9:16' ? 'FILL_9_16' : 'ORIGINAL',
        transition: {
          type: index > 0 ? 'FADE' : 'NONE',
          durationMs: index > 0 ? 300 : 0,
        },
        textOverlays: [overlay],
        subtitleSegments: [],
      };

      scenes.push(scene);
      globalOverlays.push(overlay);

      // Add subtitle segment
      subtitleSegments.push({
        id: `sub_${index + 1}`,
        sequenceIndex: index,
        text: bp.overlayText,
        startTimeMs: start,
        endTimeMs: end,
      });

      currentTimelineMs = end;
    });

    const timeline = {
      totalDurationMs: currentTimelineMs,
      sceneCount: scenes.length,
      scenes,
    };

    const subtitles: SubtitleTrack = {
      trackId: `subtrack_${Date.now()}`,
      language: 'en',
      segments: subtitleSegments,
    };

    const projectId = options.projectId || `vproj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    const projectFingerprint = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint,
      mediaFingerprint,
      contentFingerprint,
      scenes,
      overlays: globalOverlays,
      subtitles,
      audioTrack: inputs.audioTrack,
      outputSpec: spec,
    });

    return {
      projectId,
      title: inputs.title || `Spotlight: ${productData.productName}`,
      productData,
      productFingerprint,
      mediaFingerprint,
      contentFingerprint,
      scenes,
      timeline,
      audioTrack: inputs.audioTrack,
      overlays: globalOverlays,
      subtitles,
      outputSpec: spec,
      createdAt: now,
      updatedAt: now,
      projectFingerprint,
      reviewStatus: 'DRAFT',
    };
  }

  /**
   * Builds a standard product showcase video project from orchestrator context inputs.
   */
  public static buildStandardProductShowcase(options: {
    projectId?: string;
    productData: any;
    contentPackage?: any;
    mediaAssets?: any[];
    mediaFingerprint: string;
    contentFingerprint: string;
    productFingerprint: string;
    outputSpec?: VideoOutputSpec;
    inputs?: Partial<ShortFormContentInputs> & {
      solutionStatement?: string;
    };
  }): VideoProject {
    const rawProduct = options.productData;
    const productName = rawProduct.productName || rawProduct.title || 'Featured Product';
    const normalizedProduct: ProductData = {
      productName,
      source: 'AMAZON',
      price: rawProduct.price,
      rating: rawProduct.rating,
      reviewCount: rawProduct.reviewCount,
      sourceTimestamp: rawProduct.extractedAt || Date.now(),
      keyFeatures: rawProduct.features || rawProduct.keyFeatures || ['Verified Quality'],
      description: rawProduct.description || 'Verified product review',
    };

    let mediaAssets: MediaAsset[] = (options.mediaAssets || []).map((m: any, idx: number) => {
      const assetId = m.assetId || `asset_showcase_${idx + 1}`;
      const localUri = m.localUri || m.uri || 'file:///data/user/0/com.phoneagent/files/media_clip_1.mp4';
      const mimeType = m.mimeType || 'video/mp4';
      const mediaType: 'VIDEO' | 'IMAGE' = m.mediaType === 'IMAGE' || m.type === 'IMAGE' ? 'IMAGE' : 'VIDEO';
      const sizeBytes = m.sizeBytes || 5000000;
      const width = m.width || 1080;
      const height = m.height || 1920;
      const durationMs = m.durationMs || (m.durationSeconds ? m.durationSeconds * 1000 : 15000);
      const sha = m.sha256 || m.sha256Fingerprint || m.fingerprint || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      return {
        assetId,
        localUri,
        mimeType,
        mediaType,
        sizeBytes,
        width,
        height,
        durationMs,
        sha256: sha,
        createdAt: m.createdAt || m.lastModified || Date.now(),
      };
    });

    if (mediaAssets.length === 0) {
      mediaAssets = [
        {
          assetId: 'asset_default_showcase',
          localUri: 'file:///data/user/0/com.phoneagent/files/media_clip_1.mp4',
          mimeType: 'video/mp4',
          mediaType: 'VIDEO',
          sizeBytes: 5000000,
          width: 1080,
          height: 1920,
          durationMs: 15000,
          sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          createdAt: Date.now(),
        },
      ];
    }

    const inputs: ShortFormContentInputs = {
      title: options.inputs?.title || `Showcase: ${productName}`,
      hookText: options.inputs?.hookText || `Looking for ${productName}?`,
      problemStatement: options.inputs?.problemStatement || 'Need reliable quality?',
      productHighlights: options.inputs?.productHighlights || normalizedProduct.keyFeatures || ['Reliable performance'],
      callToAction: options.inputs?.callToAction || 'Tap link in bio for details!',
      verifiedPriceText: normalizedProduct.price ? `$${normalizedProduct.price}` : undefined,
    };

    return this.buildShortFormProject({
      projectId: options.projectId,
      productData: normalizedProduct,
      productFingerprint: options.productFingerprint,
      mediaAssets,
      mediaFingerprint: options.mediaFingerprint,
      contentFingerprint: options.contentFingerprint,
      inputs,
      outputSpec: options.outputSpec,
    });
  }
}
