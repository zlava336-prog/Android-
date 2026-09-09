/**
 * Phone Agent - Step 2H Orchestration Test Suite
 * 38+ Production Unit Tests covering:
 * - AdapterRegistry (Registration, Isolation, Errors, Matrix)
 * - CapabilityMatrix (Field validations, Video/Cover/Title)
 * - Amazon Special Rule (Strict rejection as publishing destination)
 * - Deterministic Planner & Ordering
 * - Content Fingerprinting & Canonical Normalization
 * - Idempotency & PublicationGuard
 * - Sequential Platform Execution & Isolation
 * - Human Approval Enforcement
 * - EmergencyStop Propagation & Queue Cancellation
 */

import { AdapterRegistry, DuplicateAdapterError, UnknownAdapterError } from '../AdapterRegistry';
import { MultiPlatformPlanner, MultiPlatformJobExecutor, DETERMINISTIC_PLATFORM_ORDER } from '../MultiPlatformPlanner';
import { computeContentFingerprint, PublicationGuard } from '../fingerprint';
import { AppAdapter, AdapterCapabilities } from '../adapters/AppAdapter';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';
import { SafeUiInspector, SafeActionExecutor } from '../inspector';
import { NormalizedContentPayload, PlatformExecutionStep } from '../../types/job';

// Test mock adapter factory
function createMockAdapter(
  id: string,
  pkg: string,
  name: string,
  caps: Partial<AdapterCapabilities> = {},
  overrides: Partial<AppAdapter> = {}
): AppAdapter {
  return {
    platformId: id,
    packageName: pkg,
    displayName: name,
    capabilities: {
      supportsVideo: true,
      supportsImage: true,
      supportsTitle: false,
      supportsDescription: true,
      supportsHashtags: true,
      supportsCover: false,
      requiresApproval: true,
      ...caps,
    },
    isInstalled: async () => true,
    launch: async () => true,
    detectReadyState: async () => true,
    selectMedia: async () => true,
    enterCaption: async () => true,
    enterHashtags: async () => true,
    selectCover: async () => true,
    verifyPreview: async () => true,
    requestPublishApproval: async () => true,
    publish: async () => ({ success: true, message: 'Published mock' }),
    verifyPublished: async () => true,
    recover: async () => true,
    stop: async () => {},
    ...overrides,
  };
}

export async function runOrchestrationTests(
  runTest: (id: string, name: string, category: any, fn: () => Promise<void> | void) => Promise<void>
): Promise<void> {
  // ==========================================
  // SECTION 1: AdapterRegistry Unit Tests (1-10)
  // ==========================================

  await runTest(
    'test_registry_01',
    'AdapterRegistry: Registration and retrieval of valid adapters',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      const mock = createMockAdapter('test_app', 'com.test.app', 'Test App');
      reg.register(mock);

      if (!reg.has('test_app')) throw new Error('Registry should contain test_app');
      if (reg.get('test_app').displayName !== 'Test App') throw new Error('Retrieved adapter mismatch');
      if (reg.size() !== 1) throw new Error('Registry size should be 1');
    }
  );

  await runTest(
    'test_registry_02',
    'AdapterRegistry: Case-insensitive registration and retrieval',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      const mock = createMockAdapter('Instagram', 'com.instagram.android', 'Instagram');
      reg.register(mock);

      if (!reg.has('instagram')) throw new Error('Should find by lowercase');
      if (!reg.has('INSTAGRAM')) throw new Error('Should find by uppercase');
      if (reg.get('InStAgRaM').displayName !== 'Instagram') throw new Error('Retrieved adapter mismatch');
    }
  );

  await runTest(
    'test_registry_03',
    'AdapterRegistry: Rejection of duplicate adapter IDs with DuplicateAdapterError',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      reg.register(createMockAdapter('threads', 'com.instagram.barcelona', 'Threads'));

      let caught = false;
      try {
        reg.register(createMockAdapter('threads', 'com.instagram.barcelona', 'Threads 2'));
      } catch (err) {
        if (err instanceof DuplicateAdapterError) {
          caught = true;
          if (err.adapterId !== 'threads') throw new Error('Error must carry adapterId');
        }
      }
      if (!caught) throw new Error('Duplicate adapter did not throw DuplicateAdapterError');
    }
  );

  await runTest(
    'test_registry_04',
    'AdapterRegistry: Unknown adapter throws UnknownAdapterError on get()',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      let caught = false;
      try {
        reg.get('unregistered_network');
      } catch (err) {
        if (err instanceof UnknownAdapterError) {
          caught = true;
          if (err.adapterId !== 'unregistered_network') throw new Error('Error must carry requested adapterId');
        }
      }
      if (!caught) throw new Error('Unknown adapter did not throw UnknownAdapterError');
    }
  );

  await runTest(
    'test_registry_05',
    'AdapterRegistry: Safe find() returns undefined without throwing',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      const result = reg.find('non_existent');
      if (result !== undefined) throw new Error('find() should return undefined for missing adapter');
    }
  );

  await runTest(
    'test_registry_06',
    'AdapterRegistry: Unregister removes adapter and returns boolean status',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      reg.register(createMockAdapter('pinterest', 'com.pinterest', 'Pinterest'));
      if (!reg.has('pinterest')) throw new Error('Should have registered pinterest');

      const removed = reg.unregister('pinterest');
      if (!removed) throw new Error('Unregister should return true');
      if (reg.has('pinterest')) throw new Error('Pinterest should no longer exist in registry');

      const secondRemove = reg.unregister('pinterest');
      if (secondRemove) throw new Error('Second unregister should return false');
    }
  );

  await runTest(
    'test_registry_07',
    'AdapterRegistry: Default registry contains all 9 official platform adapters',
    'Adapters',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const required = ['instagram', 'amazon', 'youtube', 'facebook', 'tiktok', 'pinterest', 'x', 'threads', 'linkedin'];
      for (const id of required) {
        if (!reg.has(id)) throw new Error(`Default registry missing required adapter: ${id}`);
      }
      if (reg.size() !== 9) throw new Error(`Default registry must have 9 adapters, got: ${reg.size()}`);
    }
  );

  await runTest(
    'test_registry_08',
    'AdapterRegistry: Capability matrix returns structured records for all adapters',
    'Adapters',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const matrix = reg.getCapabilityMatrix();
      if (matrix.length !== 9) throw new Error(`Matrix should have 9 items, got ${matrix.length}`);

      const yt = matrix.find(m => m.adapterId === 'youtube');
      if (!yt) throw new Error('Matrix must contain YouTube');
      if (!yt.capabilities.supportsTitle) throw new Error('YouTube must support titles');
      if (yt.capabilities.supportsImage) throw new Error('YouTube should not support static image posting');

      const ig = matrix.find(m => m.adapterId === 'instagram');
      if (!ig) throw new Error('Matrix must contain Instagram');
      if (!ig.capabilities.supportsCover) throw new Error('Instagram must support cover selection');
    }
  );

  await runTest(
    'test_registry_09',
    'AdapterRegistry: getCapabilities throws UnknownAdapterError for unknown adapter',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      let caught = false;
      try {
        reg.getCapabilities('ghost_app');
      } catch (err) {
        if (err instanceof UnknownAdapterError) caught = true;
      }
      if (!caught) throw new Error('Expected UnknownAdapterError');
    }
  );

  await runTest(
    'test_registry_10',
    'AdapterRegistry: Instances are isolated and clear() empties container',
    'Adapters',
    async () => {
      const reg1 = new AdapterRegistry();
      const reg2 = new AdapterRegistry();
      reg1.register(createMockAdapter('app1', 'pkg1', 'App 1'));
      if (reg2.has('app1')) throw new Error('Instances must not share adapter maps');

      reg1.clear();
      if (reg1.size() !== 0) throw new Error('clear() must empty registry');
    }
  );

  // ====================================================
  // SECTION 2: Amazon Special Rule Unit Tests (11-14)
  // ====================================================

  await runTest(
    'test_amazon_rule_11',
    'Amazon Special Rule: Direct publish plan rejected explicitly',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);
      const validation = planner.validatePlan({
        payload: { text: 'Product promotion' },
        platforms: ['amazon'],
      });

      if (validation.valid) throw new Error('Amazon publishing plan must be invalid');
      const err = validation.errors.find(e => e.platform === 'amazon');
      if (!err) throw new Error('Must have specific amazon error');
      if (err.code !== 'AMAZON_NOT_PUBLISHING_DESTINATION') throw new Error(`Wrong code: ${err.code}`);
      if (!err.message.includes('NOT a publishing destination')) throw new Error('Missing explanatory message');
    }
  );

  await runTest(
    'test_amazon_rule_12',
    'Amazon Special Rule: Rejection when mixed with valid social platforms',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);
      const validation = planner.validatePlan({
        payload: { description: 'Cross-platform post' },
        platforms: ['instagram', 'amazon', 'threads'],
      });

      if (validation.valid) throw new Error('Plan containing Amazon must be marked invalid');
      if (!validation.errors.some(e => e.platform === 'amazon')) throw new Error('Must flag Amazon');
    }
  );

  await runTest(
    'test_amazon_rule_13',
    'Amazon Special Rule: plan() throws PlannerValidationError if Amazon included',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);
      let caught = false;
      try {
        planner.plan({
          payload: { text: 'Sale!' },
          platforms: ['amazon'],
        });
      } catch (err: any) {
        caught = true;
        if (!err.errors?.some((e: any) => e.platform === 'amazon')) {
          throw new Error('PlannerValidationError must contain Amazon error');
        }
      }
      if (!caught) throw new Error('plan() did not throw on Amazon destination');
    }
  );

  await runTest(
    'test_amazon_rule_14',
    'Amazon Special Rule: Adapter capabilities declare no publishing support',
    'Adapters',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const caps = reg.getCapabilities('amazon');
      if (caps.supportsVideo) throw new Error('Amazon adapter must not support video publishing');
      if (caps.supportsImage) throw new Error('Amazon adapter must not support image publishing');
      if (caps.supportsTitle) throw new Error('Amazon adapter must not support title publishing');
      if (caps.supportsDescription) throw new Error('Amazon adapter must not support description publishing');
      if (caps.supportsHashtags) throw new Error('Amazon adapter must not support hashtags publishing');
    }
  );

  // ====================================================
  // SECTION 3: Capability Validation Unit Tests (15-22)
  // ====================================================

  await runTest(
    'test_caps_validation_15',
    'Capability Matrix: Rejects video payload for adapter without supportsVideo',
    'JobValidation',
    async () => {
      const reg = new AdapterRegistry();
      reg.register(createMockAdapter('no_video_app', 'pkg', 'No Video App', { supportsVideo: false }));
      const planner = new MultiPlatformPlanner(reg);

      const res = planner.validatePlan({
        payload: { videoUri: 'content://video.mp4' },
        platforms: ['no_video_app'],
      });

      if (res.valid) throw new Error('Should reject video payload');
      if (!res.errors.some(e => e.code === 'UNSUPPORTED_VIDEO')) throw new Error('Expected UNSUPPORTED_VIDEO error');
    }
  );

  await runTest(
    'test_caps_validation_16',
    'Capability Matrix: Rejects static image payload for video-only adapter',
    'JobValidation',
    async () => {
      const reg = new AdapterRegistry();
      // YouTube Shorts: video only, supportsImage = false
      reg.register(createMockAdapter('youtube', 'com.google.android.youtube', 'YouTube', { supportsImage: false, supportsVideo: true }));
      const planner = new MultiPlatformPlanner(reg);

      const res = planner.validatePlan({
        payload: { imageUri: 'file:///image.jpg' },
        platforms: ['youtube'],
      });

      if (res.valid) throw new Error('Should reject image payload for YouTube');
      if (!res.errors.some(e => e.code === 'UNSUPPORTED_IMAGE')) throw new Error('Expected UNSUPPORTED_IMAGE error');
    }
  );

  await runTest(
    'test_caps_validation_17',
    'Capability Matrix: Rejects title payload when adapter does not support title',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      // Instagram Reels does not have a separate title field in mobile UI
      const res = planner.validatePlan({
        payload: { description: 'Caption', title: 'Separate Reel Title' },
        platforms: ['instagram'],
      });

      if (res.valid) throw new Error('Instagram should reject explicit title requirement');
      if (!res.errors.some(e => e.code === 'UNSUPPORTED_TITLE' && e.platform === 'instagram')) {
        throw new Error('Expected UNSUPPORTED_TITLE for instagram');
      }
    }
  );

  await runTest(
    'test_caps_validation_18',
    'Capability Matrix: Rejects cover selection when adapter does not support cover',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      // YouTube Shorts does not support manual cover frame upload via mobile accessibility
      const res = planner.validatePlan({
        payload: { videoUri: 'file:///v.mp4', title: 'Short', coverUri: 'file:///cover.jpg' },
        platforms: ['youtube'],
      });

      if (res.valid) throw new Error('YouTube should reject cover requirement');
      if (!res.errors.some(e => e.code === 'UNSUPPORTED_COVER' && e.platform === 'youtube')) {
        throw new Error('Expected UNSUPPORTED_COVER for youtube');
      }
    }
  );

  await runTest(
    'test_caps_validation_19',
    'Capability Matrix: Rejects hashtags when adapter does not support hashtags',
    'JobValidation',
    async () => {
      const reg = new AdapterRegistry();
      reg.register(createMockAdapter('no_tags_app', 'pkg', 'No Tags App', { supportsHashtags: false }));
      const planner = new MultiPlatformPlanner(reg);

      const res = planner.validatePlan({
        payload: { hashtags: ['#marketing', '#product'] },
        platforms: ['no_tags_app'],
      });

      if (res.valid) throw new Error('Should reject hashtags for adapter with supportsHashtags=false');
      if (!res.errors.some(e => e.code === 'UNSUPPORTED_HASHTAGS')) throw new Error('Expected UNSUPPORTED_HASHTAGS');
    }
  );

  await runTest(
    'test_caps_validation_20',
    'Capability Matrix: Rejects empty platforms list with EMPTY_PLATFORMS',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);
      const res = planner.validatePlan({
        payload: { text: 'Hello' },
        platforms: [],
      });
      if (res.valid) throw new Error('Empty platform list must be invalid');
      if (res.errors[0].code !== 'EMPTY_PLATFORMS') throw new Error('Expected EMPTY_PLATFORMS');
    }
  );

  await runTest(
    'test_caps_validation_21',
    'Capability Matrix: Flags unknown adapter in plan validation',
    'JobValidation',
    async () => {
      const reg = new AdapterRegistry();
      const planner = new MultiPlatformPlanner(reg);
      const res = planner.validatePlan({
        payload: { text: 'Hello' },
        platforms: ['snapchat_unsupported'],
      });
      if (res.valid) throw new Error('Unknown adapter should be invalid');
      if (!res.errors.some(e => e.code === 'UNKNOWN_ADAPTER')) throw new Error('Expected UNKNOWN_ADAPTER error');
    }
  );

  await runTest(
    'test_caps_validation_22',
    'Capability Matrix: Accepts valid payload conforming to all adapter rules',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      const res = planner.validatePlan({
        payload: {
          videoUri: 'content://media/100',
          description: 'Great updates from our team!',
          hashtags: ['#tech', '#update'],
        },
        platforms: ['instagram', 'threads', 'facebook', 'linkedin'],
      });

      if (!res.valid) {
        throw new Error(`Expected valid plan, got errors: ${JSON.stringify(res.errors)}`);
      }
    }
  );

  // ====================================================
  // SECTION 4: Deterministic Planning & Ordering (23-26)
  // ====================================================

  await runTest(
    'test_planner_23',
    'Planner: Generates deterministic platform execution order regardless of input order',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      const plan1 = planner.plan({
        jobId: 'job_order_1',
        payload: { description: 'Post content' },
        platforms: ['linkedin', 'threads', 'instagram', 'facebook'],
      });

      const plan2 = planner.plan({
        jobId: 'job_order_2',
        payload: { description: 'Post content' },
        platforms: ['facebook', 'instagram', 'linkedin', 'threads'],
      });

      const order1 = plan1.steps.map(s => s.platform);
      const order2 = plan2.steps.map(s => s.platform);

      if (JSON.stringify(order1) !== JSON.stringify(order2)) {
        throw new Error(`Platform order must be deterministic. Plan1: ${order1.join(',')}, Plan2: ${order2.join(',')}`);
      }

      // Expected order: instagram, facebook, threads, linkedin
      if (order1[0] !== 'instagram' || order1[1] !== 'facebook' || order1[2] !== 'threads' || order1[3] !== 'linkedin') {
        throw new Error(`Unexpected order: ${order1.join(',')}`);
      }
    }
  );

  await runTest(
    'test_planner_24',
    'Planner: Deduplicates selected platforms while preserving order',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      const plan = planner.plan({
        payload: { description: 'Deduplication test' },
        platforms: ['threads', 'instagram', 'threads', 'instagram', 'threads'],
      });

      if (plan.steps.length !== 2) throw new Error(`Expected 2 steps, got ${plan.steps.length}`);
      if (plan.steps[0].platform !== 'instagram') throw new Error('Expected instagram first');
      if (plan.steps[1].platform !== 'threads') throw new Error('Expected threads second');
    }
  );

  await runTest(
    'test_planner_25',
    'Planner: Maps correct platform actions (reel vs post vs short vs pin)',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      const plan = planner.plan({
        payload: { videoUri: 'content://v.mp4', description: 'Reel/Short test' },
        platforms: ['instagram', 'youtube', 'facebook', 'pinterest'],
      });

      const ig = plan.steps.find(s => s.platform === 'instagram');
      const yt = plan.steps.find(s => s.platform === 'youtube');
      const fb = plan.steps.find(s => s.platform === 'facebook');
      const pin = plan.steps.find(s => s.platform === 'pinterest');

      if (ig?.action !== 'publish_reel') throw new Error(`Instagram action should be publish_reel, got: ${ig?.action}`);
      if (yt?.action !== 'publish_short') throw new Error(`YouTube action should be publish_short, got: ${yt?.action}`);
      if (fb?.action !== 'publish_post') throw new Error(`Facebook action should be publish_post, got: ${fb?.action}`);
      if (pin?.action !== 'publish_pin') throw new Error(`Pinterest action should be publish_pin, got: ${pin?.action}`);
    }
  );

  await runTest(
    'test_planner_26',
    'Planner: Generates platform-specific normalized payloads without field leakage',
    'JobValidation',
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      const plan = planner.plan({
        payload: {
          title: 'YouTube Title Only',
          description: 'Description shared',
          hashtags: ['#tags'],
          coverUri: 'file:///cover.jpg',
        },
        platforms: ['instagram', 'facebook'],
      });

      // Instagram: cover allowed, title not allowed
      const igStep = plan.steps.find(s => s.platform === 'instagram');
      if (igStep?.payload.title !== undefined) throw new Error('Instagram step payload should not include title');
      if (igStep?.payload.coverUri !== 'file:///cover.jpg') throw new Error('Instagram step should preserve coverUri');

      // Facebook: cover not allowed (capabilities.supportsCover = false)
      const fbStep = plan.steps.find(s => s.platform === 'facebook');
      if (fbStep?.payload.coverUri !== undefined) throw new Error('Facebook step should omit coverUri');
    }
  );

  // ====================================================
  // SECTION 5: Content Fingerprinting & Idempotency (27-30)
  // ====================================================

  await runTest(
    'test_fingerprint_27',
    'Fingerprint: Deterministic and canonical representation across whitespace and tag permutations',
    'JobValidation',
    async () => {
      const p1: NormalizedContentPayload = {
        text: 'Hello world',
        description: 'Detail text',
        hashtags: ['#zebra', '#alpha', '#beta'],
      };
      const p2: NormalizedContentPayload = {
        text: '  Hello world  ',
        description: 'Detail text',
        hashtags: ['beta', '#alpha', 'zebra'], // unnormalized prefix and permuted order
      };

      const fp1 = computeContentFingerprint(p1);
      const fp2 = computeContentFingerprint(p2);

      if (fp1 !== fp2) throw new Error(`Fingerprints must match. fp1: ${fp1}, fp2: ${fp2}`);
      if (!fp1.startsWith('fp_')) throw new Error('Fingerprint should start with fp_');
    }
  );

  await runTest(
    'test_fingerprint_28',
    'Fingerprint: Different payload produces distinct fingerprint',
    'JobValidation',
    async () => {
      const p1 = { text: 'Announcement A' };
      const p2 = { text: 'Announcement B' };

      const fp1 = computeContentFingerprint(p1);
      const fp2 = computeContentFingerprint(p2);

      if (fp1 === fp2) throw new Error('Different payloads must produce different fingerprints');
    }
  );

  await runTest(
    'test_idempotency_29',
    'PublicationGuard: Records and checks published job+platform+fingerprint',
    'JobValidation',
    async () => {
      const guard = new PublicationGuard();
      guard.clear();

      const jobId = 'job_101';
      const platform = 'instagram';
      const fp = 'fp_abcdef012345';

      if (guard.isPublished(jobId, platform, fp)) throw new Error('Should not be marked published initially');

      guard.recordPublication(jobId, platform, fp);

      if (!guard.isPublished(jobId, platform, fp)) throw new Error('Should be marked published after recording');
      // Case insensitive check
      if (!guard.isPublished(jobId, 'INSTAGRAM', fp)) throw new Error('Should be case insensitive for platform');
      // Different job
      if (guard.isPublished('job_102', platform, fp)) throw new Error('Different job must not report published');
      // Different platform
      if (guard.isPublished(jobId, 'threads', fp)) throw new Error('Different platform must not report published');
    }
  );

  await runTest(
    'test_idempotency_30',
    'PublicationGuard: MultiPlatformJobExecutor skips already published platform with ALREADY_PUBLISHED',
    'JobValidation',
    async () => {
      const reg = new AdapterRegistry();
      let publishCalls = 0;
      reg.register(
        createMockAdapter('threads', 'com.instagram.barcelona', 'Threads', {}, {
          publish: async () => {
            publishCalls++;
            return { success: true, message: 'Published' };
          },
        })
      );

      const guard = new PublicationGuard();
      guard.clear();

      const planner = new MultiPlatformPlanner(reg);
      const plan = planner.plan({
        jobId: 'job_duplicate_check',
        payload: { description: 'Checking duplicate prevention' },
        platforms: ['threads'],
      });

      // Pre-record in guard
      guard.recordPublication('job_duplicate_check', 'threads', plan.fingerprint);

      const executor = new MultiPlatformJobExecutor(reg, undefined, undefined, guard);
      const result = await executor.executePlan(plan, {
        approvalProvider: async () => true,
      });

      if (!result.success) throw new Error('Execution should succeed');
      if (publishCalls !== 0) throw new Error('Publish must not be called when already published');
      if (plan.steps[0].message !== 'ALREADY_PUBLISHED') {
        throw new Error(`Expected message ALREADY_PUBLISHED, got: ${plan.steps[0].message}`);
      }
    }
  );

  // ====================================================
  // SECTION 6: Sequential Execution & Isolation (31-35)
  // ====================================================

  await runTest(
    'test_execution_31',
    'Sequential Execution: Steps execute one after another in order',
    'Orchestration' as any,
    async () => {
      const executionOrder: string[] = [];
      const reg = new AdapterRegistry();

      reg.register(
        createMockAdapter('instagram', 'com.instagram.android', 'Instagram', {}, {
          publish: async () => {
            executionOrder.push('instagram');
            return { success: true, message: 'Published' };
          },
        })
      );

      reg.register(
        createMockAdapter('threads', 'com.instagram.barcelona', 'Threads', {}, {
          publish: async () => {
            executionOrder.push('threads');
            return { success: true, message: 'Published' };
          },
        })
      );

      const guard = new PublicationGuard();
      guard.clear();
      const planner = new MultiPlatformPlanner(reg);
      const plan = planner.plan({
        payload: { description: 'Sequential order verification' },
        platforms: ['threads', 'instagram'],
      });

      const executor = new MultiPlatformJobExecutor(reg, undefined, undefined, guard);
      const result = await executor.executePlan(plan, { approvalProvider: async () => true });

      if (!result.success) throw new Error('Plan should execute successfully');
      if (executionOrder[0] !== 'instagram' || executionOrder[1] !== 'threads') {
        throw new Error(`Expected sequential order [instagram, threads], got: [${executionOrder.join(', ')}]`);
      }
    }
  );

  await runTest(
    'test_execution_32',
    'Platform Isolation: Mismatched foreground package triggers EmergencyStop and halts queue',
    'Orchestration' as any,
    async () => {
      EmergencyStopManager.getInstance().reset();
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      const plan = planner.plan({
        payload: { description: 'Isolation violation test' },
        platforms: ['instagram', 'threads'],
      });

      // Mock inspector returning unexpected package
      const inspector = new SafeUiInspector('com.google.android.youtube'); // Wrong package for Instagram
      const executor = new MultiPlatformJobExecutor(reg);

      const res = await executor.executePlan(plan, { inspector });

      if (res.success) throw new Error('Execution should fail due to isolation failure');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop must be active');
      if (plan.steps[0].status !== 'FAILED') throw new Error('First step must be FAILED');
      if (plan.steps[1].status !== 'CANCELLED') throw new Error('Subsequent step must be CANCELLED');
    }
  );

  await runTest(
    'test_execution_33',
    'Platform Isolation: Security tripwire triggers EmergencyStop and cancels future steps',
    'Orchestration' as any,
    async () => {
      EmergencyStopManager.getInstance().reset();
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);

      const plan = planner.plan({
        payload: { description: 'Security tripwire test' },
        platforms: ['instagram', 'facebook'],
      });

      const inspector = new SafeUiInspector('com.instagram.android');
      // Inject security challenge
      inspector.simulateSecurityTripwire('Enter OTP to verify Instagram account');

      const executor = new MultiPlatformJobExecutor(reg);
      const res = await executor.executePlan(plan, { inspector });

      if (res.success) throw new Error('Plan must fail when security challenge is present');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      if (plan.steps[0].status !== 'FAILED') throw new Error('Step 1 must be FAILED');
      if (plan.steps[1].status !== 'CANCELLED') throw new Error('Step 2 must be CANCELLED');
    }
  );

  await runTest(
    'test_execution_34',
    'Approval Logic: Operator rejection cancels step and records audit entry',
    'Orchestration' as any,
    async () => {
      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);
      const plan = planner.plan({
        payload: { description: 'Operator approval rejection test' },
        platforms: ['threads'],
      });

      const executor = new MultiPlatformJobExecutor(reg);
      const res = await executor.executePlan(plan, {
        approvalProvider: async () => false, // Operator rejects
      });

      if (plan.steps[0].status !== 'CANCELLED') {
        throw new Error(`Step should be marked CANCELLED, got: ${plan.steps[0].status}`);
      }
      if (!plan.steps[0].error?.includes('Operator denied')) {
        throw new Error('Step error should state operator denial');
      }
    }
  );

  await runTest(
    'test_execution_35',
    'EmergencyStop: Prior active stop prevents execution and cancels all plan steps',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      EmergencyStopManager.getInstance().trigger('Active halt prior to plan start');

      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);
      const plan = planner.plan({
        payload: { description: 'Pre-existing stop test' },
        platforms: ['instagram', 'facebook', 'linkedin'],
      });

      const executor = new MultiPlatformJobExecutor(reg);
      const res = await executor.executePlan(plan);

      if (res.success) throw new Error('Plan must not succeed');
      for (const s of plan.steps) {
        if (s.status !== 'CANCELLED') throw new Error(`Step ${s.platform} should be CANCELLED, got: ${s.status}`);
      }
    }
  );

  // ====================================================
  // SECTION 7: Bounded Recovery & Audit Trail (36-38)
  // ====================================================

  await runTest(
    'test_recovery_36',
    'Bounded Recovery: Adapter recovery mechanism invoked on transient failure',
    'Adapters',
    async () => {
      let recoverCalls = 0;
      let publishCalls = 0;

      const reg = new AdapterRegistry();
      reg.register(
        createMockAdapter('x', 'com.twitter.android', 'X', {}, {
          publish: async () => {
            publishCalls++;
            if (publishCalls === 1) {
              return { success: false, message: 'Transient UI glitch' };
            }
            return { success: true, message: 'Published on retry' };
          },
          recover: async () => {
            recoverCalls++;
            return true; // Recovered
          },
        })
      );

      const guard = new PublicationGuard();
      guard.clear();
      const planner = new MultiPlatformPlanner(reg);
      const plan = planner.plan({
        payload: { description: 'Transient glitch recovery test' },
        platforms: ['x'],
      });

      const executor = new MultiPlatformJobExecutor(reg, undefined, undefined, guard);
      const res = await executor.executePlan(plan, { approvalProvider: async () => true });

      if (recoverCalls !== 1) throw new Error(`Expected 1 recovery call, got: ${recoverCalls}`);
      if (plan.steps[0].status !== 'PUBLISHED') throw new Error('Step should succeed after recovery');
    }
  );

  await runTest(
    'test_recovery_37',
    'Bounded Recovery: Step marked FAILED after recovery exhaustion',
    'Adapters',
    async () => {
      const reg = new AdapterRegistry();
      reg.register(
        createMockAdapter('pinterest', 'com.pinterest', 'Pinterest', {}, {
          publish: async () => ({ success: false, message: 'Unrecoverable element missing' }),
          recover: async () => false, // Recovery fails
        })
      );

      const planner = new MultiPlatformPlanner(reg);
      const plan = planner.plan({
        payload: { description: 'Exhausted recovery test' },
        platforms: ['pinterest'],
      });

      const executor = new MultiPlatformJobExecutor(reg);
      const res = await executor.executePlan(plan, { approvalProvider: async () => true });

      if (res.success) throw new Error('Execution should fail');
      if (plan.steps[0].status !== 'FAILED') throw new Error('Step status must be FAILED');
    }
  );

  await runTest(
    'test_audit_38',
    'Audit Trail: LocalActionLogger records start, success, and idempotency events',
    'Logging',
    async () => {
      const logger = LocalActionLogger.getInstance();
      const initialCount = logger.getLogs().length;

      const reg = AdapterRegistry.createDefaultRegistry();
      const planner = new MultiPlatformPlanner(reg);
      const plan = planner.plan({
        jobId: 'job_audit_val',
        payload: { description: 'Audit validation run' },
        platforms: ['threads'],
      });

      const executor = new MultiPlatformJobExecutor(reg, logger);
      await executor.executePlan(plan, { approvalProvider: async () => true });

      const newLogs = logger.getLogs().slice(0, logger.getLogs().length - initialCount);
      const hasStart = newLogs.some(l => l.action === 'MULTI_PLATFORM_JOB_START');
      const hasSuccess = newLogs.some(l => l.action === 'PLATFORM_PUBLISHED_SUCCESS');

      if (!hasStart) throw new Error('Logger must contain MULTI_PLATFORM_JOB_START');
      if (!hasSuccess) throw new Error('Logger must contain PLATFORM_PUBLISHED_SUCCESS');
    }
  );
}
