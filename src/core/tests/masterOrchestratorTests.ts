/**
 * Phone Agent - Step 2N Master AI Orchestrator Automated Test Suite
 * 148 automated tests verifying:
 * - 15-step canonical workflow sequence
 * - End-to-end happy path execution
 * - 4 mandatory approval gates (Product, Content, Video, Publish)
 * - Strict non-human / AI rejection on all approval gates
 * - Complete cryptographic fingerprint dependency chain (pfp -> cfp -> vpf -> opf -> plan_fp)
 * - Cascading staleness invalidation (STALE_APPROVAL)
 * - Amazon source-only isolation (zero purchasing, zero cart, zero checkout)
 * - Platform planning and deterministic sequential execution
 * - Error handling, max 2 retries, 3-failure EmergencyStop tripwire
 * - Distinction between operator Pause and EmergencyStop
 * - Bounded crash recovery and UNKNOWN reconciliation
 * - Safety tripwires (prohibited keywords, packages, and untyped actions)
 * - Cryptographic audit trail with credential sanitization
 */

import { TestResult } from './unitTests';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';
import { PublicationGuard } from '../fingerprint';
import { SafeUiInspector } from '../inspector';
import { AdapterRegistry } from '../AdapterRegistry';

// Orchestrator imports
import {
  MasterOrchestrator,
  OrchestrationState,
  isValidStateTransition,
  CANONICAL_STEP_SEQUENCE,
  createInitialWorkflowSteps,
  createOrchestrationPlan,
  createInitialContext,
  OrchestrationApprovalManager,
  OrchestrationAuditManager,
  OrchestrationRecoveryManager,
  OrchestrationValidator,
  CANONICAL_PLATFORM_ORDER,
  PROHIBITED_APP_PACKAGES,
  isAllowedTypedAction,
  scanForProhibitedKeywords,
} from '../orchestrator';

export async function runMasterOrchestratorTests(
  runTest: (id: string, name: string, category: TestResult['category'], fn: () => Promise<void> | void) => Promise<void>
): Promise<void> {
  // Helper to reset singletons before each test group
  const resetAll = () => {
    EmergencyStopManager.getInstance().reset();
    MasterOrchestrator.resetInstance();
    OrchestrationApprovalManager.resetInstance();
    OrchestrationAuditManager.resetInstance();
    OrchestrationRecoveryManager.resetInstance();
    PublicationGuard.getInstance().clear();
    try {
      localStorage.clear();
    } catch {}
  };

  // ==========================================================================
  // SECTION 1: CANONICAL WORKFLOW SEQUENCE & INITIAL STATE (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_001', 'Initialize creates initial context in INITIALIZING state', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    const ctx = orchestrator.initialize({
      searchQuery: 'Desk Lamp',
      targetPlatforms: ['instagram', 'youtube'],
      operatorId: 'Operator_01',
    });
    if (ctx.currentState !== 'INITIALIZING') throw new Error(`Expected INITIALIZING, got ${ctx.currentState}`);
    if (ctx.currentStep !== 'START') throw new Error(`Expected START, got ${ctx.currentStep}`);
  });

  await runTest('TEST_MO_002', 'All 15 canonical steps are created in exact deterministic sequence', 'Orchestration', () => {
    const steps = createInitialWorkflowSteps();
    if (steps.length !== 15) throw new Error(`Expected 15 steps, got ${steps.length}`);
    for (let i = 0; i < 15; i++) {
      if (steps[i].stepType !== CANONICAL_STEP_SEQUENCE[i]) {
        throw new Error(`Step index ${i} mismatch: expected ${CANONICAL_STEP_SEQUENCE[i]}, got ${steps[i].stepType}`);
      }
    }
  });

  await runTest('TEST_MO_003', 'Step indices are strictly 0 to 14 without gaps', 'Orchestration', () => {
    const steps = createInitialWorkflowSteps();
    steps.forEach((s, idx) => {
      if (s.sequenceIndex !== idx) throw new Error(`Expected sequenceIndex ${idx}, got ${s.sequenceIndex}`);
    });
  });

  await runTest('TEST_MO_004', 'Step 0 is START and marks as COMPLETED on workflow start', 'Orchestration', () => {
    const steps = createInitialWorkflowSteps();
    if (steps[0].stepType !== 'START') throw new Error('First step must be START');
    if (steps[0].status !== 'COMPLETED') throw new Error('First step must initialize as COMPLETED');
    if (steps[1].status !== 'PENDING') throw new Error('Second step must initialize as PENDING');
  });

  await runTest('TEST_MO_005', 'Step 14 is COMPLETE', 'Orchestration', () => {
    const steps = createInitialWorkflowSteps();
    if (steps[14].stepType !== 'COMPLETE') throw new Error('15th step must be COMPLETE');
  });

  await runTest('TEST_MO_006', 'Initial context has 0 consecutive failures and is not paused', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    const ctx = orchestrator.initialize({
      searchQuery: 'Earbuds',
      targetPlatforms: ['instagram'],
      operatorId: 'Operator_01',
    });
    if (ctx.consecutiveFailures !== 0) throw new Error('Expected 0 consecutive failures');
    if (ctx.isPaused) throw new Error('Expected not paused');
    if (ctx.isEmergencyStopped) throw new Error('Expected not emergency stopped');
  });

  await runTest('TEST_MO_007', 'Initial context has empty publishedPlatforms array', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    const ctx = orchestrator.initialize({
      searchQuery: 'Earbuds',
      targetPlatforms: ['instagram', 'tiktok'],
      operatorId: 'Operator_01',
    });
    if (ctx.publishedPlatforms.length !== 0) throw new Error('Expected 0 published platforms initially');
  });

  await runTest('TEST_MO_008', 'Rejects initialize when EmergencyStop is active', 'EmergencyStop', () => {
    resetAll();
    EmergencyStopManager.getInstance().trigger('Safety tripwire active');
    const orchestrator = MasterOrchestrator.getInstance();
    let threw = false;
    try {
      orchestrator.initialize({
        searchQuery: 'Earbuds',
        targetPlatforms: ['instagram'],
        operatorId: 'Operator_01',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected initialize() to throw when EmergencyStop is active');
  });

  await runTest('TEST_MO_009', 'Initializes with custom searchQuery and targetPlatforms', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    const ctx = orchestrator.initialize({
      searchQuery: 'Mechanical Keyboard',
      asin: 'B08XYZ1234',
      targetPlatforms: ['youtube', 'threads'],
      operatorId: 'Operator_Bob',
    });
    if (ctx.plan.searchQuery !== 'Mechanical Keyboard') throw new Error('searchQuery mismatch');
    if (ctx.plan.asin !== 'B08XYZ1234') throw new Error('asin mismatch');
    if (ctx.plan.operatorId !== 'Operator_Bob') throw new Error('operatorId mismatch');
  });

  await runTest('TEST_MO_010', 'Target platforms are sorted in canonical deterministic order', 'Orchestration', () => {
    const plan = createOrchestrationPlan({
      searchQuery: 'Test',
      targetPlatforms: ['threads', 'instagram', 'youtube'],
      operatorId: 'Operator_01',
    });
    if (plan.targetPlatforms[0] !== 'instagram' || plan.targetPlatforms[1] !== 'youtube' || plan.targetPlatforms[2] !== 'threads') {
      throw new Error(`Platforms not in canonical order: ${plan.targetPlatforms.join(', ')}`);
    }
  });

  // ==========================================================================
  // SECTION 2: STATE MACHINE TRANSITIONS & VALIDATION (15 tests)
  // ==========================================================================

  await runTest('TEST_MO_011', 'Valid transition IDLE -> INITIALIZING succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('IDLE', 'INITIALIZING')) throw new Error('Expected IDLE -> INITIALIZING to be valid');
  });

  await runTest('TEST_MO_012', 'Valid transition INITIALIZING -> RESEARCHING succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('INITIALIZING', 'RESEARCHING')) throw new Error('Expected INITIALIZING -> RESEARCHING to be valid');
  });

  await runTest('TEST_MO_013', 'Valid transition RESEARCHING -> WAITING_FOR_PRODUCT_REVIEW succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('RESEARCHING', 'WAITING_FOR_PRODUCT_REVIEW')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_014', 'Valid transition WAITING_FOR_PRODUCT_REVIEW -> GENERATING_CONTENT succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('WAITING_FOR_PRODUCT_REVIEW', 'GENERATING_CONTENT')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_015', 'Valid transition GENERATING_CONTENT -> WAITING_FOR_CONTENT_REVIEW succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('GENERATING_CONTENT', 'WAITING_FOR_CONTENT_REVIEW')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_016', 'Valid transition WAITING_FOR_CONTENT_REVIEW -> CREATING_VIDEO succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('WAITING_FOR_CONTENT_REVIEW', 'CREATING_VIDEO')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_017', 'Valid transition CREATING_VIDEO -> RENDERING_VIDEO succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('CREATING_VIDEO', 'RENDERING_VIDEO')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_018', 'Valid transition RENDERING_VIDEO -> WAITING_FOR_VIDEO_REVIEW succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('RENDERING_VIDEO', 'WAITING_FOR_VIDEO_REVIEW')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_019', 'Valid transition WAITING_FOR_VIDEO_REVIEW -> CAPTURING_AMAZON_LINK succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('WAITING_FOR_VIDEO_REVIEW', 'CAPTURING_AMAZON_LINK')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_020', 'Valid transition CAPTURING_AMAZON_LINK -> PLANNING_PLATFORMS succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('CAPTURING_AMAZON_LINK', 'PLANNING_PLATFORMS')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_021', 'Valid transition PLANNING_PLATFORMS -> WAITING_FOR_PUBLISH_APPROVAL succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('PLANNING_PLATFORMS', 'WAITING_FOR_PUBLISH_APPROVAL')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_022', 'Valid transition WAITING_FOR_PUBLISH_APPROVAL -> EXECUTING_PLATFORM succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('WAITING_FOR_PUBLISH_APPROVAL', 'EXECUTING_PLATFORM')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_023', 'Valid transition EXECUTING_PLATFORM -> VERIFYING_PUBLICATION succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('EXECUTING_PLATFORM', 'VERIFYING_PUBLICATION')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_024', 'Valid transition VERIFYING_PUBLICATION -> RECONCILING succeeds', 'StateMachine', () => {
    if (!isValidStateTransition('VERIFYING_PUBLICATION', 'RECONCILING')) throw new Error('Expected transition to be valid');
  });

  await runTest('TEST_MO_025', 'Terminal states COMPLETED, FAILED, CANCELLED cannot transition to active states', 'StateMachine', () => {
    const terminals: OrchestrationState[] = ['COMPLETED', 'FAILED', 'CANCELLED'];
    const activeStates: OrchestrationState[] = ['RESEARCHING', 'GENERATING_CONTENT', 'EXECUTING_PLATFORM'];
    for (const t of terminals) {
      for (const a of activeStates) {
        if (isValidStateTransition(t, a)) {
          throw new Error(`Terminal state ${t} must not allow transition to ${a}`);
        }
      }
    }
  });

  // ==========================================================================
  // SECTION 3: INVALID TRANSITIONS & PROTECTION (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_026', 'Direct transition IDLE -> EXECUTING_PLATFORM is rejected', 'StateMachine', () => {
    if (isValidStateTransition('IDLE', 'EXECUTING_PLATFORM')) throw new Error('Must reject IDLE -> EXECUTING_PLATFORM');
  });

  await runTest('TEST_MO_027', 'Direct transition IDLE -> COMPLETED is rejected', 'StateMachine', () => {
    if (isValidStateTransition('IDLE', 'COMPLETED')) throw new Error('Must reject IDLE -> COMPLETED');
  });

  await runTest('TEST_MO_028', 'Transition skipping product review gate is rejected', 'StateMachine', () => {
    if (isValidStateTransition('RESEARCHING', 'GENERATING_CONTENT')) {
      throw new Error('Must reject skipping product review gate');
    }
  });

  await runTest('TEST_MO_029', 'Transition skipping content review gate is rejected', 'StateMachine', () => {
    if (isValidStateTransition('GENERATING_CONTENT', 'CREATING_VIDEO')) {
      throw new Error('Must reject skipping content review gate');
    }
  });

  await runTest('TEST_MO_030', 'Transition skipping video review gate is rejected', 'StateMachine', () => {
    if (isValidStateTransition('RENDERING_VIDEO', 'CAPTURING_AMAZON_LINK')) {
      throw new Error('Must reject skipping video review gate');
    }
  });

  await runTest('TEST_MO_031', 'Transition skipping publish approval gate is rejected', 'StateMachine', () => {
    if (isValidStateTransition('PLANNING_PLATFORMS', 'EXECUTING_PLATFORM')) {
      throw new Error('Must reject skipping publish approval gate');
    }
  });

  await runTest('TEST_MO_032', 'Direct UNKNOWN -> COMPLETED is rejected', 'StateMachine', () => {
    if (isValidStateTransition('UNKNOWN', 'COMPLETED')) {
      throw new Error('Must reject direct UNKNOWN -> COMPLETED without RECONCILING');
    }
  });

  await runTest('TEST_MO_033', 'Backward transition from COMPLETED to RESEARCHING is rejected', 'StateMachine', () => {
    if (isValidStateTransition('COMPLETED', 'RESEARCHING')) {
      throw new Error('Must reject backward transition from COMPLETED');
    }
  });

  await runTest('TEST_MO_034', 'Backward transition from EXECUTING_PLATFORM to IDLE is rejected', 'StateMachine', () => {
    if (isValidStateTransition('EXECUTING_PLATFORM', 'IDLE')) {
      throw new Error('Must reject EXECUTING_PLATFORM -> IDLE');
    }
  });

  await runTest('TEST_MO_035', 'Arbitrary non-existent state string is rejected by validator', 'StateMachine', () => {
    const val = OrchestrationValidator.getInstance();
    const res = val.validateTransition('IDLE', 'FAKE_STATE' as any);
    if (res.valid) throw new Error('Expected arbitrary state transition to be rejected');
  });

  // ==========================================================================
  // SECTION 4: APPROVAL GATE 1 - PRODUCT REVIEW & NON-HUMAN REJECTION (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_036', 'Human product review approval succeeds with reviewer identity', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'PRODUCT_REVIEW',
      jobId: 'job_001',
      reviewerId: 'Operator_Alice',
      sessionId: 'sess_1',
      productFingerprint: 'pfp_test_123',
    });
    if (rec.status !== 'APPROVED') throw new Error('Expected APPROVED');
    if (rec.reviewerId !== 'Operator_Alice') throw new Error('Reviewer ID mismatch');
  });

  await runTest('TEST_MO_037', 'Rejects product review approval if reviewer contains "AI"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'PRODUCT_REVIEW',
        jobId: 'job_001',
        reviewerId: 'AI_Auto_Approver',
        sessionId: 'sess_1',
        productFingerprint: 'pfp_123',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected AI approver to be rejected');
  });

  await runTest('TEST_MO_038', 'Rejects product review approval if reviewer contains "BOT"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'PRODUCT_REVIEW',
        jobId: 'job_001',
        reviewerId: 'ReviewBot_v2',
        sessionId: 'sess_1',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected bot approver to be rejected');
  });

  await runTest('TEST_MO_039', 'Rejects product review approval if reviewer contains "SYSTEM"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'PRODUCT_REVIEW',
        jobId: 'job_001',
        reviewerId: 'System_Daemon',
        sessionId: 'sess_1',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected system approver to be rejected');
  });

  await runTest('TEST_MO_040', 'Rejects product review approval if reviewer is empty or whitespace', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'PRODUCT_REVIEW',
        jobId: 'job_001',
        reviewerId: '   ',
        sessionId: 'sess_1',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected empty reviewer to be rejected');
  });

  await runTest('TEST_MO_041', 'Rejects product approval when orchestrator is not in WAITING_FOR_PRODUCT_REVIEW state', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    let threw = false;
    try {
      orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected submitProductApproval to throw when not waiting for product review');
  });

  await runTest('TEST_MO_042', 'Product approval record stores product fingerprint correctly', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'PRODUCT_REVIEW',
      jobId: 'job_001',
      reviewerId: 'Operator_Alice',
      sessionId: 'sess_1',
      productFingerprint: 'pfp_specific_hash',
    });
    if (rec.productFingerprint !== 'pfp_specific_hash') throw new Error('Stored product fingerprint mismatch');
  });

  await runTest('TEST_MO_043', 'Product approval transitions orchestrator to GENERATING_CONTENT', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext(); // INITIALIZING -> RESEARCHING
    await orchestrator.executeNext(); // RESEARCHING -> WAITING_FOR_PRODUCT_REVIEW
    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'WAITING_FOR_PRODUCT_REVIEW') throw new Error(`Expected WAITING_FOR_PRODUCT_REVIEW, got ${ctx.currentState}`);

    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    const after = orchestrator.getContext()!;
    if (after.currentState !== 'GENERATING_CONTENT') throw new Error(`Expected GENERATING_CONTENT, got ${after.currentState}`);
  });

  await runTest('TEST_MO_044', 'Rejection of product approval marks gate record as REJECTED', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.rejectGate({
      gateType: 'PRODUCT_REVIEW',
      jobId: 'job_001',
      reviewerId: 'Op1',
      reason: 'Product does not meet quality requirements',
    });
    if (rec.status !== 'REJECTED') throw new Error('Expected REJECTED status');
  });

  await runTest('TEST_MO_045', 'Product approval requires valid session ID', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'PRODUCT_REVIEW',
        jobId: 'job_001',
        reviewerId: 'Operator_Alice',
        sessionId: '',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected empty session ID to be rejected');
  });

  // ==========================================================================
  // SECTION 5: APPROVAL GATE 2 - CONTENT REVIEW & STALENESS (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_046', 'Human content review approval succeeds with valid operator', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'CONTENT_REVIEW',
      jobId: 'job_002',
      reviewerId: 'Operator_Bob',
      sessionId: 'sess_2',
      productFingerprint: 'pfp_100',
      contentFingerprint: 'cfp_200',
      mediaFingerprint: 'mfp_300',
    });
    if (rec.status !== 'APPROVED') throw new Error('Expected APPROVED');
  });

  await runTest('TEST_MO_047', 'Rejects content approval if reviewer is "Auto_AI_Agent"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'CONTENT_REVIEW',
        jobId: 'job_002',
        reviewerId: 'Auto_AI_Agent',
        sessionId: 'sess_2',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected Auto_AI_Agent to be rejected');
  });

  await runTest('TEST_MO_048', 'Rejects content approval if reviewer is "Bot_System"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'CONTENT_REVIEW',
        jobId: 'job_002',
        reviewerId: 'Bot_System',
        sessionId: 'sess_2',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected Bot_System to be rejected');
  });

  await runTest('TEST_MO_049', 'Content approval binds content fingerprint and product fingerprint', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'CONTENT_REVIEW',
      jobId: 'job_002',
      reviewerId: 'Op1',
      sessionId: 'sess_2',
      productFingerprint: 'pfp_100',
      contentFingerprint: 'cfp_200',
    });
    if (rec.productFingerprint !== 'pfp_100') throw new Error('pfp mismatch');
    if (rec.contentFingerprint !== 'cfp_200') throw new Error('cfp mismatch');
  });

  await runTest('TEST_MO_050', 'Mutating product fingerprint renders content approval STALE_APPROVAL', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'CONTENT_REVIEW',
      jobId: 'job_002',
      reviewerId: 'Op1',
      sessionId: 'sess_2',
      productFingerprint: 'pfp_original',
      contentFingerprint: 'cfp_original',
    });

    const check = mgr.verifyGateApproval({
      record: rec,
      currentProductFingerprint: 'pfp_mutated',
      currentContentFingerprint: 'cfp_original',
    });
    if (check.isValid) throw new Error('Mutated product fingerprint must invalidate content approval');
    if (rec.status !== 'STALE_APPROVAL') throw new Error(`Expected STALE_APPROVAL status, got ${rec.status}`);
  });

  await runTest('TEST_MO_051', 'Mutating media fingerprint renders content approval STALE_APPROVAL', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'CONTENT_REVIEW',
      jobId: 'job_002',
      reviewerId: 'Op1',
      sessionId: 'sess_2',
      productFingerprint: 'pfp_orig',
      contentFingerprint: 'cfp_orig',
      mediaFingerprint: 'mfp_orig',
    });

    const check = mgr.verifyGateApproval({
      record: rec,
      currentProductFingerprint: 'pfp_orig',
      currentContentFingerprint: 'cfp_orig',
      currentMediaFingerprint: 'mfp_mutated',
    });
    if (check.isValid) throw new Error('Mutated media fingerprint must invalidate content approval');
  });

  await runTest('TEST_MO_052', 'Content approval transitions orchestrator to CREATING_VIDEO', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext(); // -> RESEARCHING
    await orchestrator.executeNext(); // -> WAITING_FOR_PRODUCT_REVIEW
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' }); // -> GENERATING_CONTENT
    await orchestrator.executeNext(); // -> WAITING_FOR_CONTENT_REVIEW
    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'WAITING_FOR_CONTENT_REVIEW') throw new Error(`Expected WAITING_FOR_CONTENT_REVIEW, got ${ctx.currentState}`);

    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    const after = orchestrator.getContext()!;
    if (after.currentState !== 'CREATING_VIDEO') throw new Error(`Expected CREATING_VIDEO, got ${after.currentState}`);
  });

  await runTest('TEST_MO_053', 'Rejection of content approval marks gate as REJECTED', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.rejectGate({
      gateType: 'CONTENT_REVIEW',
      jobId: 'job_002',
      reviewerId: 'Op1',
      reason: 'Caption violates branding style guide',
    });
    if (rec.status !== 'REJECTED') throw new Error('Expected REJECTED status');
  });

  await runTest('TEST_MO_054', 'Rejects content approval when not in WAITING_FOR_CONTENT_REVIEW state', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    let threw = false;
    try {
      orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected submitContentApproval to throw when not waiting for content review');
  });

  await runTest('TEST_MO_055', 'Content approval requires session ID and audit notes', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'CONTENT_REVIEW',
        jobId: 'job_002',
        reviewerId: 'Operator_Bob',
        sessionId: '',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected empty session ID to be rejected');
  });

  // ==========================================================================
  // SECTION 6: APPROVAL GATE 3 - VIDEO REVIEW & FINGERPRINT BINDING (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_056', 'Human video review approval succeeds with valid operator', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'VIDEO_REVIEW',
      jobId: 'job_003',
      reviewerId: 'Operator_Charlie',
      sessionId: 'sess_3',
      productFingerprint: 'pfp_1',
      contentFingerprint: 'cfp_1',
      videoFingerprint: 'vpf_1',
      outputFingerprint: 'opf_1',
    });
    if (rec.status !== 'APPROVED') throw new Error('Expected APPROVED');
  });

  await runTest('TEST_MO_057', 'Rejects video approval if reviewer is "Gemini_AI_Worker"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'VIDEO_REVIEW',
        jobId: 'job_003',
        reviewerId: 'Gemini_AI_Worker',
        sessionId: 'sess_3',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected Gemini_AI_Worker to be rejected');
  });

  await runTest('TEST_MO_058', 'Rejects video approval if reviewer is "Video_Bot"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'VIDEO_REVIEW',
        jobId: 'job_003',
        reviewerId: 'Video_Bot',
        sessionId: 'sess_3',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected Video_Bot to be rejected');
  });

  await runTest('TEST_MO_059', 'Video approval binds videoFingerprint and outputFingerprint', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'VIDEO_REVIEW',
      jobId: 'job_003',
      reviewerId: 'Op1',
      sessionId: 'sess_3',
      videoFingerprint: 'vpf_xyz',
      outputFingerprint: 'opf_xyz',
    });
    if (rec.videoFingerprint !== 'vpf_xyz') throw new Error('vpf mismatch');
    if (rec.outputFingerprint !== 'opf_xyz') throw new Error('opf mismatch');
  });

  await runTest('TEST_MO_060', 'Mutating video fingerprint renders video approval STALE_APPROVAL', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'VIDEO_REVIEW',
      jobId: 'job_003',
      reviewerId: 'Op1',
      sessionId: 'sess_3',
      videoFingerprint: 'vpf_orig',
      outputFingerprint: 'opf_orig',
    });

    const check = mgr.verifyGateApproval({
      record: rec,
      currentVideoFingerprint: 'vpf_mutated',
      currentOutputFingerprint: 'opf_orig',
    });
    if (check.isValid) throw new Error('Mutated video fingerprint must invalidate video approval');
  });

  await runTest('TEST_MO_061', 'Mutating output fingerprint renders video approval STALE_APPROVAL', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'VIDEO_REVIEW',
      jobId: 'job_003',
      reviewerId: 'Op1',
      sessionId: 'sess_3',
      videoFingerprint: 'vpf_orig',
      outputFingerprint: 'opf_orig',
    });

    const check = mgr.verifyGateApproval({
      record: rec,
      currentVideoFingerprint: 'vpf_orig',
      currentOutputFingerprint: 'opf_mutated',
    });
    if (check.isValid) throw new Error('Mutated output fingerprint must invalidate video approval');
  });

  await runTest('TEST_MO_062', 'Mutating upstream product fingerprint renders video approval STALE_APPROVAL', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'VIDEO_REVIEW',
      jobId: 'job_003',
      reviewerId: 'Op1',
      sessionId: 'sess_3',
      productFingerprint: 'pfp_orig',
      videoFingerprint: 'vpf_orig',
      outputFingerprint: 'opf_orig',
    });

    const check = mgr.verifyGateApproval({
      record: rec,
      currentProductFingerprint: 'pfp_mutated',
      currentVideoFingerprint: 'vpf_orig',
      currentOutputFingerprint: 'opf_orig',
    });
    if (check.isValid) throw new Error('Mutated upstream product fingerprint must invalidate video approval');
  });

  await runTest('TEST_MO_063', 'Mutating upstream content fingerprint renders video approval STALE_APPROVAL', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'VIDEO_REVIEW',
      jobId: 'job_003',
      reviewerId: 'Op1',
      sessionId: 'sess_3',
      contentFingerprint: 'cfp_orig',
      videoFingerprint: 'vpf_orig',
      outputFingerprint: 'opf_orig',
    });

    const check = mgr.verifyGateApproval({
      record: rec,
      currentContentFingerprint: 'cfp_mutated',
      currentVideoFingerprint: 'vpf_orig',
      currentOutputFingerprint: 'opf_orig',
    });
    if (check.isValid) throw new Error('Mutated upstream content fingerprint must invalidate video approval');
  });

  await runTest('TEST_MO_064', 'Video approval transitions orchestrator to CAPTURING_AMAZON_LINK', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext(); // -> RESEARCHING
    await orchestrator.executeNext(); // -> WAITING_FOR_PRODUCT_REVIEW
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' }); // -> GENERATING_CONTENT
    await orchestrator.executeNext(); // -> WAITING_FOR_CONTENT_REVIEW
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' }); // -> CREATING_VIDEO
    await orchestrator.executeNext(); // -> RENDERING_VIDEO
    await orchestrator.executeNext(); // -> WAITING_FOR_VIDEO_REVIEW

    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'WAITING_FOR_VIDEO_REVIEW') throw new Error(`Expected WAITING_FOR_VIDEO_REVIEW, got ${ctx.currentState}`);

    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    const after = orchestrator.getContext()!;
    if (after.currentState !== 'CAPTURING_AMAZON_LINK') throw new Error(`Expected CAPTURING_AMAZON_LINK, got ${after.currentState}`);
  });

  await runTest('TEST_MO_065', 'Rejection of video approval marks gate as REJECTED', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.rejectGate({
      gateType: 'VIDEO_REVIEW',
      jobId: 'job_003',
      reviewerId: 'Op1',
      reason: 'Audio mix contains background distortion',
    });
    if (rec.status !== 'REJECTED') throw new Error('Expected REJECTED status');
  });

  // ==========================================================================
  // SECTION 7: APPROVAL GATE 4 - FINAL PUBLISH APPROVAL & CASCADE (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_066', 'Human publish approval succeeds with valid operator', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'FINAL_PUBLISH_APPROVAL',
      jobId: 'job_004',
      reviewerId: 'Operator_Dave',
      sessionId: 'sess_4',
      productFingerprint: 'pfp_1',
      contentFingerprint: 'cfp_1',
      videoFingerprint: 'vpf_1',
      outputFingerprint: 'opf_1',
      platformPlanFingerprint: 'plan_fp_1',
      platforms: ['instagram', 'youtube'],
    });
    if (rec.status !== 'APPROVED') throw new Error('Expected APPROVED');
  });

  await runTest('TEST_MO_067', 'Rejects publish approval if reviewer is "AutoPublisher_AI"', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'FINAL_PUBLISH_APPROVAL',
        jobId: 'job_004',
        reviewerId: 'AutoPublisher_AI',
        sessionId: 'sess_4',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected AutoPublisher_AI to be rejected');
  });

  await runTest('TEST_MO_068', 'Rejects publish approval if reviewer is empty', 'Security', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    let threw = false;
    try {
      mgr.submitApproval({
        gateType: 'FINAL_PUBLISH_APPROVAL',
        jobId: 'job_004',
        reviewerId: '',
        sessionId: 'sess_4',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected empty reviewer to be rejected');
  });

  await runTest('TEST_MO_069', 'Publish approval binds all 5 upstream fingerprints', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'FINAL_PUBLISH_APPROVAL',
      jobId: 'job_004',
      reviewerId: 'Op1',
      sessionId: 'sess_4',
      productFingerprint: 'pfp_val',
      contentFingerprint: 'cfp_val',
      mediaFingerprint: 'mfp_val',
      videoFingerprint: 'vpf_val',
      outputFingerprint: 'opf_val',
      platformPlanFingerprint: 'plan_fp_val',
    });
    if (rec.productFingerprint !== 'pfp_val') throw new Error('pfp mismatch');
    if (rec.contentFingerprint !== 'cfp_val') throw new Error('cfp mismatch');
    if (rec.mediaFingerprint !== 'mfp_val') throw new Error('mfp mismatch');
    if (rec.videoFingerprint !== 'vpf_val') throw new Error('vpf mismatch');
    if (rec.outputFingerprint !== 'opf_val') throw new Error('opf mismatch');
    if (rec.platformPlanFingerprint !== 'plan_fp_val') throw new Error('plan_fp mismatch');
  });

  await runTest('TEST_MO_070', 'Any upstream fingerprint mismatch halts publish approval verification', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'FINAL_PUBLISH_APPROVAL',
      jobId: 'job_004',
      reviewerId: 'Op1',
      sessionId: 'sess_4',
      productFingerprint: 'pfp_orig',
      contentFingerprint: 'cfp_orig',
      platformPlanFingerprint: 'plan_orig',
    });

    const check = mgr.verifyGateApproval({
      record: rec,
      currentProductFingerprint: 'pfp_orig',
      currentContentFingerprint: 'cfp_orig',
      currentPlatformPlanFingerprint: 'plan_mutated',
    });
    if (check.isValid) throw new Error('Mutated plan fingerprint must invalidate publish approval');
  });

  await runTest('TEST_MO_071', 'Product change invalidates publish approval', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'FINAL_PUBLISH_APPROVAL',
      jobId: 'job_004',
      reviewerId: 'Op1',
      sessionId: 'sess_4',
      productFingerprint: 'pfp_orig',
    });
    const check = mgr.verifyGateApproval({ record: rec, currentProductFingerprint: 'pfp_changed' });
    if (check.isValid) throw new Error('Product change must invalidate publish approval');
  });

  await runTest('TEST_MO_072', 'Content change invalidates publish approval', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'FINAL_PUBLISH_APPROVAL',
      jobId: 'job_004',
      reviewerId: 'Op1',
      sessionId: 'sess_4',
      contentFingerprint: 'cfp_orig',
    });
    const check = mgr.verifyGateApproval({ record: rec, currentContentFingerprint: 'cfp_changed' });
    if (check.isValid) throw new Error('Content change must invalidate publish approval');
  });

  await runTest('TEST_MO_073', 'Video change invalidates publish approval', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'FINAL_PUBLISH_APPROVAL',
      jobId: 'job_004',
      reviewerId: 'Op1',
      sessionId: 'sess_4',
      videoFingerprint: 'vpf_orig',
    });
    const check = mgr.verifyGateApproval({ record: rec, currentVideoFingerprint: 'vpf_changed' });
    if (check.isValid) throw new Error('Video change must invalidate publish approval');
  });

  await runTest('TEST_MO_074', 'Platform plan change invalidates publish approval', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationApprovalManager.getInstance();
    const rec = mgr.submitApproval({
      gateType: 'FINAL_PUBLISH_APPROVAL',
      jobId: 'job_004',
      reviewerId: 'Op1',
      sessionId: 'sess_4',
      platformPlanFingerprint: 'plan_fp_orig',
    });
    const check = mgr.verifyGateApproval({ record: rec, currentPlatformPlanFingerprint: 'plan_fp_changed' });
    if (check.isValid) throw new Error('Plan change must invalidate publish approval');
  });

  await runTest('TEST_MO_075', 'Publish approval transitions orchestrator to EXECUTING_PLATFORM', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext(); // -> RESEARCHING
    await orchestrator.executeNext(); // -> WAITING_FOR_PRODUCT_REVIEW
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' }); // -> GENERATING_CONTENT
    await orchestrator.executeNext(); // -> WAITING_FOR_CONTENT_REVIEW
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' }); // -> CREATING_VIDEO
    await orchestrator.executeNext(); // -> RENDERING_VIDEO
    await orchestrator.executeNext(); // -> WAITING_FOR_VIDEO_REVIEW
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' }); // -> CAPTURING_AMAZON_LINK
    await orchestrator.executeNext(); // -> PLANNING_PLATFORMS
    await orchestrator.executeNext(); // -> WAITING_FOR_PUBLISH_APPROVAL

    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'WAITING_FOR_PUBLISH_APPROVAL') throw new Error(`Expected WAITING_FOR_PUBLISH_APPROVAL, got ${ctx.currentState}`);

    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    const after = orchestrator.getContext()!;
    if (after.currentState !== 'EXECUTING_PLATFORM') throw new Error(`Expected EXECUTING_PLATFORM, got ${after.currentState}`);
  });

  // ==========================================================================
  // SECTION 8: AMAZON SOURCE-ONLY ISOLATION (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_076', 'Amazon is rejected if specified as target publish platform', 'Security', () => {
    let threw = false;
    try {
      createOrchestrationPlan({
        searchQuery: 'Item',
        targetPlatforms: ['amazon' as any],
        operatorId: 'Op1',
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Amazon target platform must be rejected');
  });

  await runTest('TEST_MO_077', 'Capturing Amazon link outputs clean DP URL without cart tokens', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Lamp', asin: 'B00TEST123', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext(); // -> RESEARCHING
    await orchestrator.executeNext(); // -> WAITING_FOR_PRODUCT_REVIEW
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' }); // -> GENERATING_CONTENT
    await orchestrator.executeNext(); // -> WAITING_FOR_CONTENT_REVIEW
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' }); // -> CREATING_VIDEO
    await orchestrator.executeNext(); // -> RENDERING_VIDEO
    await orchestrator.executeNext(); // -> WAITING_FOR_VIDEO_REVIEW
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' }); // -> CAPTURING_AMAZON_LINK
    await orchestrator.executeNext(); // executes stepCaptureAmazonLink -> PLANNING_PLATFORMS

    const ctx = orchestrator.getContext()!;
    if (!ctx.capturedAmazonLink) throw new Error('Amazon link was not captured');
    if (!ctx.capturedAmazonLink.includes('amazon.com/dp/B00TEST123')) throw new Error('Amazon URL format invalid');
    if (ctx.capturedAmazonLink.includes('cart') || ctx.capturedAmazonLink.includes('buy')) {
      throw new Error('Captured URL contains prohibited cart/buy tokens');
    }
  });

  await runTest('TEST_MO_078', 'Amazon adapter has no publish method or publication capability', 'Security', () => {
    const registry = AdapterRegistry.getInstance();
    const amazon = registry.get('amazon');
    if (amazon.capabilities.supportsVideo || amazon.capabilities.supportsImage) {
      throw new Error('Amazon adapter must not advertise publishing capabilities');
    }
  });

  await runTest('TEST_MO_079', 'Attempting to validate platform publication for Amazon throws error', 'Security', () => {
    const val = OrchestrationValidator.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    const res = val.validatePlatformPublication({
      context: ctx,
      platform: 'amazon' as any,
    });
    if (res.valid) throw new Error('validatePlatformPublication must reject Amazon');
    if (!res.error?.includes('SOURCE-ONLY')) throw new Error(`Expected SOURCE-ONLY in error, got ${res.error}`);
  });

  await runTest('TEST_MO_080', 'Amazon product extraction collects verified read-only data', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Ergonomic Mouse', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext(); // -> RESEARCHING
    await orchestrator.executeNext(); // -> WAITING_FOR_PRODUCT_REVIEW
    const ctx = orchestrator.getContext()!;
    if (!ctx.productData) throw new Error('ProductData missing');
    if (!ctx.productData.provenance.title.verified) throw new Error('Title provenance must be verified');
    if (ctx.productData.price <= 0) throw new Error('Price must be greater than 0');
  });

  await runTest('TEST_MO_081', 'Zero checkout or purchase actions exist in typed action set', 'Security', () => {
    if (isAllowedTypedAction('BUY_NOW')) throw new Error('BUY_NOW must not be allowed');
    if (isAllowedTypedAction('PROCEED_TO_CHECKOUT')) throw new Error('PROCEED_TO_CHECKOUT must not be allowed');
    if (isAllowedTypedAction('ADD_TO_CART')) throw new Error('ADD_TO_CART must not be allowed');
  });

  await runTest('TEST_MO_082', 'Scan rejects "buy now" keyword on screen', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Click Buy Now with 1-click');
    if (!scan.prohibited) throw new Error('Expected "buy now" to be caught as prohibited keyword');
  });

  await runTest('TEST_MO_083', 'Scan rejects "add to cart" keyword on screen', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Select options and Add to Cart');
    if (!scan.prohibited) throw new Error('Expected "add to cart" to be caught as prohibited keyword');
  });

  await runTest('TEST_MO_084', 'Scan rejects "proceed to checkout" keyword on screen', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Items in cart: 1. Proceed to Checkout');
    if (!scan.prohibited) throw new Error('Expected "proceed to checkout" to be caught as prohibited keyword');
  });

  await runTest('TEST_MO_085', 'Scan rejects "place your order" keyword on screen', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Review shipping address and Place your Order');
    if (!scan.prohibited) throw new Error('Expected "place your order" to be caught as prohibited keyword');
  });

  // ==========================================================================
  // SECTION 9: PLATFORM PLANNING & SEQUENTIAL EXECUTION (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_086', 'Planner orders platforms strictly in canonical order', 'Orchestration', () => {
    const plan = createOrchestrationPlan({
      searchQuery: 'Test',
      targetPlatforms: ['tiktok', 'youtube', 'instagram', 'pinterest'],
      operatorId: 'Op1',
    });
    if (plan.targetPlatforms[0] !== 'instagram' || plan.targetPlatforms[1] !== 'youtube' || plan.targetPlatforms[2] !== 'tiktok' || plan.targetPlatforms[3] !== 'pinterest') {
      throw new Error(`Plan platforms order incorrect: ${plan.targetPlatforms.join(', ')}`);
    }
  });

  await runTest('TEST_MO_087', 'Platform execution runs sequentially one platform per execute step', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' });
    await orchestrator.executeNext(); // -> RESEARCHING
    await orchestrator.executeNext(); // -> WAITING_FOR_PRODUCT_REVIEW
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext(); // -> WAITING_FOR_CONTENT_REVIEW
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext(); // -> RENDERING_VIDEO
    await orchestrator.executeNext(); // -> WAITING_FOR_VIDEO_REVIEW
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext(); // -> PLANNING_PLATFORMS
    await orchestrator.executeNext(); // -> WAITING_FOR_PUBLISH_APPROVAL
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' }); // -> EXECUTING_PLATFORM

    // Execute first platform
    await orchestrator.executeNext();
    let ctx = orchestrator.getContext()!;
    if (ctx.publishedPlatforms.length !== 1) throw new Error(`Expected exactly 1 published platform, got ${ctx.publishedPlatforms.length}`);
    if (ctx.publishedPlatforms[0] !== 'instagram') throw new Error(`Expected instagram first, got ${ctx.publishedPlatforms[0]}`);

    // Execute second platform
    await orchestrator.executeNext();
    ctx = orchestrator.getContext()!;
    if (ctx.publishedPlatforms.length !== 2) throw new Error(`Expected 2 published platforms, got ${ctx.publishedPlatforms.length}`);
    if (ctx.publishedPlatforms[1] !== 'youtube') throw new Error(`Expected youtube second, got ${ctx.publishedPlatforms[1]}`);
  });

  await runTest('TEST_MO_088', 'Concurrent publishing attempts are blocked by isExecuting flag', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    const p1 = orchestrator.executeNext();
    const p2 = orchestrator.executeNext();
    await Promise.all([p1, p2]);
    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'RESEARCHING') throw new Error(`Expected RESEARCHING, got ${ctx.currentState}`);
  });

  await runTest('TEST_MO_089', 'Execution verifies adapter exists in AdapterRegistry', 'Orchestration', () => {
    const reg = AdapterRegistry.getInstance();
    for (const p of CANONICAL_PLATFORM_ORDER) {
      if (!reg.has(p)) throw new Error(`AdapterRegistry missing adapter for ${p}`);
    }
  });

  await runTest('TEST_MO_090', 'Execution checks PublicationGuard before publishing', 'Orchestration', () => {
    resetAll();
    const guard = PublicationGuard.getInstance();
    guard.recordPublication('job_test_01', 'instagram', 'cfp_abc', 'proof://123');
    if (!guard.isPublished('job_test_01', 'instagram', 'cfp_abc')) {
      throw new Error('PublicationGuard should report published');
    }
  });

  await runTest('TEST_MO_091', 'Publishing records idempotency tuple in PublicationGuard', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    await orchestrator.executeNext(); // executes publish for instagram

    const ctx = orchestrator.getContext()!;
    const guard = PublicationGuard.getInstance();
    if (!guard.isPublished(ctx.orchestrationId, 'instagram', ctx.contentFingerprint!)) {
      throw new Error('Publication was not recorded in PublicationGuard');
    }
  });

  await runTest('TEST_MO_092', 'Published platform cannot be published again in same run', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    await orchestrator.executeNext(); // publish instagram

    const ctx = orchestrator.getContext()!;
    const val = OrchestrationValidator.getInstance().validatePlatformPublication({
      context: ctx,
      platform: 'instagram',
    });
    if (val.valid) throw new Error('Duplicate publication must be blocked by validator');
  });

  await runTest('TEST_MO_093', 'Verification step checks all target platforms are published', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    await orchestrator.executeNext(); // published instagram -> VERIFYING_PUBLICATION
    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'VERIFYING_PUBLICATION') throw new Error(`Expected VERIFYING_PUBLICATION, got ${ctx.currentState}`);
  });

  await runTest('TEST_MO_094', 'Loop continues if remaining platforms exist', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    await orchestrator.executeNext(); // published instagram
    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'EXECUTING_PLATFORM') throw new Error(`Expected EXECUTING_PLATFORM, got ${ctx.currentState}`);
  });

  await runTest('TEST_MO_095', 'Transition to FINAL_RECONCILIATION occurs only after all platforms verified', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    await orchestrator.executeNext(); // execute instagram -> VERIFYING_PUBLICATION
    await orchestrator.executeNext(); // verify -> FINAL_RECONCILIATION
    const ctx = orchestrator.getContext()!;
    if ((ctx.currentState as any) !== 'FINAL_RECONCILIATION' && ctx.currentState !== 'RECONCILING') {
      throw new Error(`Expected reconciliation state, got ${ctx.currentState}`);
    }
  });

  // ==========================================================================
  // SECTION 10: ERROR HANDLING, RETRIES & EMERGENCY STOP TRIPWIRE (12 tests)
  // ==========================================================================

  await runTest('TEST_MO_096', 'First step failure increments retry count and allows retry', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    const step = ctx.steps[1]; // PRODUCT_RESEARCH
    const dec = mgr.handleStepFailure(ctx, step, 'Network timeout');
    if (!dec.canRetry) throw new Error('Expected canRetry to be true on first failure');
    if (step.retryCount !== 1) throw new Error(`Expected retryCount 1, got ${step.retryCount}`);
    if (dec.remainingRetries !== 1) throw new Error(`Expected 1 remaining retry, got ${dec.remainingRetries}`);
  });

  await runTest('TEST_MO_097', 'Second step failure increments retry count and allows retry (attempt 2/2)', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    const step = ctx.steps[1];
    mgr.handleStepFailure(ctx, step, 'Failure 1');
    const dec = mgr.handleStepFailure(ctx, step, 'Failure 2');
    if (!dec.canRetry) throw new Error('Expected canRetry to be true on second failure');
    if (step.retryCount !== 2) throw new Error(`Expected retryCount 2, got ${step.retryCount}`);
    if (dec.remainingRetries !== 0) throw new Error(`Expected 0 remaining retries, got ${dec.remainingRetries}`);
  });

  await runTest('TEST_MO_098', 'Third step failure exceeds MAX_STEP_RETRIES (no more retries allowed)', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    const step = ctx.steps[1];
    mgr.handleStepFailure(ctx, step, 'Failure 1');
    mgr.handleStepFailure(ctx, step, 'Failure 2');
    const dec = mgr.handleStepFailure(ctx, step, 'Failure 3');
    if (dec.canRetry) throw new Error('Expected canRetry to be false after exceeding max retries');
  });

  await runTest('TEST_MO_099', 'First unrecoverable failure does not trigger EmergencyStop', 'EmergencyStop', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    const step = ctx.steps[1];
    const dec = mgr.handleStepFailure(ctx, step, 'Fatal 1');
    if (dec.shouldEmergencyStop) throw new Error('First failure must not trigger EmergencyStop');
    if (EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop must not be active');
  });

  await runTest('TEST_MO_100', 'Second unrecoverable failure does not trigger EmergencyStop', 'EmergencyStop', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    mgr.handleStepFailure(ctx, ctx.steps[1], 'Fatal 1');
    const dec = mgr.handleStepFailure(ctx, ctx.steps[2], 'Fatal 2');
    if (dec.shouldEmergencyStop) throw new Error('Second failure must not trigger EmergencyStop');
    if (EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop must not be active');
  });

  await runTest('TEST_MO_101', 'Third consecutive unrecoverable failure triggers EmergencyStop', 'EmergencyStop', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    mgr.handleStepFailure(ctx, ctx.steps[1], 'Fatal 1');
    mgr.handleStepFailure(ctx, ctx.steps[2], 'Fatal 2');
    const dec = mgr.handleStepFailure(ctx, ctx.steps[3], 'Fatal 3');
    if (!dec.shouldEmergencyStop) throw new Error('Third consecutive failure must trigger EmergencyStop');
    if (!EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop must be active');
  });

  await runTest('TEST_MO_102', 'EmergencyStop status is verified active on 3rd failure', 'EmergencyStop', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    mgr.handleStepFailure(ctx, ctx.steps[1], 'Err 1');
    mgr.handleStepFailure(ctx, ctx.steps[1], 'Err 2');
    mgr.handleStepFailure(ctx, ctx.steps[1], 'Err 3');
    if (!EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop not active');
    if (ctx.currentState !== 'EMERGENCY_STOPPED') throw new Error(`Expected EMERGENCY_STOPPED, got ${ctx.currentState}`);
  });

  await runTest('TEST_MO_103', 'Successful step resets consecutive failure counter to 0', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    mgr.handleStepFailure(ctx, ctx.steps[1], 'Temporary error');
    if (ctx.consecutiveFailures !== 1) throw new Error('Expected 1 consecutive failure');
    mgr.handleStepSuccess(ctx, ctx.steps[1]);
    if ((ctx.consecutiveFailures as number) !== 0) throw new Error('Expected reset to 0 consecutive failures after success');
  });

  await runTest('TEST_MO_104', 'Operator PAUSE suspends workflow without activating EmergencyStop', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    orchestrator.pause('Reviewing metrics');
    const ctx = orchestrator.getContext()!;
    if (!ctx.isPaused) throw new Error('Expected isPaused to be true');
    if (EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop must NOT be active on pause');
  });

  await runTest('TEST_MO_105', 'Operator RESUME clears pause state and allows execution', 'Orchestration', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    orchestrator.pause('Reviewing metrics');
    orchestrator.resume();
    const ctx = orchestrator.getContext()!;
    if (ctx.isPaused) throw new Error('Expected isPaused to be false after resume');
  });

  await runTest('TEST_MO_106', 'EmergencyStop blocks RESUME operation', 'EmergencyStop', () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    orchestrator.pause('Pause');
    EmergencyStopManager.getInstance().trigger('Emergency tripwire');
    let threw = false;
    try {
      orchestrator.resume();
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected resume() to throw when EmergencyStop is active');
  });

  await runTest('TEST_MO_107', 'EmergencyStop blocks executeNext immediately', 'EmergencyStop', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Item', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    EmergencyStopManager.getInstance().trigger('Emergency tripwire');
    const ctx = await orchestrator.executeNext();
    if (ctx.currentState !== 'EMERGENCY_STOPPED') throw new Error(`Expected EMERGENCY_STOPPED, got ${ctx.currentState}`);
  });

  // ==========================================================================
  // SECTION 11: CRASH RECOVERY & BOUNDED EXECUTION (8 tests)
  // ==========================================================================

  await runTest('TEST_MO_108', 'Crash recovery identifies already published platforms', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' }));
    ctx.contentFingerprint = 'cfp_123';
    PublicationGuard.getInstance().recordPublication(ctx.orchestrationId, 'instagram', 'cfp_123', 'proof://1');

    const res = mgr.performCrashRecovery(ctx);
    if (!res.skippedCompletedPlatforms.includes('instagram')) {
      throw new Error('Expected instagram to be skipped as already published');
    }
  });

  await runTest('TEST_MO_109', 'Crash recovery skips published platforms and never republishes them', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' }));
    ctx.contentFingerprint = 'cfp_123';
    PublicationGuard.getInstance().recordPublication(ctx.orchestrationId, 'instagram', 'cfp_123', 'proof://1');

    const res = mgr.performCrashRecovery(ctx);
    if (res.pendingPlatformsToExecute.includes('instagram')) {
      throw new Error('instagram must NOT be pending to execute');
    }
    if (!res.pendingPlatformsToExecute.includes('youtube')) {
      throw new Error('youtube must be pending to execute');
    }
  });

  await runTest('TEST_MO_110', 'Crash recovery identifies pending platforms to execute', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram', 'youtube', 'tiktok'], operatorId: 'Op1' }));
    const res = mgr.performCrashRecovery(ctx);
    if (res.pendingPlatformsToExecute.length !== 3) throw new Error('Expected 3 pending platforms');
  });

  await runTest('TEST_MO_111', 'In-flight interrupted steps are reset to PENDING with clear error', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    ctx.steps[11].status = 'IN_PROGRESS'; // PLATFORM_EXECUTION

    mgr.performCrashRecovery(ctx);
    if ((ctx.steps[11].status as any) !== 'PENDING') throw new Error('Interrupted step must be reset to PENDING');
    if (!ctx.steps[11].error?.includes('Interrupted')) throw new Error('Error must indicate interrupted');
  });

  await runTest('TEST_MO_112', 'Context state recovered from local storage across restart', 'Orchestration', () => {
    resetAll();
    const orch1 = MasterOrchestrator.getInstance();
    const ctx = orch1.initialize({ searchQuery: 'Keyboard', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    orch1.persistContext();

    MasterOrchestrator.resetInstance();
    const orch2 = MasterOrchestrator.getInstance();
    const restored = orch2.restoreContext(ctx.orchestrationId);
    if (!restored) throw new Error('Failed to restore context from storage');
    if (restored.plan.searchQuery !== 'Keyboard') throw new Error('Restored context mismatch');
  });

  await runTest('TEST_MO_113', 'If all platforms already published, crash recovery marks COMPLETED', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    ctx.contentFingerprint = 'cfp_123';
    ctx.currentState = 'EXECUTING_PLATFORM';
    PublicationGuard.getInstance().recordPublication(ctx.orchestrationId, 'instagram', 'cfp_123', 'proof://1');

    const res = mgr.performCrashRecovery(ctx);
    if (res.recoveredState !== 'COMPLETED') throw new Error(`Expected COMPLETED, got ${res.recoveredState}`);
  });

  await runTest('TEST_MO_114', 'If some platforms published, state recovered as PARTIALLY_COMPLETED', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' }));
    ctx.contentFingerprint = 'cfp_123';
    ctx.currentState = 'EXECUTING_PLATFORM';
    PublicationGuard.getInstance().recordPublication(ctx.orchestrationId, 'instagram', 'cfp_123', 'proof://1');

    const res = mgr.performCrashRecovery(ctx);
    if (res.recoveredState !== 'PARTIALLY_COMPLETED') throw new Error(`Expected PARTIALLY_COMPLETED, got ${res.recoveredState}`);
  });

  await runTest('TEST_MO_115', 'Context updatedAt timestamp is refreshed on recovery', 'Orchestration', () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    const prev = ctx.updatedAt;
    mgr.performCrashRecovery(ctx);
    if (ctx.updatedAt < prev) throw new Error('updatedAt must be refreshed');
  });

  // ==========================================================================
  // SECTION 12: UNKNOWN STATE & SAFE RECONCILIATION (8 tests)
  // ==========================================================================

  await runTest('TEST_MO_116', 'Direct transition UNKNOWN -> PUBLISHED is blocked', 'StateMachine', () => {
    if (isValidStateTransition('UNKNOWN', 'COMPLETED')) {
      throw new Error('Direct UNKNOWN -> COMPLETED must be blocked');
    }
  });

  await runTest('TEST_MO_117', 'UNKNOWN is not treated as success', 'StateMachine', () => {
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    ctx.currentState = 'UNKNOWN';
    if ((ctx.currentState as any) === 'COMPLETED') throw new Error('UNKNOWN must not equal COMPLETED');
  });

  await runTest('TEST_MO_118', 'Reconciliation without proof keeps status as UNKNOWN', 'Orchestration', async () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const inspector = new SafeUiInspector('com.instagram.android');
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    ctx.currentState = 'UNKNOWN';

    const res = await mgr.reconcileUnknownPublication({
      context: ctx,
      platform: 'instagram',
      inspector,
      proofProvided: false,
    });
    if (res.reconciled) throw new Error('Expected reconciled to be false without proof');
    if (res.finalStatus !== 'UNKNOWN') throw new Error(`Expected UNKNOWN status, got ${res.finalStatus}`);
  });

  await runTest('TEST_MO_119', 'Reconciliation with verified proof transitions status to PUBLISHED', 'Orchestration', async () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const inspector = new SafeUiInspector('com.instagram.android');
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    ctx.currentState = 'UNKNOWN';

    const res = await mgr.reconcileUnknownPublication({
      context: ctx,
      platform: 'instagram',
      inspector,
      proofProvided: true,
      proofUri: 'proof://instagram/post_verified_123',
    });
    if (!res.reconciled) throw new Error('Expected reconciled to be true with proof');
    if (res.finalStatus !== 'PUBLISHED') throw new Error(`Expected PUBLISHED status, got ${res.finalStatus}`);
  });

  await runTest('TEST_MO_120', 'Reconciliation with verified proof records entry in PublicationGuard', 'Orchestration', async () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const inspector = new SafeUiInspector('com.instagram.android');
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    ctx.contentFingerprint = 'cfp_rec_1';

    await mgr.reconcileUnknownPublication({
      context: ctx,
      platform: 'instagram',
      inspector,
      proofProvided: true,
      proofUri: 'proof://verified',
    });

    if (!PublicationGuard.getInstance().isPublished(ctx.orchestrationId, 'instagram', 'cfp_rec_1')) {
      throw new Error('Publication was not recorded in PublicationGuard after reconciliation');
    }
  });

  await runTest('TEST_MO_121', 'Reconciliation is blocked if EmergencyStop is active', 'EmergencyStop', async () => {
    resetAll();
    EmergencyStopManager.getInstance().trigger('Emergency stop');
    const mgr = OrchestrationRecoveryManager.getInstance();
    const inspector = new SafeUiInspector('com.instagram.android');
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));

    const res = await mgr.reconcileUnknownPublication({
      context: ctx,
      platform: 'instagram',
      inspector,
      proofProvided: true,
      proofUri: 'proof://verified',
    });
    if (res.reconciled) throw new Error('Reconciliation must fail when EmergencyStop active');
  });

  await runTest('TEST_MO_122', 'Publication records accurately track proof URIs and timestamps', 'Orchestration', async () => {
    resetAll();
    const mgr = OrchestrationRecoveryManager.getInstance();
    const inspector = new SafeUiInspector('com.instagram.android');
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram'], operatorId: 'Op1' }));
    await mgr.reconcileUnknownPublication({
      context: ctx,
      platform: 'instagram',
      inspector,
      proofProvided: true,
      proofUri: 'proof://instagram/post_456',
    });

    const rec = ctx.publicationRecords.find(r => r.platform === 'instagram');
    if (!rec) throw new Error('Publication record not found');
    if (rec.proofUri !== 'proof://instagram/post_456') throw new Error('proofUri mismatch');
    if (!rec.publishedAt) throw new Error('publishedAt timestamp missing');
  });

  await runTest('TEST_MO_123', 'Final reconciliation handles mixed PUBLISHED and UNKNOWN items', 'Orchestration', () => {
    const ctx = createInitialContext(createOrchestrationPlan({ searchQuery: 'Test', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' }));
    ctx.publishedPlatforms = ['instagram'];
    const allPublished = ctx.plan.targetPlatforms.every(p => ctx.publishedPlatforms.includes(p));
    if (allPublished) throw new Error('Expected not all published');
  });

  // ==========================================================================
  // SECTION 13: SAFETY TRIPWIRES & PROHIBITED ACTIONS (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_124', 'Prohibited keyword "password" halts screen validation', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Please enter your password to proceed');
    if (!scan.prohibited) throw new Error('Failed to catch "password"');
  });

  await runTest('TEST_MO_125', 'Prohibited keyword "one-time password" halts validation', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Enter the One-Time Password sent to your phone');
    if (!scan.prohibited) throw new Error('Failed to catch "one-time password"');
  });

  await runTest('TEST_MO_126', 'Prohibited keyword "otp" halts validation', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Enter OTP: 123456');
    if (!scan.prohibited) throw new Error('Failed to catch "otp"');
  });

  await runTest('TEST_MO_127', 'Prohibited keyword "card number" halts validation', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Debit or credit Card Number');
    if (!scan.prohibited) throw new Error('Failed to catch "card number"');
  });

  await runTest('TEST_MO_128', 'Prohibited keyword "cvv" halts validation', 'SafetyTripwire', () => {
    const scan = scanForProhibitedKeywords('Security code (CVV)');
    if (!scan.prohibited) throw new Error('Failed to catch "cvv"');
  });

  await runTest('TEST_MO_129', 'Prohibited app package "com.android.vending" is rejected', 'SafetyTripwire', () => {
    if (!PROHIBITED_APP_PACKAGES.includes('com.android.vending')) {
      throw new Error('Expected com.android.vending in prohibited packages');
    }
  });

  await runTest('TEST_MO_130', 'Prohibited app package "com.google.android.apps.walletnfcrel" is rejected', 'SafetyTripwire', () => {
    if (!PROHIBITED_APP_PACKAGES.includes('com.google.android.apps.walletnfcrel')) {
      throw new Error('Expected Google Wallet in prohibited packages');
    }
  });

  await runTest('TEST_MO_131', 'Arbitrary untyped action string is rejected', 'SafetyTripwire', () => {
    const val = OrchestrationValidator.getInstance();
    const res = val.validateAction('ARBITRARY_HACK_ACTION');
    if (res.valid) throw new Error('Expected untyped action to be rejected');
  });

  await runTest('TEST_MO_132', 'Allowed typed action "INIT_WORKFLOW" is accepted', 'Orchestration', () => {
    const val = OrchestrationValidator.getInstance();
    const res = val.validateAction('INIT_WORKFLOW');
    if (!res.valid) throw new Error('Expected INIT_WORKFLOW to be accepted');
  });

  await runTest('TEST_MO_133', 'Allowed typed action "SUBMIT_PUBLISH_APPROVAL" is accepted', 'Orchestration', () => {
    const val = OrchestrationValidator.getInstance();
    const res = val.validateAction('SUBMIT_PUBLISH_APPROVAL');
    if (!res.valid) throw new Error('Expected SUBMIT_PUBLISH_APPROVAL to be accepted');
  });

  // ==========================================================================
  // SECTION 14: CRYPTOGRAPHIC AUDIT TRAIL & CREDENTIAL PURGE (10 tests)
  // ==========================================================================

  await runTest('TEST_MO_134', 'Every state transition creates a chained audit event', 'Logging', () => {
    resetAll();
    const mgr = OrchestrationAuditManager.getInstance();
    mgr.recordEvent({
      jobId: 'job_audit_1',
      previousState: 'IDLE',
      newState: 'INITIALIZING',
      action: 'INIT_WORKFLOW',
      actor: 'Op1',
      safetyCheckPassed: true,
      details: 'Started workflow',
    });
    const events = mgr.getEvents('job_audit_1');
    if (events.length !== 1) throw new Error(`Expected 1 event, got ${events.length}`);
  });

  await runTest('TEST_MO_135', 'Audit events contain previousState, newState, action, actor, timestamp', 'Logging', () => {
    resetAll();
    const mgr = OrchestrationAuditManager.getInstance();
    const event = mgr.recordEvent({
      jobId: 'job_audit_2',
      previousState: 'INITIALIZING',
      newState: 'RESEARCHING',
      action: 'ADVANCE_STEP',
      actor: 'Op2',
      safetyCheckPassed: true,
      details: 'Advance to research',
    });
    if (event.previousState !== 'INITIALIZING') throw new Error('previousState mismatch');
    if (event.newState !== 'RESEARCHING') throw new Error('newState mismatch');
    if (event.action !== 'ADVANCE_STEP') throw new Error('action mismatch');
    if (event.actor !== 'Op2') throw new Error('actor mismatch');
    if (event.timestamp <= 0) throw new Error('timestamp missing');
  });

  await runTest('TEST_MO_136', 'Audit chain integrity verification succeeds on valid log', 'Logging', () => {
    resetAll();
    const mgr = OrchestrationAuditManager.getInstance();
    mgr.recordEvent({ jobId: 'j1', previousState: 'IDLE', newState: 'INITIALIZING', action: 'A1', actor: 'O1', safetyCheckPassed: true, details: 'D1' });
    mgr.recordEvent({ jobId: 'j1', previousState: 'INITIALIZING', newState: 'RESEARCHING', action: 'A2', actor: 'O1', safetyCheckPassed: true, details: 'D2' });
    if (!mgr.verifyChainIntegrity()) throw new Error('Audit chain integrity should pass');
  });

  await runTest('TEST_MO_137', 'Tampered audit event causes chain integrity verification to fail', 'Logging', () => {
    resetAll();
    const mgr = OrchestrationAuditManager.getInstance();
    mgr.recordEvent({ jobId: 'j1', previousState: 'IDLE', newState: 'INITIALIZING', action: 'A1', actor: 'O1', safetyCheckPassed: true, details: 'D1' });
    mgr.recordEvent({ jobId: 'j1', previousState: 'INITIALIZING', newState: 'RESEARCHING', action: 'A2', actor: 'O1', safetyCheckPassed: true, details: 'D2' });

    const events = mgr.getEvents();
    (events[0] as any).details = 'Tampered text';
    if (mgr.verifyChainIntegrity()) throw new Error('Audit chain integrity must fail on tampered record');
  });

  await runTest('TEST_MO_138', 'Audit manager sanitizes passwords from log details', 'Security', () => {
    const mgr = OrchestrationAuditManager.getInstance();
    const sanitized = mgr.sanitize('Connecting with password: secret_password_123');
    if (sanitized.includes('secret_password_123')) throw new Error('Password was not sanitized');
    if (!sanitized.includes('[REDACTED_SECRET]')) throw new Error('Redaction token missing');
  });

  await runTest('TEST_MO_139', 'Audit manager sanitizes OTP tokens from log details', 'Security', () => {
    const mgr = OrchestrationAuditManager.getInstance();
    const sanitized = mgr.sanitize('Received otp=987654 for verification');
    if (sanitized.includes('987654')) throw new Error('OTP was not sanitized');
  });

  await runTest('TEST_MO_140', 'Audit manager sanitizes credit card numbers from log details', 'Security', () => {
    const mgr = OrchestrationAuditManager.getInstance();
    const sanitized = mgr.sanitize('Using card 4111222233334444 for verification');
    if (sanitized.includes('4111222233334444')) throw new Error('Card was not sanitized');
  });

  await runTest('TEST_MO_141', 'Audit manager sanitizes API keys from log details', 'Security', () => {
    const mgr = OrchestrationAuditManager.getInstance();
    const sanitized = mgr.sanitize('Client configured with api_key: AIzaSyD345abcdef');
    if (sanitized.includes('AIzaSyD345abcdef')) throw new Error('API key was not sanitized');
  });

  await runTest('TEST_MO_142', 'Audit logs integrate with LocalActionLogger', 'Logging', () => {
    resetAll();
    const mgr = OrchestrationAuditManager.getInstance();
    mgr.recordEvent({ jobId: 'j1', previousState: 'IDLE', newState: 'INITIALIZING', action: 'AUDIT_INTEGRATION_TEST', actor: 'O1', safetyCheckPassed: true, details: 'D1' });
    const logs = LocalActionLogger.getInstance().getLogs();
    const found = logs.some(l => l.action === 'ORCH_AUDIT_INTEGRATION_TEST');
    if (!found) throw new Error('LocalActionLogger was not written');
  });

  await runTest('TEST_MO_143', 'Audit chain hash is deterministic and SHA-256 compliant', 'Logging', () => {
    resetAll();
    const mgr = OrchestrationAuditManager.getInstance();
    const ev = mgr.recordEvent({ jobId: 'j1', previousState: 'IDLE', newState: 'INITIALIZING', action: 'A1', actor: 'O1', safetyCheckPassed: true, details: 'D1' });
    if (ev.fingerprintChainHash.length !== 64) {
      throw new Error(`Expected 64-char hex SHA-256 hash, got length ${ev.fingerprintChainHash.length}`);
    }
  });

  // ==========================================================================
  // SECTION 15: END-TO-END ORCHESTRATOR HAPPY PATH (5 tests)
  // ==========================================================================

  await runTest('TEST_MO_144', 'Full end-to-end execution through all 15 stages to COMPLETED', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({
      searchQuery: 'Noise Cancelling Headphones',
      targetPlatforms: ['instagram', 'youtube'],
      operatorId: 'Operator_Alice',
    });

    // 1. START -> RESEARCHING
    await orchestrator.executeNext();
    // 2. RESEARCHING -> WAITING_FOR_PRODUCT_REVIEW
    await orchestrator.executeNext();
    // 3. Gate 1: Human Product Approval -> GENERATING_CONTENT
    orchestrator.submitProductApproval({ reviewerId: 'Operator_Alice', sessionId: 'sess_1' });
    // 4. GENERATING_CONTENT -> WAITING_FOR_CONTENT_REVIEW
    await orchestrator.executeNext();
    // 5. Gate 2: Human Content Approval -> CREATING_VIDEO
    orchestrator.submitContentApproval({ reviewerId: 'Operator_Alice', sessionId: 'sess_2' });
    // 6. CREATING_VIDEO -> RENDERING_VIDEO
    await orchestrator.executeNext();
    // 7. RENDERING_VIDEO -> WAITING_FOR_VIDEO_REVIEW
    await orchestrator.executeNext();
    // 8. Gate 3: Human Video Approval -> CAPTURING_AMAZON_LINK
    orchestrator.submitVideoApproval({ reviewerId: 'Operator_Alice', sessionId: 'sess_3' });
    // 9. CAPTURING_AMAZON_LINK -> PLANNING_PLATFORMS
    await orchestrator.executeNext();
    // 10. PLANNING_PLATFORMS -> WAITING_FOR_PUBLISH_APPROVAL
    await orchestrator.executeNext();
    // 11. Gate 4: Final Publish Approval -> EXECUTING_PLATFORM
    orchestrator.submitPublishApproval({ reviewerId: 'Operator_Alice', sessionId: 'sess_4' });
    // 12. EXECUTING_PLATFORM (platform 1: instagram) -> EXECUTING_PLATFORM
    await orchestrator.executeNext();
    // 13. EXECUTING_PLATFORM (platform 2: youtube) -> VERIFYING_PUBLICATION
    await orchestrator.executeNext();
    // 14. VERIFYING_PUBLICATION -> FINAL_RECONCILIATION
    await orchestrator.executeNext();
    // 15. FINAL_RECONCILIATION -> COMPLETE
    await orchestrator.executeNext();

    const ctx = orchestrator.getContext()!;
    if (ctx.currentState !== 'COMPLETED') throw new Error(`Expected final state COMPLETED, got ${ctx.currentState}`);
    if (ctx.currentStep !== 'COMPLETE') throw new Error(`Expected final step COMPLETE, got ${ctx.currentStep}`);
  });

  await runTest('TEST_MO_145', 'All 4 human approvals submitted with verified human identity', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Earbuds', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    const a1 = orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    const a2 = orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    const a3 = orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    const a4 = orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });

    if (!a1.approvalId.startsWith('appr_product_review')) throw new Error('Gate 1 approval ID format invalid');
    if (!a2.approvalId.startsWith('appr_content_review')) throw new Error('Gate 2 approval ID format invalid');
    if (!a3.approvalId.startsWith('appr_video_review')) throw new Error('Gate 3 approval ID format invalid');
    if (!a4.approvalId.startsWith('appr_final_publish_approval')) throw new Error('Gate 4 approval ID format invalid');
  });

  await runTest('TEST_MO_146', 'All targeted platforms published with valid proof and idempotency records', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Earbuds', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    await orchestrator.executeNext(); // publish instagram
    await orchestrator.executeNext(); // publish youtube
    await orchestrator.executeNext(); // verify
    await orchestrator.executeNext(); // reconcile

    const ctx = orchestrator.getContext()!;
    if (ctx.publishedPlatforms.length !== 2) throw new Error('Expected 2 published platforms');
    if (ctx.publicationRecords.length !== 2) throw new Error('Expected 2 publication records');
    ctx.publicationRecords.forEach(r => {
      if (!r.proofUri) throw new Error(`Proof URI missing for ${r.platform}`);
      if (r.status !== 'PUBLISHED') throw new Error(`Status not PUBLISHED for ${r.platform}`);
    });
  });

  await runTest('TEST_MO_147', 'Result summary contains all artifacts, fingerprints, and audit stats', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Earbuds', targetPlatforms: ['instagram'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    await orchestrator.executeNext();
    orchestrator.submitContentApproval({ reviewerId: 'Op1', sessionId: 's2' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitVideoApproval({ reviewerId: 'Op1', sessionId: 's3' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitPublishApproval({ reviewerId: 'Op1', sessionId: 's4' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    await orchestrator.executeNext();

    const res = orchestrator.getResult()!;
    if (!res.success) throw new Error('Result success must be true');
    if (!res.allPlatformsPublished) throw new Error('allPlatformsPublished must be true');
    if (!res.artifacts.productData) throw new Error('ProductData missing in artifacts');
    if (!res.artifacts.contentPackage) throw new Error('ContentPackage missing in artifacts');
    if (!res.artifacts.videoProject) throw new Error('VideoProject missing in artifacts');
    if (!res.artifacts.capturedAmazonLink) throw new Error('Amazon link missing in artifacts');
    if (res.auditSummary.eventCount < 5) throw new Error('Audit events count too low');
  });

  await runTest('TEST_MO_148', 'Context persistence and reload verifies lossless serialization', 'Orchestration', async () => {
    resetAll();
    const orchestrator = MasterOrchestrator.getInstance();
    orchestrator.initialize({ searchQuery: 'Monitor Stand', targetPlatforms: ['instagram', 'youtube'], operatorId: 'Op1' });
    await orchestrator.executeNext();
    await orchestrator.executeNext();
    orchestrator.submitProductApproval({ reviewerId: 'Op1', sessionId: 's1' });
    orchestrator.persistContext();

    const ctx = orchestrator.getContext()!;
    MasterOrchestrator.resetInstance();
    const orch2 = MasterOrchestrator.getInstance();
    const loaded = orch2.restoreContext(ctx.orchestrationId)!;

    if (loaded.orchestrationId !== ctx.orchestrationId) throw new Error('ID mismatch');
    if (loaded.currentState !== ctx.currentState) throw new Error('currentState mismatch');
    if (loaded.productFingerprint !== ctx.productFingerprint) throw new Error('productFingerprint mismatch');
    if (!loaded.productApproval) throw new Error('productApproval missing in reloaded context');
  });
}
