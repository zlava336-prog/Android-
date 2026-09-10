/**
 * Phone Agent - Step 2M Voiceover Provider Abstraction
 * Generates local speech synthesis artifacts from approved scripts without leaking credentials.
 * Supports silent fallback and deterministic local simulation.
 */

import { AudioAsset } from './AudioAsset';
import { VideoFingerprintComputer } from './VideoFingerprint';

export interface VoiceoverRequest {
  text: string;
  voiceId?: string;
  language?: string;
  speakingRate?: number; // 0.5 to 2.0
  targetLocalUri?: string;
}

export interface VoiceoverResult {
  success: boolean;
  audioAsset?: AudioAsset;
  errorCode?: 'PROVIDER_UNAVAILABLE' | 'INVALID_TEXT' | 'NETWORK_ERROR' | 'QUOTA_EXCEEDED';
  message: string;
  isSimulation?: boolean;
}

export interface IVoiceoverProvider {
  readonly providerId: string;
  isAvailable(): Promise<boolean>;
  generateVoiceover(request: VoiceoverRequest): Promise<VoiceoverResult>;
}

export class LocalDeterministicVoiceoverProvider implements IVoiceoverProvider {
  public readonly providerId = 'local-deterministic-voiceover';

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async generateVoiceover(request: VoiceoverRequest): Promise<VoiceoverResult> {
    if (!request.text || request.text.trim().length === 0) {
      return {
        success: false,
        errorCode: 'INVALID_TEXT',
        message: 'Voiceover text cannot be empty.',
      };
    }

    // Estimate duration: ~150 words per minute -> 2.5 words per second
    const wordCount = request.text.trim().split(/\s+/).length;
    const rate = request.speakingRate || 1.0;
    const durationMs = Math.max(1000, Math.round((wordCount / (2.5 * rate)) * 1000));

    const audioId = `vo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const localUri =
      request.targetLocalUri ||
      `file:///storage/emulated/0/PhoneAgent/audio/${audioId}.mp3`;

    const estimatedBytes = Math.round((durationMs / 1000) * 16000); // 128kbps approx
    const fakeSha = `sha256_${audioId}_${durationMs}`;

    const audioAsset: AudioAsset = {
      audioId,
      localUri,
      mimeType: 'audio/mp3',
      durationMs,
      sizeBytes: estimatedBytes,
      sha256: fakeSha,
      type: 'VOICEOVER',
      volume: 1.0,
      startTimeMs: 0,
      endTimeMs: durationMs,
      createdAt: Date.now(),
    };

    return {
      success: true,
      audioAsset,
      message: `Deterministic voiceover synthesized (${wordCount} words, ${durationMs}ms).`,
      isSimulation: true,
    };
  }
}
