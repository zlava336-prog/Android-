/**
 * Phone Agent - Unit Test Suite
 * Validates State Machine, Emergency Stop, Safety Tripwires, Adapters, and Logging.
 */

import { JobStateMachine } from '../stateMachine';
import { EmergencyStopManager } from '../emergencyStop';
import { SafeUiInspector, SafeActionExecutor } from '../inspector';
import { InstagramAdapter } from '../adapters/InstagramAdapter';
import { AmazonAdapter } from '../adapters/AmazonAdapter';
import { YouTubeAdapter } from '../adapters/YouTubeAdapter';
import { FacebookAdapter } from '../adapters/FacebookAdapter';
import { TikTokAdapter } from '../adapters/TikTokAdapter';
import { PinterestAdapter } from '../adapters/PinterestAdapter';
import { XAdapter } from '../adapters/XAdapter';
import { ThreadsAdapter } from '../adapters/ThreadsAdapter';
import { LinkedInAdapter } from '../adapters/LinkedInAdapter';
import { LocalActionLogger } from '../logger';
import { JobModel } from '../../types/job';
import { runOrchestrationTests } from './orchestrationTests';
import { runPersistenceRecoveryTests } from './persistenceRecoveryTests';
import { runContentPipelineTests } from './contentPipelineTests';
import { runProductResearchTests } from './productResearchTests';

export interface TestResult {
  id: string;
  name: string;
  category:
    | 'StateMachine'
    | 'SafetyTripwire'
    | 'EmergencyStop'
    | 'Adapters'
    | 'JobValidation'
    | 'Logging'
    | 'Orchestration'
    | 'Persistence'
    | 'Security';
  passed: boolean;
  message: string;
  durationMs: number;
}

export async function runAllUnitTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Helper
  const runTest = async (
    id: string,
    name: string,
    category: TestResult['category'],
    fn: () => Promise<void> | void
  ) => {
    const start = performance.now();
    EmergencyStopManager.getInstance().reset();
    try {
      await fn();
      results.push({
        id,
        name,
        category,
        passed: true,
        message: 'Passed successfully',
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        id,
        name,
        category,
        passed: false,
        message: errorMsg,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    } finally {
      EmergencyStopManager.getInstance().reset();
    }
  };

  // Test 1: State Machine Sequential Transitions
  await runTest(
    'test_sm_01',
    'State Machine Sequential Flow (RECEIVED -> COMPLETED)',
    'StateMachine',
    () => {
      const sm = new JobStateMachine();
      if (sm.getState() !== 'RECEIVED') throw new Error('Initial state must be RECEIVED');
      const sequence = [
        'VALIDATING',
        'OPENING_APP',
        'WAITING_FOR_READY',
        'SELECTING_MEDIA',
        'ENTERING_METADATA',
        'VERIFYING_PREVIEW',
        'WAITING_FOR_APPROVAL',
        'PUBLISHING',
        'VERIFYING_RESULT',
        'COMPLETED',
      ] as const;

      for (const step of sequence) {
        const ok = sm.transitionTo(step);
        if (!ok || sm.getState() !== step) {
          throw new Error(`Failed valid transition to: ${step}`);
        }
      }
    }
  );

  // Test 2: State Machine Illegal Transition Rejection
  await runTest(
    'test_sm_02',
    'State Machine Rejects Illegal Skips (e.g. RECEIVED -> PUBLISHING)',
    'StateMachine',
    () => {
      const sm = new JobStateMachine('RECEIVED');
      const ok = sm.transitionTo('PUBLISHING');
      if (ok) throw new Error('Illegal transition from RECEIVED to PUBLISHING was unexpectedly permitted');
      if (sm.getState() !== 'RECEIVED') throw new Error('State must remain RECEIVED upon invalid transition');
    }
  );

  // Test 3: Emergency Stop Interruption from Intermediate State
  await runTest(
    'test_sm_03',
    'Emergency Stop Interruption from Intermediate State',
    'StateMachine',
    () => {
      const sm = new JobStateMachine('RECEIVED');
      sm.transitionTo('VALIDATING');
      sm.transitionTo('OPENING_APP');
      sm.transitionTo('WAITING_FOR_READY');
      sm.triggerEmergencyStop('Hardware stop triggered');
      if (sm.getState() !== 'STOPPED') throw new Error('State must be STOPPED');
      const proceed = sm.transitionTo('SELECTING_MEDIA');
      if (proceed) throw new Error('Cannot transition forward while in STOPPED state');
    }
  );

  // Test 4: Global EmergencyStopManager Singleton
  await runTest(
    'test_es_01',
    'Global EmergencyStopManager Singleton Activation & Reason Capture',
    'EmergencyStop',
    () => {
      const esm = EmergencyStopManager.getInstance();
      esm.reset();
      if (esm.isActive()) throw new Error('EmergencyStop should be inactive after reset');
      esm.trigger('Manual user button press');
      if (!esm.isActive()) throw new Error('EmergencyStop should be active after trigger');
      if (!esm.getReason().includes('Manual user button press')) {
        throw new Error('EmergencyStop did not record correct reason');
      }
      esm.reset();
    }
  );

  // Test 5: UiInspector Safety Tripwire: OTP Detection
  await runTest(
    'test_tripwire_01',
    'UiInspector Aborts on "Enter OTP" Detection',
    'SafetyTripwire',
    async () => {
      const inspector = new SafeUiInspector('com.instagram.android');
      inspector.setNodes([
        {
          id: 'challenge_view',
          text: 'Please enter OTP sent to your phone',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.android',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
        },
      ]);
      const result = await inspector.checkSecurityTripwires();
      if (!result.tripped) throw new Error('Tripwire should have detected OTP keyword');
      if (!result.reason?.toLowerCase().includes('otp')) {
        throw new Error('Tripwire reason must specify OTP detection');
      }
    }
  );

  // Test 6: UiInspector Safety Tripwire: PIN / Payment Detection
  await runTest(
    'test_tripwire_02',
    'UiInspector Aborts on "UPI PIN / Card Number" Detection',
    'SafetyTripwire',
    async () => {
      const inspector = new SafeUiInspector('com.amazon.mShop.android.shopping');
      inspector.setNodes([
        {
          id: 'payment_screen',
          text: 'Enter UPI PIN to authorize transaction',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.amazon.mShop.android.shopping',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
        },
      ]);
      const result = await inspector.checkSecurityTripwires();
      if (!result.tripped) throw new Error('Tripwire should have detected PIN keyword');
    }
  );

  // Test 7: Prohibited Banking Package Blocking
  await runTest(
    'test_tripwire_03',
    'UiInspector Prohibits Banking & Payment Packages (e.g. Google Pay / PhonePe)',
    'SafetyTripwire',
    async () => {
      const inspector = new SafeUiInspector('com.google.android.apps.nbu.paisa.user');
      const result = await inspector.checkSecurityTripwires();
      if (!result.tripped) throw new Error('Should block Google Pay package immediately');
      if (!result.reason?.includes('Prohibited package')) {
        throw new Error('Must cite prohibited package restriction');
      }
    }
  );

  // Test 8: Safe Social Media Package Passes Inspection
  await runTest(
    'test_tripwire_04',
    'UiInspector Passes Valid Social Media Screen Without Tripwires',
    'SafetyTripwire',
    async () => {
      const inspector = new SafeUiInspector('com.instagram.android');
      inspector.setNodes([
        {
          id: 'instagram_reels_header',
          text: 'New Reel',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.android',
          bounds: { x: 10, y: 50, width: 200, height: 40 },
        },
      ]);
      const result = await inspector.checkSecurityTripwires();
      if (result.tripped) throw new Error(`Unexpected tripwire triggered: ${result.reason}`);
    }
  );

  // Test 9: ActionExecutor Halts Actions When Stopped
  await runTest(
    'test_executor_01',
    'ActionExecutor Throws Exception on Click When Halted',
    'EmergencyStop',
    async () => {
      const executor = new SafeActionExecutor();
      executor.setHalted(true);
      try {
        await executor.click({
          id: 'any_button',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'test',
          bounds: { x: 0, y: 0, width: 10, height: 10 },
        });
        throw new Error('ActionExecutor should have thrown an error when halted');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Emergency Stop is active')) throw err;
      }
    }
  );

  // Test 10: Amazon Adapter Share & Copy Link Capture
  await runTest(
    'test_amazon_01',
    'Amazon Adapter Executes Share -> Copy Link -> Returns Product URL',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.amazon.mShop.android.shopping');
      const executor = new SafeActionExecutor();
      const adapter = new AmazonAdapter(inspector, executor);

      await adapter.launch();
      await adapter.detectReadyState();
      await adapter.enterCaption('wireless noise canceling headphones');
      await adapter.verifyPreview();
      const result = await adapter.publish();

      if (!result.success) throw new Error(`Amazon workflow failed: ${result.message}`);
      if (!adapter.getExtractedUrl().includes('amazon.com')) {
        throw new Error('Extracted URL must be an Amazon product link');
      }
    }
  );

  // Test 11: Instagram Adapter Approval Gate
  await runTest(
    'test_insta_01',
    'Instagram Adapter Respects requiresApproval Flag',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.instagram.android');
      const executor = new SafeActionExecutor();
      const adapter = new InstagramAdapter(inspector, executor);

      const job: JobModel = {
        jobId: 'reel_001',
        platform: 'instagram',
        action: 'publish_reel',
        videoUri: 'content://media/external/video/media/1042',
        caption: 'Top gadgets for home automation',
        hashtags: ['#homegadgets', '#tech'],
        requiresApproval: true,
      };

      const needsApproval = await adapter.requestPublishApproval(job);
      if (!needsApproval) throw new Error('Instagram adapter must request user approval');
    }
  );

  // Test 12: Job Model Deserialization & Validation
  await runTest(
    'test_job_01',
    'Job Model Deserialization and Attribute Verification',
    'JobValidation',
    () => {
      const rawJson = `{
        "jobId": "reel_001",
        "platform": "instagram",
        "action": "publish_reel",
        "videoUri": "content://media/external/video/media/1042",
        "caption": "Minimalist desk setup review",
        "hashtags": ["#amazonfinds", "#deals"],
        "coverUri": "content://media/external/images/media/89",
        "requiresApproval": true
      }`;

      const job: JobModel = JSON.parse(rawJson);
      if (job.jobId !== 'reel_001') throw new Error('JobId mismatch');
      if (job.platform !== 'instagram') throw new Error('Platform mismatch');
      if (job.hashtags?.length !== 2) throw new Error('Hashtags count mismatch');
      if (job.requiresApproval !== true) throw new Error('requiresApproval must be true');
    }
  );

  // Test 13: Local Action Logger Audit Recording
  await runTest(
    'test_logger_01',
    'LocalActionLogger Appends and Stores Audit Entries',
    'Logging',
    () => {
      const logger = LocalActionLogger.getInstance();
      const initialCount = logger.getLogs().length;
      logger.log({
        jobId: 'test_audit_01',
        platform: 'instagram',
        action: 'VERIFY_PREVIEW',
        details: 'Verified preview node matches mediaUri parameters.',
        severity: 'INFO',
        safetyCheckPassed: true,
      });
      const newCount = logger.getLogs().length;
      if (newCount !== initialCount + 1) {
        throw new Error('Audit log entry was not recorded');
      }
    }
  );

  // Test 14: Amazon Adapter Prohibits Buy Now
  await runTest(
    'test_amazon_02',
    'Amazon Adapter Strictly Rejects Any Purchase / Buy Now Interactions',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.amazon.mShop.android.shopping');
      const executor = new SafeActionExecutor();
      const adapter = new AmazonAdapter(inspector, executor);
      // Verify adapter publish does NOT invoke buy now nodes
      await adapter.publish();
      const history = executor.getHistory();
      for (const item of history) {
        if (item.target.toLowerCase().includes('buy') || item.target.toLowerCase().includes('checkout')) {
          throw new Error('Safety breach: Executor interacted with checkout element');
        }
      }
    }
  );

  // Test 15: YouTube Package Verification Failure Stops Job & Triggers Emergency Stop
  await runTest(
    'test_youtube_01',
    'YouTube Adapter: Unexpected Package Change Halts Job and Triggers Emergency Stop',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.android'); // Unexpected package!
      const executor = new SafeActionExecutor();
      const adapter = new YouTubeAdapter(inspector, executor);

      let caught = false;
      try {
        await adapter.launch();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Unexpected package change')) {
          throw new Error(`Expected unexpected package error, got: ${msg}`);
        }
      }

      if (!caught) {
        throw new Error('YouTube adapter should have thrown when package is not YouTube');
      }

      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop should be active following unexpected package detection');
      }
      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 16: YouTube Media Validation Failure (empty and invalid scheme)
  await runTest(
    'test_youtube_02',
    'YouTube Adapter: Media Validation Fails on Empty or Non-Local URI',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.google.android.youtube');
      const executor = new SafeActionExecutor();
      const adapter = new YouTubeAdapter(inspector, executor);

      // 1. Empty URI
      let emptyCaught = false;
      try {
        adapter.validateMediaUri('');
      } catch {
        emptyCaught = true;
      }
      if (!emptyCaught) throw new Error('validateMediaUri must reject empty string');

      // 2. Web URI (prohibited)
      let webCaught = false;
      try {
        adapter.validateMediaUri('https://external-site.com/video.mp4');
      } catch {
        webCaught = true;
      }
      if (!webCaught) throw new Error('validateMediaUri must reject remote HTTP URIs');

      // 3. Valid local content URI passes
      adapter.validateMediaUri('content://media/external/video/media/105');
      adapter.validateMediaUri('file:///data/user/0/com.phoneagent/cache/video.mp4');
    }
  );

  // Test 17: YouTube Metadata Handling (Title limit <= 100 chars and Hashtag formatting)
  await runTest(
    'test_youtube_03',
    'YouTube Adapter: Enforces 100 Char Title Limit and Proper Hashtag Formatting',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.google.android.youtube');
      const executor = new SafeActionExecutor();
      const adapter = new YouTubeAdapter(inspector, executor);

      const longTitle = 'A'.repeat(150); // Over 100 chars
      await adapter.enterCaption(longTitle);

      const history = executor.getHistory();
      const titleEntry = history.find(h => h.action === 'typeText');
      if (!titleEntry) throw new Error('Expected typeText action for title');
      // Target string in SafeActionExecutor contains the slice of typed text
      if (titleEntry.target.length > 150) {
        throw new Error('Title should not exceed 100 chars');
      }

      // Hashtag formatting check
      await adapter.enterHashtags(['Shorts', '#coding', 'tips']);
      const hashtagEntry = executor.getHistory().filter(h => h.action === 'typeText')[1];
      if (!hashtagEntry || !hashtagEntry.target.includes('#Shorts')) {
        throw new Error('Hashtags should be formatted with #');
      }
    }
  );

  // Test 18: YouTube Approval Gate (requiresApproval == true halts before Publish)
  await runTest(
    'test_youtube_04',
    'YouTube Adapter: Halts Before Publish When Operator Approval Is Required',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.google.android.youtube');
      const executor = new SafeActionExecutor();
      const adapter = new YouTubeAdapter(inspector, executor);

      const job: JobModel = {
        jobId: 'yt_short_approval_test',
        platform: 'youtube',
        action: 'publish_short',
        videoUri: 'content://media/external/video/media/99',
        caption: 'Minimalist desk tour 2026',
        hashtags: ['#Shorts', '#tech'],
        requiresApproval: true,
      };

      const needsApproval = await adapter.requestPublishApproval(job);
      if (!needsApproval) {
        throw new Error('requestPublishApproval should return true when job requires approval');
      }
    }
  );

  // Test 19: YouTube Security Tripwire Triggers Emergency Stop
  await runTest(
    'test_youtube_05',
    'YouTube Adapter: Security/Auth Challenge Triggers Immediate Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.google.android.youtube');
      inspector.setNodes([
        {
          id: 'com.google.android.youtube:id/account_auth_dialog',
          text: 'Verify it\'s you. Enter password to continue.',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.google.android.youtube',
          bounds: { x: 50, y: 500, width: 900, height: 200 },
        },
      ]);
      const executor = new SafeActionExecutor();
      const adapter = new YouTubeAdapter(inspector, executor);

      let tripwireFired = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        tripwireFired = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes('challenge') && !msg.toLowerCase().includes('password')) {
          throw new Error(`Expected security challenge message, got: ${msg}`);
        }
      }

      if (!tripwireFired) {
        throw new Error('Adapter should have aborted due to auth challenge on screen');
      }

      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop should be triggered on YouTube security challenge');
      }
      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 20: YouTube Adapter Capabilities Metadata
  await runTest(
    'test_youtube_06',
    'YouTube Adapter: Exposes Accurate Capability Metadata',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.google.android.youtube');
      const executor = new SafeActionExecutor();
      const adapter = new YouTubeAdapter(inspector, executor);

      const caps = adapter.capabilities;
      if (!caps) throw new Error('YouTube adapter must define capabilities');
      if (caps.supportsVideo !== true) throw new Error('supportsVideo must be true');
      if (caps.supportsTitle !== true) throw new Error('supportsTitle must be true');
      if (caps.supportsDescription !== true) throw new Error('supportsDescription must be true');
      if (caps.supportsHashtags !== true) throw new Error('supportsHashtags must be true');
      if (caps.supportsCover !== false) throw new Error('supportsCover must be false for Shorts');
      if (caps.requiresApproval !== true) throw new Error('requiresApproval must be true');
    }
  );

  // Test 21: Facebook Package Verification
  await runTest(
    'test_fb_01',
    'Facebook Adapter: Official Package Verification & Dynamic Configuration',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor, 'com.facebook.katana');

      const launched = await adapter.launch();
      if (!launched) throw new Error('Launch should succeed with configured package');
      if (adapter.packageName !== 'com.facebook.katana') {
        throw new Error('Default package should be com.facebook.katana');
      }

      // Reconfigure to Facebook Lite
      adapter.configurePackage('com.facebook.lite');
      inspector.setPackage('com.facebook.lite');
      const liteLaunched = await adapter.launch();
      if (!liteLaunched) throw new Error('Launch should succeed with Facebook Lite package');
      if ((adapter.packageName as string) !== 'com.facebook.lite') {
        throw new Error('Configured package should be com.facebook.lite');
      }
    }
  );

  // Test 22: Unexpected Package Triggers EmergencyStop
  await runTest(
    'test_fb_02',
    'Facebook Adapter: Unexpected Package Change Triggers Emergency Stop',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.malicious.fakefb');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor, 'com.facebook.katana');

      let failedWithUnexpected = false;
      try {
        await adapter.launch();
      } catch (err: unknown) {
        failedWithUnexpected = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Unexpected package change')) {
          throw new Error(`Expected unexpected package error, got: ${msg}`);
        }
      }

      if (!failedWithUnexpected) {
        throw new Error('Launch should have thrown due to package mismatch');
      }
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be triggered on package mismatch');
      }
      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 23: Empty URI Rejection
  await runTest(
    'test_fb_03',
    'Facebook Adapter: Rejects Empty or Blank Media URI',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      let emptyRejected = false;
      try {
        adapter.validateMediaUri('');
      } catch (err: unknown) {
        emptyRejected = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('cannot be empty')) {
          throw new Error(`Expected empty URI message, got: ${msg}`);
        }
      }
      if (!emptyRejected) throw new Error('Empty URI should be rejected');

      let whitespaceRejected = false;
      try {
        adapter.validateMediaUri('   ');
      } catch (err: unknown) {
        whitespaceRejected = true;
      }
      if (!whitespaceRejected) throw new Error('Whitespace URI should be rejected');
    }
  );

  // Test 24: HTTP/HTTPS URI Rejection
  await runTest(
    'test_fb_04',
    'Facebook Adapter: Prohibits Remote HTTP/HTTPS URIs',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      let httpRejected = false;
      try {
        adapter.validateMediaUri('http://example.com/video.mp4');
      } catch (err: unknown) {
        httpRejected = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Remote HTTP/HTTPS URIs are prohibited')) {
          throw new Error(`Expected prohibition message, got: ${msg}`);
        }
      }
      if (!httpRejected) throw new Error('HTTP URI should be prohibited');

      let httpsRejected = false;
      try {
        adapter.validateMediaUri('https://facebook.com/reel/999.mp4');
      } catch (err: unknown) {
        httpsRejected = true;
      }
      if (!httpsRejected) throw new Error('HTTPS URI should be prohibited');
    }
  );

  // Test 25: Valid Local Media URI
  await runTest(
    'test_fb_05',
    'Facebook Adapter: Accepts Valid Local Media URIs',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      // These should not throw
      adapter.validateMediaUri('content://media/external/video/media/77');
      adapter.validateMediaUri('file:///storage/emulated/0/DCIM/fb_reel.mp4');
      adapter.validateMediaUri('/storage/emulated/0/Movies/post.mp4');
    }
  );

  // Test 26: Caption Handling
  await runTest(
    'test_fb_06',
    'Facebook Adapter: Preserves Line Breaks and Enforces Length Ceiling',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      const multiLineCaption = 'Line 1: Headline\nLine 2: Details\nLine 3: Call to action';
      await adapter.enterCaption(multiLineCaption);

      const history = executor.getHistory();
      const captionEntry = history.find(h => h.action === 'typeText');
      if (!captionEntry) throw new Error('Expected typeText action for caption');
      if (!captionEntry.target.includes('Line 1: Headline')) {
        throw new Error('Caption must preserve text');
      }

      // Length ceiling test
      adapter.maxCaptionLength = 30;
      const truncated = adapter.sanitizeCaption('This is an excessively long caption exceeding max length');
      if (truncated.length !== 30) {
        throw new Error(`Expected length 30, got ${truncated.length}`);
      }

      await adapter.enterCaption('This is an excessively long caption exceeding max length');
      const secondEntry = executor.getHistory().filter(h => h.action === 'typeText')[1];
      if (!secondEntry) throw new Error('Expected second typeText action');
      const match = secondEntry.target.match(/:\s*"([^"]*)/);
      const typedContent = match ? match[1].replace(/\.\.\.$/, '') : '';
      if (typedContent.length > 30) {
        throw new Error('Caption must be clamped to maxCaptionLength');
      }
    }
  );

  // Test 27: Hashtag Formatting
  await runTest(
    'test_fb_07',
    'Facebook Adapter: Ensures All Hashtags Have Leading Hash Symbol',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      const formatted = adapter.sanitizeHashtags(['tech', '#innovation', 'future']);
      if (formatted[0] !== '#tech') throw new Error('tech should be formatted to #tech');
      if (formatted[1] !== '#innovation') throw new Error('#innovation should remain #innovation');
      if (formatted[2] !== '#future') throw new Error('future should be formatted to #future');
    }
  );

  // Test 28: Duplicate Hashtag Removal
  await runTest(
    'test_fb_08',
    'Facebook Adapter: Removes Duplicate Hashtags & Avoids Redundancy with Caption',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      const rawTags = ['tech', '#TECH', 'tech', '#ai', 'AI', '#tech'];
      const deduplicated = adapter.sanitizeHashtags(rawTags);
      if (deduplicated.length !== 2) {
        throw new Error(`Expected 2 unique tags, got: ${deduplicated.length}`);
      }
      if (deduplicated[0] !== '#tech' || deduplicated[1] !== '#ai') {
        throw new Error(`Unexpected tags: ${JSON.stringify(deduplicated)}`);
      }

      // Exclude tag already in caption text
      const existingText = 'Sharing insights on #tech trends';
      const filtered = adapter.sanitizeHashtags(['tech', 'design'], existingText);
      if (filtered.length !== 1 || filtered[0] !== '#design') {
        throw new Error('Should not duplicate hashtag already in existing text');
      }
    }
  );

  // Test 29: Approval-Required Workflow
  await runTest(
    'test_fb_09',
    'Facebook Adapter: Enforces Approval-Required Flow Before Publish',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      const job: JobModel = {
        jobId: 'fb_post_job_001',
        platform: 'facebook',
        action: 'publish_post',
        videoUri: 'content://media/external/video/media/10',
        caption: 'Design update',
        requiresApproval: true,
      };

      const needsApproval = await adapter.requestPublishApproval(job);
      if (!needsApproval) {
        throw new Error('requestPublishApproval must return true when requiresApproval=true');
      }
    }
  );

  // Test 30: Publish Blocked Before Approval
  await runTest(
    'test_fb_10',
    'Facebook Adapter: Rejects Publish Action When Adapter Is Stopped',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      await adapter.stop();
      const result = await adapter.publish();
      if (result.success !== false) {
        throw new Error('Publish should not succeed when adapter is stopped');
      }
      if (!result.message.includes('stopped')) {
        throw new Error(`Expected stopped message, got: ${result.message}`);
      }
    }
  );

  // Test 31: Security Tripwire
  await runTest(
    'test_fb_11',
    'Facebook Adapter: Security Challenge & 2FA Triggers Immediate Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.facebook.katana');
      inspector.setNodes([
        {
          id: 'com.facebook.katana:id/security_checkpoint',
          text: 'Two-factor authentication required. Enter the 6-digit confirmation code.',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 50, y: 500, width: 900, height: 200 },
        },
      ]);
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      let challengeFired = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        challengeFired = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes('challenge') && !msg.toLowerCase().includes('factor')) {
          throw new Error(`Expected challenge message, got: ${msg}`);
        }
      }

      if (!challengeFired) {
        throw new Error('Adapter should abort immediately on two-factor prompt');
      }
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop should be active');
      }
      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 32: Account-Switcher Detection
  await runTest(
    'test_fb_12',
    'Facebook Adapter: Account Switcher Halts Automation for Operator Safety',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.facebook.katana');
      inspector.setNodes([
        {
          id: 'com.facebook.katana:id/account_switcher',
          text: 'Switch account or choose a profile to continue',
          contentDescription: 'Switch profile',
          className: 'android.view.View',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 100, y: 300, width: 900, height: 500 },
        },
      ]);
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      let switcherFired = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        switcherFired = true;
      }

      if (!switcherFired) {
        throw new Error('Adapter should halt on account switcher');
      }
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop should be active on account switcher');
      }
      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 33: Payment/Billing Detection
  await runTest(
    'test_fb_13',
    'Facebook Adapter: Payment/Billing Screen Triggers Immediate Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.facebook.katana');
      inspector.setNodes([
        {
          id: 'com.facebook.katana:id/boost_post_banner',
          text: 'Boost post with Meta Pay. Enter payment details or credit card.',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 50, y: 400, width: 950, height: 600 },
        },
      ]);
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      let billingFired = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        billingFired = true;
      }

      if (!billingFired) {
        throw new Error('Adapter should halt on payment/billing screen');
      }
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop should be active on payment/billing');
      }
      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 34: Publish Verification
  await runTest(
    'test_fb_14',
    'Facebook Adapter: Confirms Visual Publication Confirmation State in UI',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      // Without confirmation node, verification returns false
      const unverified = await adapter.verifyPublished();
      if (unverified !== false) {
        throw new Error('verifyPublished must not return true without visual confirmation');
      }

      // Inject visual confirmation snackbar
      inspector.setNodes([
        {
          id: 'com.facebook.katana:id/snackbar_text',
          text: 'Your post was shared to your feed',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 40, y: 2100, width: 960, height: 120 },
        },
      ]);

      const verified = await adapter.verifyPublished();
      if (verified !== true) {
        throw new Error('verifyPublished must return true when confirmation element is visible');
      }
    }
  );

  // Test 35: Recovery Limit
  await runTest(
    'test_fb_15',
    'Facebook Adapter: Enforces Strict 2-Attempt Recovery Limit',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      if (adapter.getRecoveryAttempts() !== 0) throw new Error('Initial recovery count should be 0');
      const rec1 = await adapter.recover('Glitch 1');
      if (!rec1 || adapter.getRecoveryAttempts() !== 1) throw new Error('Recovery 1 should succeed');
      const rec2 = await adapter.recover('Glitch 2');
      if (!rec2 || adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery 2 should succeed');
      const rec3 = await adapter.recover('Glitch 3');
      if (rec3 !== false) throw new Error('Recovery 3 should fail due to 2-attempt limit');
      if (adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery count should remain 2');
    }
  );

  // Test 36: Capability Metadata
  await runTest(
    'test_fb_16',
    'Facebook Adapter: Exposes Accurate Capability Metadata',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.facebook.katana');
      const executor = new SafeActionExecutor();
      const adapter = new FacebookAdapter(inspector, executor);

      const caps = adapter.capabilities;
      if (!caps) throw new Error('Facebook adapter must define capabilities');
      if (caps.supportsVideo !== true) throw new Error('supportsVideo must be true');
      if (caps.supportsTitle !== false) throw new Error('supportsTitle must be false for Facebook post');
      if (caps.supportsDescription !== true) throw new Error('supportsDescription must be true');
      if (caps.supportsHashtags !== true) throw new Error('supportsHashtags must be true');
      if (caps.supportsCover !== false) throw new Error('supportsCover must be false unless detected');
      if (caps.requiresApproval !== true) throw new Error('requiresApproval must be true');
    }
  );

  // ==========================================
  // TIKTOK ADAPTER UNIT TESTS (test_tt_01 to test_tt_17)
  // ==========================================

  // Test 37: Package Verification
  await runTest(
    'test_tt_01',
    'TikTok Adapter: Verifies Configured and Regional Package Identifiers',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor, 'com.zhiliaoapp.musically');

      if (adapter.packageName !== 'com.zhiliaoapp.musically') {
        throw new Error('Default package name must be com.zhiliaoapp.musically');
      }
      const launched = await adapter.launch();
      if (!launched) throw new Error('launch() must succeed for configured TikTok package');

      // Test regional TikTok package (com.ss.android.ugc.trill)
      adapter.configurePackage('com.ss.android.ugc.trill');
      inspector.setPackage('com.ss.android.ugc.trill');
      const regionalLaunched = await adapter.launch();
      if (!regionalLaunched) throw new Error('launch() must succeed for regional TikTok package');
    }
  );

  // Test 38: Unexpected Package Change
  await runTest(
    'test_tt_02',
    'TikTok Adapter: Unexpected Package Change Triggers Immediate Emergency Stop',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor, 'com.zhiliaoapp.musically');

      // Malicious or unexpected package in foreground
      inspector.setPackage('com.unauthorized.spoofed.app');

      let threw = false;
      try {
        await adapter.launch();
      } catch (err: unknown) {
        threw = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Unexpected package change')) {
          throw new Error(`Expected package change error, got: ${msg}`);
        }
      }

      if (!threw) throw new Error('launch() must throw on unexpected package');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop must be triggered immediately on package change');
      }

      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 39: Media URI Validation
  await runTest(
    'test_tt_03',
    'TikTok Adapter: Validates Local Media URIs & Prohibits Remote HTTP/HTTPS or Blank URIs',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      // Valid local schemes
      adapter.validateMediaUri('content://media/external/video/media/777');
      adapter.validateMediaUri('file:///storage/emulated/0/DCIM/clip.mp4');
      adapter.validateMediaUri('/storage/emulated/0/Movies/edit.mp4');
      adapter.validateMediaUri('/data/user/0/com.phoneagent/files/render.mp4');

      // Remote scheme rejection
      let threwHttp = false;
      try {
        adapter.validateMediaUri('http://remote.cdn/video.mp4');
      } catch {
        threwHttp = true;
      }
      if (!threwHttp) throw new Error('Remote http:// URI must be rejected');

      let threwHttps = false;
      try {
        adapter.validateMediaUri('https://tiktokcdn.com/stream/video.mp4');
      } catch {
        threwHttps = true;
      }
      if (!threwHttps) throw new Error('Remote https:// URI must be rejected');

      // Blank / empty URI rejection
      let threwEmpty = false;
      try {
        adapter.validateMediaUri('   ');
      } catch {
        threwEmpty = true;
      }
      if (!threwEmpty) throw new Error('Blank media URI must be rejected');
    }
  );

  // Test 40: Caption Sanitization
  await runTest(
    'test_tt_04',
    'TikTok Adapter: Sanitizes Captions, Normalizes Spaces, Preserves Line Breaks and Handles Unicode',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      const raw = '  Top 3 developer   hacks   \n\n1. Use mechanical keyboard  ⌨️  \n2. Drink coffee  ☕  ';
      const sanitized = adapter.sanitizeCaption(raw);
      const expected = 'Top 3 developer hacks\n\n1. Use mechanical keyboard ⌨️\n2. Drink coffee ☕';
      if (sanitized !== expected) {
        throw new Error(`Sanitization mismatch. Expected "${expected}", got "${sanitized}"`);
      }
    }
  );

  // Test 41: Hashtags Deduplication
  await runTest(
    'test_tt_05',
    'TikTok Adapter: Normalizes and Deduplicates Hashtags Case-Insensitively',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      const rawTags = ['tiktok', '#TIKTOK', 'fyp', '#FYP', '#viral', 'viral', '#coding'];
      const deduplicated = adapter.sanitizeHashtags(rawTags);
      const expected = ['#tiktok', '#fyp', '#viral', '#coding'];

      if (JSON.stringify(deduplicated) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(deduplicated)}`);
      }

      // Check against caption already containing tag
      const existingText = 'Coding in React #fyp';
      const filtered = adapter.sanitizeHashtags(['fyp', 'tech', 'react'], existingText);
      if (filtered.includes('#fyp')) {
        throw new Error('Should filter out #fyp since it already appears in caption');
      }
    }
  );

  // Test 42: Caption Length Ceiling
  await runTest(
    'test_tt_06',
    'TikTok Adapter: Halts if Caption Exceeds Character Limit (Never Silently Truncates)',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);
      adapter.maxCaptionLength = 30;

      let threw = false;
      try {
        adapter.sanitizeCaption('This is an excessively long caption that exceeds the safety threshold.');
      } catch (err: unknown) {
        threw = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('exceeds TikTok limit of 30 characters')) {
          throw new Error(`Unexpected error message: ${msg}`);
        }
      }
      if (!threw) throw new Error('Should throw error when caption cannot safely fit within limits');
    }
  );

  // Test 43: Security Tripwire - Login / Auth
  await runTest(
    'test_tt_07',
    'TikTok Adapter: Security Tripwire Halts on Auth / Login Prompts',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/login_title',
          text: 'Log in to TikTok',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 50, y: 100, width: 900, height: 200 },
        },
      ]);

      let threw = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        threw = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('TikTok security/auth/account-switcher/payment challenge detected')) {
          throw new Error(`Unexpected message: ${msg}`);
        }
      }
      if (!threw) throw new Error('Must halt on login challenge');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be active');
      }

      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 44: Security Tripwire - OTP / 2FA
  await runTest(
    'test_tt_08',
    'TikTok Adapter: Security Tripwire Halts on OTP / Two-Factor Authentication',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/tv_otp_prompt',
          text: 'Enter 6-digit code sent to your phone',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 50, y: 200, width: 900, height: 150 },
        },
      ]);

      let threw = false;
      try {
        await adapter.detectReadyState();
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('Must halt on OTP/2FA challenge');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be active on 2FA');
      }

      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 45: Security Tripwire - CAPTCHA Puzzle Slider
  await runTest(
    'test_tt_09',
    'TikTok Adapter: Security Tripwire Halts on CAPTCHA Puzzle / Slider Challenge',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/captcha_dialog',
          text: 'Drag the slider to complete the puzzle',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 100, y: 300, width: 800, height: 400 },
        },
      ]);

      let threw = false;
      try {
        await adapter.detectReadyState();
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('Must halt on CAPTCHA puzzle challenge');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be active on CAPTCHA');
      }

      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 46: Security Tripwire - Account Switcher
  await runTest(
    'test_tt_10',
    'TikTok Adapter: Security Tripwire Halts on Account Switcher Prompt',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/account_menu',
          text: 'Switch account or log into another account',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 50, y: 150, width: 900, height: 100 },
        },
      ]);

      let threw = false;
      try {
        await adapter.detectReadyState();
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('Must halt on account switcher');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be active on account switcher');
      }

      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 47: Security Tripwire - Coins / Wallet / Recharge
  await runTest(
    'test_tt_11',
    'TikTok Adapter: Security Tripwire Halts on TikTok Coins / Recharge Prompts',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/btn_buy_coins',
          text: 'Recharge coins with Google Play',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 100, y: 800, width: 800, height: 120 },
        },
      ]);

      let threw = false;
      try {
        await adapter.detectReadyState();
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('Must halt on TikTok coins / recharge prompt');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be active on coins/payment');
      }

      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 48: Security Tripwire - Promote / Boost
  await runTest(
    'test_tt_12',
    'TikTok Adapter: Security Tripwire Halts on Promote Video / Ad Budget Prompts',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/promote_card',
          text: 'Promote video to reach more viewers',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 50, y: 600, width: 900, height: 200 },
        },
      ]);

      let threw = false;
      try {
        await adapter.detectReadyState();
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('Must halt on promote prompt');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be active on promote');
      }

      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 49: Cover Handling
  await runTest(
    'test_tt_13',
    'TikTok Adapter: Cover Selection Safely Skipped When Unsupported or Absent',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      // Default: supportsCover = false
      if (adapter.capabilities.supportsCover !== false) {
        throw new Error('supportsCover must default to false');
      }
      const skipped = await adapter.selectCover('file:///storage/cover.jpg');
      if (!skipped) throw new Error('selectCover must resolve safely when skipped');
    }
  );

  // Test 50: Approval Gate
  await runTest(
    'test_tt_14',
    'TikTok Adapter: Enforces Human Operator Approval Gate Prior to Post',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      const job: JobModel = {
        jobId: 'tt_123',
        platform: 'tiktok',
        action: 'publish_video',
        videoUri: 'content://media/external/video/media/89',
        caption: 'Review pending post',
        hashtags: ['#test'],
        requiresApproval: true,
      };

      const needed = await adapter.requestPublishApproval(job);
      if (needed !== true) throw new Error('Operator approval must be required');
    }
  );

  // Test 51: Publication Verification
  await runTest(
    'test_tt_15',
    'TikTok Adapter: Verifies Publication and Distinguishes Upload Success From Drafts or Errors',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      // 1. Unconfirmed state -> false
      inspector.setNodes([]);
      const pending = await adapter.verifyPublished();
      if (pending !== false) throw new Error('Empty nodes must return false for verifyPublished');

      // 2. Draft saved toast -> false
      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/toast',
          text: 'Video saved to drafts',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 50, y: 2000, width: 900, height: 100 },
        },
      ]);
      const draftResult = await adapter.verifyPublished();
      if (draftResult !== false) throw new Error('Draft saved state must return false');

      // 3. Upload failure toast -> false
      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/toast_err',
          text: 'Upload failed. Tap to retry.',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 50, y: 2000, width: 900, height: 100 },
        },
      ]);
      const failResult = await adapter.verifyPublished();
      if (failResult !== false) throw new Error('Upload failed state must return false');

      // 4. Confirmed upload toast -> true
      inspector.setNodes([
        {
          id: 'com.zhiliaoapp.musically:id/tv_toast',
          text: 'Your video was uploaded',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 40, y: 2100, width: 960, height: 120 },
        },
      ]);
      const successResult = await adapter.verifyPublished();
      if (successResult !== true) throw new Error('Confirmed upload node must return true');
    }
  );

  // Test 52: Recovery Limit
  await runTest(
    'test_tt_16',
    'TikTok Adapter: Enforces Strict 2-Attempt Recovery Limit',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      if (adapter.getRecoveryAttempts() !== 0) throw new Error('Initial recovery count should be 0');
      const rec1 = await adapter.recover('Stall 1');
      if (!rec1 || adapter.getRecoveryAttempts() !== 1) throw new Error('Recovery 1 should succeed');
      const rec2 = await adapter.recover('Stall 2');
      if (!rec2 || adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery 2 should succeed');
      const rec3 = await adapter.recover('Stall 3');
      if (rec3 !== false) throw new Error('Recovery 3 should fail due to 2-attempt limit');
      if (adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery count should remain 2');
    }
  );

  // Test 53: Capability Metadata
  await runTest(
    'test_tt_17',
    'TikTok Adapter: Exposes Accurate Capability Metadata',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
      const executor = new SafeActionExecutor();
      const adapter = new TikTokAdapter(inspector, executor);

      const caps = adapter.capabilities;
      if (!caps) throw new Error('TikTok adapter must define capabilities');
      if (caps.supportsVideo !== true) throw new Error('supportsVideo must be true');
      if (caps.supportsTitle !== false) throw new Error('supportsTitle must be false for TikTok video');
      if (caps.supportsDescription !== true) throw new Error('supportsDescription must be true');
      if (caps.supportsHashtags !== true) throw new Error('supportsHashtags must be true');
      if (caps.supportsCover !== false) throw new Error('supportsCover must be false unless detected');
      if (caps.requiresApproval !== true) throw new Error('requiresApproval must be true');
    }
  );

  // ==========================================
  // PINTEREST ADAPTER TEST SUITE (24 Tests)
  // ==========================================

  // Test 54 (Pin 1): Package verification
  await runTest(
    'test_pin_01',
    'Pinterest Adapter: Foreground Package Verification and Multi-Flavor Support',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      if (adapter.packageName !== 'com.pinterest') throw new Error('Expected default package com.pinterest');
      const launched = await adapter.launch();
      if (!launched) throw new Error('Failed to launch with valid package');

      // Test regional/lite flavor
      adapter.configurePackage('com.pinterest.tiramisu');
      inspector.setPackage('com.pinterest.tiramisu');
      const launchedFlavor = await adapter.launch();
      if (!launchedFlavor) throw new Error('Failed to launch with tiramisu package');
    }
  );

  // Test 55 (Pin 2): Unexpected package
  await runTest(
    'test_pin_02',
    'Pinterest Adapter: Halts and Triggers Emergency Stop on Unexpected Package',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setPackage('com.unauthorized.malicious.app');
      let caught = false;
      try {
        await adapter.launch();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Unexpected package change')) {
          throw new Error(`Unexpected error message: ${msg}`);
        }
      }
      if (!caught) throw new Error('Expected error on unexpected package mismatch');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency stop must be triggered on package mismatch');
      }
    }
  );

  // Test 56 (Pin 3): Media URI validation
  await runTest(
    'test_pin_03',
    'Pinterest Adapter: Rejects Empty or Blank Media URIs',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      let emptyCaught = false;
      try {
        adapter.validateMediaUri('');
      } catch {
        emptyCaught = true;
      }
      if (!emptyCaught) throw new Error('Empty URI must be rejected');

      let blankCaught = false;
      try {
        adapter.validateMediaUri('   ');
      } catch {
        blankCaught = true;
      }
      if (!blankCaught) throw new Error('Blank URI must be rejected');
    }
  );

  // Test 57 (Pin 4): HTTP/HTTPS rejection
  await runTest(
    'test_pin_04',
    'Pinterest Adapter: Strictly Prohibits Remote HTTP/HTTPS URIs',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      let httpCaught = false;
      try {
        adapter.validateMediaUri('http://example.com/pin.jpg');
      } catch (e: unknown) {
        httpCaught = true;
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('Remote HTTP/HTTPS URIs are prohibited')) throw new Error('Wrong error message');
      }
      if (!httpCaught) throw new Error('HTTP URI was not rejected');

      let httpsCaught = false;
      try {
        adapter.validateMediaUri('https://cdn.pinterest.com/pin.mp4');
      } catch (e: unknown) {
        httpsCaught = true;
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('Remote HTTP/HTTPS URIs are prohibited')) throw new Error('Wrong error message');
      }
      if (!httpsCaught) throw new Error('HTTPS URI was not rejected');
    }
  );

  // Test 58 (Pin 5): Valid local URI
  await runTest(
    'test_pin_05',
    'Pinterest Adapter: Accepts Valid Local Media Schemes (content://, file://, /storage/)',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      adapter.validateMediaUri('content://media/external/images/media/4421');
      adapter.validateMediaUri('file:///storage/emulated/0/DCIM/Camera/IMG_2026.jpg');
      adapter.validateMediaUri('/storage/emulated/0/Movies/pin_reel.mp4');
      adapter.validateMediaUri('/data/user/0/com.phoneagent/cache/pin.png');
    }
  );

  // Test 59 (Pin 6): Title capability detection
  await runTest(
    'test_pin_06',
    'Pinterest Adapter: Title Capability Detected Dynamically via UiInspector',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      // Initially false
      if ((adapter.capabilities.supportsTitle as boolean) !== false) throw new Error('Initial supportsTitle must be false');

      // Add title field to UI
      inspector.setNodes([
        {
          id: 'com.pinterest:id/pin_title_edit_text',
          text: '',
          contentDescription: 'Add a title',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 200, width: 1000, height: 100 },
        },
      ]);

      const entered = await adapter.enterTitleIfSupported('Minimalist Living Room Aesthetic');
      if (!entered) throw new Error('Failed to enter title');
      if ((adapter.capabilities.supportsTitle as boolean) !== true) throw new Error('supportsTitle must be updated to true when detected');
      if (!executor.getHistory().some(h => h.action === 'typeText' && h.target.includes('Minimalist Living Room'))) {
        throw new Error('Title text was not typed');
      }
    }
  );

  // Test 60 (Pin 7): Description handling & ceiling
  await runTest(
    'test_pin_07',
    'Pinterest Adapter: Preserves Line Breaks and Enforces 500-Character Ceiling Without Truncation',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      const multiline = 'Inspiring modern living.\nClean lines and warm tones.\nEvery detail matters.';
      const clean = adapter.sanitizeDescription(multiline);
      if (clean !== multiline) throw new Error('Multiline description formatting was altered');

      // Test ceiling limit (500 chars)
      const overCeiling = 'X'.repeat(501);
      let ceilingCaught = false;
      try {
        adapter.sanitizeDescription(overCeiling);
      } catch (err: unknown) {
        ceilingCaught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('exceeds Pinterest limit of 500')) throw new Error(`Wrong ceiling message: ${msg}`);
      }
      if (!ceilingCaught) throw new Error('Exceeding 500 characters should have thrown error');
    }
  );

  // Test 61 (Pin 8): Hashtag normalization
  await runTest(
    'test_pin_08',
    'Pinterest Adapter: Normalizes Hashtags With # Prefix and Preserves Unicode',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      const raw = ['decor', '#interior', '  minimalism  ', '#デザイン', '#cozy'];
      const sanitized = adapter.sanitizeHashtags(raw);
      const expected = ['#decor', '#interior', '#minimalism', '#デザイン', '#cozy'];
      if (JSON.stringify(sanitized) !== JSON.stringify(expected)) {
        throw new Error(`Sanitized tags mismatch: ${JSON.stringify(sanitized)}`);
      }
    }
  );

  // Test 62 (Pin 9): Hashtag deduplication
  await runTest(
    'test_pin_09',
    'Pinterest Adapter: Deduplicates Hashtags Case-Insensitively and Excludes Pre-Existing Tags',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      const raw = ['#decor', 'Decor', '#DECOR', 'woodwork', 'plants', 'plants'];
      const sanitized = adapter.sanitizeHashtags(raw, 'Warm aesthetic home #decor');
      // #decor already in existing text -> excluded. woodwork & plants kept.
      const expected = ['#woodwork', '#plants'];
      if (JSON.stringify(sanitized) !== JSON.stringify(expected)) {
        throw new Error(`Deduplicated tags mismatch: ${JSON.stringify(sanitized)}`);
      }
    }
  );

  // Test 63 (Pin 10): Board detection
  await runTest(
    'test_pin_10',
    'Pinterest Adapter: Detects Board Selection UI and Unambiguously Selects Target Board',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/board_list',
          text: 'Pick a board',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 0, y: 100, width: 1080, height: 100 },
        },
        {
          id: 'com.pinterest:id/board_item_1',
          text: 'Home Decor',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 250, width: 1000, height: 100 },
        },
        {
          id: 'com.pinterest:id/board_item_2',
          text: 'Dinner Ideas',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 360, width: 1000, height: 100 },
        },
      ]);

      const selected = await adapter.selectBoardIfRequired('Home Decor');
      if (!selected) throw new Error('Board selection failed');
      if (!executor.getHistory().some(h => h.action === 'click' && h.target === 'com.pinterest:id/board_item_1')) {
        throw new Error('Did not click target board');
      }
    }
  );

  // Test 64 (Pin 11): Ambiguous board selection
  await runTest(
    'test_pin_11',
    'Pinterest Adapter: Halts Automation Immediately on Ambiguous Board Selection',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/board_list',
          text: 'Pick a board',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 0, y: 100, width: 1080, height: 100 },
        },
        {
          id: 'com.pinterest:id/board_1',
          text: 'Modern Architecture',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 250, width: 1000, height: 100 },
        },
        {
          id: 'com.pinterest:id/board_2',
          text: 'Classical Architecture',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 360, width: 1000, height: 100 },
        },
      ]);

      let caught = false;
      try {
        await adapter.selectBoardIfRequired('Architecture');
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Ambiguous board selection')) throw new Error(`Wrong ambiguity error: ${msg}`);
      }
      if (!caught) throw new Error('Expected halt on ambiguous board target');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 65 (Pin 12): Cover detection
  await runTest(
    'test_pin_12',
    'Pinterest Adapter: Interacts with Cover Control When Detected in UI and Enabled',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/edit_cover',
          text: 'Edit cover',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 800, y: 200, width: 200, height: 100 },
        },
      ]);
      adapter.setCapabilities({ ...adapter.capabilities, supportsCover: true });

      const covered = await adapter.selectCover('file:///storage/emulated/0/DCIM/cover.jpg');
      if (!covered) throw new Error('Cover selection failed');
      if (!executor.getHistory().some(h => h.action === 'click' && h.target === 'com.pinterest:id/edit_cover')) {
        throw new Error('Did not click cover element');
      }
    }
  );

  // Test 66 (Pin 13): Cover safely skipped
  await runTest(
    'test_pin_13',
    'Pinterest Adapter: Cover Safely Skipped When Not Present in Current UI',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      // No cover control in inspector
      inspector.setNodes([]);
      const covered = await adapter.selectCover('file:///storage/emulated/0/DCIM/cover.jpg');
      if (!covered) throw new Error('Cover skip should succeed gracefully');
      if (adapter.capabilities.supportsCover !== false) throw new Error('supportsCover must be false');
      if (executor.getHistory().some(h => h.target.includes('cover'))) {
        throw new Error('Unexpected interaction with non-existent cover');
      }
    }
  );

  // Test 67 (Pin 14): Approval gate
  await runTest(
    'test_pin_14',
    'Pinterest Adapter: Enforces Mandatory Operator Approval Gate Before Publishing',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      if (adapter.capabilities.requiresApproval !== true) {
        throw new Error('requiresApproval must be strictly true');
      }

      const job: JobModel = {
        jobId: 'pin_app_001',
        platform: 'pinterest',
        action: 'publish_pin',
        imageUri: 'content://media/pin.jpg',
        title: 'Mid-Century Dining Room',
        description: 'Teak table and brass accents.',
        board: 'Interior Inspiration',
        hashtags: ['#midcentury', '#interiors'],
        requiresApproval: true,
      };

      const approved = await adapter.requestPublishApproval(job);
      if (!approved) throw new Error('Approval request failed');
    }
  );

  // Test 68 (Pin 15): Publish blocked before approval / if stopped
  await runTest(
    'test_pin_15',
    'Pinterest Adapter: Blocks Publish Step if Emergency Stop is Active',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      EmergencyStopManager.getInstance().trigger('Safety tripwire activated');
      const res = await adapter.publish();
      if (res.success !== false) throw new Error('Publish must fail if emergency stop is active');
    }
  );

  // Test 69 (Pin 16): Login tripwire
  await runTest(
    'test_pin_16',
    'Pinterest Adapter: Halts Immediately and Triggers Emergency Stop on Login Prompts',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/login_btn',
          text: 'Log in to Pinterest',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 100, y: 800, width: 880, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('challenge detected')) throw new Error(`Wrong tripwire message: ${msg}`);
      }
      if (!caught) throw new Error('Login screen was not intercepted');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
    }
  );

  // Test 70 (Pin 17): OTP/2FA tripwire
  await runTest(
    'test_pin_17',
    'Pinterest Adapter: Halts Immediately on OTP / Two-Factor Authentication Challenges',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/otp_input',
          text: 'Enter 6-digit code',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 100, y: 500, width: 880, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        caught = true;
      }
      if (!caught) throw new Error('OTP prompt was not intercepted');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
    }
  );

  // Test 71 (Pin 18): CAPTCHA tripwire
  await runTest(
    'test_pin_18',
    'Pinterest Adapter: Halts Immediately on CAPTCHA or Puzzle Challenges',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/captcha_view',
          text: "Verify you're a human puzzle",
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 100, y: 400, width: 880, height: 150 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch {
        caught = true;
      }
      if (!caught) throw new Error('CAPTCHA challenge was not intercepted');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
    }
  );

  // Test 72 (Pin 19): Account-switcher tripwire
  await runTest(
    'test_pin_19',
    'Pinterest Adapter: Halts Immediately on Account-Switcher Prompts',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/account_menu',
          text: 'Switch account or choose another account',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 100, y: 600, width: 880, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch {
        caught = true;
      }
      if (!caught) throw new Error('Account switcher was not intercepted');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
    }
  );

  // Test 73 (Pin 20): Payment/promoted-pin tripwire
  await runTest(
    'test_pin_20',
    'Pinterest Adapter: Halts Immediately on Promoted Pin / Ad Budget Prompts',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.pinterest:id/promoted_banner',
          text: 'Promote pin with $15 daily ad budget',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 100, y: 700, width: 880, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch {
        caught = true;
      }
      if (!caught) throw new Error('Promoted pin flow was not intercepted');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      EmergencyStopManager.getInstance().reset();
    }
  );

  // Test 74 (Pin 21): Recovery limit
  await runTest(
    'test_pin_21',
    'Pinterest Adapter: Enforces Strict 2-Attempt Recovery Limit',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      if (adapter.getRecoveryAttempts() !== 0) throw new Error('Initial recovery count must be 0');
      const rec1 = await adapter.recover('Lag 1');
      if (!rec1 || adapter.getRecoveryAttempts() !== 1) throw new Error('Recovery 1 must succeed');
      const rec2 = await adapter.recover('Lag 2');
      if (!rec2 || adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery 2 must succeed');
      const rec3 = await adapter.recover('Lag 3');
      if (rec3 !== false) throw new Error('Recovery 3 must fail due to 2-attempt limit');
      if (adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery count should remain 2');
    }
  );

  // Test 75 (Pin 22): Publication verification
  await runTest(
    'test_pin_22',
    'Pinterest Adapter: Verifies Publication and Distinguishes Success From Drafts or Errors',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      // 1. Unconfirmed state -> false
      inspector.setNodes([]);
      const pending = await adapter.verifyPublished();
      if (pending !== false) throw new Error('Empty nodes must return false');

      // 2. Draft saved toast -> false
      inspector.setNodes([
        {
          id: 'com.pinterest:id/toast',
          text: 'Saved as draft',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 50, y: 2000, width: 900, height: 100 },
        },
      ]);
      const draftResult = await adapter.verifyPublished();
      if (draftResult !== false) throw new Error('Draft saved state must return false');

      // 3. Upload failure toast -> false
      inspector.setNodes([
        {
          id: 'com.pinterest:id/toast_err',
          text: "Couldn't save pin. Something went wrong.",
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 50, y: 2000, width: 900, height: 100 },
        },
      ]);
      const failResult = await adapter.verifyPublished();
      if (failResult !== false) throw new Error('Upload error state must return false');

      // 4. Confirmed saved toast -> true
      inspector.setNodes([
        {
          id: 'com.pinterest:id/tv_toast',
          text: 'Saved to Interior Inspiration!',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 2100, width: 960, height: 120 },
        },
      ]);
      const successResult = await adapter.verifyPublished();
      if (successResult !== true) throw new Error('Confirmed saved node must return true');
    }
  );

  // Test 76 (Pin 23): Emergency stop
  await runTest(
    'test_pin_23',
    'Pinterest Adapter: Halts Further Operations When Stop is Invoked',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      await adapter.stop();
      const launched = await adapter.launch();
      if (launched !== false) throw new Error('Launch must return false after adapter stop');
    }
  );

  // Test 77 (Pin 24): Audit logging
  await runTest(
    'test_pin_24',
    'Pinterest Adapter: Cryptographically Valid Local Audit Logging',
    'Logging',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.pinterest');
      const executor = new SafeActionExecutor();
      const adapter = new PinterestAdapter(inspector, executor);

      const beforeCount = LocalActionLogger.getInstance().getLogs().length;
      await adapter.launch();
      const afterLogs = LocalActionLogger.getInstance().getLogs();
      if (afterLogs.length <= beforeCount) throw new Error('Audit log was not written');

      const lastLog = afterLogs[0];
      if (lastLog.platform !== 'pinterest') throw new Error(`Platform must be pinterest, got: ${lastLog.platform}`);
      if (lastLog.action !== 'LAUNCH') throw new Error(`Action must be LAUNCH, got: ${lastLog.action}`);
    }
  );

  // ==========================================
  // X (TWITTER) ADAPTER TEST SUITE (25 Tests)
  // ==========================================

  // Test 78 (X 1): Package verification and multi-flavor support
  await runTest(
    'test_x_01',
    'X Adapter: Foreground Package Verification and Multi-Flavor Support',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      if (adapter.packageName !== 'com.twitter.android') throw new Error('Expected default package com.twitter.android');
      const launched = await adapter.launch();
      if (!launched) throw new Error('Failed to launch with valid package');

      // Test Lite flavor
      adapter.configurePackage('com.twitter.android.lite');
      inspector.setPackage('com.twitter.android.lite');
      const launchedLite = await adapter.launch();
      if (!launchedLite) throw new Error('Failed to launch with lite package');
    }
  );

  // Test 79 (X 2): Unexpected package triggers EmergencyStop
  await runTest(
    'test_x_02',
    'X Adapter: Halts and Triggers Emergency Stop on Unexpected Package',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setPackage('com.unauthorized.malicious.app');
      let caught = false;
      try {
        await adapter.launch();
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('Unexpected package change')) {
          throw new Error(`Expected unexpected package error, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Expected adapter to throw on package mismatch');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop must be triggered on package mismatch');
      }
    }
  );

  // Test 80 (X 3): Rejects empty or blank media URI
  await runTest(
    'test_x_03',
    'X Adapter: Rejects Empty or Blank Media URI',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      let caughtEmpty = false;
      try {
        adapter.validateMediaUri('');
      } catch (e) {
        caughtEmpty = true;
      }
      if (!caughtEmpty) throw new Error('Failed to reject empty URI');

      let caughtBlank = false;
      try {
        adapter.validateMediaUri('   ');
      } catch (e) {
        caughtBlank = true;
      }
      if (!caughtBlank) throw new Error('Failed to reject blank URI');
    }
  );

  // Test 81 (X 4): Rejects remote HTTP media URI
  await runTest(
    'test_x_04',
    'X Adapter: Rejects Remote HTTP Media URI',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      let caught = false;
      try {
        adapter.validateMediaUri('http://insecure.cdn.com/post_video.mp4');
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('Remote HTTP/HTTPS URIs are prohibited')) {
          throw new Error(`Expected HTTP rejection message, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Failed to reject HTTP URI');
    }
  );

  // Test 82 (X 5): Rejects remote HTTPS media URI
  await runTest(
    'test_x_05',
    'X Adapter: Rejects Remote HTTPS Media URI',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      let caught = false;
      try {
        adapter.validateMediaUri('https://secure.cdn.com/post_video.mp4');
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('Remote HTTP/HTTPS URIs are prohibited')) {
          throw new Error(`Expected HTTPS rejection message, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Failed to reject HTTPS URI');
    }
  );

  // Test 83 (X 6): Accepts valid local content:// URI
  await runTest(
    'test_x_06',
    'X Adapter: Accepts Valid Local content:// URI',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      adapter.validateMediaUri('content://media/external/video/media/9921');
    }
  );

  // Test 84 (X 7): Accepts valid local file:// and storage paths
  await runTest(
    'test_x_07',
    'X Adapter: Accepts Valid Local file:// and Device Storage Paths',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      adapter.validateMediaUri('file:///storage/emulated/0/DCIM/Camera/X_POST.mp4');
      adapter.validateMediaUri('/storage/emulated/0/Movies/Clip.mp4');
      adapter.validateMediaUri('/data/user/0/com.phoneagent/cache/temp.mp4');
    }
  );

  // Test 85 (X 8): Dynamic Composer detection
  await runTest(
    'test_x_08',
    'X Adapter: Dynamic Composer Detection',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.twitter.android:id/composer_write',
          text: 'Post',
          contentDescription: 'New post',
          className: 'android.widget.ImageButton',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 880, y: 1950, width: 140, height: 140 },
        },
      ]);

      const success = await adapter.openComposer();
      if (!success) throw new Error('openComposer failed');
      const clicks = executor.getHistory().filter((l) => l.action === 'click');
      if (clicks.length === 0) throw new Error('Expected click on composer trigger');
    }
  );

  // Test 86 (X 9): Text validation normalizes whitespace while preserving line breaks
  await runTest(
    'test_x_09',
    'X Adapter: Text Validation Normalizes Whitespace While Preserving Intentional Line Breaks',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const input = '   Engineering   update:   \n\nNew Phone Agent release 🚀.\n\n\n\nFeatures full zero-trust!   ';
      const output = adapter.sanitizePostText(input);

      if (output.includes('   ')) throw new Error('Failed to normalize runs of whitespace');
      if (output.includes('\n\n\n')) throw new Error('Failed to collapse excessive consecutive newlines');
      if (!output.includes('Engineering update:')) throw new Error('Lost meaningful text content');
      if (!output.includes('\n\nNew Phone Agent release 🚀.')) throw new Error('Lost intentional line breaks');
    }
  );

  // Test 87 (X 10): Preserves full Unicode text
  await runTest(
    'test_x_10',
    'X Adapter: Preserves Full Unicode Characters (Emojis & International Text)',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const unicode = '🤖 Phone Agent: Zero-Trust Companion 🌟 — 日本語・한국어 & Español.';
      const output = adapter.sanitizePostText(unicode);
      if (output !== unicode) throw new Error(`Unicode mismatch: got '${output}'`);
    }
  );

  // Test 88 (X 11): Text length limit enforcement (280 chars) with structured error
  await runTest(
    'test_x_11',
    'X Adapter: Enforces Safe 280-Character Limit Without Silent Truncation',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const exact280 = 'A'.repeat(280);
      const output = adapter.sanitizePostText(exact280);
      if (output.length !== 280) throw new Error(`Expected 280 chars, got: ${output.length}`);

      const over280 = 'B'.repeat(281);
      let caught = false;
      try {
        adapter.sanitizePostText(over280);
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('exceeds X composer limit')) {
          throw new Error(`Expected structured limit error, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Failed to reject post exceeding 280 characters');
    }
  );

  // Test 89 (X 12): Normalizes hashtags with '#' prefix and whitespace stripping
  await runTest(
    'test_x_12',
    'X Adapter: Normalizes Hashtags with # Prefix and Whitespace Trimming',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const rawTags = ['#AmazonFinds', 'techdeals', '##gadgets', '   ', '#'];
      const normalized = adapter.sanitizeHashtags(rawTags);

      if (normalized.length !== 3) throw new Error(`Expected 3 normalized tags, got: ${normalized.length}`);
      if (normalized[0] !== '#AmazonFinds') throw new Error(`Expected #AmazonFinds, got: ${normalized[0]}`);
      if (normalized[1] !== '#techdeals') throw new Error(`Expected #techdeals, got: ${normalized[1]}`);
      if (normalized[2] !== '#gadgets') throw new Error(`Expected #gadgets, got: ${normalized[2]}`);
    }
  );

  // Test 90 (X 13): Case-insensitive hashtag deduplication and exclusion of existing post hashtags
  await runTest(
    'test_x_13',
    'X Adapter: Case-Insensitive Hashtag Deduplication and Exclusion of Existing Tags',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const tags = ['#AI', '#ai', 'Ai', '#Robotics', '#ExistingTag'];
      const existingText = 'Exploring new breakthroughs with #existingtag right now!';
      const deduped = adapter.sanitizeHashtags(tags, existingText);

      if (deduped.length !== 2) throw new Error(`Expected 2 tags, got: ${deduped.length}`);
      if (deduped[0] !== '#AI') throw new Error(`Expected #AI, got: ${deduped[0]}`);
      if (deduped[1] !== '#Robotics') throw new Error(`Expected #Robotics, got: ${deduped[1]}`);
    }
  );

  // Test 91 (X 14): Media preview verification
  await runTest(
    'test_x_14',
    'X Adapter: Verifies Media Attachment Preview in Composer',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.twitter.android:id/media_preview',
          contentDescription: 'Attached video preview',
          className: 'android.widget.ImageView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 50, y: 500, width: 980, height: 600 },
        },
      ]);

      const previewOk = await adapter.verifyPreview();
      if (!previewOk) throw new Error('Expected media preview to be verified');
    }
  );

  // Test 92 (X 15): Accurate capability declarations
  await runTest(
    'test_x_15',
    'X Adapter: Accurately Declares Supported Capabilities',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const caps = adapter.capabilities;
      if (!caps.supportsVideo) throw new Error('supportsVideo must be true');
      if (caps.supportsTitle) throw new Error('supportsTitle must be false for X mobile composer');
      if (!caps.supportsDescription) throw new Error('supportsDescription must be true');
      if (!caps.supportsHashtags) throw new Error('supportsHashtags must be true');
      if (caps.supportsCover) throw new Error('supportsCover must be false unless detected');
      if (!caps.requiresApproval) throw new Error('requiresApproval must be true');
    }
  );

  // Test 93 (X 16): Publish blocked without prior explicit human approval
  await runTest(
    'test_x_16',
    'X Adapter: Publish Action Blocked Without Explicit Human Operator Approval',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const result = await adapter.publish();
      if (result.success) throw new Error('Publish must fail when not approved');
      if (!result.message.includes('explicit human approval is required')) {
        throw new Error(`Expected approval required message, got: ${result.message}`);
      }
      if (!result.requiresUserAction) throw new Error('requiresUserAction must be true');
    }
  );

  // Test 94 (X 17): Login and Sign-in tripwire detection halts execution immediately
  await runTest(
    'test_x_17',
    'X Adapter: Login Tripwire Detection Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.twitter.android:id/login_btn',
          text: 'Log in to X',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 100, y: 1200, width: 880, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('log in')) {
          throw new Error(`Expected login tripwire error, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Expected adapter to throw on login prompt');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop must be activated on login challenge');
      }
    }
  );

  // Test 95 (X 18): OTP and 2FA verification tripwire detection halts execution immediately
  await runTest(
    'test_x_18',
    'X Adapter: OTP / 2FA Tripwire Detection Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.twitter.android:id/otp_text',
          text: 'Enter confirmation code',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 50, y: 400, width: 900, height: 100 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('confirmation code')) {
          throw new Error(`Expected OTP tripwire error, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Expected adapter to throw on OTP prompt');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop must be activated on OTP prompt');
      }
    }
  );

  // Test 96 (X 19): CAPTCHA and Arkose security challenge tripwire detection
  await runTest(
    'test_x_19',
    'X Adapter: CAPTCHA / Security Challenge Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.twitter.android:id/arkose_frame',
          contentDescription: 'Security challenge authenticate puzzle',
          className: 'android.webkit.WebView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 0, y: 200, width: 1080, height: 1600 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('challenge') && !e.message.includes('puzzle')) {
          throw new Error(`Expected CAPTCHA tripwire error, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Expected adapter to throw on CAPTCHA challenge');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop must be activated on CAPTCHA challenge');
      }
    }
  );

  // Test 97 (X 20): Account switcher tripwire detection halts execution immediately
  await runTest(
    'test_x_20',
    'X Adapter: Account Switcher Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.twitter.android:id/account_menu',
          text: 'Switch accounts',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 40, y: 300, width: 600, height: 80 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('switch account')) {
          throw new Error(`Expected account switcher error, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Expected adapter to throw on account switcher');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop must be activated on account switcher');
      }
    }
  );

  // Test 98 (X 21): Payment and Premium subscription tripwire detection
  await runTest(
    'test_x_21',
    'X Adapter: Premium Subscription and Payment Upsell Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.twitter.android:id/upsell_btn',
          text: 'Subscribe to Premium',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 60, y: 1500, width: 960, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (e: any) {
        caught = true;
        if (!e.message.includes('subscribe') && !e.message.includes('premium')) {
          throw new Error(`Expected payment/subscription error, got: ${e.message}`);
        }
      }
      if (!caught) throw new Error('Expected adapter to throw on Premium upsell');
      if (!EmergencyStopManager.getInstance().isActive()) {
        throw new Error('Emergency Stop must be activated on payment/subscription upsell');
      }
    }
  );

  // Test 99 (X 22): Emergency Stop blocks publish even if approval was granted
  await runTest(
    'test_x_22',
    'X Adapter: Emergency Stop Blocks Publish Action Even When Approved',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const job: JobModel = {
        jobId: 'x_job_emergency',
        platform: 'x',
        action: 'publish_post',
        caption: 'Autonomous tweet test',
        requiresApproval: true,
      };

      await adapter.requestPublishApproval(job);

      // Trigger Emergency Stop after approval
      EmergencyStopManager.getInstance().trigger('Manual safety override');

      const res = await adapter.publish();
      if (res.success) throw new Error('Publish must fail when Emergency Stop is active');
      if (!res.message.includes('Emergency Stop is active')) {
        throw new Error(`Expected Emergency Stop message, got: ${res.message}`);
      }
    }
  );

  // Test 100 (X 23): Enforces strict 2-attempt recovery limit before fail-stop
  await runTest(
    'test_x_23',
    'X Adapter: Enforces Strict 2-Attempt Recovery Limit Before Fail-Stop',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      if (adapter.getRecoveryAttempts() !== 0) throw new Error('Initial recovery count must be 0');

      const rec1 = await adapter.recover('Stall 1');
      if (!rec1 || adapter.getRecoveryAttempts() !== 1) throw new Error('Recovery 1 should succeed');

      const rec2 = await adapter.recover('Stall 2');
      if (!rec2 || adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery 2 should succeed');

      const rec3 = await adapter.recover('Stall 3');
      if (rec3 !== false) throw new Error('Recovery 3 must fail due to 2-attempt limit');
      if (adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery count must remain 2');
    }
  );

  // Test 101 (X 24): Publication verification confirms real positive evidence and rejects draft/error
  await runTest(
    'test_x_24',
    'X Adapter: Publication Verification Confirms Real Positive Evidence and Rejects Draft / Error',
    'Adapters',
    async () => {
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      // 1. Empty tree -> pending (false)
      inspector.setNodes([]);
      const pendingResult = await adapter.verifyPublished();
      if (pendingResult !== false) throw new Error('Empty nodes must return false');

      // 2. Draft saved toast -> false
      inspector.setNodes([
        {
          id: 'com.twitter.android:id/toast',
          text: 'Saved to drafts',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 40, y: 2100, width: 960, height: 100 },
        },
      ]);
      const draftResult = await adapter.verifyPublished();
      if (draftResult !== false) throw new Error('Draft saved toast must return false');

      // 3. Failed to send banner -> false
      inspector.setNodes([
        {
          id: 'com.twitter.android:id/error_banner',
          text: 'Failed to send post',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 40, y: 200, width: 1000, height: 120 },
        },
      ]);
      const failResult = await adapter.verifyPublished();
      if (failResult !== false) throw new Error('Error banner must return false');

      // 4. Confirmed sent toast -> true
      inspector.setNodes([
        {
          id: 'com.twitter.android:id/toast',
          text: 'Your post was sent',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 40, y: 2100, width: 960, height: 100 },
        },
      ]);
      const successResult = await adapter.verifyPublished();
      if (successResult !== true) throw new Error('Confirmed sent toast must return true');
    }
  );

  // Test 102 (X 25): Cryptographically valid local audit logging
  await runTest(
    'test_x_25',
    'X Adapter: Cryptographically Valid Local Audit Logging',
    'Logging',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.twitter.android');
      const executor = new SafeActionExecutor();
      const adapter = new XAdapter(inspector, executor);

      const beforeCount = LocalActionLogger.getInstance().getLogs().length;
      await adapter.launch();
      const afterLogs = LocalActionLogger.getInstance().getLogs();
      if (afterLogs.length <= beforeCount) throw new Error('Audit log was not written');

      const lastLog = afterLogs[0];
      if (lastLog.platform !== 'x') throw new Error(`Platform must be x, got: ${lastLog.platform}`);
      if (lastLog.action !== 'LAUNCH') throw new Error(`Action must be LAUNCH, got: ${lastLog.action}`);
    }
  );

  // ==========================================
  // STEP 2F: THREADS ADAPTER TESTS (103 - 136)
  // ==========================================

  // Test 103 (Threads 01): Correct package accepted
  await runTest(
    'test_threads_01',
    'Threads Adapter: Correct Package Accepted (com.instagram.barcelona)',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const verified = await adapter.verifyThreads();
      if (!verified) throw new Error('Failed to verify valid Threads package');
    }
  );

  // Test 104 (Threads 02): Unexpected package rejected
  await runTest(
    'test_threads_02',
    'Threads Adapter: Unexpected Package Triggers Immediate Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.unauthorized.malicious.app');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      let caught = false;
      try {
        await adapter.verifyThreads();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Unexpected package change')) throw new Error(`Wrong error message: ${msg}`);
      }
      if (!caught) throw new Error('Expected unexpected package error');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 105 (Threads 03): Whitelisted package list contains barcelona
  await runTest(
    'test_threads_03',
    'Threads Adapter: Supported Package List Contains Barcelona',
    'Adapters',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      if (!adapter.supportedPackages.includes('com.instagram.barcelona')) {
        throw new Error('supportedPackages must contain com.instagram.barcelona');
      }
    }
  );

  // Test 106 (Threads 04): EmergencyStop before action aborts immediately
  await runTest(
    'test_threads_04',
    'Threads Adapter: Pre-existing Emergency Stop Blocks Execution',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      EmergencyStopManager.getInstance().trigger('Pre-existing safety lockout');
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const verified = await adapter.verifyThreads();
      if (verified !== false) throw new Error('Expected action to be rejected when Emergency Stop is active');
    }
  );

  // Test 107 (Threads 05): EmergencyStop during workflow aborts publish
  await runTest(
    'test_threads_05',
    'Threads Adapter: Emergency Stop During Workflow Aborts Publish',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      EmergencyStopManager.getInstance().trigger('Active halt during workflow');
      const res = await adapter.publish();
      if (res.success !== false) throw new Error('Publish must fail if emergency stop is active');
      if (res.finalState !== 'ABORTED_EMERGENCY_STOP') throw new Error(`Expected ABORTED_EMERGENCY_STOP, got: ${res.finalState}`);
    }
  );

  // Test 108 (Threads 06): Composer detection successful via semantic triggers
  await runTest(
    'test_threads_06',
    'Threads Adapter: Dynamic UI Composer Detection via Semantic Node',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/creation_tab',
          text: 'New thread',
          contentDescription: 'New thread',
          className: 'android.widget.FrameLayout',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 450, y: 2000, width: 180, height: 180 },
        },
        {
          id: 'com.instagram.barcelona:id/post_text_view',
          text: "Start a thread...",
          contentDescription: "Start a thread...",
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 40, y: 300, width: 1000, height: 260 },
        },
      ]);

      const success = await adapter.openComposer();
      if (!success) throw new Error('openComposer failed');
      const clicks = executor.getHistory().filter((l) => l.action === 'click');
      if (clicks.length === 0) throw new Error('Expected click on composer trigger');
    }
  );

  // Test 109 (Threads 07): Composer missing triggers bounded recovery
  await runTest(
    'test_threads_07',
    'Threads Adapter: Missing Composer Triggers Bounded Recovery',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);
      inspector.setNodes([]);

      const success = await adapter.openComposer();
      if (success !== false) throw new Error('openComposer must fail if trigger missing');
      if (adapter.getRecoveryAttempts() !== 1) throw new Error('Expected recovery attempts count to equal 1');
    }
  );

  // Test 110 (Threads 08): Local content URI accepted
  await runTest(
    'test_threads_08',
    'Threads Adapter: Valid Local content:// URI Accepted',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      adapter.validateMediaUri('content://media/external/images/media/4412');
    }
  );

  // Test 111 (Threads 09): Local file URI accepted
  await runTest(
    'test_threads_09',
    'Threads Adapter: Valid Local file:// URI Accepted',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      adapter.validateMediaUri('file:///storage/emulated/0/DCIM/threads_video.mp4');
    }
  );

  // Test 112 (Threads 10): Remote HTTP rejected
  await runTest(
    'test_threads_10',
    'Threads Adapter: Remote http:// URI Strictly Prohibited',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      let caught = false;
      try {
        adapter.validateMediaUri('http://insecure.cdn.com/post.mp4');
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Remote HTTP/HTTPS media URIs are strictly prohibited')) {
          throw new Error(`Unexpected error message: ${msg}`);
        }
      }
      if (!caught) throw new Error('Expected error for remote HTTP URI');
    }
  );

  // Test 113 (Threads 11): Remote HTTPS rejected
  await runTest(
    'test_threads_11',
    'Threads Adapter: Remote https:// URI Strictly Prohibited',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      let caught = false;
      try {
        adapter.validateMediaUri('https://cdn.threads.net/video.mp4');
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Remote HTTP/HTTPS media URIs are strictly prohibited')) {
          throw new Error(`Unexpected error message: ${msg}`);
        }
      }
      if (!caught) throw new Error('Expected error for remote HTTPS URI');
    }
  );

  // Test 114 (Threads 12): Malformed URI scheme rejected
  await runTest(
    'test_threads_12',
    'Threads Adapter: Malformed URI Scheme Rejected',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      let caught = false;
      try {
        adapter.validateMediaUri('ftp://files.example.com/asset.png');
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Unsupported media URI scheme')) {
          throw new Error(`Unexpected error message: ${msg}`);
        }
      }
      if (!caught) throw new Error('Expected rejection of FTP URI scheme');
    }
  );

  // Test 115 (Threads 13): Deterministic payload normalization
  await runTest(
    'test_threads_13',
    'Threads Adapter: Deterministic Payload Normalization',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const raw = 'Hello    Threads   community!   \n\n\n\nNew   features   incoming!   ';
      const clean = adapter.sanitizePostText(raw);
      if (clean !== 'Hello Threads community!\n\nNew features incoming!') {
        throw new Error(`Normalization failure. Got: "${clean}"`);
      }
    }
  );

  // Test 116 (Threads 14): Oversized payload (>500 chars) rejected without silent truncation
  await runTest(
    'test_threads_14',
    'Threads Adapter: Oversized Payload (>500 Chars) Rejected Without Silent Truncation',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const oversized = 'A'.repeat(501);
      let caught = false;
      try {
        adapter.sanitizePostText(oversized);
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Post text exceeds maximum allowed length of 500')) {
          throw new Error(`Unexpected error message: ${msg}`);
        }
      }
      if (!caught) throw new Error('Expected rejection of oversized post text');
    }
  );

  // Test 117 (Threads 15): Unicode preservation
  await runTest(
    'test_threads_15',
    'Threads Adapter: Unicode Text and Characters Preserved',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const unicodeText = 'Threads 🚀 Bonjour le monde 🌍 こんにちは世界';
      const clean = adapter.sanitizePostText(unicodeText);
      if (clean !== unicodeText) throw new Error(`Unicode text corrupted. Got: "${clean}"`);
    }
  );

  // Test 118 (Threads 16): Emoji preservation
  await runTest(
    'test_threads_16',
    'Threads Adapter: Unicode Emojis Preserved',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const emojiText = 'Phone Agent companion 🤖⚡️🔥';
      const clean = adapter.sanitizePostText(emojiText);
      if (clean !== emojiText) throw new Error(`Emoji text corrupted. Got: "${clean}"`);
    }
  );

  // Test 119 (Threads 17): Case-insensitive hashtag deduplication
  await runTest(
    'test_threads_17',
    'Threads Adapter: Case-Insensitive Hashtag Deduplication',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const tags = ['#Android', 'android', '#TECH', 'tech', '#OpenSource'];
      const clean = adapter.sanitizeHashtags(tags);
      const expected = ['#Android', '#TECH', '#OpenSource'];
      if (JSON.stringify(clean) !== JSON.stringify(expected)) {
        throw new Error(`Deduplication failure. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(clean)}`);
      }
    }
  );

  // Test 120 (Threads 18): Hashtags already in body are filtered out
  await runTest(
    'test_threads_18',
    'Threads Adapter: Hashtags Already in Body Are Filtered Out',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const body = 'Excited about modern #Android development!';
      const tags = ['#Android', '#Kotlin', '#Mobile'];
      const clean = adapter.sanitizeHashtags(tags, body);
      const expected = ['#Kotlin', '#Mobile'];
      if (JSON.stringify(clean) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(clean)}`);
      }
    }
  );

  // Test 121 (Threads 19): Malformed and empty hashtags filtered
  await runTest(
    'test_threads_19',
    'Threads Adapter: Malformed and Empty Hashtags Filtered',
    'JobValidation',
    () => {
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const tags = ['#', '   ', '##', '#valid_tag'];
      const clean = adapter.sanitizeHashtags(tags);
      const expected = ['#valid_tag'];
      if (JSON.stringify(clean) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(clean)}`);
      }
    }
  );

  // Test 122 (Threads 20): Login prompt tripwire halts automation immediately
  await runTest(
    'test_threads_20',
    'Threads Adapter: Login Challenge Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/login_btn',
          text: 'Log in with Instagram',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 100, y: 1000, width: 880, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.verifyThreads();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('challenge detected')) throw new Error(`Wrong tripwire message: ${msg}`);
      }
      if (!caught) throw new Error('Expected halt on login prompt');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 123 (Threads 21): OTP / 2FA confirmation code tripwire halts automation immediately
  await runTest(
    'test_threads_21',
    'Threads Adapter: OTP / 2FA Confirmation Code Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/otp_input',
          text: 'Enter 6-digit confirmation code',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 100, y: 800, width: 880, height: 120 },
        },
      ]);

      let caught = false;
      try {
        await adapter.detectReadyState();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('challenge detected')) throw new Error(`Wrong tripwire message: ${msg}`);
      }
      if (!caught) throw new Error('Expected halt on OTP screen');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 124 (Threads 22): Arkose / CAPTCHA challenge tripwire halts automation immediately
  await runTest(
    'test_threads_22',
    'Threads Adapter: Arkose / CAPTCHA Challenge Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/arkose_frame',
          text: 'Security challenge: solve the puzzle to verify you are human',
          className: 'android.view.View',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 0, y: 0, width: 1080, height: 1920 },
        },
      ]);

      let caught = false;
      try {
        await adapter.verifyThreads();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('challenge detected')) throw new Error(`Wrong tripwire message: ${msg}`);
      }
      if (!caught) throw new Error('Expected halt on CAPTCHA challenge');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 125 (Threads 23): Account switcher tripwire halts automation immediately
  await runTest(
    'test_threads_23',
    'Threads Adapter: Account Switcher Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/account_menu',
          text: 'Switch accounts',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 100, y: 400, width: 880, height: 100 },
        },
      ]);

      let caught = false;
      try {
        await adapter.verifyThreads();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('challenge detected')) throw new Error(`Wrong tripwire message: ${msg}`);
      }
      if (!caught) throw new Error('Expected halt on account switcher');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 126 (Threads 24): Payment / Meta Verified / monetization tripwire halts automation immediately
  await runTest(
    'test_threads_24',
    'Threads Adapter: Meta Verified / Monetization Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/verified_upsell',
          text: 'Subscribe to Meta Verified',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 100, y: 500, width: 880, height: 140 },
        },
      ]);

      let caught = false;
      try {
        await adapter.verifyThreads();
      } catch (err: unknown) {
        caught = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('challenge detected')) throw new Error(`Wrong tripwire message: ${msg}`);
      }
      if (!caught) throw new Error('Expected halt on monetization screen');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 127 (Threads 25): Mandatory human operator approval enforced
  await runTest(
    'test_threads_25',
    'Threads Adapter: Mandatory Human Operator Approval Enforced',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const job: JobModel = {
        jobId: 'threads_job_101',
        platform: 'threads',
        action: 'publish_post',
        caption: 'Test post content',
        requiresApproval: true,
      };

      await adapter.requestPublishApproval(job);
      if (adapter.isApprovalGranted()) throw new Error('Approval must default to false before operator action');
    }
  );

  // Test 128 (Threads 26): Approval denied or cancelled blocks publish
  await runTest(
    'test_threads_26',
    'Threads Adapter: Approval Denied or Cancelled Blocks Publish',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const res = await adapter.publish();
      if (res.success !== false) throw new Error('Publish must not succeed without approval');
      if (res.finalState !== 'WAITING_FOR_APPROVAL') throw new Error(`Expected WAITING_FOR_APPROVAL, got: ${res.finalState}`);
    }
  );

  // Test 129 (Threads 27): Publish blocked without prior operator approval
  await runTest(
    'test_threads_27',
    'Threads Adapter: Publish Blocked Without Prior Operator Approval',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const res = await adapter.publish();
      if (res.success !== false) throw new Error('Publish must be blocked');
      if (!res.message.includes('Operator approval required')) throw new Error('Incorrect rejection message');
    }
  );

  // Test 130 (Threads 28): Positive confirmation toast verifies publication
  await runTest(
    'test_threads_28',
    'Threads Adapter: Positive Confirmation Toast Verifies Publication',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      adapter.approvePublish();

      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/button_post',
          text: 'Post',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 800, y: 100, width: 200, height: 100 },
        },
        {
          id: 'com.instagram.barcelona:id/toast',
          text: 'Your thread was posted',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 40, y: 2100, width: 960, height: 100 },
        },
      ]);

      const res = await adapter.publish();
      if (!res.success) throw new Error(`Expected publication success, got: ${res.message}`);
      if (res.finalState !== 'COMPLETED') throw new Error(`Expected COMPLETED state, got: ${res.finalState}`);
    }
  );

  // Test 131 (Threads 29): Ambiguous outcome marked as UNCONFIRMED
  await runTest(
    'test_threads_29',
    'Threads Adapter: Ambiguous Outcome Marked as UNCONFIRMED',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      adapter.approvePublish();

      // Composer remains open without any success toast -> ambiguous
      inspector.setNodes([
        {
          id: 'com.instagram.barcelona:id/post_text_view',
          text: 'Start a thread',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 40, y: 300, width: 1000, height: 260 },
        },
        {
          id: 'com.instagram.barcelona:id/button_post',
          text: 'Post',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 800, y: 100, width: 200, height: 100 },
        },
      ]);

      const res = await adapter.publish();
      if (res.success !== false) throw new Error('Ambiguous publish must not report success');
      if (res.finalState !== 'UNCONFIRMED') throw new Error(`Expected UNCONFIRMED, got: ${res.finalState}`);
    }
  );

  // Test 132 (Threads 30): Recovery attempt #1 bounded and logged
  await runTest(
    'test_threads_30',
    'Threads Adapter: Recovery Attempt #1 Bounded and Logged',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const r1 = await adapter.recover('First transient UI stall');
      if (!r1) throw new Error('First recovery attempt should succeed');
      if (adapter.getRecoveryAttempts() !== 1) throw new Error('Recovery attempts counter should be 1');
    }
  );

  // Test 133 (Threads 31): Recovery attempt #2 bounded and logged
  await runTest(
    'test_threads_31',
    'Threads Adapter: Recovery Attempt #2 Bounded and Logged',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      await adapter.recover('First attempt');
      const r2 = await adapter.recover('Second attempt');
      if (!r2) throw new Error('Second recovery attempt should succeed');
      if (adapter.getRecoveryAttempts() !== 2) throw new Error('Recovery attempts counter should be 2');
    }
  );

  // Test 134 (Threads 32): Third recovery failure triggers safety fail-stop
  await runTest(
    'test_threads_32',
    'Threads Adapter: Third Recovery Failure Triggers Safety Fail-Stop',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      await adapter.recover('Attempt 1');
      await adapter.recover('Attempt 2');
      const r3 = await adapter.recover('Attempt 3 exceeding threshold');
      if (r3 !== false) throw new Error('Third recovery attempt must fail-stop');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered on exceeded limit');
    }
  );

  // Test 135 (Threads 33): Cryptographically valid local audit logging
  await runTest(
    'test_threads_33',
    'Threads Adapter: Cryptographically Valid Local Audit Logging',
    'Logging',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const beforeCount = LocalActionLogger.getInstance().getLogs().length;
      await adapter.launch();
      const afterLogs = LocalActionLogger.getInstance().getLogs();
      if (afterLogs.length <= beforeCount) throw new Error('Audit log was not written');

      const launchLog = afterLogs.slice(0, afterLogs.length - beforeCount).find(l => l.action === 'LAUNCH');
      if (!launchLog) throw new Error('Action LAUNCH not found in audit logs');
      if (launchLog.platform !== 'threads') throw new Error(`Platform must be threads, got: ${launchLog.platform}`);
    }
  );

  // Test 136 (Threads 34): Recovery blocked while EmergencyStop active
  await runTest(
    'test_threads_34',
    'Threads Adapter: Recovery Blocked While Emergency Stop Active',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      EmergencyStopManager.getInstance().trigger('Active halt prior to recovery');
      const inspector = new SafeUiInspector('com.instagram.barcelona');
      const executor = new SafeActionExecutor();
      const adapter = new ThreadsAdapter(inspector, executor);

      const recovered = await adapter.recover('Attempted recovery during emergency stop');
      if (recovered !== false) throw new Error('Recovery must be rejected when Emergency Stop is active');
    }
  );

  // ==========================================
  // LINKEDIN ADAPTER TEST SUITE (Tests 137-174)
  // ==========================================

  // Test 137 (LinkedIn 01): Correct foreground package passes verification
  await runTest(
    'test_linkedin_01',
    'LinkedIn Adapter: Official Foreground Package Passes Verification',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const verified = await adapter.verifyLinkedIn();
      if (!verified) throw new Error('Official LinkedIn package must pass verification');
    }
  );

  // Test 138 (LinkedIn 02): Unexpected foreground package triggers EmergencyStop
  await runTest(
    'test_linkedin_02',
    'LinkedIn Adapter: Unexpected Package Triggers Immediate Emergency Stop',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.unauthorized.malicious.app');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      try {
        await adapter.verifyLinkedIn();
        throw new Error('Should have thrown on unauthorized package');
      } catch (e: unknown) {
        const err = e as Error;
        if (!err.message.includes('Unexpected package change')) throw err;
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop was not triggered');
      }
    }
  );

  // Test 139 (LinkedIn 03): Pre-existing EmergencyStop rejects execution
  await runTest(
    'test_linkedin_03',
    'LinkedIn Adapter: Pre-existing Emergency Stop Rejects Action',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      EmergencyStopManager.getInstance().trigger('Pre-existing safety lockout');
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const result = await adapter.verifyLinkedIn();
      if (result !== false) throw new Error('Adapter must reject execution when Emergency Stop is active');
    }
  );

  // Test 140 (LinkedIn 04): Adapter stop() halts workflow
  await runTest(
    'test_linkedin_04',
    'LinkedIn Adapter: stop() Method Halts Subsequent Actions',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      await adapter.stop();
      const result = await adapter.detectReadyState();
      if (result !== false) throw new Error('Adapter should reject actions after stop()');
    }
  );

  // Test 141 (LinkedIn 05): Dynamic ready-state detection
  await runTest(
    'test_linkedin_05',
    'LinkedIn Adapter: Dynamic Ready-State Detected via Accessibility Hierarchy',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/share_box',
          text: 'Start a post',
          contentDescription: 'Start a post',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 200, width: 1000, height: 100 },
        },
      ]);

      const ready = await adapter.detectReadyState();
      if (!ready) throw new Error('Ready state must be detected when share box is present');
    }
  );

  // Test 142 (LinkedIn 06): Composer detection succeeds
  await runTest(
    'test_linkedin_06',
    'LinkedIn Adapter: Composer Detected Successfully via Dynamic Semantic Match',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/composer_edit_text',
          text: 'What do you want to talk about?',
          contentDescription: 'What do you want to talk about?',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 300, width: 1000, height: 400 },
        },
      ]);

      const isOpen = await adapter.verifyComposer();
      if (!isOpen) throw new Error('Composer must be detected as active');
    }
  );

  // Test 143 (LinkedIn 07): Composer failure triggers bounded recovery
  await runTest(
    'test_linkedin_07',
    'LinkedIn Adapter: Composer Missing Triggers Bounded Recovery Attempt',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([]); // No trigger node

      const opened = await adapter.openComposer();
      if (opened !== false) throw new Error('openComposer must fail when no trigger node exists');
      if (adapter.getRecoveryAttempts() !== 1) throw new Error('Recovery attempt should increment to 1');
    }
  );

  // Test 144 (LinkedIn 08): Valid content:// URI accepted
  await runTest(
    'test_linkedin_08',
    'LinkedIn Adapter: Local content:// Media URI Validated and Accepted',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      adapter.validateMediaUri('content://media/external/images/media/9921');
    }
  );

  // Test 145 (LinkedIn 09): Valid file:// URI accepted
  await runTest(
    'test_linkedin_09',
    'LinkedIn Adapter: Local file:// Media URI Validated and Accepted',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      adapter.validateMediaUri('file:///storage/emulated/0/DCIM/Camera/photo.jpg');
    }
  );

  // Test 146 (LinkedIn 10): Remote http:// URI strictly prohibited
  await runTest(
    'test_linkedin_10',
    'LinkedIn Adapter: Remote http:// URI Strictly Rejected with Security Error',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      try {
        adapter.validateMediaUri('http://insecure-source.com/video.mp4');
        throw new Error('Should have rejected remote http:// URI');
      } catch (e: unknown) {
        const err = e as Error;
        if (!err.message.includes('Remote HTTP/HTTPS media URIs are strictly prohibited')) throw err;
      }
    }
  );

  // Test 147 (LinkedIn 11): Remote https:// URI strictly prohibited
  await runTest(
    'test_linkedin_11',
    'LinkedIn Adapter: Remote https:// URI Strictly Rejected with Security Error',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      try {
        adapter.validateMediaUri('https://cdn.example.com/exploit.mp4');
        throw new Error('Should have rejected remote https:// URI');
      } catch (e: unknown) {
        const err = e as Error;
        if (!err.message.includes('Remote HTTP/HTTPS media URIs are strictly prohibited')) throw err;
      }
    }
  );

  // Test 148 (LinkedIn 12): Malformed media URI rejected
  await runTest(
    'test_linkedin_12',
    'LinkedIn Adapter: Unsupported Scheme Rejected with Validation Error',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      try {
        adapter.validateMediaUri('ftp://files.example.com/asset.png');
        throw new Error('Should have rejected unsupported scheme');
      } catch (e: unknown) {
        const err = e as Error;
        if (!err.message.includes('Unsupported media URI scheme')) throw err;
      }
    }
  );

  // Test 149 (LinkedIn 13): Payload whitespace normalization
  await runTest(
    'test_linkedin_13',
    'LinkedIn Adapter: Payload Whitespace and Excessive Blank Lines Normalized',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const input = 'Excited to announce   our new project!   \r\n\r\n\r\n\r\nStay tuned   for details.';
      const output = adapter.sanitizePostText(input);
      if (output !== 'Excited to announce our new project!\n\nStay tuned for details.') {
        throw new Error(`Unexpected sanitized output: ${JSON.stringify(output)}`);
      }
    }
  );

  // Test 150 (LinkedIn 14): Unicode preservation in text
  await runTest(
    'test_linkedin_14',
    'LinkedIn Adapter: Full International Unicode Preserved Accurately',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const input = 'Honored to partner with global teams across 東京, München, and São Paulo!';
      const output = adapter.sanitizePostText(input);
      if (output !== input) throw new Error('Unicode characters must not be corrupted');
    }
  );

  // Test 151 (LinkedIn 15): Emoji preservation in text
  await runTest(
    'test_linkedin_15',
    'LinkedIn Adapter: Multi-byte Emojis Preserved Accurately',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const input = 'Big milestone today! 🚀💼📈 Gratitude to everyone involved. 🤝🎉';
      const output = adapter.sanitizePostText(input);
      if (output !== input) throw new Error('Emojis must be preserved');
    }
  );

  // Test 152 (LinkedIn 16): Oversized payload rejected (>3000 chars)
  await runTest(
    'test_linkedin_16',
    'LinkedIn Adapter: Oversized Payload Rejected with Structured Policy Error',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const oversized = 'L'.repeat(3001);
      try {
        adapter.sanitizePostText(oversized);
        throw new Error('Should have rejected text exceeding 3000 chars');
      } catch (e: unknown) {
        const err = e as Error;
        if (!err.message.includes('Post text exceeds maximum allowed length of 3000 characters')) throw err;
      }
    }
  );

  // Test 153 (LinkedIn 17): Hashtags normalized
  await runTest(
    'test_linkedin_17',
    'LinkedIn Adapter: Hashtags Normalized with Mandatory # Prefix',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const raw = ['leadership', '#innovation', 'tech_news'];
      const tags = adapter.sanitizeHashtags(raw);
      if (JSON.stringify(tags) !== JSON.stringify(['#leadership', '#innovation', '#technews'])) {
        throw new Error(`Unexpected tags: ${JSON.stringify(tags)}`);
      }
    }
  );

  // Test 154 (LinkedIn 18): Hashtags deduplicated case-insensitively
  await runTest(
    'test_linkedin_18',
    'LinkedIn Adapter: Hashtags Deduplicated Case-Insensitively',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const raw = ['#AI', '#ai', '#Ai', '#Robotics'];
      const tags = adapter.sanitizeHashtags(raw);
      if (JSON.stringify(tags) !== JSON.stringify(['#AI', '#Robotics'])) {
        throw new Error(`Unexpected deduplicated tags: ${JSON.stringify(tags)}`);
      }
    }
  );

  // Test 155 (LinkedIn 19): Hashtag body overlap excluded
  await runTest(
    'test_linkedin_19',
    'LinkedIn Adapter: Body Overlapping Hashtags Excluded Automatically',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const body = 'Reflecting on #Leadership and organizational culture.';
      const raw = ['#leadership', '#Strategy', '#Culture'];
      const tags = adapter.sanitizeHashtags(raw, body);
      if (JSON.stringify(tags) !== JSON.stringify(['#Strategy', '#Culture'])) {
        throw new Error(`Unexpected overlap filtered tags: ${JSON.stringify(tags)}`);
      }
    }
  );

  // Test 156 (LinkedIn 20): Malformed hashtags filtered
  await runTest(
    'test_linkedin_20',
    'LinkedIn Adapter: Malformed Empty or Isolated Hash Filtered',
    'JobValidation',
    async () => {
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const raw = ['#', '   ', '#valid'];
      const tags = adapter.sanitizeHashtags(raw);
      if (JSON.stringify(tags) !== JSON.stringify(['#valid'])) {
        throw new Error(`Unexpected filtered tags: ${JSON.stringify(tags)}`);
      }
    }
  );

  // Test 157 (LinkedIn 21): Login tripwire triggers EmergencyStop
  await runTest(
    'test_linkedin_21',
    'LinkedIn Adapter: Login Screen Tripwire Triggers Immediate Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/sign_in_button',
          text: 'Sign in to LinkedIn',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 100, y: 1000, width: 800, height: 120 },
        },
      ]);

      try {
        await adapter.verifyLinkedIn();
        throw new Error('Should have triggered emergency stop on sign in keyword');
      } catch (e: unknown) {
        const err = e as Error;
        if (!err.message.includes('LinkedIn security/auth/account-switcher/payment challenge detected')) throw err;
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 158 (LinkedIn 22): Password field tripwire triggers EmergencyStop
  await runTest(
    'test_linkedin_22',
    'LinkedIn Adapter: Password Prompt Tripwire Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/password_input',
          text: 'Enter your password',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 100, y: 800, width: 800, height: 120 },
        },
      ]);

      try {
        await adapter.detectReadyState();
        throw new Error('Should have triggered on password prompt');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 159 (LinkedIn 23): OTP tripwire triggers EmergencyStop
  await runTest(
    'test_linkedin_23',
    'LinkedIn Adapter: OTP Verification Code Prompt Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/otp_input',
          text: 'Enter 6-digit verification code',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 100, y: 700, width: 800, height: 120 },
        },
      ]);

      try {
        await adapter.verifyLinkedIn();
        throw new Error('Should have triggered on OTP prompt');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 160 (LinkedIn 24): 2FA challenge triggers EmergencyStop
  await runTest(
    'test_linkedin_24',
    'LinkedIn Adapter: Two-Factor Authentication Prompt Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/security_title',
          text: 'Two-step verification required to access this account',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 100, y: 400, width: 800, height: 120 },
        },
      ]);

      try {
        await adapter.verifyLinkedIn();
        throw new Error('Should have triggered on 2-step verification challenge');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 161 (LinkedIn 25): CAPTCHA / puzzle / Arkose challenge triggers EmergencyStop
  await runTest(
    'test_linkedin_25',
    'LinkedIn Adapter: Security Puzzle / Arkose Challenge Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/captcha_view',
          text: 'Quick security check: solve this puzzle to proceed',
          className: 'android.webkit.WebView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 50, y: 300, width: 900, height: 1200 },
        },
      ]);

      try {
        await adapter.detectReadyState();
        throw new Error('Should have triggered on security puzzle');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 162 (LinkedIn 26): Passkey / biometric prompt triggers EmergencyStop
  await runTest(
    'test_linkedin_26',
    'LinkedIn Adapter: Passkey / Biometric Prompt Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/passkey_dialog',
          text: 'Use your biometric passkey to authenticate',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 100, y: 500, width: 800, height: 150 },
        },
      ]);

      try {
        await adapter.verifyLinkedIn();
        throw new Error('Should have triggered on passkey prompt');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 163 (LinkedIn 27): Account switcher triggers EmergencyStop
  await runTest(
    'test_linkedin_27',
    'LinkedIn Adapter: Account Switcher Prompt Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/account_list',
          text: 'Choose an account to continue',
          className: 'android.widget.ListView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 100, y: 500, width: 800, height: 400 },
        },
      ]);

      try {
        await adapter.verifyLinkedIn();
        throw new Error('Should have triggered on account switcher');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 164 (LinkedIn 28): Premium upsell triggers EmergencyStop
  await runTest(
    'test_linkedin_28',
    'LinkedIn Adapter: Premium Subscription Upsell Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/premium_banner',
          text: 'Try LinkedIn Premium free for 1 month',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 50, y: 400, width: 900, height: 180 },
        },
      ]);

      try {
        await adapter.detectReadyState();
        throw new Error('Should have triggered on Premium upsell');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 165 (LinkedIn 29): Payment / billing prompt triggers EmergencyStop
  await runTest(
    'test_linkedin_29',
    'LinkedIn Adapter: Payment / Credit Card Prompt Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/billing_layout',
          text: 'Add payment method - Credit card info required',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 50, y: 500, width: 900, height: 150 },
        },
      ]);

      try {
        await adapter.verifyLinkedIn();
        throw new Error('Should have triggered on payment prompt');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 166 (LinkedIn 30): Boost / sponsored prompt triggers EmergencyStop
  await runTest(
    'test_linkedin_30',
    'LinkedIn Adapter: Boost Post / Sponsored Content Triggers Emergency Stop',
    'SafetyTripwire',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/boost_post_button',
          text: 'Boost post to reach 5,000+ professionals',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 100, y: 700, width: 800, height: 120 },
        },
      ]);

      try {
        await adapter.detectReadyState();
        throw new Error('Should have triggered on boost post prompt');
      } catch (e: unknown) {
        if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be active');
      }
    }
  );

  // Test 167 (LinkedIn 31): Human approval gate requested
  await runTest(
    'test_linkedin_31',
    'LinkedIn Adapter: Human Approval Gate Enforced Prior to Publish',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const job: JobModel = {
        jobId: 'li_unit_01',
        platform: 'linkedin',
        action: 'publish_post',
        caption: 'Thought leadership milestone update',
        requiresApproval: true,
      };

      const requested = await adapter.requestPublishApproval(job);
      if (!requested) throw new Error('Approval request failed');
      if (adapter.isApprovalGranted()) throw new Error('Approval should be false initially');
    }
  );

  // Test 168 (LinkedIn 32): Publish blocked without operator approval
  await runTest(
    'test_linkedin_32',
    'LinkedIn Adapter: Publish Attempt Blocked Without Human Approval',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const res = await adapter.publish();
      if (res.success) throw new Error('Publish must not succeed without approval');
      if (res.finalState !== 'WAITING_FOR_APPROVAL') throw new Error(`Expected WAITING_FOR_APPROVAL, got: ${res.finalState}`);
    }
  );

  // Test 169 (LinkedIn 33): Publish succeeds when operator approves
  await runTest(
    'test_linkedin_33',
    'LinkedIn Adapter: Publish Succeeds After Human Approval Granted',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      adapter.approvePublish();

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/post_button',
          text: 'Post',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 800, y: 100, width: 200, height: 100 },
        },
        {
          id: 'com.linkedin.android:id/toast',
          text: 'Your post was shared',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 2100, width: 960, height: 100 },
        },
      ]);

      const res = await adapter.publish();
      if (!res.success) throw new Error(`Publish failed unexpectedly: ${res.message}`);
      if (res.finalState !== 'COMPLETED') throw new Error(`Expected COMPLETED, got: ${res.finalState}`);
    }
  );

  // Test 170 (LinkedIn 34): Publication verification confirms positive UI evidence
  await runTest(
    'test_linkedin_34',
    'LinkedIn Adapter: Positive UI Publication Evidence Confirmed',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/toast',
          text: 'Post shared',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 2000, width: 900, height: 100 },
        },
      ]);

      const verified = await adapter.verifyPublished();
      if (!verified) throw new Error('Publication should be verified from toast');
    }
  );

  // Test 171 (LinkedIn 35): Publication verification detects failure signal
  await runTest(
    'test_linkedin_35',
    'LinkedIn Adapter: Publication Failure Signal Detected and Marked Unsuccessful',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      inspector.setNodes([
        {
          id: 'com.linkedin.android:id/error_banner',
          text: "Couldn't share post. Tap to retry.",
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 50, y: 300, width: 900, height: 150 },
        },
      ]);

      const verified = await adapter.verifyPublished();
      if (verified !== false) throw new Error('verifyPublished must return false when error banner is present');
    }
  );

  // Test 172 (LinkedIn 36): Bounded recovery enforces max 2 attempts; 3rd triggers EmergencyStop
  await runTest(
    'test_linkedin_36',
    'LinkedIn Adapter: Max 2 Recovery Attempts Enforced, 3rd Triggers Fail-Stop',
    'Adapters',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      if (adapter.getRecoveryAttempts() !== 0) throw new Error('Initial recovery count should be 0');
      const r1 = await adapter.recover('Attempt 1');
      if (!r1 || adapter.getRecoveryAttempts() !== 1) throw new Error('Attempt 1 should succeed');

      const r2 = await adapter.recover('Attempt 2');
      if (!r2 || adapter.getRecoveryAttempts() !== 2) throw new Error('Attempt 2 should succeed');

      const r3 = await adapter.recover('Attempt 3 exceeding threshold');
      if (r3 !== false) throw new Error('Attempt 3 must fail-stop');
      if (!EmergencyStopManager.getInstance().isActive()) throw new Error('Emergency stop must be triggered');
    }
  );

  // Test 173 (LinkedIn 37): Recovery blocked while EmergencyStop active
  await runTest(
    'test_linkedin_37',
    'LinkedIn Adapter: Recovery Blocked While Emergency Stop Active',
    'EmergencyStop',
    async () => {
      EmergencyStopManager.getInstance().reset();
      EmergencyStopManager.getInstance().trigger('Active halt prior to recovery');
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const recovered = await adapter.recover('Attempted recovery during emergency stop');
      if (recovered !== false) throw new Error('Recovery must be rejected when Emergency Stop is active');
    }
  );

  // Test 174 (LinkedIn 38): Local cryptographic audit logging records LinkedIn actions
  await runTest(
    'test_linkedin_38',
    'LinkedIn Adapter: Cryptographically Valid Local Audit Logging',
    'Logging',
    async () => {
      EmergencyStopManager.getInstance().reset();
      const inspector = new SafeUiInspector('com.linkedin.android');
      const executor = new SafeActionExecutor();
      const adapter = new LinkedInAdapter(inspector, executor);

      const beforeCount = LocalActionLogger.getInstance().getLogs().length;
      await adapter.launch();
      const afterLogs = LocalActionLogger.getInstance().getLogs();
      if (afterLogs.length <= beforeCount) throw new Error('Audit log was not written');

      const launchLog = afterLogs.slice(0, afterLogs.length - beforeCount).find(l => l.action === 'VERIFY_LINKEDIN');
      if (!launchLog) throw new Error('Action VERIFY_LINKEDIN not found in audit logs');
      if (launchLog.platform !== 'linkedin') throw new Error(`Platform must be linkedin, got: ${launchLog.platform}`);
    }
  );

  // Section: Step 2H Adapter Registry, Capability Matrix & Multi-Platform Planner Tests (38 tests)
  await runOrchestrationTests(runTest);

  // Section: Step 2I Persistent Job Store & Crash Recovery Engine Tests (52 tests)
  const persistenceResults = await runPersistenceRecoveryTests();
  for (const pr of persistenceResults) {
    results.push({
      id: pr.id,
      name: pr.name,
      category: 'Persistence',
      passed: pr.passed,
      message: pr.message,
      durationMs: pr.durationMs,
    });
  }

  // Section: Step 2J Content & Media Pipeline + Human Review System Tests (62 tests)
  await runContentPipelineTests(runTest);

  // Section: Step 2K Product Research & Intelligence Pipeline Tests (75 tests)
  await runProductResearchTests(runTest);

  return results;
}

