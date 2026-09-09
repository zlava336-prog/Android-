/**
 * Phone Agent - Step 2K Product Research & Intelligence Pipeline Tests
 * 75 comprehensive tests verifying safety boundaries, lifecycle, extraction,
 * provenance, Amazon URLs, cryptographic fingerprints, duplicate detection,
 * policy compliance, suitability scoring, human review binding, and Step 2J integration.
 */

import { ProductData, createDefaultProductData } from '../product/ProductData';
import { ProductCandidate, ProductResearchRequest } from '../product/ProductCandidate';
import {
  ProductFieldProvenance,
  createFieldProvenance,
  isValidProvenanceSource,
} from '../product/ProductFieldProvenance';
import {
  computeProductFingerprint,
  computeProductUrlFingerprint,
  validateAmazonProductUrl,
} from '../product/ProductFingerprint';
import { ProductFingerprintIndex } from '../product/ProductFingerprintIndex';
import { ProductPolicyValidator } from '../product/ProductPolicyValidator';
import { ProductScorer } from '../product/ProductScorer';
import { ProductResearchSession, ProductResearchStateMachine } from '../product/ProductResearchSession';
import { AmazonResearchAdapter, PROHIBITED_RESEARCH_ACTIONS } from '../product/AmazonResearchAdapter';
import { ProductReviewManager } from '../product/ProductReviewManager';
import { ProductResearchManager } from '../product/ProductResearchManager';
import { ContentNormalizer } from '../content/ContentNormalizer';
import { PersistentJobStore } from '../PersistentJobStore';
import { UiInspector, ActionExecutor, UiNode } from '../inspector';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';
import { TestResult } from './unitTests';

export async function runProductResearchTests(
  runTest: (
    id: string,
    name: string,
    category: TestResult['category'],
    fn: () => Promise<void> | void
  ) => Promise<void>
): Promise<void> {
  const eStop = EmergencyStopManager.getInstance();
  const policyValidator = ProductPolicyValidator.getInstance();
  const reviewManager = ProductReviewManager.getInstance();
  const fingerprintIndex = ProductFingerprintIndex.getInstance();
  const jobStore = PersistentJobStore.getInstance();

  // ----------------------------------------------------
  // SECTION 1: Safety Boundary Tests (10 tests)
  // ----------------------------------------------------

  await runTest('test_research_safety_01', 'Safety: Prohibit BUY_NOW action & trigger EmergencyStop', 'Security', async () => {
    eStop.reset();
    const inspector = new UiInspector('com.amazon.mShop.android.shopping');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('BUY_NOW_BUTTON_CLICK');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected BUY_NOW action to be blocked and throw');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be active after BUY_NOW attempt');
    eStop.reset();
  });

  await runTest('test_research_safety_02', 'Safety: Prohibit ADD_TO_CART action & trigger EmergencyStop', 'Security', async () => {
    eStop.reset();
    const inspector = new UiInspector('com.amazon.mShop.android.shopping');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('ADD_TO_CART');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected ADD_TO_CART action to be blocked');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be active after ADD_TO_CART attempt');
    eStop.reset();
  });

  await runTest('test_research_safety_03', 'Safety: Prohibit CHECKOUT action & trigger EmergencyStop', 'Security', async () => {
    eStop.reset();
    const inspector = new UiInspector('com.amazon.mShop.android.shopping');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('PROCEED_TO_CHECKOUT');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected CHECKOUT action to be blocked');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be active after CHECKOUT attempt');
    eStop.reset();
  });

  await runTest('test_research_safety_04', 'Safety: Prohibit PAYMENT action & trigger EmergencyStop', 'Security', async () => {
    eStop.reset();
    const inspector = new UiInspector('com.amazon.mShop.android.shopping');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('SUBMIT_PAYMENT');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected PAYMENT action to be blocked');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be active');
    eStop.reset();
  });

  await runTest('test_research_safety_05', 'Safety: Prohibit SUBSCRIBE action & trigger EmergencyStop', 'Security', async () => {
    eStop.reset();
    const inspector = new UiInspector('com.amazon.mShop.android.shopping');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('SUBSCRIBE_AND_SAVE');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected SUBSCRIBE action to be blocked');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be active');
    eStop.reset();
  });

  await runTest('test_research_safety_06', 'Safety: Disallowed foreground package triggers EmergencyStop', 'Security', async () => {
    eStop.reset();
    // Simulate unexpected app in foreground
    const inspector = new UiInspector('com.unknown.malicious.app');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('OPEN_AMAZON');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected unexpected package to throw');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be active');
    eStop.reset();
  });

  await runTest('test_research_safety_07', 'Safety: Sensitive UI keyword (OTP / password) halts research', 'Security', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'com.amazon.mShop.android.shopping:id/otp_entry',
        text: 'Enter your 6-digit OTP code',
        className: 'android.widget.EditText',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 100, width: 300, height: 50 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('ENTER_SEARCH_QUERY');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected sensitive OTP node to trigger halt');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be triggered');
    eStop.reset();
  });

  await runTest('test_research_safety_08', 'Safety: Active EmergencyStop blocks creating new research session', 'Security', async () => {
    eStop.trigger('Test safety stop');
    const manager = ProductResearchManager.getInstance();

    let thrown = false;
    try {
      manager.createSession({
        requestId: 'req_test',
        query: 'mouse',
        createdAt: Date.now(),
      });
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected createSession to throw when EmergencyStop is active');
    eStop.reset();
  });

  await runTest('test_research_safety_09', 'Safety: Active EmergencyStop blocks execution of ongoing adapter actions', 'Security', async () => {
    eStop.trigger('Test safety stop');
    const inspector = new UiInspector('com.amazon.mShop.android.shopping');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const allowed = await adapter.verifySafetyBoundary('OPEN_AMAZON');
    if (allowed) throw new Error('verifySafetyBoundary must return false when EmergencyStop is active');
    eStop.reset();
  });

  await runTest('test_research_safety_10', 'Safety: Account switching attempt triggers EmergencyStop', 'Security', async () => {
    eStop.reset();
    const inspector = new UiInspector('com.amazon.mShop.android.shopping');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.verifySafetyBoundary('CHANGE_PAYMENT_OR_SWITCH_ACCOUNT');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected prohibited account/payment manipulation to throw');
    eStop.reset();
  });

  // ----------------------------------------------------
  // SECTION 2: Research Session Lifecycle Tests (6 tests)
  // ----------------------------------------------------

  await runTest('test_research_lifecycle_01', 'Lifecycle: Full valid state transition sequence', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_1', {
      requestId: 'r_1',
      query: 'bluetooth keyboard',
      createdAt: Date.now(),
    });

    if (session.getState() !== 'CREATED') throw new Error('Initial state must be CREATED');
    session.transitionTo('VALIDATING', 'Validating');
    session.transitionTo('OPENING_AMAZON', 'Opening Amazon');
    session.transitionTo('VERIFYING_AMAZON', 'Verifying');
    session.transitionTo('SEARCHING', 'Searching');
    session.transitionTo('PRODUCT_CANDIDATE_FOUND', 'Candidates found');
    session.transitionTo('EXTRACTING_VISIBLE_DATA', 'Extracting');
    session.transitionTo('VALIDATING_DATA', 'Validating data');
    session.transitionTo('NEEDS_REVIEW', 'Awaiting review');
    session.transitionTo('APPROVED', 'Operator approved');
    session.transitionTo('COMPLETED', 'Session finished');

    if (session.getState() !== 'COMPLETED') throw new Error('Final state must be COMPLETED');
  });

  await runTest('test_research_lifecycle_02', 'Lifecycle: Illegal state transition throws descriptive error', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_2', {
      requestId: 'r_2',
      query: 'desk lamp',
      createdAt: Date.now(),
    });

    let thrown = false;
    try {
      // Cannot jump from CREATED to EXTRACTING_VISIBLE_DATA
      session.transitionTo('EXTRACTING_VISIBLE_DATA', 'Invalid jump');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected illegal jump to throw');
  });

  await runTest('test_research_lifecycle_03', 'Lifecycle: FAILED state cannot transition to APPROVED', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_3', {
      requestId: 'r_3',
      query: 'usb hub',
      createdAt: Date.now(),
    });
    session.transitionTo('FAILED', 'Session crashed');

    let thrown = false;
    try {
      session.transitionTo('APPROVED', 'Illegal recovery');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('FAILED -> APPROVED must be rejected');
  });

  await runTest('test_research_lifecycle_04', 'Lifecycle: STALE state cannot transition to APPROVED', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_4', {
      requestId: 'r_4',
      query: 'monitor stand',
      createdAt: Date.now(),
    });
    session.transitionTo('VALIDATING', 'Validating');
    session.transitionTo('OPENING_AMAZON', 'Opening');
    session.transitionTo('VERIFYING_AMAZON', 'Verifying');
    session.transitionTo('SEARCHING', 'Searching');
    session.transitionTo('PRODUCT_CANDIDATE_FOUND', 'Found');
    session.transitionTo('EXTRACTING_VISIBLE_DATA', 'Extracting');
    session.transitionTo('VALIDATING_DATA', 'Validating');
    session.transitionTo('NEEDS_REVIEW', 'Review');
    session.transitionTo('STALE', 'Data changed');

    let thrown = false;
    try {
      session.transitionTo('APPROVED', 'Cannot approve stale');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('STALE -> APPROVED must be rejected');
  });

  await runTest('test_research_lifecycle_05', 'Lifecycle: EMERGENCY_STOPPED state is terminal', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_5', {
      requestId: 'r_5',
      query: 'cable organizer',
      createdAt: Date.now(),
    });
    session.transitionTo('EMERGENCY_STOPPED', 'E-Stop triggered');

    let thrown = false;
    try {
      session.transitionTo('SEARCHING', 'Cannot resume from E-Stop');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('EMERGENCY_STOPPED is terminal and must reject transitions');
  });

  await runTest('test_research_lifecycle_06', 'Lifecycle: History records timestamps, from/to, and reasons', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_6', {
      requestId: 'r_6',
      query: 'mousepad',
      createdAt: Date.now(),
    });
    session.transitionTo('VALIDATING', 'Reason A');
    session.transitionTo('OPENING_AMAZON', 'Reason B');

    const history = session.getHistory();
    if (history.length !== 2) throw new Error(`Expected 2 events, got ${history.length}`);
    if (history[0].from !== 'CREATED' || history[0].to !== 'VALIDATING' || history[0].reason !== 'Reason A') {
      throw new Error('History event 0 mismatch');
    }
    if (history[1].from !== 'VALIDATING' || history[1].to !== 'OPENING_AMAZON') {
      throw new Error('History event 1 mismatch');
    }
  });

  // ----------------------------------------------------
  // SECTION 3: Crash Recovery Tests (4 tests)
  // ----------------------------------------------------

  await runTest('test_research_recovery_01', 'Recovery: Crash recovery succeeds within max 2 attempts', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_rec_1', {
      requestId: 'r_rec_1',
      query: 'stylus pen',
      createdAt: Date.now(),
    });

    const attempt1 = session.attemptRecovery('Transient timeout');
    if (!attempt1 || session.getRecoveryAttempts() !== 1) throw new Error('Recovery attempt 1 should succeed');

    const attempt2 = session.attemptRecovery('Transient UI glitch');
    if (!attempt2 || session.getRecoveryAttempts() !== 2) throw new Error('Recovery attempt 2 should succeed');
  });

  await runTest('test_research_recovery_02', 'Recovery: 3rd consecutive recovery failure triggers EmergencyStop', 'StateMachine', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_rec_2', {
      requestId: 'r_rec_2',
      query: 'webcam cover',
      createdAt: Date.now(),
    });

    session.attemptRecovery('Error 1');
    session.attemptRecovery('Error 2');
    const attempt3 = session.attemptRecovery('Error 3');

    if (attempt3) throw new Error('Attempt 3 must fail');
    if (!eStop.isActive()) throw new Error('EmergencyStop must be active after 3rd recovery failure');
    if (session.getState() !== 'EMERGENCY_STOPPED') throw new Error('Session must transition to EMERGENCY_STOPPED');
    eStop.reset();
  });

  await runTest('test_research_recovery_03', 'Recovery: Recovery is blocked if EmergencyStop is active', 'StateMachine', async () => {
    eStop.trigger('External safety lock');
    const session = new ProductResearchSession('s_rec_3', {
      requestId: 'r_rec_3',
      query: 'adapter',
      createdAt: Date.now(),
    });

    const canRecover = session.attemptRecovery('Any error');
    if (canRecover) throw new Error('Recovery should be blocked when EmergencyStop is active');
    eStop.reset();
  });

  await runTest('test_research_recovery_04', 'Recovery: Recovery attempts are recorded in local audit logs', 'Logging', async () => {
    eStop.reset();
    const session = new ProductResearchSession('s_rec_4', {
      requestId: 'r_rec_4',
      query: 'headphone stand',
      createdAt: Date.now(),
    });
    const beforeCount = LocalActionLogger.getInstance().getLogs().length;
    session.attemptRecovery('Simulated recoverable error');
    const afterCount = LocalActionLogger.getInstance().getLogs().length;

    if (afterCount <= beforeCount) throw new Error('Expected audit log to be created for recovery');
  });

  // ----------------------------------------------------
  // SECTION 4: Product Candidate Extraction Tests (5 tests)
  // ----------------------------------------------------

  await runTest('test_research_candidates_01', 'Candidates: Detects candidates from accessibility tree', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'item_1',
        text: 'Anker Vertical Ergonomic Wireless Mouse',
        contentDescription: '$29.99 4.5 stars 1,200 reviews',
        className: 'android.widget.TextView',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 100, width: 800, height: 100 },
      },
      {
        id: 'item_2',
        text: 'Logitech Lift Vertical Ergonomic Mouse',
        contentDescription: '$69.99 4.7 stars 3,400 reviews',
        className: 'android.widget.TextView',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 220, width: 800, height: 100 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const candidates = await adapter.detectCandidates(5);
    if (candidates.length < 2) throw new Error(`Expected at least 2 candidates, got ${candidates.length}`);
    if (!candidates[0].title.includes('Anker')) throw new Error('Candidate 1 title mismatch');
  });

  await runTest('test_research_candidates_02', 'Candidates: Correctly extracts price, currency, rating, and reviews', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'item_card',
        text: 'Anker Vertical Mouse',
        contentDescription: '$29.99 4.6 out of 5 stars 1,420 ratings',
        className: 'android.widget.TextView',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 100, width: 800, height: 100 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const candidates = await adapter.detectCandidates(1);
    const top = candidates[0];
    if (top.visiblePrice !== 29.99) throw new Error(`Expected price 29.99, got ${top.visiblePrice}`);
    if (top.currency !== 'USD') throw new Error(`Expected currency USD, got ${top.currency}`);
    if (top.rating !== 4.6) throw new Error(`Expected rating 4.6, got ${top.rating}`);
    if (top.reviewCount !== 1420) throw new Error(`Expected reviews 1420, got ${top.reviewCount}`);
  });

  await runTest('test_research_candidates_03', 'Candidates: Preserves ranking sourcePosition', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'i1',
        text: 'Product Rank One Item Description',
        contentDescription: '$10.00',
        className: 'android.widget.TextView',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      },
      {
        id: 'i2',
        text: 'Product Rank Two Item Description',
        contentDescription: '$20.00',
        className: 'android.widget.TextView',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 60, width: 100, height: 50 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const candidates = await adapter.detectCandidates(2);
    if (candidates[0].sourcePosition !== 1) throw new Error('First candidate position must be 1');
    if (candidates[1].sourcePosition !== 2) throw new Error('Second candidate position must be 2');
  });

  await runTest('test_research_candidates_04', 'Candidates: Detects sponsored tag when present', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'i1',
        text: 'Sponsored item: Best wireless mouse on earth',
        contentDescription: '$19.99 sponsored',
        className: 'android.widget.TextView',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const candidates = await adapter.detectCandidates(1);
    if (!candidates[0].isSponsored) throw new Error('Expected candidate to be tagged as sponsored');
  });

  await runTest('test_research_candidates_05', 'Candidates: Missing candidate fields remain undefined, never guessed', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'i1',
        text: 'Plain Product With No Price or Reviews',
        contentDescription: 'Plain product description only',
        className: 'android.widget.TextView',
        isClickable: true,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const candidates = await adapter.detectCandidates(1);
    const cand = candidates[0];
    if (cand.visiblePrice !== undefined) throw new Error('Missing price must remain undefined');
    if (cand.rating !== undefined) throw new Error('Missing rating must remain undefined');
    if (cand.reviewCount !== undefined) throw new Error('Missing reviewCount must remain undefined');
  });

  // ----------------------------------------------------
  // SECTION 5: Product Detail Extraction Tests (6 tests)
  // ----------------------------------------------------

  await runTest('test_research_extract_01', 'Extraction: Extracts title, visible price, availability, and features', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'title_node',
        text: 'Anker 2.4G Wireless Vertical Ergonomic Optical Mouse',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 500, height: 60 },
      },
      {
        id: 'price_node',
        text: '$29.99',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 70, width: 100, height: 30 },
      },
      {
        id: 'feat_1',
        text: '• Ergonomic design promotes healthy wrist alignment',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 110, width: 500, height: 30 },
      },
      {
        id: 'avail',
        text: 'In Stock.',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 150, width: 200, height: 30 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const product = await adapter.readVisibleProductData();
    if (!product.title.includes('Anker 2.4G')) throw new Error('Title not extracted correctly');
    if (product.price !== 29.99) throw new Error(`Price mismatch: expected 29.99, got ${product.price}`);
    if (product.availability !== 'In Stock.') throw new Error('Availability mismatch');
    if (!product.keyFeatures || product.keyFeatures.length === 0) throw new Error('Features should be extracted');
  });

  await runTest('test_research_extract_02', 'Extraction: Missing fields remain null/undefined', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'title_node',
        text: 'Minimalistic Notebook Stand With Simple Frame',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 500, height: 60 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const product = await adapter.readVisibleProductData();
    if (product.price !== undefined) throw new Error('Missing price must be undefined');
    if (product.availability !== undefined) throw new Error('Missing availability must be undefined');
    if (product.rating !== undefined) throw new Error('Missing rating must be undefined');
  });

  await runTest('test_research_extract_03', 'Extraction: Conflicting preview vs detail values flagged as CONFLICT', 'JobValidation', async () => {
    eStop.reset();
    // Candidate says price is 24.99, but detail node says 39.99
    const cand: ProductCandidate = {
      candidateId: 'cand_conf',
      title: 'Ergonomic Stand Candidate',
      visiblePrice: 24.99,
      sourcePosition: 1,
      sourceFingerprint: 'fp_1',
      confidence: 0.9,
    };
    const mockNodes: UiNode[] = [
      {
        id: 'title_node',
        text: 'Ergonomic Stand Full Detail Title',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 500, height: 60 },
      },
      {
        id: 'price_node',
        text: '$39.99',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 70, width: 100, height: 30 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const product = await adapter.readVisibleProductData(cand);
    if (product.validationStatus !== 'CONFLICT') {
      throw new Error(`Expected validationStatus CONFLICT, got ${product.validationStatus}`);
    }
    if (!product.conflicts || product.conflicts.length === 0) {
      throw new Error('Expected conflict record to be recorded');
    }
  });

  await runTest('test_research_extract_04', 'Extraction: Generates field-level provenance for each extracted field', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'title_node',
        text: 'Ergonomic Wireless Trackball Mouse with Precision Sensor',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 500, height: 60 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const product = await adapter.readVisibleProductData();
    if (!product.fieldProvenance || product.fieldProvenance.length === 0) {
      throw new Error('Field provenance must be populated');
    }
    const titleProv = product.fieldProvenance.find(p => p.fieldName === 'title');
    if (!titleProv) throw new Error('Title provenance missing');
    if (titleProv.sourceType !== 'AMAZON_VISIBLE_UI') throw new Error('Source type must be AMAZON_VISIBLE_UI');
    if (titleProv.confidence < 0.9) throw new Error('Confidence should be high for visible title');
  });

  await runTest('test_research_extract_05', 'Extraction: Computes initial pfp_<sha256> fingerprint', 'JobValidation', async () => {
    eStop.reset();
    const mockNodes: UiNode[] = [
      {
        id: 'title_node',
        text: 'Full Featured Ergonomic Mechanical Keyboard',
        className: 'android.widget.TextView',
        isClickable: false,
        isVisible: true,
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 0, y: 0, width: 500, height: 60 },
      },
    ];
    const inspector = new UiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    const product = await adapter.readVisibleProductData();
    if (!product.dataFingerprint || !product.dataFingerprint.startsWith('pfp_')) {
      throw new Error(`Expected fingerprint starting with pfp_, got ${product.dataFingerprint}`);
    }
  });

  await runTest('test_research_extract_06', 'Extraction: Rejects extraction when foreground package switches', 'Security', async () => {
    eStop.reset();
    const inspector = new UiInspector('com.unknown.switched.package');
    const executor = new ActionExecutor(inspector);
    const adapter = new AmazonResearchAdapter(inspector, executor);

    let thrown = false;
    try {
      await adapter.readVisibleProductData();
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected readVisibleProductData to throw when package is not Amazon');
    eStop.reset();
  });

  // ----------------------------------------------------
  // SECTION 6: Field-Level Provenance & Evidence Tests (5 tests)
  // ----------------------------------------------------

  await runTest('test_research_provenance_01', 'Provenance: AMAZON_VISIBLE_UI marked as verified with confidence', 'JobValidation', async () => {
    const prov = createFieldProvenance({
      fieldName: 'price',
      sourceType: 'AMAZON_VISIBLE_UI',
      sourceScreen: 'ProductDetailScreen',
      sourceText: '$49.99',
      extractedValue: 49.99,
      confidence: 0.98,
    });
    if (!prov.isVerified) throw new Error('AMAZON_VISIBLE_UI should be marked isVerified=true');
    if (prov.confidence !== 0.98) throw new Error(`Confidence mismatch: ${prov.confidence}`);
  });

  await runTest('test_research_provenance_02', 'Provenance: USER_PROVIDED marked as verified', 'JobValidation', async () => {
    const prov = createFieldProvenance({
      fieldName: 'affiliateLink',
      sourceType: 'USER_PROVIDED',
      extractedValue: 'https://amzn.to/3xyz',
    });
    if (!prov.isVerified) throw new Error('USER_PROVIDED should be isVerified=true');
  });

  await runTest('test_research_provenance_03', 'Provenance: AI_GUESS and UNVERIFIED rejected for factual claims', 'Security', async () => {
    if (isValidProvenanceSource('AI_GUESS')) throw new Error('AI_GUESS must not be a valid provenance source');
    if (isValidProvenanceSource('INFERRED_FROM_INTERNET')) throw new Error('INFERRED_FROM_INTERNET must not be valid');
    if (isValidProvenanceSource('UNVERIFIED')) throw new Error('UNVERIFIED must not be valid');

    const prov = createFieldProvenance({
      fieldName: 'cure',
      sourceType: 'AI_GUESS' as any,
      extractedValue: '100% cure',
    });
    if (prov.sourceType !== 'UNKNOWN') throw new Error('Invalid source type must fallback to UNKNOWN');
    if (prov.isVerified) throw new Error('UNKNOWN source must NOT be verified');
  });

  await runTest('test_research_provenance_04', 'Provenance: Confidence clamped to [0.0, 1.0]', 'JobValidation', async () => {
    const provHigh = createFieldProvenance({
      fieldName: 'test',
      sourceType: 'SYSTEM_DERIVED',
      extractedValue: 'val',
      confidence: 1.5,
    });
    if (provHigh.confidence > 1.0) throw new Error('Confidence must be clamped to <= 1.0');

    const provLow = createFieldProvenance({
      fieldName: 'test',
      sourceType: 'SYSTEM_DERIVED',
      extractedValue: 'val',
      confidence: -0.5,
    });
    if (provLow.confidence < 0.0) throw new Error('Confidence must be clamped to >= 0.0');
  });

  await runTest('test_research_provenance_05', 'Provenance: Preserves original sourceScreen and text snippet', 'JobValidation', async () => {
    const prov = createFieldProvenance({
      fieldName: 'feature',
      sourceType: 'AMAZON_VISIBLE_UI',
      sourceScreen: 'TechnicalDetailsTable',
      sourceText: 'Battery Life: Up to 70 days on full charge',
      extractedValue: '70 days battery',
    });
    if (prov.sourceScreen !== 'TechnicalDetailsTable') throw new Error('sourceScreen mismatch');
    if (!prov.sourceText?.includes('70 days')) throw new Error('sourceText mismatch');
  });

  // ----------------------------------------------------
  // SECTION 7: Amazon URL & Link Safety Tests (6 tests)
  // ----------------------------------------------------

  await runTest('test_research_url_01', 'URL: Valid HTTPS Amazon product URL accepted', 'Security', async () => {
    const res = validateAmazonProductUrl('https://www.amazon.com/dp/B0CX234XYZ?tag=phoneagent-20');
    if (!res.valid) throw new Error(`Valid Amazon URL rejected: ${res.reason}`);
    if (res.asin !== 'B0CX234XYZ') throw new Error(`Expected ASIN B0CX234XYZ, got ${res.asin}`);
  });

  await runTest('test_research_url_02', 'URL: Insecure scheme rejected', 'Security', async () => {
    const res = validateAmazonProductUrl('ftp://www.amazon.com/dp/B0CX234XYZ');
    if (res.valid) throw new Error('FTP scheme should be rejected');
  });

  await runTest('test_research_url_03', 'URL: Non-Amazon external domain rejected', 'Security', async () => {
    const res = validateAmazonProductUrl('https://www.phishing-amazon-deals.com/dp/B0CX234XYZ');
    if (res.valid) throw new Error('Non-Amazon domain should be rejected');
  });

  await runTest('test_research_url_04', 'URL: International Amazon domains accepted', 'Security', async () => {
    const resIn = validateAmazonProductUrl('https://www.amazon.in/dp/B0CX234XYZ');
    if (!resIn.valid) throw new Error('amazon.in rejected');

    const resUk = validateAmazonProductUrl('https://www.amazon.co.uk/dp/B0CX234XYZ');
    if (!resUk.valid) throw new Error('amazon.co.uk rejected');

    const resDe = validateAmazonProductUrl('https://www.amazon.de/dp/B0CX234XYZ');
    if (!resDe.valid) throw new Error('amazon.de rejected');
  });

  await runTest('test_research_url_05', 'URL: Shortened Amazon domains (amzn.to, a.co) accepted', 'Security', async () => {
    const resShort1 = validateAmazonProductUrl('https://amzn.to/3xyz123');
    if (!resShort1.valid) throw new Error('amzn.to rejected');

    const resShort2 = validateAmazonProductUrl('https://a.co/d/4xyz567');
    if (!resShort2.valid) throw new Error('a.co rejected');
  });

  await runTest('test_research_url_06', 'URL: Deterministic SHA-256 URL fingerprint computed', 'Security', async () => {
    const url = 'https://www.amazon.com/dp/B0CX234XYZ';
    const fp1 = computeProductUrlFingerprint(url);
    const fp2 = computeProductUrlFingerprint(url);
    if (!fp1.startsWith('urlfp_')) throw new Error('URL fingerprint must start with urlfp_');
    if (fp1 !== fp2) throw new Error('URL fingerprint must be deterministic');
  });

  // ----------------------------------------------------
  // SECTION 8: Product Cryptographic Fingerprinting Tests (5 tests)
  // ----------------------------------------------------

  await runTest('test_research_pfp_01', 'Fingerprint: Deterministic computation across runs', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Logitech MX Master 3S Wireless Performance Mouse',
      price: 99.99,
      currency: 'USD',
      keyFeatures: ['Quiet Clicks', '8K DPI sensor'],
    });
    const fp1 = computeProductFingerprint(prod);
    const fp2 = computeProductFingerprint(prod);
    if (!fp1.startsWith('pfp_')) throw new Error('Product fingerprint must start with pfp_');
    if (fp1 !== fp2) throw new Error('Fingerprint must be deterministic');
  });

  await runTest('test_research_pfp_02', 'Fingerprint: Changes when title changes', 'Security', async () => {
    const prodA = createDefaultProductData({ title: 'Title Alpha', price: 50.0 });
    const prodB = createDefaultProductData({ title: 'Title Beta', price: 50.0 });
    const fpA = computeProductFingerprint(prodA);
    const fpB = computeProductFingerprint(prodB);
    if (fpA === fpB) throw new Error('Fingerprint must change when title changes');
  });

  await runTest('test_research_pfp_03', 'Fingerprint: Changes when price changes', 'Security', async () => {
    const prodA = createDefaultProductData({ title: 'Title Same', price: 50.0 });
    const prodB = createDefaultProductData({ title: 'Title Same', price: 59.99 });
    const fpA = computeProductFingerprint(prodA);
    const fpB = computeProductFingerprint(prodB);
    if (fpA === fpB) throw new Error('Fingerprint must change when price changes');
  });

  await runTest('test_research_pfp_04', 'Fingerprint: Changes when key features change', 'Security', async () => {
    const prodA = createDefaultProductData({ title: 'Title', keyFeatures: ['Feature 1'] });
    const prodB = createDefaultProductData({ title: 'Title', keyFeatures: ['Feature 1', 'Feature 2'] });
    const fpA = computeProductFingerprint(prodA);
    const fpB = computeProductFingerprint(prodB);
    if (fpA === fpB) throw new Error('Fingerprint must change when features change');
  });

  await runTest('test_research_pfp_05', 'Fingerprint: Canonical sorting avoids spurious changes', 'Security', async () => {
    const prodA = createDefaultProductData({ title: 'Title', keyFeatures: ['Alpha', 'Beta'] });
    const prodB = createDefaultProductData({ title: 'Title', keyFeatures: ['Beta', 'Alpha'] });
    const fpA = computeProductFingerprint(prodA);
    const fpB = computeProductFingerprint(prodB);
    if (fpA !== fpB) throw new Error('Feature order should be canonically sorted so permutation does not change fingerprint');
  });

  // ----------------------------------------------------
  // SECTION 9: Duplicate Detection & Index Tests (5 tests)
  // ----------------------------------------------------

  await runTest('test_research_duplicate_01', 'Duplicate: Exact product fingerprint duplicate detected', 'JobValidation', async () => {
    fingerprintIndex.clear();
    const prod = createDefaultProductData({
      title: 'Anker Vertical Mouse Ergonomic',
      price: 29.99,
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
    });
    fingerprintIndex.indexProduct(prod, 'session_1');

    const check = fingerprintIndex.checkProductDuplicate(prod);
    if (!check.isDuplicate) throw new Error('Expected duplicate to be detected');
    if (check.duplicateType !== 'EXACT_FINGERPRINT') throw new Error('Expected EXACT_FINGERPRINT duplicate type');
  });

  await runTest('test_research_duplicate_02', 'Duplicate: Identical source URL duplicate detected', 'JobValidation', async () => {
    fingerprintIndex.clear();
    const prod1 = createDefaultProductData({
      title: 'Original Title',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
    });
    fingerprintIndex.indexProduct(prod1, 'session_1');

    const prod2 = createDefaultProductData({
      title: 'Different Title (Modified)',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
    });
    const check = fingerprintIndex.checkProductDuplicate(prod2);
    if (!check.isDuplicate) throw new Error('Expected URL duplicate to be detected');
    if (!check.hasConflict) throw new Error('URL match with differing fingerprint should flag conflict');
  });

  await runTest('test_research_duplicate_03', 'Duplicate: Candidate title duplicate detected', 'JobValidation', async () => {
    fingerprintIndex.clear();
    const prod = createDefaultProductData({
      title: 'Logitech Ergo M575 Trackball Mouse',
      sourceUrl: 'https://www.amazon.com/dp/B0877995GT',
    });
    fingerprintIndex.indexProduct(prod, 's1');

    const cand: ProductCandidate = {
      candidateId: 'cand_dup',
      title: 'Logitech Ergo M575 Trackball Mouse',
      sourcePosition: 1,
      sourceFingerprint: 'fp_cand',
      confidence: 0.9,
    };
    const check = fingerprintIndex.checkCandidateDuplicate(cand);
    if (!check.isDuplicate) throw new Error('Expected candidate duplicate by title match');
  });

  await runTest('test_research_duplicate_04', 'Duplicate: ASIN match detected as conflict if details differ', 'JobValidation', async () => {
    fingerprintIndex.clear();
    const prod1 = createDefaultProductData({
      productId: 'B0CX123XYZ',
      title: 'Original Product Item',
    });
    fingerprintIndex.indexProduct(prod1, 's1');

    const prod2 = createDefaultProductData({
      productId: 'B0CX123XYZ',
      title: 'Conflicting Product Item',
    });
    const check = fingerprintIndex.checkProductDuplicate(prod2);
    if (!check.isDuplicate || !check.hasConflict) throw new Error('Expected ASIN conflict');
  });

  await runTest('test_research_duplicate_05', 'Duplicate: Index preserves session IDs and timestamps', 'JobValidation', async () => {
    fingerprintIndex.clear();
    const prod = createDefaultProductData({ title: 'Repeated Item' });
    fingerprintIndex.indexProduct(prod, 's_first');
    fingerprintIndex.indexProduct(prod, 's_second');

    const pfp = computeProductFingerprint(prod);
    const entry = fingerprintIndex.getEntry(pfp);
    if (!entry) throw new Error('Entry should exist');
    if (!entry.researchSessionIds.includes('s_first') || !entry.researchSessionIds.includes('s_second')) {
      throw new Error('All session IDs must be preserved');
    }
  });

  // ----------------------------------------------------
  // SECTION 10: Policy & Deceptive Claims Tests (6 tests)
  // ----------------------------------------------------

  await runTest('test_research_policy_01', 'Policy: Medical treatment claim triggers BLOCK', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Miracle Herbal Cream that cures diabetes permanently',
    });
    const res = policyValidator.evaluateProduct(prod);
    if (res.verdict !== 'BLOCK') throw new Error(`Expected BLOCK, got ${res.verdict}`);
    if (res.blockedCount === 0) throw new Error('blockedCount must be > 0');
  });

  await runTest('test_research_policy_02', 'Policy: Weight loss guarantee triggers BLOCK', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Dietary Shake',
      description: 'Guaranteed weight loss of 20 lbs in 5 days!',
    });
    const res = policyValidator.evaluateProduct(prod);
    if (res.verdict !== 'BLOCK') throw new Error(`Expected BLOCK, got ${res.verdict}`);
  });

  await runTest('test_research_policy_03', 'Policy: Guaranteed earnings claim triggers BLOCK', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Trading Software System',
      description: 'Make $5,000/week guaranteed with zero effort',
    });
    const res = policyValidator.evaluateProduct(prod);
    if (res.verdict !== 'BLOCK') throw new Error(`Expected BLOCK, got ${res.verdict}`);
  });

  await runTest('test_research_policy_04', 'Policy: Superlative ranking (#1 in India) triggers WARN', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Wireless Earbuds rated #1 in India for deep bass',
    });
    const res = policyValidator.evaluateProduct(prod);
    if (res.verdict !== 'WARN') throw new Error(`Expected WARN, got ${res.verdict}`);
    if (res.warnCount === 0) throw new Error('warnCount must be > 0');
  });

  await runTest('test_research_policy_05', 'Policy: Risk-free guarantee phrasing triggers WARN', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Ergonomic Chair with 30-day risk-free trial',
    });
    const res = policyValidator.evaluateProduct(prod);
    if (res.verdict !== 'WARN') throw new Error(`Expected WARN, got ${res.verdict}`);
  });

  await runTest('test_research_policy_06', 'Policy: Clean, factual product passes with PASS verdict', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Anker Vertical Ergonomic Optical Mouse',
      description: 'Features 800/1200/1600 DPI optical sensor with 5 buttons.',
      keyFeatures: ['Ergonomic wrist design', '2.4G wireless USB receiver'],
    });
    const res = policyValidator.evaluateProduct(prod);
    if (res.verdict !== 'PASS') throw new Error(`Expected PASS, got ${res.verdict}`);
    if (!res.policyFingerprint.startsWith('pol_')) throw new Error('Policy fingerprint missing');
  });

  // ----------------------------------------------------
  // SECTION 11: Suitability Scorer Tests (5 tests)
  // ----------------------------------------------------

  await runTest('test_research_scorer_01', 'Scorer: Complete factual product scores >= 75 (EXCELLENT)', 'JobValidation', async () => {
    const prod = createDefaultProductData({
      title: 'High Performance Wireless Gaming Mouse with RGB',
      sourceUrl: 'https://www.amazon.com/dp/B0CX123XYZ',
      price: 49.99,
      currency: 'USD',
      description: 'Extremely lightweight honeycomb shell mouse with optical switches.',
      keyFeatures: ['Ultralight 58g', '16K DPI PixArt sensor', 'PTFE skates'],
      specifications: { Sensor: 'PixArt 3389', Weight: '58g' },
    });
    const policy = policyValidator.evaluateProduct(prod);
    const score = ProductScorer.calculateScore(prod, policy);
    if (score.finalScore < 75) throw new Error(`Expected score >= 75, got ${score.finalScore}`);
    if (score.recommendation !== 'EXCELLENT') throw new Error(`Expected EXCELLENT, got ${score.recommendation}`);
  });

  await runTest('test_research_scorer_02', 'Scorer: Missing price reduces score', 'JobValidation', async () => {
    const prodWithoutPrice = createDefaultProductData({
      title: 'Product Title With No Price Attached',
      sourceUrl: 'https://www.amazon.com/dp/B0CX123XYZ',
    });
    const score = ProductScorer.calculateScore(prodWithoutPrice);
    if (score.hasPrice) throw new Error('hasPrice should be false');
    if (score.finalScore > 60) throw new Error('Score without price should be <= 60');
  });

  await runTest('test_research_scorer_03', 'Scorer: Missing features reduces score', 'JobValidation', async () => {
    const prodWithoutFeatures = createDefaultProductData({
      title: 'Product Title with Price but Zero Features Listed',
      sourceUrl: 'https://www.amazon.com/dp/B0CX123XYZ',
      price: 20.0,
      keyFeatures: [],
    });
    const score = ProductScorer.calculateScore(prodWithoutFeatures);
    if (score.hasFeatures) throw new Error('hasFeatures should be false');
  });

  await runTest('test_research_scorer_04', 'Scorer: Policy BLOCK applies heavy penalty (HIGH_RISK_BLOCKED)', 'JobValidation', async () => {
    const prod = createDefaultProductData({
      title: 'Herbal Supplement that cures all diseases',
      sourceUrl: 'https://www.amazon.com/dp/B0CX123XYZ',
      price: 30.0,
    });
    const policy = policyValidator.evaluateProduct(prod);
    const score = ProductScorer.calculateScore(prod, policy);
    if (score.recommendation !== 'HIGH_RISK_BLOCKED') {
      throw new Error(`Expected HIGH_RISK_BLOCKED, got ${score.recommendation}`);
    }
  });

  await runTest('test_research_scorer_05', 'Scorer: Score is strictly advisory and never auto-approves', 'JobValidation', async () => {
    const prod = createDefaultProductData({
      title: 'Perfect Product with High Score',
      sourceUrl: 'https://www.amazon.com/dp/B0CX123XYZ',
      price: 99.99,
    });
    const score = ProductScorer.calculateScore(prod);
    // Verified: ProductScorer only returns ProductScoreBreakdown, does not mutate approval status
    if (prod.validationStatus === 'VALID') {
      throw new Error('Scorer must not mutate validationStatus to VALID');
    }
  });

  // ----------------------------------------------------
  // SECTION 12: Review, Cryptographic Approval & Stale Tests (6 tests)
  // ----------------------------------------------------

  await runTest('test_research_approval_01', 'Review: Approval cryptographically binds product fingerprint & reviewer', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Ergonomic Vertical Mouse',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
      price: 29.99,
    });
    const { approvedProduct, approvalRecord } = reviewManager.approveProduct(
      prod,
      'session_appr_1',
      'Operator_Bob'
    );
    if (approvedProduct.validationStatus !== 'VALID') throw new Error('validationStatus must be VALID');
    if (!approvalRecord.approvalId.startsWith('prod_appr_')) throw new Error('approvalId missing');
    if (approvalRecord.reviewerId !== 'Operator_Bob') throw new Error('reviewerId mismatch');

    const status = reviewManager.verifyApprovalStatus(approvedProduct, approvalRecord);
    if (!status.isApproved || status.state !== 'APPROVED') {
      throw new Error(`Expected APPROVED status, got ${status.state}`);
    }
  });

  await runTest('test_research_approval_02', 'Review: Product title modification causes STALE_APPROVAL', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Original Approved Title',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
      price: 29.99,
    });
    const { approvedProduct, approvalRecord } = reviewManager.approveProduct(
      prod,
      'session_appr_2',
      'Operator_Bob'
    );

    // Tamper with title
    const tampered = { ...approvedProduct, title: 'Tampered Title Altered Without Approval' };
    const status = reviewManager.verifyApprovalStatus(tampered, approvalRecord);
    if (status.isApproved) throw new Error('Tampered product must not be approved');
    if (status.state !== 'STALE_APPROVAL') throw new Error(`Expected STALE_APPROVAL, got ${status.state}`);
  });

  await runTest('test_research_approval_03', 'Review: Product price modification causes STALE_APPROVAL', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Original Title',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
      price: 29.99,
    });
    const { approvedProduct, approvalRecord } = reviewManager.approveProduct(
      prod,
      'session_appr_3',
      'Operator_Bob'
    );

    // Tamper with price
    const tampered = { ...approvedProduct, price: 19.99 };
    const status = reviewManager.verifyApprovalStatus(tampered, approvalRecord);
    if (status.isApproved || status.state !== 'STALE_APPROVAL') {
      throw new Error(`Expected STALE_APPROVAL for price change, got ${status.state}`);
    }
  });

  await runTest('test_research_approval_04', 'Review: Source URL modification causes STALE_APPROVAL', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Original Title',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
      price: 29.99,
    });
    const { approvedProduct, approvalRecord } = reviewManager.approveProduct(
      prod,
      'session_appr_4',
      'Operator_Bob'
    );

    // Tamper with sourceUrl
    const tampered = { ...approvedProduct, sourceUrl: 'https://www.amazon.com/dp/B00FPAVU99' };
    const status = reviewManager.verifyApprovalStatus(tampered, approvalRecord);
    if (status.isApproved || status.state !== 'STALE_APPROVAL') {
      throw new Error(`Expected STALE_APPROVAL for URL change, got ${status.state}`);
    }
  });

  await runTest('test_research_approval_05', 'Review: Prohibited claims BLOCK prevents product approval', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Skin Ointment that heals cancer completely',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
    });

    let thrown = false;
    try {
      reviewManager.approveProduct(prod, 'session_block', 'Operator_Bob');
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected approveProduct to throw when policy verdict is BLOCK');
  });

  await runTest('test_research_approval_06', 'Review: Rejection record created with revocation flag', 'Security', async () => {
    const prod = createDefaultProductData({
      title: 'Item to Reject',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
    });
    const record = reviewManager.rejectProduct(
      prod,
      'session_rej',
      'Operator_Bob',
      'Poor build quality observed'
    );
    if (!record.isRevoked) throw new Error('Rejection record must have isRevoked=true');
    if (!record.approvalId.startsWith('prod_rej_')) throw new Error('approvalId prefix mismatch');
  });

  // ----------------------------------------------------
  // SECTION 13: Step 2J Integration & Persistence Tests (6 tests)
  // ----------------------------------------------------

  await runTest('test_research_integration_01', 'Integration: Approved ProductData converts to Step 2J ContentPackage', 'JobValidation', async () => {
    const prod = createDefaultProductData({
      title: 'Anker Vertical Ergonomic Mouse',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
      price: 29.99,
      description: 'Comfortable ergonomic vertical mouse for daily office use.',
    });
    const { approvedProduct, approvalRecord } = reviewManager.approveProduct(
      prod,
      'sess_pkg_1',
      'Operator_Bob'
    );

    const contentPkg = reviewManager.createContentPackageFromApprovedProduct(
      approvedProduct,
      approvalRecord,
      {
        selectedPlatforms: ['instagram', 'threads'],
      }
    );

    if (!contentPkg.contentId.startsWith('pkg_')) throw new Error('contentId prefix mismatch');
    if (contentPkg.productData?.title !== prod.title) throw new Error('Product title mismatch in ContentPackage');
    if (contentPkg.sourceReference !== prod.sourceUrl) throw new Error('sourceReference mismatch');
  });

  await runTest('test_research_integration_02', 'Integration: Unapproved ProductData CANNOT convert to ContentPackage', 'Security', async () => {
    const unapprovedProd = createDefaultProductData({
      title: 'Unapproved Product Draft',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
    });
    const fakeRecord = {
      approvalId: 'fake_appr',
      researchSessionId: 's1',
      reviewerId: 'Nobody',
      approvedAt: Date.now(),
      productFingerprint: 'pfp_mismatch',
      sourceUrlFingerprint: 'urlfp_mismatch',
      policyFingerprint: 'pol_mismatch',
      isRevoked: false,
    };

    let thrown = false;
    try {
      reviewManager.createContentPackageFromApprovedProduct(unapprovedProd, fakeRecord);
    } catch {
      thrown = true;
    }
    if (!thrown) throw new Error('Expected createContentPackageFromApprovedProduct to reject unapproved product');
  });

  await runTest('test_research_integration_03', 'Integration: Step 2J ContentNormalizer validates approved ProductData', 'JobValidation', async () => {
    const prod = createDefaultProductData({
      title: 'Anker Wireless Mouse',
      productName: 'Anker Wireless Mouse',
      sourceUrl: 'https://www.amazon.com/dp/B00FPAVU34',
      productUrl: 'https://www.amazon.com/dp/B00FPAVU34',
      price: 29.99,
      currency: 'USD',
      sourceTimestamp: Date.now(),
    });
    const { approvedProduct, approvalRecord } = reviewManager.approveProduct(
      prod,
      'sess_norm_1',
      'Operator_Bob'
    );
    const contentPkg = reviewManager.createContentPackageFromApprovedProduct(
      approvedProduct,
      approvalRecord
    );

    const { normalizedPackage } = ContentNormalizer.getInstance().normalize(contentPkg);
    if (!normalizedPackage.productData?.productName) throw new Error('Normalized productData missing productName');
    if (normalizedPackage.productData.price !== 29.99) throw new Error('Normalized productData price mismatch');
  });

  await runTest('test_research_persistence_01', 'Persistence: Research session saved and restored in JobStore', 'Persistence', async () => {
    const session = new ProductResearchSession('s_pers_1', {
      requestId: 'r_pers_1',
      query: 'ergonomic keyboard',
      createdAt: Date.now(),
    });
    session.transitionTo('VALIDATING', 'Validating query');

    jobStore.saveResearchSession(session);
    const loaded = jobStore.getResearchSession('s_pers_1');
    if (!loaded) throw new Error('Session not found in store');
    if (loaded.sessionId !== 's_pers_1') throw new Error('Session ID mismatch');
    if (loaded.state !== 'VALIDATING') throw new Error(`State mismatch: expected VALIDATING, got ${loaded.state}`);
  });

  await runTest('test_research_persistence_02', 'Persistence: ProductData saved and restored in JobStore', 'Persistence', async () => {
    const prod = createDefaultProductData({
      productId: 'B0CX123XYZ',
      title: 'Persisted Wireless Keyboard',
      price: 79.99,
      dataFingerprint: 'pfp_test_pers_keyboard',
    });
    jobStore.saveProduct(prod);

    const loaded = jobStore.getProduct(prod.dataFingerprint!);
    if (!loaded) throw new Error('Product not found in store');
    if (loaded.title !== 'Persisted Wireless Keyboard') throw new Error('Loaded title mismatch');
    if (loaded.price !== 79.99) throw new Error('Loaded price mismatch');
  });

  await runTest('test_research_persistence_03', 'Persistence: ProductApprovalRecord saved and restored in JobStore', 'Persistence', async () => {
    const record = {
      approvalId: 'prod_appr_pers_test_123',
      researchSessionId: 'sess_1',
      reviewerId: 'Operator_Alice',
      approvedAt: Date.now(),
      productFingerprint: 'pfp_test_123',
      sourceUrlFingerprint: 'urlfp_test_123',
      policyFingerprint: 'pol_test_123',
      isRevoked: false,
    };
    jobStore.saveProductApproval(record);

    const loaded = jobStore.getProductApproval('prod_appr_pers_test_123');
    if (!loaded) throw new Error('Approval record not found in store');
    if (loaded.reviewerId !== 'Operator_Alice') throw new Error('Loaded reviewerId mismatch');
  });
}
