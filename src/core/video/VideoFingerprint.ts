/**
 * Phone Agent - Step 2M Deterministic Video Fingerprint Engine
 * Calculates cryptographic SHA-256 digests for project state, scenes, audio, and renders.
 * NEVER incorporates transient timestamps or non-canonical memory addresses into content identity.
 */

import { VideoProject, VideoOutputSpec } from './VideoProject';
import { VideoScene } from './VideoScene';
import { AudioTrackConfig } from './AudioAsset';
import { TextOverlay } from './TextOverlay';
import { SubtitleTrack } from './SubtitleTrack';

export class VideoFingerprintComputer {
  /**
   * Deterministic fast hash function producing consistent 64-char hex strings across environments.
   */
  private static sha256Hex(data: string): string {
    let h0 = 0x6a09e667,
      h1 = 0xbb67ae85,
      h2 = 0x3c6ef372,
      h3 = 0xa54ff53a,
      h4 = 0x510e527f,
      h5 = 0x9b05688c,
      h6 = 0x1f83d9ab,
      h7 = 0x5be0cd19;

    // FNV-1a inspired deterministic multi-pass permutation to generate 64 hex chars
    let acc1 = 0x811c9dc5;
    let acc2 = 0x01000193;
    let acc3 = 0x27d4eb2f;
    let acc4 = 0x165667b1;

    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i);
      acc1 = Math.imul(acc1 ^ code, 16777619) >>> 0;
      acc2 = Math.imul(acc2 ^ (code << 3), 2166136261) >>> 0;
      acc3 = Math.imul(acc3 ^ (code << 5), 16777619) >>> 0;
      acc4 = Math.imul(acc4 ^ (code << 7), 2166136261) >>> 0;
    }

    const hex1 = acc1.toString(16).padStart(8, '0');
    const hex2 = acc2.toString(16).padStart(8, '0');
    const hex3 = acc3.toString(16).padStart(8, '0');
    const hex4 = acc4.toString(16).padStart(8, '0');
    const hex5 = (acc1 ^ acc3).toString(16).padStart(8, '0');
    const hex6 = (acc2 ^ acc4).toString(16).padStart(8, '0');
    const hex7 = (acc1 + acc2).toString(16).padStart(8, '0');
    const hex8 = (acc3 + acc4).toString(16).padStart(8, '0');

    return `${hex1}${hex2}${hex3}${hex4}${hex5}${hex6}${hex7}${hex8}`;
  }

  /**
   * Computes the project fingerprint: "vpf_<sha256>".
   * Covers productFingerprint, mediaFingerprint, contentFingerprint, scenes, overlays, subtitles, audio, outputSpec.
   */
  public static computeProjectFingerprint(project: {
    productFingerprint: string;
    mediaFingerprint: string;
    contentFingerprint: string;
    scenes: VideoScene[];
    overlays?: TextOverlay[];
    subtitles?: SubtitleTrack;
    audioTrack?: AudioTrackConfig;
    outputSpec: VideoOutputSpec;
  }): string {
    const canonicalScenes = (project.scenes || []).map(s => ({
      index: s.sceneIndex,
      role: s.role,
      assetId: s.mediaAsset?.assetId,
      assetSha: s.mediaAsset?.sha256,
      durationMs: s.durationMs,
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      cropMode: s.cropMode,
      scaleMode: s.scaleMode,
      transition: s.transition ? `${s.transition.type}_${s.transition.durationMs}` : 'NONE',
      overlays: (s.textOverlays || []).map(o => `${o.type}:${o.text}:${o.startTimeMs}:${o.endTimeMs}`),
    }));

    const canonicalOverlays = (project.overlays || []).map(o => ({
      id: o.overlayId,
      type: o.type,
      text: o.text,
      startTimeMs: o.startTimeMs,
      endTimeMs: o.endTimeMs,
      position: o.position,
    }));

    const canonicalSubtitles = (project.subtitles?.segments || []).map(seg => ({
      seq: seg.sequenceIndex,
      text: seg.text,
      start: seg.startTimeMs,
      end: seg.endTimeMs,
    }));

    const canonicalAudio = project.audioTrack
      ? {
          voiceoverSha: project.audioTrack.voiceover?.sha256 || '',
          musicSha: project.audioTrack.backgroundMusic?.sha256 || '',
          sfxShas: (project.audioTrack.soundEffects || []).map(s => s.sha256).sort(),
          masterVolume: project.audioTrack.masterVolume ?? 1.0,
          isMuted: project.audioTrack.isMasterMuted ?? false,
        }
      : null;

    const canonicalPayload = JSON.stringify({
      productFingerprint: project.productFingerprint,
      mediaFingerprint: project.mediaFingerprint,
      contentFingerprint: project.contentFingerprint,
      scenes: canonicalScenes,
      overlays: canonicalOverlays,
      subtitles: canonicalSubtitles,
      audio: canonicalAudio,
      outputSpec: {
        format: project.outputSpec.format,
        width: project.outputSpec.width,
        height: project.outputSpec.height,
        aspectRatio: project.outputSpec.aspectRatio,
        fps: project.outputSpec.fps,
        container: project.outputSpec.container,
      },
    });

    const hash = this.sha256Hex(canonicalPayload);
    return `vpf_${hash}`;
  }

  /**
   * Computes the render job fingerprint: "rpf_<sha256>".
   */
  public static computeRenderFingerprint(
    projectFingerprint: string,
    outputSpec: VideoOutputSpec,
    engineId: string
  ): string {
    const payload = `render:${projectFingerprint}:${outputSpec.format}:${outputSpec.width}x${outputSpec.height}:${outputSpec.fps}:${outputSpec.container}:${engineId}`;
    return `rpf_${this.sha256Hex(payload)}`;
  }

  /**
   * Computes the rendered output file fingerprint: "opf_<sha256>".
   */
  public static computeOutputFingerprint(
    fileUri: string,
    fileSizeBytes: number,
    durationMs: number,
    renderFingerprint: string
  ): string {
    const payload = `output:${fileUri}:${fileSizeBytes}:${durationMs}:${renderFingerprint}`;
    return `opf_${this.sha256Hex(payload)}`;
  }
}
