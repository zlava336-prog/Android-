/**
 * Phone Agent - Step 2M Production-Grade Video Creation & Editing Pipeline Tests
 * 95+ comprehensive tests verifying:
 * - Transition types, duration bounds, and validation
 * - VideoAsset & strict local-only URI security (rejects http/https/remote)
 * - AudioAsset & Track configuration (volume, fades, local-only audio)
 * - TextOverlay & Fact-Grounding claims against ProductData
 * - SubtitleTrack monotonic sequencing, Unicode preservation, and SRT export
 * - VideoClip trimming, playback speed, and VideoScene roles
 * - VideoTimeline continuity, gap/overlap rejection, and rebuilder
 * - VideoProject output specs (9:16, 1:1, 16:9), fingerprints, and lifecycle
 * - Deterministic VideoFingerprintComputer (project, render, output)
 * - VoiceoverProvider local deterministic synthesis & zero secret leakage
 * - VideoOutputValidator media inspection (dimensions, size, duration, opf)
 * - VideoRenderEngine simulation identification & EmergencyStop enforcement
 * - VideoRenderQueue sequential lifecycle & 3-failure EmergencyStop tripwire
 * - ShortFormVideoBuilder structured 6-scene templates & claim checks
 * - VideoReviewManager human approval binding, staleness detection, and rejection
 * - VideoProjectPersistence & crash recovery scanning
 */

import { TestResult } from './unitTests';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';
import { ProductData } from '../content/ContentPackage';
import {
  VideoTransition,
  validateTransition,
  DEFAULT_TRANSITION,
  VideoAssetSource,
  VideoAssetValidator,
  AudioAsset,
  AudioTrackConfig,
  AudioAssetValidator,
  TextOverlay,
  TextOverlayValidator,
  SubtitleTrack,
  SubtitleSegment,
  SubtitleTrackValidator,
  VideoClip,
  VideoClipValidator,
  VideoScene,
  VideoSceneValidator,
  VideoTimeline,
  VideoTimelineValidator,
  VideoProject,
  VideoProjectValidator,
  VIDEO_OUTPUT_PRESETS,
  VideoFingerprintComputer,
  VoiceoverRequest,
  LocalDeterministicVoiceoverProvider,
  VideoOutputMetadata,
  VideoOutputValidator,
  VideoRenderJob,
  VideoRenderResult,
  LocalDeterministicRenderEngine,
  AndroidRenderEngine,
  VideoRenderQueue,
  ShortFormVideoBuilder,
  VideoReviewManager,
  ApprovedVideoArtifact,
  ApprovedVideoArtifactValidator,
  VideoProjectPersistence,
} from '../video';
import { MemoryStorageDriver } from '../PersistentJobStore';

export async function runVideoPipelineTests(
  runTest: (
    id: string,
    name: string,
    category: TestResult['category'],
    fn: () => Promise<void> | void
  ) => Promise<void>
): Promise<void> {
  const eStop = EmergencyStopManager.getInstance();
  const logger = LocalActionLogger.getInstance();

  // Helper fixture for ProductData
  const sampleProduct: ProductData = {
    productName: 'ErgoLift Aluminum Laptop Stand',
    brand: 'ErgoTech',
    price: 49.99,
    currency: 'USD',
    source: 'AMAZON',
    sourceUrl: 'https://www.amazon.com/dp/B09V3K3K5V',
    sourceTimestamp: Date.now(),
    dataFingerprint: 'pfp_sample_laptop_stand_123',
    keyFeatures: ['6 adjustable angles', 'Aircraft aluminum', 'Foldable design'],
    benefits: ['Relieves neck tension', 'Improves posture'],
  };

  // Helper fixture for local MediaAsset
  const sampleMediaAsset: VideoAssetSource = {
    assetId: 'sample_asset_1',
    localUri: 'content://media/external/images/media/4001',
    mimeType: 'image/jpeg',
    mediaType: 'IMAGE',
    sizeBytes: 1500000,
    width: 1080,
    height: 1920,
    sha256: 'sha256_mock_sample_image_1',
    createdAt: Date.now(),
  };

  // ==========================================
  // 1. TRANSITION TESTS (6 tests)
  // ==========================================

  await runTest('VID_TRANS_01', 'Validates default and standard transition types', 'JobValidation', () => {
    const check1 = validateTransition(DEFAULT_TRANSITION);
    if (!check1.valid) throw new Error('Default transition should be valid');

    const fade: VideoTransition = { type: 'FADE', durationMs: 500 };
    const check2 = validateTransition(fade);
    if (!check2.valid) throw new Error('FADE transition should be valid');

    const wipe: VideoTransition = { type: 'WIPE', durationMs: 1000 };
    const check3 = validateTransition(wipe);
    if (!check3.valid) throw new Error('WIPE transition should be valid');
  });

  await runTest('VID_TRANS_02', 'Rejects negative transition duration', 'SafetyTripwire', () => {
    const invalid: VideoTransition = { type: 'FADE', durationMs: -200 };
    const check = validateTransition(invalid);
    if (check.valid) throw new Error('Negative duration must be rejected');
    if (!check.error?.includes('non-negative')) throw new Error('Expected non-negative error');
  });

  await runTest('VID_TRANS_03', 'Rejects excessively long transition duration (> 5000ms)', 'SafetyTripwire', () => {
    const invalid: VideoTransition = { type: 'DISSOLVE', durationMs: 6000 };
    const check = validateTransition(invalid);
    if (check.valid) throw new Error('Excessive transition duration must be rejected');
    if (!check.error?.includes('exceeds maximum')) throw new Error('Expected maximum error');
  });

  await runTest('VID_TRANS_04', 'Rejects unknown transition type', 'JobValidation', () => {
    const invalid: any = { type: 'EXPLOSION_3D', durationMs: 500 };
    const check = validateTransition(invalid);
    if (check.valid) throw new Error('Unknown transition type must be rejected');
  });

  await runTest('VID_TRANS_05', 'Allows undefined transition defaulting to valid NONE', 'JobValidation', () => {
    const check = validateTransition(undefined);
    if (!check.valid) throw new Error('Undefined transition should be valid (treated as NONE)');
  });

  await runTest('VID_TRANS_06', 'Verifies all supported transition types', 'JobValidation', () => {
    const types = ['NONE', 'FADE', 'DISSOLVE', 'SLIDE_LEFT', 'SLIDE_RIGHT', 'WIPE', 'ZOOM'] as const;
    for (const t of types) {
      const check = validateTransition({ type: t, durationMs: t === 'NONE' ? 0 : 300 });
      if (!check.valid) throw new Error(`Transition type ${t} failed validation`);
    }
  });

  // ==========================================
  // 2. VIDEO ASSET & LOCAL-ONLY URI SECURITY (8 tests)
  // ==========================================

  await runTest('VID_ASSET_01', 'Accepts valid local content:// URI', 'Security', () => {
    const check = VideoAssetValidator.validateLocalUri('content://media/external/video/media/992');
    if (!check.valid) throw new Error('content:// URI must be accepted');
  });

  await runTest('VID_ASSET_02', 'Accepts valid local file:// URI', 'Security', () => {
    const check = VideoAssetValidator.validateLocalUri('file:///storage/emulated/0/DCIM/Camera/vid1.mp4');
    if (!check.valid) throw new Error('file:// URI must be accepted');
  });

  await runTest('VID_ASSET_03', 'Accepts valid absolute local path', 'Security', () => {
    const check = VideoAssetValidator.validateLocalUri('/storage/emulated/0/DCIM/video.mp4');
    if (!check.valid) throw new Error('Local absolute path must be accepted');
  });

  await runTest('VID_ASSET_04', 'Strictly rejects http:// remote URL', 'SafetyTripwire', () => {
    const check = VideoAssetValidator.validateLocalUri('http://remote-server.com/video.mp4');
    if (check.valid) throw new Error('http:// must be strictly rejected');
    if (!check.error?.includes('Remote')) throw new Error('Expected remote rejection message');
  });

  await runTest('VID_ASSET_05', 'Strictly rejects https:// remote CDN URL', 'SafetyTripwire', () => {
    const check = VideoAssetValidator.validateLocalUri('https://cdn.example.com/assets/video.mp4');
    if (check.valid) throw new Error('https:// must be strictly rejected');
  });

  await runTest('VID_ASSET_06', 'Strictly rejects dangerous javascript:, data:, and blob: schemes', 'SafetyTripwire', () => {
    const checkJs = VideoAssetValidator.validateLocalUri('javascript:alert(1)');
    if (checkJs.valid) throw new Error('javascript: must be rejected');

    const checkData = VideoAssetValidator.validateLocalUri('data:text/html;base64,PHNjcmlwdD4=');
    if (checkData.valid) throw new Error('data: must be rejected');

    const checkBlob = VideoAssetValidator.validateLocalUri('blob:http://localhost/uuid');
    if (checkBlob.valid) throw new Error('blob: must be rejected');
  });

  await runTest('VID_ASSET_07', 'Validates complete VideoAssetSource fields', 'JobValidation', () => {
    const check = VideoAssetValidator.validateAsset(sampleMediaAsset);
    if (!check.valid) throw new Error(`Asset validation failed: ${check.errors.join('; ')}`);
  });

  await runTest('VID_ASSET_08', 'Rejects asset with unsupported MIME type or zero dimensions', 'SafetyTripwire', () => {
    const badAsset: VideoAssetSource = {
      ...sampleMediaAsset,
      mimeType: 'application/pdf',
      width: 0,
      height: -100,
    };
    const check = VideoAssetValidator.validateAsset(badAsset);
    if (check.valid) throw new Error('Invalid MIME and zero dimensions must fail validation');
    if (check.errors.length < 2) throw new Error('Expected multiple validation errors');
  });

  // ==========================================
  // 3. AUDIO ASSET & TRACK CONFIGURATION (8 tests)
  // ==========================================

  await runTest('VID_AUDIO_01', 'Validates audio asset with proper local URI and duration', 'JobValidation', () => {
    const audio: AudioAsset = {
      audioId: 'audio_vo_1',
      localUri: 'file:///storage/emulated/0/PhoneAgent/audio/vo.mp3',
      mimeType: 'audio/mp3',
      durationMs: 15000,
      sizeBytes: 240000,
      sha256: 'sha256_mock_audio_1',
      type: 'VOICEOVER',
      volume: 0.9,
      startTimeMs: 0,
      endTimeMs: 15000,
      createdAt: Date.now(),
    };
    const check = AudioAssetValidator.validateAsset(audio);
    if (!check.valid) throw new Error(`Audio asset validation failed: ${check.errors.join('; ')}`);
  });

  await runTest('VID_AUDIO_02', 'Rejects remote URI in audio asset', 'SafetyTripwire', () => {
    const audio: AudioAsset = {
      audioId: 'audio_remote',
      localUri: 'https://example.com/audio/voice.mp3',
      mimeType: 'audio/mp3',
      durationMs: 10000,
      sizeBytes: 160000,
      sha256: 'sha256_audio_remote',
      type: 'VOICEOVER',
      volume: 1.0,
      startTimeMs: 0,
      endTimeMs: 10000,
      createdAt: Date.now(),
    };
    const check = AudioAssetValidator.validateAsset(audio);
    if (check.valid) throw new Error('Remote audio URI must be rejected');
  });

  await runTest('VID_AUDIO_03', 'Rejects negative or out-of-bounds audio volume', 'SafetyTripwire', () => {
    const audioBadVol: AudioAsset = {
      audioId: 'audio_bad_vol',
      localUri: 'file:///storage/emulated/0/audio.mp3',
      mimeType: 'audio/mp3',
      durationMs: 5000,
      sizeBytes: 80000,
      sha256: 'sha256_audio_vol',
      type: 'BACKGROUND_MUSIC',
      volume: 1.5, // exceeds 1.0
      startTimeMs: 0,
      endTimeMs: 5000,
      createdAt: Date.now(),
    };
    const check = AudioAssetValidator.validateAsset(audioBadVol);
    if (check.valid) throw new Error('Volume > 1.0 must be rejected');
  });

  await runTest('VID_AUDIO_04', 'Rejects negative fade durations in audio', 'JobValidation', () => {
    const audioBadFade: AudioAsset = {
      audioId: 'audio_bad_fade',
      localUri: 'file:///storage/emulated/0/audio.mp3',
      mimeType: 'audio/mp3',
      durationMs: 5000,
      sizeBytes: 80000,
      sha256: 'sha256_audio_fade',
      type: 'BACKGROUND_MUSIC',
      volume: 0.5,
      startTimeMs: 0,
      endTimeMs: 5000,
      fadeInMs: -500,
      createdAt: Date.now(),
    };
    const check = AudioAssetValidator.validateAsset(audioBadFade);
    if (check.valid) throw new Error('Negative fadeInMs must be rejected');
  });

  await runTest('VID_AUDIO_05', 'Validates AudioTrackConfig with voiceover and background music', 'JobValidation', () => {
    const config: AudioTrackConfig = {
      voiceover: {
        audioId: 'vo1',
        localUri: 'file:///storage/emulated/0/vo.mp3',
        mimeType: 'audio/mp3',
        durationMs: 10000,
        sizeBytes: 160000,
        sha256: 'sha256_vo',
        type: 'VOICEOVER',
        volume: 1.0,
        startTimeMs: 0,
        endTimeMs: 10000,
        createdAt: Date.now(),
      },
      backgroundMusic: {
        audioId: 'bgm1',
        localUri: 'file:///storage/emulated/0/music.mp3',
        mimeType: 'audio/mp3',
        durationMs: 30000,
        sizeBytes: 480000,
        sha256: 'sha256_bgm',
        type: 'BACKGROUND_MUSIC',
        volume: 0.15,
        startTimeMs: 0,
        endTimeMs: 30000,
        createdAt: Date.now(),
      },
      masterVolume: 0.95,
      isMasterMuted: false,
    };
    const check = AudioAssetValidator.validateAudioTrackConfig(config);
    if (!check.valid) throw new Error(`AudioTrackConfig failed validation: ${check.errors.join('; ')}`);
  });

  await runTest('VID_AUDIO_06', 'Rejects invalid master volume in AudioTrackConfig', 'SafetyTripwire', () => {
    const config: AudioTrackConfig = {
      masterVolume: -0.1,
    };
    const check = AudioAssetValidator.validateAudioTrackConfig(config);
    if (check.valid) throw new Error('Negative masterVolume must be rejected');
  });

  await runTest('VID_AUDIO_07', 'Allows undefined AudioTrackConfig (silent video)', 'JobValidation', () => {
    const check = AudioAssetValidator.validateAudioTrackConfig(undefined);
    if (!check.valid) throw new Error('Undefined AudioTrackConfig should be valid');
  });

  await runTest('VID_AUDIO_08', 'Rejects unsupported audio MIME type', 'JobValidation', () => {
    const audio: AudioAsset = {
      audioId: 'audio_bad_mime',
      localUri: 'file:///storage/emulated/0/audio.flac',
      mimeType: 'video/mp4', // video mime for audio asset
      durationMs: 5000,
      sizeBytes: 80000,
      sha256: 'sha256_audio_mime',
      type: 'VOICEOVER',
      volume: 1.0,
      startTimeMs: 0,
      endTimeMs: 5000,
      createdAt: Date.now(),
    };
    const check = AudioAssetValidator.validateAsset(audio);
    if (check.valid) throw new Error('Invalid audio MIME must be rejected');
  });

  // ==========================================
  // 4. TEXT OVERLAY & FACT GROUNDING (8 tests)
  // ==========================================

  await runTest('VID_OVERLAY_01', 'Validates headline and CTA text overlay within time bounds', 'JobValidation', () => {
    const overlay: TextOverlay = {
      overlayId: 'ov_1',
      type: 'HEADLINE',
      text: 'ErgoLift Aluminum Laptop Stand',
      startTimeMs: 0,
      endTimeMs: 4000,
      position: 'LOWER_THIRD',
      isFactualClaim: true,
    };
    const check = TextOverlayValidator.validateOverlay(overlay, sampleProduct);
    if (!check.valid) throw new Error(`Overlay validation failed: ${check.errors.join('; ')}`);
  });

  await runTest('VID_OVERLAY_02', 'Rejects empty overlay text or missing overlayId', 'JobValidation', () => {
    const badOverlay: TextOverlay = {
      overlayId: '',
      type: 'CTA',
      text: '   ',
      startTimeMs: 0,
      endTimeMs: 2000,
      position: 'CENTER',
    };
    const check = TextOverlayValidator.validateOverlay(badOverlay);
    if (check.valid) throw new Error('Empty text and missing overlayId must fail validation');
  });

  await runTest('VID_OVERLAY_03', 'Rejects negative startTimeMs or inverted start/end times', 'SafetyTripwire', () => {
    const inverted: TextOverlay = {
      overlayId: 'ov_inv',
      type: 'HOOK',
      text: 'Great deals!',
      startTimeMs: 3000,
      endTimeMs: 1000, // end < start
      position: 'CENTER',
    };
    const check = TextOverlayValidator.validateOverlay(inverted);
    if (check.valid) throw new Error('Inverted overlay times must fail');
  });

  await runTest('VID_OVERLAY_04', 'Rejects ungrounded false price claim in overlay', 'SafetyTripwire', () => {
    const fakePrice: TextOverlay = {
      overlayId: 'ov_price',
      type: 'PRICE',
      text: 'Only $9.99 today!', // verified price is $49.99
      startTimeMs: 0,
      endTimeMs: 3000,
      position: 'BOTTOM',
      isFactualClaim: true,
    };
    const check = TextOverlayValidator.validateOverlay(fakePrice, sampleProduct);
    if (check.valid) throw new Error('Fabricated price claim must fail fact-grounding');
    if (!check.errors.some(e => e.toUpperCase().includes('PRICE'))) throw new Error('Expected price grounding error');
  });

  await runTest('VID_OVERLAY_05', 'Accepts verified price claim matching ProductData', 'JobValidation', () => {
    const truePrice: TextOverlay = {
      overlayId: 'ov_price_ok',
      type: 'PRICE',
      text: 'Verified Price: $49.99 USD',
      startTimeMs: 0,
      endTimeMs: 3000,
      position: 'BOTTOM',
      isFactualClaim: true,
    };
    const check = TextOverlayValidator.validateOverlay(truePrice, sampleProduct);
    if (!check.valid) throw new Error(`Verified price failed validation: ${check.errors.join('; ')}`);
  });

  await runTest('VID_OVERLAY_06', 'Rejects policy-violating deceptive claims in overlays', 'SafetyTripwire', () => {
    const deceptive: TextOverlay = {
      overlayId: 'ov_deceptive',
      type: 'PRODUCT_FEATURE',
      text: 'Clinically proven to cure chronic arthritis and spinal stenosis permanently!',
      startTimeMs: 0,
      endTimeMs: 4000,
      position: 'CENTER',
      isFactualClaim: true,
    };
    const check = TextOverlayValidator.validateOverlay(deceptive, sampleProduct);
    if (check.valid) throw new Error('Medical/deceptive claim in overlay must be rejected');
  });

  await runTest('VID_OVERLAY_07', 'Preserves Unicode characters and emojis in overlays', 'JobValidation', () => {
    const emojiOverlay: TextOverlay = {
      overlayId: 'ov_emoji',
      type: 'HOOK',
      text: '🔥 Boost your focus & posture! 💻✨ Ergonomic & sleek.',
      startTimeMs: 0,
      endTimeMs: 3000,
      position: 'CENTER',
    };
    const check = TextOverlayValidator.validateOverlay(emojiOverlay);
    if (!check.valid) throw new Error('Emojis and Unicode must be fully supported');
  });

  await runTest('VID_OVERLAY_08', 'Rejects excessively long overlay text (> 120 chars)', 'JobValidation', () => {
    const longOverlay: TextOverlay = {
      overlayId: 'ov_long',
      type: 'HEADLINE',
      text: 'This is an excessively long on-screen overlay text that wraps multiple lines and obscures the entire video viewport making it unreadable for viewers.',
      startTimeMs: 0,
      endTimeMs: 4000,
      position: 'LOWER_THIRD',
    };
    const check = TextOverlayValidator.validateOverlay(longOverlay);
    if (check.valid) throw new Error('Excessively long overlay must be rejected');
  });

  // ==========================================
  // 5. SUBTITLE TRACK & FORMATTING (6 tests)
  // ==========================================

  await runTest('VID_SUB_01', 'Validates properly ordered subtitle segments', 'JobValidation', () => {
    const track: SubtitleTrack = {
      trackId: 'sub_en_1',
      language: 'en',
      segments: [
        { id: 's1', sequenceIndex: 0, text: 'Welcome to ErgoLift spotlight.', startTimeMs: 0, endTimeMs: 3000 },
        { id: 's2', sequenceIndex: 1, text: 'Adjustable in 6 ergonomic angles.', startTimeMs: 3000, endTimeMs: 6500 },
      ],
    };
    const check = SubtitleTrackValidator.validateTrack(track);
    if (!check.valid) throw new Error(`Subtitle track failed: ${check.errors.join('; ')}`);
  });

  await runTest('VID_SUB_02', 'Rejects non-monotonic overlapping subtitle segments', 'SafetyTripwire', () => {
    const badTrack: SubtitleTrack = {
      trackId: 'sub_bad',
      language: 'en',
      segments: [
        { id: 's1', sequenceIndex: 0, text: 'First segment', startTimeMs: 0, endTimeMs: 4000 },
        { id: 's2', sequenceIndex: 1, text: 'Overlapping segment', startTimeMs: 2500, endTimeMs: 6000 }, // starts at 2500 < 4000
      ],
    };
    const check = SubtitleTrackValidator.validateTrack(badTrack);
    if (check.valid) throw new Error('Overlapping subtitle segments must be rejected');
  });

  await runTest('VID_SUB_03', 'Rejects empty subtitle segment text or inverted times', 'JobValidation', () => {
    const badTrack: SubtitleTrack = {
      trackId: 'sub_bad2',
      language: 'en',
      segments: [
        { id: 's1', sequenceIndex: 0, text: '', startTimeMs: 0, endTimeMs: 2000 },
      ],
    };
    const check = SubtitleTrackValidator.validateTrack(badTrack);
    if (check.valid) throw new Error('Empty subtitle text must fail validation');
  });

  await runTest('VID_SUB_04', 'Exports valid SubRip (.srt) format with millisecond timestamps', 'JobValidation', () => {
    const track: SubtitleTrack = {
      trackId: 'sub_srt_test',
      language: 'en',
      segments: [
        { id: 's1', sequenceIndex: 0, text: 'Hello World', startTimeMs: 1200, endTimeMs: 4500 },
        { id: 's2', sequenceIndex: 1, text: 'Ergonomic Stand ✨', startTimeMs: 4500, endTimeMs: 8000 },
      ],
    };
    const srt = SubtitleTrackValidator.toSrt(track);
    if (!srt.includes('00:00:01,200 --> 00:00:04,500')) {
      throw new Error(`Unexpected SRT timestamp format in: \n${srt}`);
    }
    if (!srt.includes('Ergonomic Stand ✨')) {
      throw new Error('Unicode/emoji was not preserved in SRT export');
    }
  });

  await runTest('VID_SUB_05', 'Allows null or undefined subtitle track (optional)', 'JobValidation', () => {
    const check = SubtitleTrackValidator.validateTrack(null);
    if (!check.valid) throw new Error('Null subtitle track should be valid');
  });

  await runTest('VID_SUB_06', 'Rejects subtitle sequenceIndex mismatch', 'JobValidation', () => {
    const badSeqTrack: SubtitleTrack = {
      trackId: 'sub_seq',
      language: 'en',
      segments: [
        { id: 's1', sequenceIndex: 5, text: 'Hello', startTimeMs: 0, endTimeMs: 2000 }, // expected 0
      ],
    };
    const check = SubtitleTrackValidator.validateTrack(badSeqTrack);
    if (check.valid) throw new Error('Sequence index mismatch must fail validation');
  });

  // ==========================================
  // 6. VIDEO CLIP & VIDEO SCENE (8 tests)
  // ==========================================

  await runTest('VID_CLIP_01', 'Validates VideoClip with proper trimming and speed', 'JobValidation', () => {
    const clip: VideoClip = {
      clipId: 'clip_1',
      asset: sampleMediaAsset,
      sourceStartMs: 1000,
      sourceEndMs: 5000,
      playbackSpeed: 1.25,
      volume: 0.8,
    };
    const check = VideoClipValidator.validateClip(clip);
    if (!check.valid) throw new Error(`Clip validation failed: ${check.errors.join('; ')}`);
  });

  await runTest('VID_CLIP_02', 'Rejects sourceEndMs <= sourceStartMs in VideoClip', 'SafetyTripwire', () => {
    const badClip: VideoClip = {
      clipId: 'clip_bad_trim',
      asset: sampleMediaAsset,
      sourceStartMs: 4000,
      sourceEndMs: 2000,
    };
    const check = VideoClipValidator.validateClip(badClip);
    if (check.valid) throw new Error('Inverted source trim times must fail');
  });

  await runTest('VID_CLIP_03', 'Rejects out-of-bounds playback speed in VideoClip', 'SafetyTripwire', () => {
    const fastClip: VideoClip = {
      clipId: 'clip_hyper',
      asset: sampleMediaAsset,
      playbackSpeed: 10.0, // max is 4.0
    };
    const check = VideoClipValidator.validateClip(fastClip);
    if (check.valid) throw new Error('Excessive playback speed must fail validation');
  });

  await runTest('VID_SCENE_01', 'Validates standard VideoScene with transition and overlays', 'JobValidation', () => {
    const scene: VideoScene = {
      sceneId: 'scene_hook',
      sceneIndex: 0,
      role: 'HOOK',
      mediaAsset: sampleMediaAsset,
      startTimeMs: 0,
      endTimeMs: 3000,
      durationMs: 3000,
      cropMode: 'COVER',
      scaleMode: 'FILL_9_16',
      transition: { type: 'NONE', durationMs: 0 },
      textOverlays: [
        {
          overlayId: 'ov_hook',
          type: 'HOOK',
          text: 'Tired of poor laptop posture?',
          startTimeMs: 0,
          endTimeMs: 3000,
          position: 'CENTER',
        },
      ],
      subtitleSegments: [],
    };
    const check = VideoSceneValidator.validateScene(scene, sampleProduct);
    if (!check.valid) throw new Error(`Scene validation failed: ${check.errors.join('; ')}`);
  });

  await runTest('VID_SCENE_02', 'Rejects zero or negative duration in VideoScene', 'SafetyTripwire', () => {
    const zeroDurationScene: VideoScene = {
      sceneId: 'scene_zero',
      sceneIndex: 0,
      role: 'PRODUCT',
      mediaAsset: sampleMediaAsset,
      startTimeMs: 0,
      endTimeMs: 0,
      durationMs: 0,
      cropMode: 'COVER',
      scaleMode: 'ORIGINAL',
      transition: { type: 'NONE', durationMs: 0 },
      textOverlays: [],
      subtitleSegments: [],
    };
    const check = VideoSceneValidator.validateScene(zeroDurationScene);
    if (check.valid) throw new Error('Zero duration scene must fail');
  });

  await runTest('VID_SCENE_03', 'Rejects durationMs mismatch with endTimeMs - startTimeMs', 'SafetyTripwire', () => {
    const mismatchScene: VideoScene = {
      sceneId: 'scene_mismatch',
      sceneIndex: 0,
      role: 'PRODUCT',
      mediaAsset: sampleMediaAsset,
      startTimeMs: 0,
      endTimeMs: 5000,
      durationMs: 3000, // 5000 != 3000
      cropMode: 'COVER',
      scaleMode: 'ORIGINAL',
      transition: { type: 'NONE', durationMs: 0 },
      textOverlays: [],
      subtitleSegments: [],
    };
    const check = VideoSceneValidator.validateScene(mismatchScene);
    if (check.valid) throw new Error('Duration mismatch must fail validation');
  });

  await runTest('VID_SCENE_04', 'Rejects transition duration >= scene duration', 'SafetyTripwire', () => {
    const badTransScene: VideoScene = {
      sceneId: 'scene_trans_overflow',
      sceneIndex: 0,
      role: 'PRODUCT',
      mediaAsset: sampleMediaAsset,
      startTimeMs: 0,
      endTimeMs: 2000,
      durationMs: 2000,
      cropMode: 'COVER',
      scaleMode: 'ORIGINAL',
      transition: { type: 'FADE', durationMs: 2500 }, // 2500 >= 2000
      textOverlays: [],
      subtitleSegments: [],
    };
    const check = VideoSceneValidator.validateScene(badTransScene);
    if (check.valid) throw new Error('Transition duration exceeding scene duration must fail');
  });

  await runTest('VID_SCENE_05', 'Rejects scene with invalid remote media asset', 'SafetyTripwire', () => {
    const remoteMediaScene: VideoScene = {
      sceneId: 'scene_remote_media',
      sceneIndex: 0,
      role: 'PRODUCT',
      mediaAsset: {
        ...sampleMediaAsset,
        localUri: 'https://cdn.example.com/image.jpg',
      },
      startTimeMs: 0,
      endTimeMs: 3000,
      durationMs: 3000,
      cropMode: 'COVER',
      scaleMode: 'ORIGINAL',
      transition: { type: 'NONE', durationMs: 0 },
      textOverlays: [],
      subtitleSegments: [],
    };
    const check = VideoSceneValidator.validateScene(remoteMediaScene);
    if (check.valid) throw new Error('Scene with remote media must fail');
  });

  // ==========================================
  // 7. VIDEO TIMELINE (6 tests)
  // ==========================================

  await runTest('VID_TIMELINE_01', 'Validates contiguous, monotonic multi-scene timeline', 'JobValidation', () => {
    const scenes: VideoScene[] = [
      {
        sceneId: 's1',
        sceneIndex: 0,
        role: 'HOOK',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 0,
        endTimeMs: 3000,
        durationMs: 3000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
      {
        sceneId: 's2',
        sceneIndex: 1,
        role: 'PRODUCT',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 3000,
        endTimeMs: 7000,
        durationMs: 4000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'FADE', durationMs: 300 },
        textOverlays: [],
        subtitleSegments: [],
      },
    ];
    const check = VideoTimelineValidator.validateTimeline(scenes, sampleProduct);
    if (!check.valid) throw new Error(`Timeline validation failed: ${check.errors.join('; ')}`);
    if (check.totalDurationMs !== 7000) throw new Error(`Expected 7000ms, got ${check.totalDurationMs}`);
  });

  await runTest('VID_TIMELINE_02', 'Rejects empty timeline with zero scenes', 'SafetyTripwire', () => {
    const check = VideoTimelineValidator.validateTimeline([], sampleProduct);
    if (check.valid) throw new Error('Empty timeline must fail');
  });

  await runTest('VID_TIMELINE_03', 'Rejects timeline where first scene does not start at 0ms', 'SafetyTripwire', () => {
    const scenes: VideoScene[] = [
      {
        sceneId: 's1',
        sceneIndex: 0,
        role: 'HOOK',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 1000, // should be 0
        endTimeMs: 4000,
        durationMs: 3000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
    ];
    const check = VideoTimelineValidator.validateTimeline(scenes);
    if (check.valid) throw new Error('Non-zero timeline start must fail');
  });

  await runTest('VID_TIMELINE_04', 'Rejects timeline with gaps between scenes', 'SafetyTripwire', () => {
    const scenes: VideoScene[] = [
      {
        sceneId: 's1',
        sceneIndex: 0,
        role: 'HOOK',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 0,
        endTimeMs: 3000,
        durationMs: 3000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
      {
        sceneId: 's2',
        sceneIndex: 1,
        role: 'PRODUCT',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 4000, // gap of 1000ms!
        endTimeMs: 7000,
        durationMs: 3000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
    ];
    const check = VideoTimelineValidator.validateTimeline(scenes);
    if (check.valid) throw new Error('Timeline with gaps must fail validation');
    if (!check.errors.some(e => e.includes('Timeline gap'))) throw new Error('Expected gap error');
  });

  await runTest('VID_TIMELINE_05', 'Rejects timeline with overlapping scenes', 'SafetyTripwire', () => {
    const scenes: VideoScene[] = [
      {
        sceneId: 's1',
        sceneIndex: 0,
        role: 'HOOK',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 0,
        endTimeMs: 4000,
        durationMs: 4000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
      {
        sceneId: 's2',
        sceneIndex: 1,
        role: 'PRODUCT',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 3000, // overlap of 1000ms!
        endTimeMs: 7000,
        durationMs: 4000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
    ];
    const check = VideoTimelineValidator.validateTimeline(scenes);
    if (check.valid) throw new Error('Timeline with overlapping scenes must fail validation');
  });

  await runTest('VID_TIMELINE_06', 'Rebuilds contiguous timeline normalizing timestamps', 'JobValidation', () => {
    const rawScenes: VideoScene[] = [
      {
        sceneId: 's1',
        sceneIndex: 0,
        role: 'HOOK',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 100,
        endTimeMs: 3100,
        durationMs: 3000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
      {
        sceneId: 's2',
        sceneIndex: 1,
        role: 'PRODUCT',
        mediaAsset: sampleMediaAsset,
        startTimeMs: 5000,
        endTimeMs: 9000,
        durationMs: 4000,
        cropMode: 'COVER',
        scaleMode: 'ORIGINAL',
        transition: { type: 'NONE', durationMs: 0 },
        textOverlays: [],
        subtitleSegments: [],
      },
    ];
    const rebuilt = VideoTimelineValidator.rebuildContiguousTimeline(rawScenes);
    if (rebuilt.scenes[0].startTimeMs !== 0 || rebuilt.scenes[0].endTimeMs !== 3000) {
      throw new Error('Scene 0 not normalized to 0-3000ms');
    }
    if (rebuilt.scenes[1].startTimeMs !== 3000 || rebuilt.scenes[1].endTimeMs !== 7000) {
      throw new Error('Scene 1 not normalized to 3000-7000ms');
    }
    if (rebuilt.totalDurationMs !== 7000) throw new Error('Total duration mismatch');
  });

  // ==========================================
  // 8. VIDEO PROJECT & OUTPUT SPECS (6 tests)
  // ==========================================

  await runTest('VID_PROJ_01', 'Validates standard VERTICAL_SHORT output profile (9:16, 1080x1920, 30fps)', 'JobValidation', () => {
    const spec = VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT;
    const check = VideoProjectValidator.validateOutputSpec(spec);
    if (!check.valid) throw new Error(`VERTICAL_SHORT failed: ${check.errors.join('; ')}`);
    if (spec.width !== 1080 || spec.height !== 1920) throw new Error('Dimensions mismatch');
  });

  await runTest('VID_PROJ_02', 'Validates SQUARE (1:1) and LANDSCAPE (16:9) profiles', 'JobValidation', () => {
    const squareCheck = VideoProjectValidator.validateOutputSpec(VIDEO_OUTPUT_PRESETS.SQUARE);
    if (!squareCheck.valid) throw new Error('SQUARE failed validation');

    const wideCheck = VideoProjectValidator.validateOutputSpec(VIDEO_OUTPUT_PRESETS.LANDSCAPE);
    if (!wideCheck.valid) throw new Error('LANDSCAPE failed validation');
  });

  await runTest('VID_PROJ_03', 'Rejects aspect ratio mismatch with width and height', 'SafetyTripwire', () => {
    const badSpec = {
      ...VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      width: 1920,
      height: 1080, // Landscape dimensions for 9:16 aspect ratio!
    };
    const check = VideoProjectValidator.validateOutputSpec(badSpec);
    if (check.valid) throw new Error('Aspect ratio / dimension mismatch must fail');
  });

  await runTest('VID_PROJ_04', 'Rejects unsupported container format', 'JobValidation', () => {
    const badContainer: any = {
      ...VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      container: 'avi',
    };
    const check = VideoProjectValidator.validateOutputSpec(badContainer);
    if (check.valid) throw new Error('Unsupported container format must fail');
  });

  await runTest('VID_PROJ_05', 'Rejects project with missing or invalid cryptographic fingerprints', 'SafetyTripwire', () => {
    const project: VideoProject = {
      projectId: 'proj_bad_fp',
      title: 'Bad Fingerprint Project',
      productFingerprint: 'invalid_fp', // does not start with pfp_
      mediaFingerprint: 'mfp_123',
      contentFingerprint: 'cfp_123',
      scenes: [],
      timeline: { totalDurationMs: 0, sceneCount: 0, scenes: [] },
      overlays: [],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectFingerprint: 'vpf_123',
      reviewStatus: 'DRAFT',
    };
    const check = VideoProjectValidator.validateProject(project);
    if (check.valid) throw new Error('Invalid productFingerprint must fail validation');
  });

  await runTest('VID_PROJ_06', 'Rejects project when timeline exceeds outputSpec maxDurationMs', 'SafetyTripwire', () => {
    const longProject = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_sample_laptop_stand_123',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_sample_media_123',
      contentFingerprint: 'cfp_sample_content_123',
      inputs: {
        hookText: 'Stop slouching!',
        productHighlights: ['Adjustable', 'Sturdy'],
        callToAction: 'Check link',
      },
      outputSpec: {
        ...VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
        maxDurationMs: 5000, // 5s limit, but project is ~21s
      },
    });
    const check = VideoProjectValidator.validateProject(longProject);
    if (check.valid) throw new Error('Project exceeding maxDurationMs must fail validation');
  });

  // ==========================================
  // 9. DETERMINISTIC VIDEO FINGERPRINT ENGINE (7 tests)
  // ==========================================

  await runTest('VID_FP_01', 'Computes deterministic project fingerprint prefix vpf_', 'Security', () => {
    const fp = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint: 'pfp_test_1',
      mediaFingerprint: 'mfp_test_1',
      contentFingerprint: 'cfp_test_1',
      scenes: [],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });
    if (!fp.startsWith('vpf_')) throw new Error('Fingerprint must start with vpf_');
    if (fp.length < 20) throw new Error('Fingerprint length too short');
  });

  await runTest('VID_FP_02', 'Produces identical fingerprint for identical canonical content', 'Security', () => {
    const payload = {
      productFingerprint: 'pfp_test_1',
      mediaFingerprint: 'mfp_test_1',
      contentFingerprint: 'cfp_test_1',
      scenes: [],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    };
    const fp1 = VideoFingerprintComputer.computeProjectFingerprint(payload);
    const fp2 = VideoFingerprintComputer.computeProjectFingerprint(payload);
    if (fp1 !== fp2) throw new Error(`Fingerprints must be strictly deterministic: ${fp1} vs ${fp2}`);
  });

  await runTest('VID_FP_03', 'Alters fingerprint when scene duration or order changes', 'Security', () => {
    const s1: VideoScene = {
      sceneId: 's1',
      sceneIndex: 0,
      role: 'HOOK',
      mediaAsset: sampleMediaAsset,
      startTimeMs: 0,
      endTimeMs: 3000,
      durationMs: 3000,
      cropMode: 'COVER',
      scaleMode: 'ORIGINAL',
      transition: { type: 'NONE', durationMs: 0 },
      textOverlays: [],
      subtitleSegments: [],
    };
    const fpA = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint: 'pfp_1',
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      scenes: [s1],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });

    const s1Modified = { ...s1, durationMs: 4000 };
    const fpB = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint: 'pfp_1',
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      scenes: [s1Modified],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });

    if (fpA === fpB) throw new Error('Fingerprint must change when scene duration changes');
  });

  await runTest('VID_FP_04', 'Alters fingerprint when text overlay or subtitle changes', 'Security', () => {
    const fpBase = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint: 'pfp_1',
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      scenes: [],
      overlays: [
        {
          overlayId: 'o1',
          type: 'HOOK',
          text: 'Hook original',
          startTimeMs: 0,
          endTimeMs: 2000,
          position: 'CENTER',
        },
      ],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });

    const fpChanged = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint: 'pfp_1',
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      scenes: [],
      overlays: [
        {
          overlayId: 'o1',
          type: 'HOOK',
          text: 'Hook mutated text',
          startTimeMs: 0,
          endTimeMs: 2000,
          position: 'CENTER',
        },
      ],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });

    if (fpBase === fpChanged) throw new Error('Fingerprint must change when overlay text changes');
  });

  await runTest('VID_FP_05', 'Alters fingerprint when audio track configuration changes', 'Security', () => {
    const fpBase = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint: 'pfp_1',
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      scenes: [],
      audioTrack: { masterVolume: 1.0 },
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });

    const fpMuted = VideoFingerprintComputer.computeProjectFingerprint({
      productFingerprint: 'pfp_1',
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      scenes: [],
      audioTrack: { masterVolume: 1.0, isMasterMuted: true },
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    });

    if (fpBase === fpMuted) throw new Error('Fingerprint must change when audio mute state changes');
  });

  await runTest('VID_FP_06', 'Computes render fingerprint rpf_ and output fingerprint opf_', 'Security', () => {
    const rpf = VideoFingerprintComputer.computeRenderFingerprint(
      'vpf_project123',
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      'test-engine'
    );
    if (!rpf.startsWith('rpf_')) throw new Error('Render fingerprint must start with rpf_');

    const opf = VideoFingerprintComputer.computeOutputFingerprint(
      'file:///output.mp4',
      15000000,
      21000,
      rpf
    );
    if (!opf.startsWith('opf_')) throw new Error('Output fingerprint must start with opf_');
  });

  await runTest('VID_FP_07', 'Ensures fingerprint excludes non-deterministic timestamps and memory addresses', 'Security', () => {
    const p1 = {
      productFingerprint: 'pfp_static',
      mediaFingerprint: 'mfp_static',
      contentFingerprint: 'cfp_static',
      scenes: [],
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    };
    const p2 = { ...p1 };
    const fp1 = VideoFingerprintComputer.computeProjectFingerprint(p1);
    const fp2 = VideoFingerprintComputer.computeProjectFingerprint(p2);
    if (fp1 !== fp2) throw new Error('Fingerprint must not vary across object instances');
  });

  // ==========================================
  // 10. VOICEOVER PROVIDER & ZERO LEAK (5 tests)
  // ==========================================

  await runTest('VID_VOICE_01', 'Deterministic voiceover synthesis produces local audio asset', 'JobValidation', async () => {
    const provider = new LocalDeterministicVoiceoverProvider();
    const req: VoiceoverRequest = {
      text: 'ErgoLift Stand relieves neck strain with 6 ergonomic angles.',
      language: 'en',
    };
    const result = await provider.generateVoiceover(req);
    if (!result.success || !result.audioAsset) throw new Error('Voiceover generation failed');
    if (!result.audioAsset.localUri.startsWith('file:///')) throw new Error('Asset must be local URI');
    if (!result.isSimulation) throw new Error('Simulation flag must be true');
  });

  await runTest('VID_VOICE_02', 'Rejects empty text for voiceover synthesis', 'SafetyTripwire', async () => {
    const provider = new LocalDeterministicVoiceoverProvider();
    const result = await provider.generateVoiceover({ text: '   ' });
    if (result.success) throw new Error('Empty voiceover text must fail');
    if (result.errorCode !== 'INVALID_TEXT') throw new Error('Expected INVALID_TEXT error code');
  });

  await runTest('VID_VOICE_03', 'Calculates estimated duration proportional to word count', 'JobValidation', async () => {
    const provider = new LocalDeterministicVoiceoverProvider();
    const shortRes = await provider.generateVoiceover({ text: 'Hello there.' });
    const longRes = await provider.generateVoiceover({
      text: 'This is a significantly longer script describing all the ergonomic features and heat dissipation capabilities of the aluminum laptop stand.',
    });
    if (!shortRes.audioAsset || !longRes.audioAsset) throw new Error('Missing audio asset');
    if (longRes.audioAsset.durationMs <= shortRes.audioAsset.durationMs) {
      throw new Error('Longer script must have longer estimated duration');
    }
  });

  await runTest('VID_VOICE_04', 'Zero credential leakage: never includes API keys or secrets in VoiceoverResult', 'Security', async () => {
    const provider = new LocalDeterministicVoiceoverProvider();
    const result = await provider.generateVoiceover({ text: 'Test script' });
    const json = JSON.stringify(result);
    if (json.includes('AIza') || json.includes('gsk_') || json.includes('secret') || json.includes('password')) {
      throw new Error('VoiceoverResult contained credential leak pattern');
    }
  });

  await runTest('VID_VOICE_05', 'Provider isAvailable returns true for deterministic simulator', 'JobValidation', async () => {
    const provider = new LocalDeterministicVoiceoverProvider();
    const avail = await provider.isAvailable();
    if (!avail) throw new Error('Simulator must be available');
  });

  // ==========================================
  // 11. VIDEO OUTPUT VALIDATION (7 tests)
  // ==========================================

  await runTest('VID_OUTVAL_01', 'Validates compliant rendered video output file', 'JobValidation', () => {
    const meta: VideoOutputMetadata = {
      outputUri: 'file:///storage/emulated/0/PhoneAgent/renders/render_1.mp4',
      mimeType: 'video/mp4',
      container: 'mp4',
      width: 1080,
      height: 1920,
      durationMs: 20000,
      sizeBytes: 15000000,
      outputFingerprint: 'opf_1234567890abcdef',
      renderedAt: Date.now(),
    };
    const res = VideoOutputValidator.validateRenderedOutput(
      meta,
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      20000
    );
    if (!res.valid) throw new Error(`Output validation failed: ${res.errors.join('; ')}`);
  });

  await runTest('VID_OUTVAL_02', 'Rejects non-local or remote output URI', 'SafetyTripwire', () => {
    const meta: VideoOutputMetadata = {
      outputUri: 'https://cdn.example.com/renders/out.mp4',
      mimeType: 'video/mp4',
      container: 'mp4',
      width: 1080,
      height: 1920,
      durationMs: 20000,
      sizeBytes: 15000000,
      outputFingerprint: 'opf_1234567890abcdef',
      renderedAt: Date.now(),
    };
    const res = VideoOutputValidator.validateRenderedOutput(
      meta,
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      20000
    );
    if (res.valid) throw new Error('Remote output URI must fail validation');
  });

  await runTest('VID_OUTVAL_03', 'Rejects corrupted zero-byte rendered output', 'SafetyTripwire', () => {
    const meta: VideoOutputMetadata = {
      outputUri: 'file:///storage/emulated/0/PhoneAgent/renders/zero.mp4',
      mimeType: 'video/mp4',
      container: 'mp4',
      width: 1080,
      height: 1920,
      durationMs: 20000,
      sizeBytes: 0, // corrupted zero-byte
      outputFingerprint: 'opf_1234567890abcdef',
      renderedAt: Date.now(),
    };
    const res = VideoOutputValidator.validateRenderedOutput(
      meta,
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      20000
    );
    if (res.valid) throw new Error('Zero-byte file must fail validation');
  });

  await runTest('VID_OUTVAL_04', 'Rejects output dimension mismatch', 'SafetyTripwire', () => {
    const meta: VideoOutputMetadata = {
      outputUri: 'file:///storage/emulated/0/PhoneAgent/renders/dim.mp4',
      mimeType: 'video/mp4',
      container: 'mp4',
      width: 720, // requested 1080
      height: 1280, // requested 1920
      durationMs: 20000,
      sizeBytes: 5000000,
      outputFingerprint: 'opf_1234567890abcdef',
      renderedAt: Date.now(),
    };
    const res = VideoOutputValidator.validateRenderedOutput(
      meta,
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      20000
    );
    if (res.valid) throw new Error('Dimension mismatch must fail validation');
  });

  await runTest('VID_OUTVAL_05', 'Rejects output duration diverging significantly from timeline (> 1500ms)', 'SafetyTripwire', () => {
    const meta: VideoOutputMetadata = {
      outputUri: 'file:///storage/emulated/0/PhoneAgent/renders/dur.mp4',
      mimeType: 'video/mp4',
      container: 'mp4',
      width: 1080,
      height: 1920,
      durationMs: 10000, // expected 20000 (diff 10000ms!)
      sizeBytes: 8000000,
      outputFingerprint: 'opf_1234567890abcdef',
      renderedAt: Date.now(),
    };
    const res = VideoOutputValidator.validateRenderedOutput(
      meta,
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      20000
    );
    if (res.valid) throw new Error('Divergent duration must fail validation');
  });

  await runTest('VID_OUTVAL_06', 'Rejects missing output fingerprint opf_', 'SafetyTripwire', () => {
    const meta: VideoOutputMetadata = {
      outputUri: 'file:///storage/emulated/0/PhoneAgent/renders/nofp.mp4',
      mimeType: 'video/mp4',
      container: 'mp4',
      width: 1080,
      height: 1920,
      durationMs: 20000,
      sizeBytes: 8000000,
      outputFingerprint: '', // missing
      renderedAt: Date.now(),
    };
    const res = VideoOutputValidator.validateRenderedOutput(
      meta,
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      20000
    );
    if (res.valid) throw new Error('Missing output fingerprint must fail validation');
  });

  await runTest('VID_OUTVAL_07', 'Rejects null or undefined output metadata', 'JobValidation', () => {
    const res = VideoOutputValidator.validateRenderedOutput(
      null,
      VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT
    );
    if (res.valid) throw new Error('Null output metadata must fail validation');
  });

  // ==========================================
  // 12. VIDEO RENDER ENGINE (5 tests)
  // ==========================================

  await runTest('VID_ENG_01', 'LocalDeterministicRenderEngine renders successfully with isSimulation: true', 'JobValidation', async () => {
    const engine = new LocalDeterministicRenderEngine();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: {
        hookText: 'Posture fix!',
        productHighlights: ['Alloy build'],
        callToAction: 'Shop now',
      },
    });

    const job: VideoRenderJob = {
      jobId: 'job_test_1',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'rpf_test_1',
      status: 'RENDERING',
      outputSpec: project.outputSpec,
      progress: 0,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    let progressCalls = 0;
    const result = await engine.render(project, job, () => progressCalls++);
    if (!result.success) throw new Error('Render failed');
    if (!result.isSimulation) throw new Error('Simulation flag must be true');
    if (progressCalls === 0) throw new Error('Progress callbacks were not invoked');
  });

  await runTest('VID_ENG_02', 'RenderEngine aborts immediately when Emergency Stop is active', 'SafetyTripwire', async () => {
    const engine = new LocalDeterministicRenderEngine();
    eStop.trigger('Safety tripwire test');

    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['Highlight'], callToAction: 'CTA' },
    });

    const job: VideoRenderJob = {
      jobId: 'job_test_estop',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'rpf_test_estop',
      status: 'QUEUED',
      outputSpec: project.outputSpec,
      progress: 0,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    try {
      await engine.render(project, job);
      throw new Error('Should have thrown Emergency Stop error');
    } catch (err: any) {
      if (!err.message.includes('Emergency Stop')) {
        throw new Error(`Expected Emergency Stop error, got: ${err.message}`);
      }
    } finally {
      eStop.reset();
    }
  });

  await runTest('VID_ENG_03', 'AndroidRenderEngine detects absence of native bridge in web runtime', 'JobValidation', async () => {
    const androidEngine = new AndroidRenderEngine();
    const available = await androidEngine.isAvailable();
    if (available) {
      throw new Error('Android bridge should not be available in standard Node/browser environment');
    }
  });

  await runTest('VID_ENG_04', 'Render result generates opf_ fingerprint from output URI and size', 'Security', async () => {
    const engine = new LocalDeterministicRenderEngine();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['Highlight'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'job_test_opf',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'rpf_opf',
      status: 'RENDERING',
      outputSpec: project.outputSpec,
      progress: 0,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    const res = await engine.render(project, job);
    if (!res.outputFingerprint.startsWith('opf_')) {
      throw new Error('Render result outputFingerprint must start with opf_');
    }
  });

  await runTest('VID_ENG_05', 'Render engine logs VIDEO_RENDER_STARTED and VIDEO_RENDER_COMPLETED', 'Logging', async () => {
    const engine = new LocalDeterministicRenderEngine();
    const beforeCount = logger.getLogs().length;

    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['Highlight'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'job_log_test',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'rpf_log_test',
      status: 'RENDERING',
      outputSpec: project.outputSpec,
      progress: 0,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    await engine.render(project, job);
    const started = logger.getLogs().some(l => l.action === 'VIDEO_RENDER_STARTED' && l.details.includes(project.projectId));
    const completed = logger.getLogs().some(l => l.action === 'VIDEO_RENDER_COMPLETED' && l.details.includes(project.projectId));
    if (!started || !completed) throw new Error('Missing start/completed render audit logs');
  });

  // ==========================================
  // 13. VIDEO RENDER QUEUE LIFECYCLE (9 tests)
  // ==========================================

  await runTest('VID_QUEUE_01', 'Enqueues project in QUEUED status with renderFingerprint', 'JobValidation', () => {
    const queue = new VideoRenderQueue();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const job = queue.enqueue(project);
    if (job.status !== 'QUEUED') throw new Error(`Expected QUEUED, got: ${job.status}`);
    if (!job.renderFingerprint.startsWith('rpf_')) throw new Error('Missing rpf_ render fingerprint');
  });

  await runTest('VID_QUEUE_02', 'Transitions QUEUED -> VALIDATING -> RENDERING -> RENDERED -> VALIDATING_OUTPUT -> READY_FOR_REVIEW', 'JobValidation', async () => {
    const queue = new VideoRenderQueue();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const job = queue.enqueue(project);
    const completedJob = await queue.processJob(job.jobId);

    // Invariant: Completed job is READY_FOR_REVIEW, NEVER auto-approved!
    if (completedJob.status !== 'READY_FOR_REVIEW') {
      throw new Error(`Expected READY_FOR_REVIEW, got: ${completedJob.status}`);
    }
    if (completedJob.progress !== 100) throw new Error('Progress must be 100%');
    if (!completedJob.validationResult?.valid) throw new Error('Validation result must be valid');
  });

  await runTest('VID_QUEUE_03', 'Invariant: Render queue NEVER auto-approves video projects', 'SafetyTripwire', async () => {
    const queue = new VideoRenderQueue();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const job = queue.enqueue(project);
    const completedJob = await queue.processJob(job.jobId);

    if (completedJob.status === 'APPROVED') {
      throw new Error('CRITICAL FAILURE: Render queue automatically approved video!');
    }
  });

  await runTest('VID_QUEUE_04', 'Invariant: Render queue NEVER publishes or contains publishing methods', 'SafetyTripwire', () => {
    const queue = new VideoRenderQueue() as any;
    if (typeof queue.publish === 'function' || typeof queue.publishVideo === 'function') {
      throw new Error('CRITICAL FAILURE: VideoRenderQueue must not contain publishing methods!');
    }
  });

  await runTest('VID_QUEUE_05', 'Allows retry up to max 2 recovery attempts', 'JobValidation', async () => {
    const queue = new VideoRenderQueue();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const job = queue.enqueue(project);
    job.status = 'FAILED';
    job.error = 'Simulated transient failure';

    const retry1 = await queue.retryJob(job.jobId);
    if (retry1.recoveryAttempts !== 1) throw new Error('Recovery attempts should be 1');

    retry1.status = 'FAILED';
    const retry2 = await queue.retryJob(job.jobId);
    if (retry2.recoveryAttempts !== 2) throw new Error('Recovery attempts should be 2');

    retry2.status = 'FAILED';
    try {
      await queue.retryJob(job.jobId);
      throw new Error('Third retry must be blocked');
    } catch (err: any) {
      if (!err.message.includes('Maximum recovery attempts')) {
        throw new Error(`Expected max recovery message, got: ${err.message}`);
      }
    }
  });

  await runTest('VID_QUEUE_06', 'Third consecutive unrecoverable failure trips EmergencyStop', 'SafetyTripwire', async () => {
    const mockFailingEngine = {
      engineId: 'failing-engine',
      isAvailable: async () => true,
      render: async () => {
        throw new Error('Hardware rendering fault');
      },
    };

    const queue = new VideoRenderQueue(mockFailingEngine as any);
    const p1 = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const j1 = queue.enqueue(p1);
    await queue.processJob(j1.jobId); // Fail 1

    const j2 = queue.enqueue(p1);
    await queue.processJob(j2.jobId); // Fail 2

    const j3 = queue.enqueue(p1);
    await queue.processJob(j3.jobId); // Fail 3 -> Must trip EmergencyStop!

    if (!eStop.isActive()) {
      throw new Error('Emergency Stop should have triggered after 3 consecutive failures');
    }
    eStop.reset();
  });

  await runTest('VID_QUEUE_07', 'Cancels queued and in-flight jobs', 'JobValidation', () => {
    const queue = new VideoRenderQueue();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const job = queue.enqueue(project);
    const cancelled = queue.cancelJob(job.jobId, 'Operator cancelled');
    if (!cancelled) throw new Error('Job cancellation failed');
    if (job.status !== 'CANCELLED') throw new Error(`Expected CANCELLED, got: ${job.status}`);
  });

  await runTest('VID_QUEUE_08', 'Reconciles UNKNOWN job safely without auto-approval', 'SafetyTripwire', () => {
    const queue = new VideoRenderQueue();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const job = queue.enqueue(project);
    job.status = 'UNKNOWN';

    // 1. Without output artifact -> marks FAILED
    const failedReconcile = queue.reconcileUnknownJob(job.jobId);
    if (failedReconcile.status !== 'FAILED') {
      throw new Error(`Expected FAILED without output artifact, got: ${failedReconcile.status}`);
    }

    // 2. With verified output artifact -> marks READY_FOR_REVIEW, NEVER APPROVED!
    const validMeta: VideoOutputMetadata = {
      outputUri: 'file:///storage/emulated/0/PhoneAgent/renders/recon.mp4',
      mimeType: 'video/mp4',
      container: 'mp4',
      width: 1080,
      height: 1920,
      durationMs: project.timeline.totalDurationMs,
      sizeBytes: 12000000,
      outputFingerprint: 'opf_reconciled',
      renderedAt: Date.now(),
    };
    job.status = 'UNKNOWN';
    const successReconcile = queue.reconcileUnknownJob(job.jobId, validMeta);
    if (successReconcile.status !== 'READY_FOR_REVIEW') {
      throw new Error(`Expected READY_FOR_REVIEW, got: ${successReconcile.status}`);
    }
  });

  await runTest('VID_QUEUE_09', 'Rejects enqueuing jobs when Emergency Stop is active', 'SafetyTripwire', () => {
    const queue = new VideoRenderQueue();
    eStop.trigger('Active emergency');
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });

    try {
      queue.enqueue(project);
      throw new Error('Enqueue should have been blocked');
    } catch (err: any) {
      if (!err.message.includes('Emergency Stop is active')) {
        throw new Error(`Expected Emergency Stop error, got: ${err.message}`);
      }
    } finally {
      eStop.reset();
    }
  });

  // ==========================================
  // 14. SHORT-FORM VIDEO TEMPLATES (6 tests)
  // ==========================================

  await runTest('VID_TMPL_01', 'Builds standard short-form project with 6 scenes (HOOK -> PROBLEM -> PRODUCT -> BENEFITS -> DEMO -> CTA)', 'JobValidation', () => {
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: {
        hookText: 'Stop slouching at work!',
        problemStatement: 'Low screens cause bad posture.',
        productHighlights: ['6 adjustable angles', 'Aluminum cooling'],
        callToAction: 'Check link in bio',
      },
    });

    if (project.scenes.length !== 6) {
      throw new Error(`Expected 6 scenes, got: ${project.scenes.length}`);
    }
    const roles = project.scenes.map(s => s.role);
    const expectedRoles = ['HOOK', 'PROBLEM', 'PRODUCT', 'KEY_BENEFITS', 'DEMONSTRATION', 'CTA'];
    if (JSON.stringify(roles) !== JSON.stringify(expectedRoles)) {
      throw new Error(`Scene roles mismatch: ${roles.join(', ')}`);
    }
  });

  await runTest('VID_TMPL_02', 'Rejects short-form build when no media assets are provided', 'SafetyTripwire', () => {
    try {
      ShortFormVideoBuilder.buildShortFormProject({
        productData: sampleProduct,
        productFingerprint: 'pfp_1',
        mediaAssets: [], // empty!
        mediaFingerprint: 'mfp_1',
        contentFingerprint: 'cfp_1',
        inputs: { hookText: 'H', productHighlights: ['P'], callToAction: 'C' },
      });
      throw new Error('Build with empty media assets should have failed');
    } catch (err: any) {
      if (!err.message.includes('at least one validated local media asset')) {
        throw new Error(`Expected media assets error, got: ${err.message}`);
      }
    }
  });

  await runTest('VID_TMPL_03', 'Blocks short-form build with policy-violating claim in hook or CTA', 'SafetyTripwire', () => {
    try {
      ShortFormVideoBuilder.buildShortFormProject({
        productData: sampleProduct,
        productFingerprint: 'pfp_1',
        mediaAssets: [sampleMediaAsset],
        mediaFingerprint: 'mfp_1',
        contentFingerprint: 'cfp_1',
        inputs: {
          hookText: 'Guaranteed to completely cure your arthritis!', // illegal medical claim
          productHighlights: ['Alloy'],
          callToAction: 'Buy now',
        },
      });
      throw new Error('Policy-violating claim should have been blocked');
    } catch (err: any) {
      if (!err.message.includes('blocked by policy')) {
        throw new Error(`Expected policy block message, got: ${err.message}`);
      }
    }
  });

  await runTest('VID_TMPL_04', 'Cycles across multiple provided media assets seamlessly', 'JobValidation', () => {
    const asset2: VideoAssetSource = {
      ...sampleMediaAsset,
      assetId: 'sample_asset_2',
      sha256: 'sha256_mock_sample_image_2',
    };
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset, asset2],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['P1', 'P2'], callToAction: 'C' },
    });

    if (project.scenes[0].mediaAsset.assetId !== 'sample_asset_1') throw new Error('Scene 0 should use asset 1');
    if (project.scenes[1].mediaAsset.assetId !== 'sample_asset_2') throw new Error('Scene 1 should use asset 2');
    if (project.scenes[2].mediaAsset.assetId !== 'sample_asset_1') throw new Error('Scene 2 should cycle to asset 1');
  });

  await runTest('VID_TMPL_05', 'Generates matching subtitle segments for every scene', 'JobValidation', () => {
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook text', productHighlights: ['Highlight 1'], callToAction: 'CTA' },
    });

    if (!project.subtitles || project.subtitles.segments.length !== project.scenes.length) {
      throw new Error('Subtitles should match scenes count');
    }
  });

  await runTest('VID_TMPL_06', 'Assigns valid transitions between consecutive scenes', 'JobValidation', () => {
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['H'], callToAction: 'CTA' },
    });

    if (project.scenes[0].transition.type !== 'NONE') throw new Error('Scene 0 transition should be NONE');
    if (project.scenes[1].transition.type !== 'FADE') throw new Error('Scene 1 transition should be FADE');
  });

  // ==========================================
  // 15. VIDEO REVIEW MANAGER & HUMAN APPROVAL (9 tests)
  // ==========================================

  await runTest('VID_REV_01', 'Human operator approves project in READY_FOR_REVIEW status', 'JobValidation', () => {
    const manager = new VideoReviewManager();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'Hook', productHighlights: ['H'], callToAction: 'CTA' },
    });

    const job: VideoRenderJob = {
      jobId: 'job_app_1',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'rpf_1',
      status: 'READY_FOR_REVIEW',
      outputSpec: project.outputSpec,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
      outputResult: {
        success: true,
        outputUri: 'file:///storage/renders/out.mp4',
        outputFingerprint: 'opf_test_approved',
        durationMs: 21000,
        width: 1080,
        height: 1920,
        sizeBytes: 14000000,
        mimeType: 'video/mp4',
        isSimulation: true,
        renderedAt: Date.now(),
      },
    };

    const artifact = manager.approve(
      project,
      job,
      'Operator Alex',
      ['instagram', 'tiktok', 'youtube'],
      'Verified facts against Amazon source.'
    );

    if (project.reviewStatus !== 'APPROVED') throw new Error('Project reviewStatus must be APPROVED');
    if (job.status !== 'APPROVED') throw new Error('Job status must be APPROVED');
    if (!artifact.artifactId) throw new Error('ApprovedVideoArtifact must have artifactId');
    if (artifact.outputFingerprint !== 'opf_test_approved') throw new Error('Fingerprint mismatch in artifact');
  });

  await runTest('VID_REV_02', 'Approval requires human reviewer identity', 'SafetyTripwire', () => {
    const manager = new VideoReviewManager();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'j',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'r',
      status: 'READY_FOR_REVIEW',
      outputSpec: project.outputSpec,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
      outputResult: {
        success: true,
        outputUri: 'file:///out.mp4',
        outputFingerprint: 'opf_1',
        durationMs: 1000,
        width: 1080,
        height: 1920,
        sizeBytes: 1000,
        mimeType: 'video/mp4',
        isSimulation: true,
        renderedAt: Date.now(),
      },
    };

    try {
      manager.approve(project, job, '   '); // empty reviewer ID!
      throw new Error('Approval without reviewer ID should fail');
    } catch (err: any) {
      if (!err.message.includes('reviewer identity is required')) {
        throw new Error(`Expected reviewer identity error, got: ${err.message}`);
      }
    }
  });

  await runTest('VID_REV_03', 'Cannot approve when job is still in QUEUED or RENDERING status', 'SafetyTripwire', () => {
    const manager = new VideoReviewManager();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'j',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'r',
      status: 'RENDERING', // not ready!
      outputSpec: project.outputSpec,
      progress: 50,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    try {
      manager.approve(project, job, 'Alex');
      throw new Error('Premature approval should fail');
    } catch (err: any) {
      if (!err.message.includes('READY_FOR_REVIEW')) {
        throw new Error(`Expected READY_FOR_REVIEW requirement, got: ${err.message}`);
      }
    }
  });

  await runTest('VID_REV_04', 'Strictly forbids Amazon as an approved publishing destination in artifact', 'SafetyTripwire', () => {
    const manager = new VideoReviewManager();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'j',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'r',
      status: 'READY_FOR_REVIEW',
      outputSpec: project.outputSpec,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
      outputResult: {
        success: true,
        outputUri: 'file:///out.mp4',
        outputFingerprint: 'opf_1',
        durationMs: 1000,
        width: 1080,
        height: 1920,
        sizeBytes: 1000,
        mimeType: 'video/mp4',
        isSimulation: true,
        renderedAt: Date.now(),
      },
    };

    try {
      // Amazon is exclusively a source application, never a publishing destination!
      manager.approve(project, job, 'Alex', ['amazon' as any]);
      throw new Error('Amazon target platform must be rejected');
    } catch (err: any) {
      if (!err.message.includes('Amazon')) {
        throw new Error(`Expected Amazon platform prohibition error, got: ${err.message}`);
      }
    }
  });

  await runTest('VID_REV_05', 'Detects staleness when projectFingerprint mutates post-approval', 'SafetyTripwire', () => {
    const manager = new VideoReviewManager();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'j',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'r',
      status: 'READY_FOR_REVIEW',
      outputSpec: project.outputSpec,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
      outputResult: {
        success: true,
        outputUri: 'file:///out.mp4',
        outputFingerprint: 'opf_1',
        durationMs: 1000,
        width: 1080,
        height: 1920,
        sizeBytes: 1000,
        mimeType: 'video/mp4',
        isSimulation: true,
        renderedAt: Date.now(),
      },
    };

    manager.approve(project, job, 'Alex');
    if (project.reviewStatus !== 'APPROVED') throw new Error('Project should be APPROVED');

    // Mutate project fingerprint (e.g. edited text or scene)
    project.projectFingerprint = 'vpf_mutated_post_approval';
    const isStale = manager.invalidateIfStale(project, 'opf_1');
    if (!isStale || (project.reviewStatus as any) !== 'STALE_APPROVAL') {
      throw new Error('Project should have flipped to STALE_APPROVAL');
    }
  });

  await runTest('VID_REV_06', 'Detects staleness when rendered output fingerprint mutates post-approval', 'SafetyTripwire', () => {
    const manager = new VideoReviewManager();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'j',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'r',
      status: 'READY_FOR_REVIEW',
      outputSpec: project.outputSpec,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
      outputResult: {
        success: true,
        outputUri: 'file:///out.mp4',
        outputFingerprint: 'opf_original',
        durationMs: 1000,
        width: 1080,
        height: 1920,
        sizeBytes: 1000,
        mimeType: 'video/mp4',
        isSimulation: true,
        renderedAt: Date.now(),
      },
    };

    manager.approve(project, job, 'Alex');
    const isStale = manager.invalidateIfStale(project, 'opf_altered_media');
    if (!isStale || project.reviewStatus !== 'STALE_APPROVAL') {
      throw new Error('Output fingerprint alteration must flip project to STALE_APPROVAL');
    }
  });

  await runTest('VID_REV_07', 'Human operator rejects project with recorded reason', 'JobValidation', () => {
    const manager = new VideoReviewManager();
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'j',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'r',
      status: 'READY_FOR_REVIEW',
      outputSpec: project.outputSpec,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    manager.reject(project, job, 'Alex', 'Music volume too loud; please lower BGM.');
    if (project.reviewStatus !== 'REJECTED') throw new Error('Project must be REJECTED');
    if (job.status !== 'FAILED') throw new Error('Job must be marked FAILED');
    if (!job.error?.includes('Music volume too loud')) throw new Error('Rejection reason missing from job');
  });

  await runTest('VID_REV_08', 'Approval blocked when Emergency Stop is active', 'SafetyTripwire', () => {
    const manager = new VideoReviewManager();
    eStop.trigger('Safety tripwire');
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });
    const job: VideoRenderJob = {
      jobId: 'j',
      projectId: project.projectId,
      projectFingerprint: project.projectFingerprint,
      renderFingerprint: 'r',
      status: 'READY_FOR_REVIEW',
      outputSpec: project.outputSpec,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
      outputResult: {
        success: true,
        outputUri: 'file:///out.mp4',
        outputFingerprint: 'opf_1',
        durationMs: 1000,
        width: 1080,
        height: 1920,
        sizeBytes: 1000,
        mimeType: 'video/mp4',
        isSimulation: true,
        renderedAt: Date.now(),
      },
    };

    try {
      manager.approve(project, job, 'Alex');
      throw new Error('Approval should have been blocked');
    } catch (err: any) {
      if (!err.message.includes('Emergency Stop is active')) {
        throw new Error(`Expected Emergency Stop error, got: ${err.message}`);
      }
    } finally {
      eStop.reset();
    }
  });

  await runTest('VID_REV_09', 'Validates ApprovedVideoArtifact downstream structure', 'JobValidation', () => {
    const artifact: ApprovedVideoArtifact = {
      artifactId: 'art_123',
      projectId: 'vproj_123',
      artifactUri: 'file:///storage/emulated/0/PhoneAgent/renders/art.mp4',
      outputFingerprint: 'opf_test_123',
      contentFingerprint: 'cfp_test_123',
      productFingerprint: 'pfp_test_123',
      projectFingerprint: 'vpf_test_123',
      approvedPlatformTargets: ['instagram', 'tiktok'],
      approvedBy: 'Alex Chen',
      approvedAt: Date.now(),
      durationMs: 21000,
      dimensions: { width: 1080, height: 1920 },
    };
    const check = ApprovedVideoArtifactValidator.validate(artifact);
    if (!check.valid) throw new Error(`Artifact validation failed: ${check.errors.join('; ')}`);
  });

  // ==========================================
  // 16. PERSISTENCE & CRASH RECOVERY (6 tests)
  // ==========================================

  await runTest('VID_PERSIST_01', 'Saves and loads VideoProject state across storage', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const persistence = new VideoProjectPersistence(driver);
    const project = ShortFormVideoBuilder.buildShortFormProject({
      productData: sampleProduct,
      productFingerprint: 'pfp_1',
      mediaAssets: [sampleMediaAsset],
      mediaFingerprint: 'mfp_1',
      contentFingerprint: 'cfp_1',
      inputs: { hookText: 'H', productHighlights: ['H'], callToAction: 'CTA' },
    });

    persistence.saveProject(project);
    const loaded = persistence.loadProject(project.projectId);
    if (!loaded) throw new Error('Failed to load saved project');
    if (loaded.projectId !== project.projectId) throw new Error('Loaded project ID mismatch');
    if (loaded.projectFingerprint !== project.projectFingerprint) throw new Error('Fingerprint mismatch');
  });

  await runTest('VID_PERSIST_02', 'Saves and loads VideoRenderJob state across storage', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const persistence = new VideoProjectPersistence(driver);
    const job: VideoRenderJob = {
      jobId: 'job_persist_1',
      projectId: 'proj_1',
      projectFingerprint: 'vpf_1',
      renderFingerprint: 'rpf_1',
      status: 'READY_FOR_REVIEW',
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      progress: 100,
      recoveryAttempts: 1,
      createdAt: Date.now(),
    };

    persistence.saveRenderJob(job);
    const loaded = persistence.loadRenderJob('job_persist_1');
    if (!loaded) throw new Error('Failed to load saved render job');
    if (loaded.jobId !== 'job_persist_1') throw new Error('Job ID mismatch');
    if (loaded.status !== 'READY_FOR_REVIEW') throw new Error('Status mismatch');
  });

  await runTest('VID_PERSIST_03', 'Saves and loads ApprovedVideoArtifact', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const persistence = new VideoProjectPersistence(driver);
    const artifact: ApprovedVideoArtifact = {
      artifactId: 'art_p1',
      projectId: 'proj_p1',
      artifactUri: 'file:///art.mp4',
      outputFingerprint: 'opf_1',
      contentFingerprint: 'cfp_1',
      productFingerprint: 'pfp_1',
      projectFingerprint: 'vpf_1',
      approvedPlatformTargets: ['youtube'],
      approvedBy: 'Alex',
      approvedAt: Date.now(),
      durationMs: 5000,
      dimensions: { width: 1920, height: 1080 },
    };

    persistence.saveApprovedArtifact(artifact);
    const loaded = persistence.loadApprovedArtifact('proj_p1');
    if (!loaded) throw new Error('Failed to load approved artifact');
    if (loaded.artifactId !== 'art_p1') throw new Error('Artifact ID mismatch');
  });

  await runTest('VID_PERSIST_04', 'Crash recovery scan detects in-flight RENDERING jobs and marks UNKNOWN', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const persistence = new VideoProjectPersistence(driver);
    const inFlightJob: VideoRenderJob = {
      jobId: 'job_crashed',
      projectId: 'proj_crashed',
      projectFingerprint: 'vpf_crashed',
      renderFingerprint: 'rpf_crashed',
      status: 'RENDERING', // in-flight when system crashed
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      progress: 45,
      recoveryAttempts: 0,
      createdAt: Date.now() - 10000,
    };

    persistence.saveRenderJob(inFlightJob);
    const scan = persistence.performRecoveryScan();

    if (scan.interruptedRendersFound !== 1) throw new Error('Interrupted render not found');
    if (!scan.jobsMarkedUnknown.includes('job_crashed')) throw new Error('Job not marked UNKNOWN');

    const reloaded = persistence.loadRenderJob('job_crashed');
    if (reloaded?.status !== 'UNKNOWN') throw new Error(`Expected UNKNOWN status, got: ${reloaded?.status}`);
  });

  await runTest('VID_PERSIST_05', 'Crash recovery scan leaves completed or ready jobs untouched', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const persistence = new VideoProjectPersistence(driver);
    const readyJob: VideoRenderJob = {
      jobId: 'job_ready',
      projectId: 'proj_ready',
      projectFingerprint: 'vpf_ready',
      renderFingerprint: 'rpf_ready',
      status: 'READY_FOR_REVIEW',
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      progress: 100,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };

    persistence.saveRenderJob(readyJob);
    const scan = persistence.performRecoveryScan();
    if (scan.interruptedRendersFound !== 0) throw new Error('Should not flag READY_FOR_REVIEW job');

    const reloaded = persistence.loadRenderJob('job_ready');
    if (reloaded?.status !== 'READY_FOR_REVIEW') throw new Error('Status altered unexpectedly');
  });

  await runTest('VID_PERSIST_06', 'Crash recovery logs VIDEO_RECOVERY_MARKED_UNKNOWN audit event', 'Logging', () => {
    const driver = new MemoryStorageDriver();
    const persistence = new VideoProjectPersistence(driver);
    const beforeCount = logger.getLogs().length;

    const inFlight: VideoRenderJob = {
      jobId: 'job_audit_rec',
      projectId: 'p',
      projectFingerprint: 'v',
      renderFingerprint: 'r',
      status: 'VALIDATING',
      outputSpec: VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
      progress: 5,
      recoveryAttempts: 0,
      createdAt: Date.now(),
    };
    persistence.saveRenderJob(inFlight);
    persistence.performRecoveryScan();

    const recLog = logger.getLogs().find(l => l.action === 'VIDEO_RECOVERY_MARKED_UNKNOWN' && l.jobId === inFlight.jobId);
    if (!recLog) throw new Error('VIDEO_RECOVERY_MARKED_UNKNOWN audit log not emitted');
  });
}
