/**
 * Phone Agent - Step 2J Content & Media Pipeline + Human Review System Unit Tests
 * 62 comprehensive tests covering media validation, claim detection, normalizer,
 * platform profiles, overrides, state machine, fingerprints, human approvals,
 * duplicate detection, persistence recovery, and end-to-end pipeline execution.
 */

import {
  ContentPackage,
  MediaAsset,
  ProductData,
  createDefaultContentPackage,
} from '../content/ContentPackage';
import { MediaValidator } from '../content/MediaValidator';
import { ContentClaimValidator } from '../content/ContentClaimValidator';
import { ContentNormalizer } from '../content/ContentNormalizer';
import { PlatformContentProfileCalculator } from '../content/PlatformContentProfile';
import {
  computeDeterministicContentFingerprint,
  computeMediaFingerprint,
  computeMediaCollectionFingerprint,
  computePlatformOverrideFingerprint,
  sha256,
} from '../content/ContentFingerprint';
import { MediaFingerprintIndex } from '../content/MediaFingerprintIndex';
import {
  ContentPipelineStateMachine,
  ContentPipelineTransitionError,
} from '../content/ContentPipelineStateMachine';
import { ContentReviewManager } from '../content/ContentReviewManager';
import { AdapterRegistry } from '../AdapterRegistry';
import { MultiPlatformPlanner, MultiPlatformJobExecutor } from '../MultiPlatformPlanner';
import { PersistentJobStore, MemoryStorageDriver } from '../PersistentJobStore';
import { PublicationGuard } from '../fingerprint';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';
import { TestResult } from './unitTests';

export async function runContentPipelineTests(
  runTest: (
    id: string,
    name: string,
    category: TestResult['category'],
    fn: () => Promise<void> | void
  ) => Promise<void>
): Promise<void> {
  const mediaValidator = MediaValidator.getInstance();
  const claimValidator = ContentClaimValidator.getInstance();
  const normalizer = ContentNormalizer.getInstance();
  const profileCalc = new PlatformContentProfileCalculator();
  const stateMachine = ContentPipelineStateMachine.getInstance();
  const reviewManager = ContentReviewManager.getInstance();

  const dummySha = sha256('dummy_test_media_content_bytes_12345');

  const validImage: MediaAsset = {
    assetId: 'asset_img_1',
    localUri: 'content://media/external/images/media/1001',
    mimeType: 'image/jpeg',
    mediaType: 'IMAGE',
    sizeBytes: 2 * 1024 * 1024,
    width: 1080,
    height: 1080,
    sha256: dummySha,
    createdAt: Date.now(),
  };

  const validVideo: MediaAsset = {
    assetId: 'asset_vid_1',
    localUri: 'file:///storage/emulated/0/DCIM/Camera/VID_20260909_001.mp4',
    mimeType: 'video/mp4',
    mediaType: 'VIDEO',
    sizeBytes: 15 * 1024 * 1024,
    width: 1080,
    height: 1920,
    durationMs: 30000,
    sha256: sha256('dummy_video_bytes_67890'),
    createdAt: Date.now(),
  };

  // Test 1: valid image
  await runTest('test_media_1', 'Valid image media asset validation', 'JobValidation', () => {
    const res = mediaValidator.validateMediaAsset(validImage);
    if (!res.valid) throw new Error(`Expected valid image, got errors: ${res.errors.map(e => e.message).join('; ')}`);
  });

  // Test 2: valid video
  await runTest('test_media_2', 'Valid video media asset validation', 'JobValidation', () => {
    const res = mediaValidator.validateMediaAsset(validVideo);
    if (!res.valid) throw new Error(`Expected valid video, got errors: ${res.errors.map(e => e.message).join('; ')}`);
  });

  // Test 3: invalid URI scheme
  await runTest('test_media_3', 'Invalid URI scheme rejection (ftp, unknown)', 'JobValidation', () => {
    const res = mediaValidator.validateUriScheme('ftp://server.local/media.mp4');
    if (res.valid) throw new Error('Expected ftp URI to be rejected');
    if (res.error?.code !== 'INVALID_URI') throw new Error(`Expected code INVALID_URI, got: ${res.error?.code}`);
  });

  // Test 4: remote URI rejection (http/https zero remote download)
  await runTest('test_media_4', 'Remote http/https URI strict rejection', 'JobValidation', () => {
    const httpRes = mediaValidator.validateUriScheme('http://example.com/asset.jpg');
    const httpsRes = mediaValidator.validateUriScheme('https://cdn.photos.com/video.mp4');
    if (httpRes.valid || httpsRes.valid) throw new Error('Remote HTTP/HTTPS URIs must be strictly rejected');
    if (httpRes.error?.code !== 'INVALID_URI') throw new Error('Expected code INVALID_URI');
  });

  // Test 5: unsupported MIME
  await runTest('test_media_5', 'Unsupported MIME type rejection', 'JobValidation', () => {
    const res = mediaValidator.validateMimeConsistency('content://media/file.pdf', 'application/pdf', 'IMAGE');
    if (res.valid) throw new Error('Expected application/pdf to be rejected');
    if (!res.errors.some(e => e.code === 'UNSUPPORTED_MEDIA')) throw new Error('Expected UNSUPPORTED_MEDIA error');
  });

  // Test 6: missing file / zero size
  await runTest('test_media_6', 'Zero size media rejection', 'JobValidation', () => {
    const res = mediaValidator.validateFileSize('IMAGE', 0);
    if (res.valid) throw new Error('Zero size must be rejected');
    if (!res.errors.some(e => e.code === 'FILE_NOT_READABLE')) throw new Error('Expected FILE_NOT_READABLE');
  });

  // Test 7: unreadable file / negative size
  await runTest('test_media_7', 'Negative size media rejection', 'JobValidation', () => {
    const res = mediaValidator.validateFileSize('VIDEO', -100);
    if (res.valid) throw new Error('Negative size must be rejected');
    if (!res.errors.some(e => e.code === 'FILE_NOT_READABLE')) throw new Error('Expected FILE_NOT_READABLE');
  });

  // Test 8: invalid dimensions
  await runTest('test_media_8', 'Invalid and non-positive dimensions rejection', 'JobValidation', () => {
    const res = mediaValidator.validateDimensions(0, 500);
    const resSmall = mediaValidator.validateDimensions(50, 50);
    if (res.valid || resSmall.valid) throw new Error('Invalid dimensions must be rejected');
    if (!res.errors.some(e => e.code === 'INVALID_DIMENSIONS')) throw new Error('Expected INVALID_DIMENSIONS');
  });

  // Test 9: invalid duration
  await runTest('test_media_9', 'Invalid video duration rejection (0, negative, >60min)', 'JobValidation', () => {
    const resZero = mediaValidator.validateDuration('VIDEO', 0);
    const resNegative = mediaValidator.validateDuration('VIDEO', -500);
    const resHuge = mediaValidator.validateDuration('VIDEO', 7200 * 1000);
    if (resZero.valid || resNegative.valid || resHuge.valid) throw new Error('Invalid duration must be rejected');
  });

  // Test 10: file fingerprint
  await runTest('test_media_10', 'SHA-256 fingerprint format validation', 'JobValidation', () => {
    const validRes = mediaValidator.validateFingerprint(dummySha);
    const invalidRes = mediaValidator.validateFingerprint('not_a_valid_sha256');
    if (!validRes.valid) throw new Error('Valid 64-char sha256 should pass');
    if (invalidRes.valid) throw new Error('Invalid sha256 must fail');
    if (!invalidRes.errors.some(e => e.code === 'FINGERPRINT_FAILED')) throw new Error('Expected FINGERPRINT_FAILED');
  });

  // Test 11: deterministic content fingerprint
  await runTest('test_fp_11', 'Deterministic cryptographic content fingerprint computation', 'JobValidation', () => {
    const pkg1 = createDefaultContentPackage({
      baseCaption: 'Hello world! Check out our new smart lamp.',
      hashtags: ['#home', '#lighting', '#tech'],
      callToAction: 'https://example.com/lamp',
      selectedPlatforms: ['instagram', 'threads'],
    });
    const fp1 = computeDeterministicContentFingerprint(pkg1);
    const fp2 = computeDeterministicContentFingerprint({
      ...pkg1,
      hashtags: ['#lighting', '#tech', '#home'], // different order
    });
    if (!fp1.startsWith('cfp_')) throw new Error('Content fingerprint must start with cfp_');
    if (fp1 !== fp2) throw new Error('Sorted hashtags must produce deterministic identical content fingerprint');
  });

  // Test 12: hashtag normalization
  await runTest('test_norm_12', 'Hashtag normalization with special characters', 'JobValidation', () => {
    const h1 = normalizer.normalizeHashtag('smart_lamp!');
    const h2 = normalizer.normalizeHashtag('###cleanCode');
    if (h1 !== '#smart_lamp') throw new Error(`Expected #smart_lamp, got ${h1}`);
    if (h2 !== '#cleanCode') throw new Error(`Expected #cleanCode, got ${h2}`);
  });

  // Test 13: hashtag deduplication
  await runTest('test_norm_13', 'Case-insensitive hashtag deduplication', 'JobValidation', () => {
    const tags = ['#Gadget', '#tech', '#GADGET', '#Tech', '#smartHome'];
    const deduped = normalizer.deduplicateHashtags(tags);
    if (deduped.length !== 3) throw new Error(`Expected 3 deduped tags, got ${deduped.length}`);
    if (deduped[0] !== '#Gadget' || deduped[1] !== '#tech' || deduped[2] !== '#smartHome') {
      throw new Error(`Unexpected deduped tags: ${JSON.stringify(deduped)}`);
    }
  });

  // Test 14: Unicode preservation
  await runTest('test_norm_14', 'Unicode and emoji preservation intact', 'JobValidation', () => {
    const original = '✨ Amazing café décor 🚀 世界に一つだけ ☕️';
    const normalized = normalizer.normalizeWhitespace(original);
    if (normalized !== original) throw new Error(`Unicode/emoji altered! Expected "${original}", got "${normalized}"`);
  });

  // Test 15: CTA normalization
  await runTest('test_norm_15', 'CTA normalization with product and affiliate links', 'JobValidation', () => {
    const product: ProductData = {
      productName: 'Desk Lamp',
      productUrl: 'https://example.com/item/123',
      affiliateLink: 'https://amzn.to/affiliate_123',
      source: 'AMAZON',
      sourceTimestamp: Date.now(),
    };
    const cta = normalizer.normalizeCta('', product);
    if (!cta.includes('https://amzn.to/affiliate_123')) {
      throw new Error(`CTA should prefer affiliateLink, got: ${cta}`);
    }
  });

  // Test 16: incomplete product data
  await runTest('test_norm_16', 'Incomplete product data triggers NEEDS_REVIEW', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Reviewing this item',
      productData: {
        productName: '', // empty name
        productUrl: '',
        source: 'AMAZON',
        sourceTimestamp: Date.now(),
      },
    });
    const { validationResult } = normalizer.normalize(pkg);
    if (validationResult.valid && !validationResult.needsReview) {
      throw new Error('Incomplete product data must trigger needsReview');
    }
  });

  // Test 17: Amazon source isolation
  await runTest('test_amazon_17', 'Amazon product link source isolation', 'JobValidation', () => {
    const profile = profileCalc.getProfile('amazon');
    if (profile.supportsVideo || profile.supportsImage) {
      throw new Error('Amazon must not support publishing media');
    }
    if (!profile.unsupportedFields.includes('publish') || !profile.unsupportedFields.includes('checkout')) {
      throw new Error('Amazon profile must declare publishing and checkout as unsupported');
    }
  });

  // Test 18: purchase prohibition
  await runTest('test_amazon_18', 'Purchase and checkout prohibition on Amazon', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Buy now!',
      selectedPlatforms: ['amazon'] as any,
    });
    let threw = false;
    try {
      profileCalc.projectForPlatform(pkg, 'amazon');
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Attempting to project content for Amazon publishing must throw error');
  });

  // Test 19: unsupported platform capability
  await runTest('test_platform_19', 'Unsupported platform capability detection (e.g. Threads title)', 'JobValidation', () => {
    const profile = profileCalc.getProfile('threads');
    if (profile.supportsTitle) throw new Error('Threads does not support title');
    if (!profile.unsupportedFields.includes('title')) throw new Error('Title must be in unsupported fields for Threads');
  });

  // Test 20: platform normalization
  await runTest('test_platform_20', 'Platform normalization strips unsupported fields deterministically', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Threads post content',
      title: 'Should be omitted on Threads',
      description: 'Threads description',
      hashtags: ['#threads', '#social'],
      mediaAssets: [validImage],
      selectedPlatforms: ['threads'],
    });
    const { payload, unsupportedOmissions } = profileCalc.projectForPlatform(pkg, 'threads');
    if (payload.title !== undefined) throw new Error('Title should be undefined on Threads');
    if (!unsupportedOmissions.includes('title')) throw new Error('Title should be recorded in unsupported omissions');
  });

  // Test 21: platform override
  await runTest('test_override_21', 'Platform override applied to payload', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Generic caption',
      selectedPlatforms: ['x'],
      platformOverrides: {
        x: {
          platform: 'x',
          caption: 'Custom X short post! 🐦',
          hashtags: ['#XDev'],
        },
      },
    });
    const { payload } = profileCalc.projectForPlatform(pkg, 'x');
    if (!payload.text?.includes('Custom X short post!')) {
      throw new Error(`Override caption not applied, got: ${payload.text}`);
    }
  });

  // Test 22: override fingerprint
  await runTest('test_override_22', 'Platform override cryptographic fingerprint computation', 'JobValidation', () => {
    const o1 = { platform: 'instagram' as const, caption: 'Reel caption', hashtags: ['#viral'] };
    const fp1 = computePlatformOverrideFingerprint(o1);
    const fp2 = computePlatformOverrideFingerprint(o1);
    if (!fp1.startsWith('ofp_')) throw new Error('Override fingerprint must start with ofp_');
    if (fp1 !== fp2) throw new Error('Override fingerprint must be deterministic');
  });

  // Test 23: override approval invalidation
  await runTest('test_appr_23', 'Platform override modification invalidates approval', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
      platformOverrides: {
        threads: { platform: 'threads', caption: 'Original override' },
      },
    });
    const approved = reviewManager.approveJob(pkg, 'session_1', 'Operator');
    if (approved.approvalState !== 'APPROVED') throw new Error('Job should be approved');

    // Modify override
    const modifiedPkg: ContentPackage = {
      ...approved,
      platformOverrides: {
        threads: { platform: 'threads', caption: 'Modified override!' },
      },
    };
    const check = reviewManager.checkApprovalValidity(modifiedPkg);
    if (check.isValid) throw new Error('Approval must become invalid after override modification');
  });

  // Test 24: content modification invalidates approval
  await runTest('test_appr_24', 'Base caption edit invalidates approval', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_2', 'Operator');
    const modified: ContentPackage = { ...approved, baseCaption: 'Edited caption!' };
    const check = reviewManager.checkApprovalValidity(modified);
    if (check.isValid) throw new Error('Approval must be invalid after caption change');
  });

  // Test 25: media modification invalidates approval
  await runTest('test_appr_25', 'Media swap invalidates approval', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_3', 'Operator');
    const modified: ContentPackage = { ...approved, mediaAssets: [validVideo] };
    const check = reviewManager.checkApprovalValidity(modified);
    if (check.isValid) throw new Error('Approval must be invalid after media asset swap');
  });

  // Test 26: platform selection modification invalidates approval
  await runTest('test_appr_26', 'Platform selection change invalidates approval', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_4', 'Operator');
    const modified: ContentPackage = { ...approved, selectedPlatforms: ['threads', 'instagram'] };
    const check = reviewManager.checkApprovalValidity(modified);
    if (check.isValid) throw new Error('Approval must be invalid after changing selected platforms');
  });

  // Test 27: stale approval rejection
  await runTest('test_appr_27', 'Stale approval execution rejection by planner', 'JobValidation', () => {
    const planner = new MultiPlatformPlanner();
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_5', 'Operator');
    const stale: ContentPackage = {
      ...approved,
      baseCaption: 'Silently modified!',
      reviewState: 'STALE_APPROVAL',
      approvalState: 'STALE',
    };
    let threw = false;
    try {
      planner.planContentPackage(stale);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Planning stale content package must throw error');
  });

  // Test 28: explicit approval
  await runTest('test_appr_28', 'Approval requires explicit human session and operator identification', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    let threw = false;
    try {
      reviewManager.approveJob(pkg, '', 'Operator'); // empty session
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Empty approval session ID must be rejected');
  });

  // Test 29: approval fingerprint matching
  await runTest('test_appr_29', 'Approval fingerprint matching passes validation check', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_6', 'Operator');
    const validity = reviewManager.checkApprovalValidity(approved);
    if (!validity.isValid) throw new Error(`Expected valid approval, got: ${validity.reason}`);
  });

  // Test 30: wrong fingerprint rejection
  await runTest('test_appr_30', 'Wrong fingerprint rejection in approval record', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_7', 'Operator');
    // Tamper with approval record fingerprint
    approved.currentApproval!.contentFingerprint = 'cfp_tampered_00000000000000';
    const validity = reviewManager.checkApprovalValidity(approved);
    if (validity.isValid) throw new Error('Tampered fingerprint must be rejected');
  });

  // Test 31: claim detection - general
  await runTest('test_claim_31', 'Scan text for prohibited or exaggerated claims', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'This phone is okay and looks fine.' },
    ]);
    if (warnings.length !== 0) throw new Error('Normal text should not flag claims');
  });

  // Test 32: medical claim detection
  await runTest('test_claim_32', 'Medical claim detection (permanently cures acne)', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'Our revolutionary cream permanently cures acne within 24 hours!' },
    ]);
    if (!warnings.some(w => w.category === 'MEDICAL_CLAIM' && w.severity === 'BLOCK')) {
      throw new Error('Expected blocking MEDICAL_CLAIM warning');
    }
  });

  // Test 33: guarantee claim detection
  await runTest('test_claim_33', 'Guaranteed result claim detection (100% guaranteed results)', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'Experience 100% guaranteed results with zero effort.' },
    ]);
    if (!warnings.some(w => w.category === 'GUARANTEED_RESULT')) {
      throw new Error('Expected GUARANTEED_RESULT warning');
    }
  });

  // Test 34: fabricated certification detection
  await runTest('test_claim_34', 'Unsupported certification detection (government certified)', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'This gadget is government certified by the authorities.' },
    ]);
    if (!warnings.some(w => w.category === 'UNSUPPORTED_CERTIFICATION')) {
      throw new Error('Expected UNSUPPORTED_CERTIFICATION warning');
    }
  });

  // Test 35: fabricated scarcity detection
  await runTest('test_claim_35', 'Fabricated scarcity detection (only 2 left)', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'Hurry, only 2 left in stock before gone!' },
    ]);
    if (!warnings.some(w => w.category === 'FABRICATED_SCARCITY')) {
      throw new Error('Expected FABRICATED_SCARCITY warning');
    }
  });

  // Test 36: fabricated testimonial detection
  await runTest('test_claim_36', 'Fabricated testimonial detection', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'John from New York says it changed his life forever!' },
    ]);
    if (!warnings.some(w => w.category === 'FABRICATED_TESTIMONIAL')) {
      throw new Error('Expected FABRICATED_TESTIMONIAL warning');
    }
  });

  // Test 37: duplicate media
  await runTest('test_media_37', 'Duplicate media detection within same package', 'JobValidation', () => {
    const index = new MediaFingerprintIndex();
    const warnings = index.checkForDuplicates({
      mediaAssets: [validImage, { ...validImage, assetId: 'asset_img_duplicate' }],
      jobId: 'job_dup_1',
      contentFingerprint: 'cfp_123',
    });
    if (!warnings.some(w => w.type === 'DUPLICATE_MEDIA')) {
      throw new Error('Expected DUPLICATE_MEDIA warning for identical SHA256 in same job');
    }
  });

  // Test 38: duplicate publication candidate
  await runTest('test_media_38', 'Duplicate publication candidate detection via PublicationGuard', 'JobValidation', () => {
    const guard = PublicationGuard.getInstance();
    guard.recordPublication('job_prev_1', 'threads', 'cfp_test_match');

    const index = new MediaFingerprintIndex(guard);
    const warnings = index.checkForDuplicates({
      mediaAssets: [validImage],
      jobId: 'job_prev_1',
      contentFingerprint: 'cfp_test_match',
      platforms: ['threads'],
    });
    if (!warnings.some(w => w.type === 'DUPLICATE_PUBLICATION_CANDIDATE')) {
      throw new Error('Expected DUPLICATE_PUBLICATION_CANDIDATE warning');
    }
  });

  // Test 39: persistent content package
  await runTest('test_persist_39', 'PersistentJobStore creates and persists job from ContentPackage', 'Persistence', () => {
    const store = new PersistentJobStore(new MemoryStorageDriver());
    const pkg = createDefaultContentPackage({
      contentId: 'pkg_persist_1',
      baseCaption: 'Persistence verified caption',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_persist', 'Operator');
    const job = store.createJobFromContentPackage(approved);

    if (job.contentPackageId !== 'pkg_persist_1') throw new Error('Package ID not preserved');
    if (job.contentFingerprint !== approved.contentFingerprint) throw new Error('Content fingerprint not preserved');
    if (job.approvalRecord?.approvalState !== 'APPROVED') throw new Error('Approval record not preserved');
  });

  // Test 40: crash recovery
  await runTest('test_persist_40', 'Crash recovery preserves ContentPackage metadata and fingerprints', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const store1 = new PersistentJobStore(driver);
    const pkg = createDefaultContentPackage({
      contentId: 'pkg_crash_1',
      baseCaption: 'Crash recovery test',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_crash', 'Operator');
    store1.createJobFromContentPackage(approved, { jobId: 'job_crash_100' });

    // Simulate crash restart with fresh store instance
    const store2 = new PersistentJobStore(driver);
    const recovered = store2.getJob('job_crash_100');
    if (!recovered) throw new Error('Job not found after crash recovery');
    if (recovered.contentPackageId !== 'pkg_crash_1') throw new Error('contentPackageId lost in recovery');
    if (recovered.contentFingerprint !== approved.contentFingerprint) throw new Error('Fingerprint lost in recovery');
  });

  // Test 41: recovery approval preservation
  await runTest('test_persist_41', 'Approval validity and session preserved across recovery', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const store1 = new PersistentJobStore(driver);
    const pkg = createDefaultContentPackage({
      contentId: 'pkg_appr_pres_1',
      baseCaption: 'Approval preservation test',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_exact_99', 'Supervisor');
    store1.createJobFromContentPackage(approved, { jobId: 'job_rec_appr' });

    const store2 = new PersistentJobStore(driver);
    const recovered = store2.getJob('job_rec_appr');
    if (recovered?.approvalRecord?.approvalSessionId !== 'session_exact_99') {
      throw new Error(`Expected session_exact_99, got: ${recovered?.approvalRecord?.approvalSessionId}`);
    }
  });

  // Test 42: no automatic reapproval
  await runTest('test_appr_42', 'No automatic reapproval on content alteration', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_8', 'Operator');
    const modified: ContentPackage = { ...approved, baseCaption: 'Altered caption' };
    const rechecked = reviewManager.checkAndInvalidateIfModified(modified);

    if (rechecked.approvalState === 'APPROVED' || rechecked.reviewState === 'APPROVED') {
      throw new Error('Altered package must NOT remain APPROVED');
    }
    if (rechecked.approvalState !== 'STALE' || rechecked.reviewState !== 'STALE_APPROVAL') {
      throw new Error(`Expected STALE / STALE_APPROVAL, got: ${rechecked.approvalState}`);
    }
  });

  // Test 43: no automatic publishing
  await runTest('test_appr_43', 'Publishing requires explicit approved execution plan', 'Orchestration', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Unapproved draft',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const planner = new MultiPlatformPlanner();
    let threw = false;
    try {
      planner.planContentPackage(pkg);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Unapproved package must be rejected from planning');
  });

  // Test 44: invalid state transition in pipeline state machine
  await runTest('test_sm_44', 'Pipeline state machine rejects illegal transition (VALIDATING -> EXECUTING)', 'StateMachine', () => {
    let threw = false;
    try {
      stateMachine.validateTransition('VALIDATING', 'EXECUTING');
    } catch (err) {
      threw = err instanceof ContentPipelineTransitionError;
    }
    if (!threw) throw new Error('VALIDATING -> EXECUTING must be blocked');
  });

  // Test 45: DRAFT execution rejection
  await runTest('test_sm_45', 'DRAFT -> EXECUTING direct transition strictly forbidden', 'StateMachine', () => {
    let threw = false;
    try {
      stateMachine.validateTransition('DRAFT', 'EXECUTING');
    } catch (err) {
      threw = err instanceof ContentPipelineTransitionError;
    }
    if (!threw) throw new Error('DRAFT -> EXECUTING must throw ContentPipelineTransitionError');
  });

  // Test 46: NEEDS_REVIEW execution rejection
  await runTest('test_sm_46', 'NEEDS_REVIEW -> EXECUTING direct transition strictly forbidden', 'StateMachine', () => {
    let threw = false;
    try {
      stateMachine.validateTransition('NEEDS_REVIEW', 'EXECUTING');
    } catch (err) {
      threw = err instanceof ContentPipelineTransitionError;
    }
    if (!threw) throw new Error('NEEDS_REVIEW -> EXECUTING must throw ContentPipelineTransitionError');
  });

  // Test 47: REJECTED execution rejection
  await runTest('test_sm_47', 'REJECTED -> EXECUTING direct transition strictly forbidden', 'StateMachine', () => {
    let threw = false;
    try {
      stateMachine.validateTransition('REJECTED', 'EXECUTING');
    } catch (err) {
      threw = err instanceof ContentPipelineTransitionError;
    }
    if (!threw) throw new Error('REJECTED -> EXECUTING must throw ContentPipelineTransitionError');
  });

  // Test 48: Amazon publishing destination rejection
  await runTest('test_amazon_48', 'Amazon publishing destination strictly rejected in planner', 'Orchestration', () => {
    const planner = new MultiPlatformPlanner();
    const pkg = createDefaultContentPackage({
      baseCaption: 'Approved text',
      selectedPlatforms: ['amazon'] as any,
      mediaAssets: [validImage],
      reviewState: 'APPROVED',
      approvalState: 'APPROVED',
    });
    let threw = false;
    try {
      planner.planContentPackage(pkg);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Amazon in selectedPlatforms must be rejected');
  });

  // Test 49: EmergencyStop integration during pipeline execution
  await runTest('test_emg_49', 'EmergencyStop halts multi-platform executor during pipeline execution', 'EmergencyStop', async () => {
    const reg = AdapterRegistry.createDefaultRegistry();
    const planner = new MultiPlatformPlanner(reg);
    const executor = new MultiPlatformJobExecutor(reg);

    const pkg = createDefaultContentPackage({
      baseCaption: 'Halt test',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_emg', 'Operator');
    const plan = planner.planContentPackage(approved);

    EmergencyStopManager.getInstance().trigger('Safety tripwire test');
    const result = await executor.executePlan(plan);
    if (result.success) throw new Error('Execution should have failed under Emergency Stop');
    if (!result.stoppedReason?.includes('Safety tripwire test')) {
      throw new Error(`Expected stop reason, got: ${result.stoppedReason}`);
    }
    EmergencyStopManager.getInstance().reset();
  });

  // Test 50: full content -> review -> approval -> planner -> executor integration
  await runTest('test_e2e_50', 'End-to-end ContentPackage -> Review -> Approval -> Plan -> Execution', 'Orchestration', async () => {
    const reg = AdapterRegistry.createDefaultRegistry();
    const planner = new MultiPlatformPlanner(reg);
    const executor = new MultiPlatformJobExecutor(reg);

    const pkg = createDefaultContentPackage({
      contentId: 'pkg_e2e_full',
      baseCaption: 'Full integration test caption! 🚀',
      hashtags: ['#android', '#integration'],
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });

    // 1. Validate
    const { pkg: validatedPkg, validationResult } = reviewManager.validate(pkg);
    if (!validationResult.valid) throw new Error(`Validation failed: ${validationResult.errors.join('; ')}`);

    // 2. Explicit Approval
    const approvedPkg = reviewManager.approveJob(validatedPkg, 'session_e2e_100', 'LeadOperator');
    if (approvedPkg.approvalState !== 'APPROVED') throw new Error('Approval failed');

    // 3. Plan
    const plan = planner.planContentPackage(approvedPkg);
    if (plan.steps.length !== 1) throw new Error(`Expected 1 step, got ${plan.steps.length}`);
    if (plan.steps[0].platform !== 'threads') throw new Error(`Expected threads, got ${plan.steps[0].platform}`);

    // 4. Execute with human approval provider
    const result = await executor.executePlan(plan, {
      approvalProvider: async () => true,
    });
    if (!result.success) throw new Error(`Execution failed: ${result.stoppedReason || result.steps[0]?.error}`);
    if (result.steps[0]?.status !== 'PUBLISHED') throw new Error(`Step status should be PUBLISHED, got: ${result.steps[0]?.status}`);
  });

  // Test 51: Fabricated earnings claim detection
  await runTest('test_claim_51', 'Guaranteed earnings claim detection (make $1000/day guaranteed)', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'Make $1,000/day guaranteed using this secret method!' },
    ]);
    if (!warnings.some(w => w.category === 'GUARANTEED_EARNINGS' && w.severity === 'BLOCK')) {
      throw new Error('Expected blocking GUARANTEED_EARNINGS warning');
    }
  });

  // Test 52: Fabricated rating claim detection
  await runTest('test_claim_52', 'Fabricated rating claim detection (rated 5.0 by millions)', 'JobValidation', () => {
    const warnings = claimValidator.scanClaims([
      { location: 'caption', text: 'Rated 5.0 by millions of users everywhere.' },
    ]);
    if (!warnings.some(w => w.category === 'FABRICATED_RATING')) {
      throw new Error('Expected FABRICATED_RATING warning');
    }
  });

  // Test 53: Whitespace normalization
  await runTest('test_norm_53', 'Collapse multiple spaces and excessive newlines', 'JobValidation', () => {
    const raw = 'Hello    world!\n\n\n\n\nHow   are you?  ';
    const clean = normalizer.normalizeWhitespace(raw);
    if (clean !== 'Hello world!\n\nHow are you?') {
      throw new Error(`Unexpected whitespace clean output: ${JSON.stringify(clean)}`);
    }
  });

  // Test 54: Hashtags in text not duplicated in trailing list
  await runTest('test_norm_54', 'Hashtags present in text are omitted from trailing list', 'JobValidation', () => {
    const caption = 'Check out this #cool product!';
    const tags = ['#cool', '#gadget'];
    const filtered = normalizer.filterHashtagsAlreadyInText(caption, tags);
    if (filtered.length !== 1 || filtered[0] !== '#gadget') {
      throw new Error(`Expected only #gadget, got: ${JSON.stringify(filtered)}`);
    }
  });

  // Test 55: Multiple media assets collection fingerprint calculation
  await runTest('test_fp_55', 'Multiple media assets collection fingerprint calculation', 'JobValidation', () => {
    const mfp = computeMediaCollectionFingerprint([validImage, validVideo]);
    if (!mfp.startsWith('mfp_coll_')) throw new Error('Collection fingerprint must start with mfp_coll_');
  });

  // Test 56: Media size limit exceeded for image (>50MB)
  await runTest('test_media_56', 'Image size > 50MB rejected with SIZE_LIMIT_EXCEEDED', 'JobValidation', () => {
    const res = mediaValidator.validateFileSize('IMAGE', 55 * 1024 * 1024);
    if (res.valid) throw new Error('55MB image must be rejected');
    if (!res.errors.some(e => e.code === 'SIZE_LIMIT_EXCEEDED')) throw new Error('Expected SIZE_LIMIT_EXCEEDED');
  });

  // Test 57: Media size limit exceeded for video (>500MB)
  await runTest('test_media_57', 'Video size > 500MB rejected with SIZE_LIMIT_EXCEEDED', 'JobValidation', () => {
    const res = mediaValidator.validateFileSize('VIDEO', 550 * 1024 * 1024);
    if (res.valid) throw new Error('550MB video must be rejected');
    if (!res.errors.some(e => e.code === 'SIZE_LIMIT_EXCEEDED')) throw new Error('Expected SIZE_LIMIT_EXCEEDED');
  });

  // Test 58: Extension and MIME type mismatch rejection
  await runTest('test_media_58', 'Extension .mp4 with image/jpeg rejected as mismatch', 'JobValidation', () => {
    const res = mediaValidator.validateMimeConsistency('content://path/video.mp4', 'image/jpeg', 'IMAGE');
    if (res.valid) throw new Error('Extension mismatch must be flagged');
  });

  // Test 59: Approved local path validation
  await runTest('test_media_59', 'Approved local storage path /storage/emulated/0/... accepted', 'JobValidation', () => {
    const res = mediaValidator.validateUriScheme('/storage/emulated/0/DCIM/photo.jpg');
    if (!res.valid) throw new Error(`Approved path should be valid, got: ${res.error?.message}`);
  });

  // Test 60: Platform character limit warnings (e.g. X 280 chars)
  await runTest('test_platform_60', 'Character limit warnings when content exceeds platform limit', 'JobValidation', () => {
    const longText = 'A'.repeat(300);
    const pkg = createDefaultContentPackage({
      baseCaption: longText,
      selectedPlatforms: ['x'],
    });
    const { warnings } = profileCalc.projectForPlatform(pkg, 'x');
    if (!warnings.some(w => w.includes('exceeds X') && w.includes('280'))) {
      throw new Error(`Expected X character limit warning, got: ${warnings.join('; ')}`);
    }
  });

  // Test 61: Platform specific approval
  await runTest('test_appr_61', 'Platform-specific approval binds session to platform', 'JobValidation', () => {
    const pkg = createDefaultContentPackage({
      baseCaption: 'Platform approval',
      selectedPlatforms: ['threads', 'instagram'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approvePlatform(pkg, 'threads', 'session_threads_only', 'Operator');
    if (approved.approvalState !== 'APPROVED') throw new Error('Platform approval should approve package');
  });

  // Test 62: Invalidation audit logging verification
  await runTest('test_audit_62', 'Audit logger records APPROVAL_INVALIDATED on modification', 'Logging', () => {
    const logger = LocalActionLogger.getInstance();
    const beforeCount = logger.getLogs().length;

    const pkg = createDefaultContentPackage({
      baseCaption: 'Audit test',
      selectedPlatforms: ['threads'],
      mediaAssets: [validImage],
    });
    const approved = reviewManager.approveJob(pkg, 'session_audit', 'Operator');
    const tampered = { ...approved, baseCaption: 'Tampered' };
    reviewManager.checkAndInvalidateIfModified(tampered);

    const afterLogs = logger.getLogs();
    const newLogs = afterLogs.slice(0, afterLogs.length - beforeCount);
    if (!newLogs.some(l => l.action === 'APPROVAL_INVALIDATED')) {
      throw new Error('APPROVAL_INVALIDATED action was not logged');
    }
  });
}
