/**
 * Phone Agent - Step 2M Local Audio Asset Abstraction
 * Enforces strictly local-only audio, volume boundaries, and audio track configuration.
 * Zero remote music/audio downloads.
 */

import { VideoAssetValidator } from './VideoAsset';

export type AudioAssetType = 'VOICEOVER' | 'BACKGROUND_MUSIC' | 'SOUND_EFFECT';

export interface AudioAsset {
  audioId: string;
  localUri: string;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  sha256: string;
  type: AudioAssetType;
  volume: number; // 0.0 to 1.0
  startTimeMs: number;
  endTimeMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  isMuted?: boolean;
  createdAt: number;
}

export interface AudioTrackConfig {
  voiceover?: AudioAsset;
  backgroundMusic?: AudioAsset;
  soundEffects?: AudioAsset[];
  masterVolume?: number; // 0.0 to 1.0
  isMasterMuted?: boolean;
}

export const SUPPORTED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
]);

export class AudioAssetValidator {
  public static validateAsset(audio: AudioAsset): {
    valid: boolean;
    errors: string[];
  } {
    return this.validateAudioAsset(audio);
  }

  public static validateAudioAsset(audio: AudioAsset): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!audio) {
      return { valid: false, errors: ['Audio asset is null or undefined.'] };
    }

    if (!audio.audioId || audio.audioId.trim().length === 0) {
      errors.push('Audio ID is required.');
    }

    // Local URI check
    const uriCheck = VideoAssetValidator.validateLocalUri(audio.localUri);
    if (!uriCheck.valid && uriCheck.error) {
      errors.push(`Audio URI error: ${uriCheck.error}`);
    }

    const mime = (audio.mimeType || '').toLowerCase().trim();
    if (!SUPPORTED_AUDIO_MIMES.has(mime)) {
      errors.push(
        `Unsupported audio MIME type: "${mime}". Supported types: ${Array.from(SUPPORTED_AUDIO_MIMES).join(', ')}.`
      );
    }

    if (typeof audio.durationMs !== 'number' || audio.durationMs <= 0) {
      errors.push(`Audio durationMs must be greater than 0, got: ${audio.durationMs}.`);
    }

    if (typeof audio.sizeBytes !== 'number' || audio.sizeBytes <= 0) {
      errors.push(`Audio sizeBytes must be greater than 0, got: ${audio.sizeBytes}.`);
    }

    if (!audio.sha256 || audio.sha256.trim().length === 0) {
      errors.push('Cryptographic SHA-256 fingerprint is required for audio asset.');
    }

    if (typeof audio.volume !== 'number' || audio.volume < 0 || audio.volume > 1) {
      errors.push(`Audio volume must be between 0.0 and 1.0, got: ${audio.volume}.`);
    }

    if (typeof audio.startTimeMs !== 'number' || audio.startTimeMs < 0) {
      errors.push(`Audio startTimeMs must be non-negative, got: ${audio.startTimeMs}.`);
    }

    if (typeof audio.endTimeMs !== 'number' || audio.endTimeMs <= audio.startTimeMs) {
      errors.push(`Audio endTimeMs (${audio.endTimeMs}) must be greater than startTimeMs (${audio.startTimeMs}).`);
    }

    if (audio.fadeInMs !== undefined && (audio.fadeInMs < 0 || isNaN(audio.fadeInMs))) {
      errors.push(`Audio fadeInMs must be non-negative, got: ${audio.fadeInMs}.`);
    }

    if (audio.fadeOutMs !== undefined && (audio.fadeOutMs < 0 || isNaN(audio.fadeOutMs))) {
      errors.push(`Audio fadeOutMs must be non-negative, got: ${audio.fadeOutMs}.`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public static validateAudioTrackConfig(config?: AudioTrackConfig | null): {
    valid: boolean;
    errors: string[];
  } {
    if (!config) {
      // Audio is optional - project can be valid with zero audio
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    if (config.masterVolume !== undefined) {
      if (typeof config.masterVolume !== 'number' || config.masterVolume < 0 || config.masterVolume > 1) {
        errors.push(`Master volume must be between 0.0 and 1.0, got: ${config.masterVolume}.`);
      }
    }

    if (config.voiceover) {
      const vCheck = this.validateAudioAsset(config.voiceover);
      if (!vCheck.valid) {
        errors.push(...vCheck.errors.map(e => `[Voiceover] ${e}`));
      }
    }

    if (config.backgroundMusic) {
      const mCheck = this.validateAudioAsset(config.backgroundMusic);
      if (!mCheck.valid) {
        errors.push(...mCheck.errors.map(e => `[BackgroundMusic] ${e}`));
      }
    }

    if (config.soundEffects && Array.isArray(config.soundEffects)) {
      config.soundEffects.forEach((sfx, idx) => {
        const sfxCheck = this.validateAudioAsset(sfx);
        if (!sfxCheck.valid) {
          errors.push(...sfxCheck.errors.map(e => `[SFX #${idx}] ${e}`));
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
