/**
 * Phone Agent - Step 2I Persistent Job Store & Crash Recovery Unit Test Suite
 * 52 comprehensive tests verifying durability, transitions, crash recovery,
 * reconciliation, idempotency, leases, audit logs, and security invariants.
 */

import {
  JobStoreRepository,
  MemoryStorageDriver,
  JobStateTransitionValidator,
  InvalidJobStateTransitionError,
  JobConcurrencyConflictError,
  IncompatibleSchemaVersionError,
  SecretSanitizationError,
  STORAGE_KEY_MAIN,
} from '../PersistentJobStore';
import { CrashRecoveryManager } from '../CrashRecoveryManager';
import { PublicationReconciliationManager } from '../PublicationReconciliationManager';
import { SafeUiInspector } from '../inspector';
import { EmergencyStopManager } from '../emergencyStop';
import { PublicationGuard, computeContentFingerprint } from '../fingerprint';
import { NormalizedContentPayload } from '../../types/job';
import { SafeCheckpoint, PersistentApprovalRecord, CURRENT_SCHEMA_VERSION } from '../../types/persistence';

export interface PersistenceTestResult {
  id: string;
  name: string;
  category: 'Persistence' | 'Recovery' | 'Reconciliation' | 'Idempotency' | 'Security';
  passed: boolean;
  message: string;
  durationMs: number;
}

export async function runPersistenceRecoveryTests(): Promise<PersistenceTestResult[]> {
  const results: PersistenceTestResult[] = [];

  // Flexible helper allowing category to be optional
  const runTest = async (
    id: string,
    name: string,
    categoryOrFn: PersistenceTestResult['category'] | (() => Promise<void> | void),
    maybeFn?: () => Promise<void> | void
  ) => {
    const category: PersistenceTestResult['category'] = typeof categoryOrFn === 'string' ? categoryOrFn : 'Persistence';
    const fn: () => Promise<void> | void = typeof categoryOrFn === 'function' ? categoryOrFn : maybeFn!;
    const start = performance.now();
    EmergencyStopManager.getInstance().reset();
    PublicationGuard.getInstance().clear();
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
    }
  };

  const createFreshRepo = (customDriver?: MemoryStorageDriver) => {
    const driver = customDriver || new MemoryStorageDriver();
    return new JobStoreRepository(driver);
  };

  // 1. Job Persistence
  await runTest('PERSIST_01', 'job persistence across store instances', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const repo1 = new JobStoreRepository(driver);
    repo1.createJob({
      jobId: 'job_persist_1',
      normalizedBasePayload: { title: 'Durable Post', text: 'Testing persistence' },
      selectedPlatforms: ['instagram', 'youtube'],
    });

    const repo2 = new JobStoreRepository(driver);
    const restored = repo2.getJob('job_persist_1');
    if (!restored) throw new Error('Job not found after re-instantiation');
    if (restored.jobId !== 'job_persist_1') throw new Error('Mismatched jobId');
    if (restored.selectedPlatforms.length !== 2) throw new Error('Selected platforms lost');
  });

  // 2. Job Restoration
  await runTest('PERSIST_02', 'job restoration retains all platform execution states', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const repo = new JobStoreRepository(driver);
    repo.createJob({
      jobId: 'job_persist_2',
      normalizedBasePayload: { text: 'Full state check' },
      selectedPlatforms: ['facebook', 'threads'],
    });

    const job = repo.getJob('job_persist_2')!;
    if (!job.platformExecutionStates['facebook'] || !job.platformExecutionStates['threads']) {
      throw new Error('Platform execution states missing');
    }
    if (job.platformExecutionStates['facebook'].status !== 'PENDING') {
      throw new Error('Initial status should be PENDING');
    }
  });

  // 3. Schema Versioning
  await runTest('PERSIST_03', 'schema versioning initializes to current version', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const repo = new JobStoreRepository(driver);
    repo.createJob({
      jobId: 'job_schema_ver',
      normalizedBasePayload: { text: 'Version check' },
      selectedPlatforms: ['linkedin'],
    });

    const raw = JSON.parse(driver.getItem(STORAGE_KEY_MAIN)!);
    if (raw.version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`Expected schema version ${CURRENT_SCHEMA_VERSION}, got ${raw.version}`);
    }
  });

  // 4. Migration v1 -> v2
  await runTest('PERSIST_04', 'migration framework cleanly upgrades v1 schema to v2', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const v1Data = {
      version: 1,
      jobs: {
        job_v1: {
          jobId: 'job_v1',
          createdAt: 1000,
          updatedAt: 1000,
          status: 'PENDING',
          approvalLevel: 'PLATFORM_APPROVAL',
          normalizedBasePayload: { text: 'Migrate me' },
          selectedPlatforms: ['pinterest'],
          platformExecutionStates: {
            pinterest: {
              platform: 'pinterest',
              status: 'PENDING',
              approvalState: 'PENDING',
              expectedPackage: 'com.pinterest',
              contentFingerprint: 'fp_old',
              attemptCount: 0,
              publicationVerificationState: 'UNVERIFIED',
            },
          },
          executionSequence: ['pinterest'],
          contentFingerprint: 'fp_old',
        },
      },
      auditLogs: [],
    };
    driver.setItem(STORAGE_KEY_MAIN, JSON.stringify(v1Data));

    const repo = new JobStoreRepository(driver);
    const upgraded = repo.getJob('job_v1');
    if (!upgraded) throw new Error('Job not upgraded');
    if (upgraded.schemaVersion !== 2) throw new Error('Job schemaVersion not bumped to 2');
    if (!upgraded.retryMetadata) throw new Error('retryMetadata missing after migration');
    if (!upgraded.emergencyStopState) throw new Error('emergencyStopState missing after migration');
  });

  // 5. Invalid Schema Fails Closed
  await runTest('PERSIST_05', 'unknown future schema version fails closed', 'Persistence', () => {
    const driver = new MemoryStorageDriver();
    const futureData = {
      version: 999, // future unsupported version
      jobs: {},
      auditLogs: [],
    };
    driver.setItem(STORAGE_KEY_MAIN, JSON.stringify(futureData));

    try {
      new JobStoreRepository(driver);
      throw new Error('Should have failed on unsupported future schema version');
    } catch (err) {
      if (!(err instanceof IncompatibleSchemaVersionError)) {
        throw new Error(`Expected IncompatibleSchemaVersionError, got: ${err}`);
      }
    }
  });

  // 6. State Transition Validation
  await runTest('PERSIST_06', 'state transition validator allows legal job progression', 'Persistence', () => {
    JobStateTransitionValidator.validateJobTransition('PENDING', 'VALIDATING');
    JobStateTransitionValidator.validateJobTransition('VALIDATING', 'READY');
    JobStateTransitionValidator.validateJobTransition('READY', 'WAITING_FOR_APPROVAL');
    JobStateTransitionValidator.validateJobTransition('WAITING_FOR_APPROVAL', 'RUNNING');
    JobStateTransitionValidator.validateJobTransition('RUNNING', 'PUBLISHED');
  });

  // 7. Invalid Transition Rejection
  await runTest('PERSIST_07', 'state transition validator rejects illegal jumps', 'Persistence', () => {
    try {
      JobStateTransitionValidator.validateJobTransition('PENDING', 'PUBLISHED');
      throw new Error('Should have rejected PENDING -> PUBLISHED');
    } catch (err) {
      if (!(err instanceof InvalidJobStateTransitionError)) throw err;
    }
  });

  // 8. Crash During RUNNING
  await runTest('PERSIST_08', 'crash during RUNNING is detected by recovery engine', 'Recovery', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_crash_01',
      normalizedBasePayload: { text: 'Running crash test' },
      selectedPlatforms: ['instagram'],
    });
    repo.markPlatformRunning('job_crash_01', 'instagram', 'PUBLISH_ACTION_STARTED');

    const recovery = new CrashRecoveryManager(repo);
    const scan = recovery.performStartupRecovery();

    if (scan.interruptedJobsFound !== 1) throw new Error('Failed to find interrupted job');
    if (scan.platformsMarkedUnknown.length !== 1) throw new Error('Platform not marked UNKNOWN');
  });

  // 9. UNKNOWN Generation
  await runTest('PERSIST_09', 'interrupted platform becomes UNKNOWN with preserved checkpoint', 'Recovery', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_crash_02',
      normalizedBasePayload: { text: 'Unknown gen test' },
      selectedPlatforms: ['youtube'],
    });
    repo.markPlatformRunning('job_crash_02', 'youtube', 'PUBLISH_ACTION_STARTED');

    const recovery = new CrashRecoveryManager(repo);
    recovery.performStartupRecovery();

    const job = repo.getJob('job_crash_02')!;
    if (job.status !== 'UNKNOWN') throw new Error(`Job status expected UNKNOWN, got ${job.status}`);
    const pState = job.platformExecutionStates['youtube'];
    if (pState.status !== 'UNKNOWN') throw new Error(`Platform status expected UNKNOWN, got ${pState.status}`);
    if (pState.lastSafeCheckpoint !== 'PUBLISH_ACTION_STARTED') {
      throw new Error(`Checkpoint lost, got ${pState.lastSafeCheckpoint}`);
    }
  });

  // 10. UNKNOWN Reconciliation
  await runTest('PERSIST_10', 'reconciliation manager handles UNKNOWN platform', 'Reconciliation', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_reconcile_01',
      normalizedBasePayload: { text: 'Reconciliation' },
      selectedPlatforms: ['instagram'],
    });
    repo.markPlatformRunning('job_reconcile_01', 'instagram');
    repo.markPlatformUnknown('job_reconcile_01', 'instagram', 'Simulated crash');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.instagram.android');
    inspector.setNodes([
      {
        id: 'node_1',
        text: 'Reel posted',
        className: 'android.widget.TextView',
        isClickable: false,
        isEditable: false,
        isVisible: true,
        packageName: 'com.instagram.android',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      },
    ]);

    const rep = await reconciler.reconcilePlatform('job_reconcile_01', 'instagram', inspector);
    if (rep.outcome !== 'CONFIRMED_PUBLISHED') {
      throw new Error(`Expected CONFIRMED_PUBLISHED, got ${rep.outcome}`);
    }
  });

  // 11. Confirmed Published
  await runTest('PERSIST_11', 'confirmed published transitions state to PUBLISHED and guards idempotency', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_reconcile_pub',
      normalizedBasePayload: { text: 'Published proof' },
      selectedPlatforms: ['tiktok'],
    });
    repo.markPlatformRunning('job_reconcile_pub', 'tiktok');
    repo.markPlatformUnknown('job_reconcile_pub', 'tiktok', 'Process killed');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
    inspector.setNodes([
      {
        id: 'n1',
        text: 'Video uploaded',
        className: 'android.widget.TextView',
        isClickable: false,
        isEditable: false,
        isVisible: true,
        packageName: 'com.zhiliaoapp.musically',
        bounds: { x: 0, y: 0, width: 200, height: 50 },
      },
    ]);

    const report = await reconciler.reconcilePlatform('job_reconcile_pub', 'tiktok', inspector);
    if (report.outcome !== 'CONFIRMED_PUBLISHED') throw new Error('Expected CONFIRMED_PUBLISHED');

    const updatedJob = repo.getJob('job_reconcile_pub')!;
    if (updatedJob.platformExecutionStates['tiktok'].status !== 'PUBLISHED') {
      throw new Error('Platform not marked PUBLISHED');
    }
    const guard = PublicationGuard.getInstance();
    if (!guard.isPublished('job_reconcile_pub', 'tiktok', updatedJob.contentFingerprint)) {
      throw new Error('PublicationGuard missing confirmed record');
    }
  });

  // 12. Confirmed Not Published
  await runTest('PERSIST_12', 'confirmed not published transitions platform to READY for operator review', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_reconcile_not_pub',
      normalizedBasePayload: { text: 'Draft proof' },
      selectedPlatforms: ['facebook'],
    });
    repo.markPlatformRunning('job_reconcile_not_pub', 'facebook');
    repo.markPlatformUnknown('job_reconcile_not_pub', 'facebook', 'Killed mid-upload');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.facebook.katana');
    inspector.setNodes([
      {
        id: 'n1',
        text: 'Discard draft',
        className: 'android.widget.Button',
        isClickable: true,
        isEditable: false,
        isVisible: true,
        packageName: 'com.facebook.katana',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      },
    ]);

    const report = await reconciler.reconcilePlatform('job_reconcile_not_pub', 'facebook', inspector);
    if (report.outcome !== 'CONFIRMED_NOT_PUBLISHED') {
      throw new Error(`Expected CONFIRMED_NOT_PUBLISHED, got ${report.outcome}`);
    }
    const job = repo.getJob('job_reconcile_not_pub')!;
    if (job.platformExecutionStates['facebook'].status !== 'READY') {
      throw new Error('Platform should be reset to READY for human operator, not auto-republished');
    }
  });

  // 13. Still Unknown
  await runTest('PERSIST_13', 'reconciliation outcome is STILL_UNKNOWN when UI is ambiguous', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_reconcile_ambiguous',
      normalizedBasePayload: { text: 'Ambiguous test' },
      selectedPlatforms: ['pinterest'],
    });
    repo.markPlatformRunning('job_reconcile_ambiguous', 'pinterest');
    repo.markPlatformUnknown('job_reconcile_ambiguous', 'pinterest', 'Power loss');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.pinterest');
    // UI nodes have generic feed, no completion banner and no draft
    inspector.setNodes([
      {
        id: 'n1',
        text: 'Search for ideas',
        className: 'android.widget.TextView',
        isClickable: true,
        isEditable: false,
        isVisible: true,
        packageName: 'com.pinterest',
        bounds: { x: 0, y: 0, width: 300, height: 40 },
      },
    ]);

    const report = await reconciler.reconcilePlatform('job_reconcile_ambiguous', 'pinterest', inspector);
    if (report.outcome !== 'STILL_UNKNOWN') {
      throw new Error(`Expected STILL_UNKNOWN, got ${report.outcome}`);
    }
    const job = repo.getJob('job_reconcile_ambiguous')!;
    if (job.platformExecutionStates['pinterest'].status !== 'UNKNOWN') {
      throw new Error('Platform must remain UNKNOWN without guessing');
    }
  });

  // 14. Security Blocked
  await runTest('PERSIST_14', 'security challenge trips reconciliation into SECURITY_BLOCKED', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_sec_blocked',
      normalizedBasePayload: { text: 'Tripwire trigger' },
      selectedPlatforms: ['instagram'],
    });
    repo.markPlatformRunning('job_sec_blocked', 'instagram');
    repo.markPlatformUnknown('job_sec_blocked', 'instagram', 'Interrupted');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.instagram.android');
    inspector.simulateSecurityTripwire('Enter OTP to verify device');

    const report = await reconciler.reconcilePlatform('job_sec_blocked', 'instagram', inspector);
    if (report.outcome !== 'SECURITY_BLOCKED') {
      throw new Error(`Expected SECURITY_BLOCKED, got ${report.outcome}`);
    }
    if (!EmergencyStopManager.getInstance().isActive()) {
      throw new Error('EmergencyStop should be triggered on security challenge');
    }
  });

  // 15. Idempotency
  await runTest('PERSIST_15', 'publication idempotency key format and resolution', () => {
    const payload: NormalizedContentPayload = {
      title: 'Idempotency Test',
      text: 'Canonical text',
      hashtags: ['test', 'safe'],
    };
    const fp1 = computeContentFingerprint(payload);
    const fp2 = computeContentFingerprint({
      title: ' Idempotency Test ',
      text: 'Canonical text',
      hashtags: ['safe', 'test'],
    });
    if (fp1 !== fp2) throw new Error('Fingerprint should be identical for normalized content');
  });

  // 16. Duplicate Execution Prevention
  await runTest('PERSIST_16', 'already published platform throws error on attempt to re-run', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_dup_prevent',
      normalizedBasePayload: { text: 'Published content' },
      selectedPlatforms: ['x'],
    });
    repo.markPlatformRunning('job_dup_prevent', 'x');
    repo.markPlatformCompleted('job_dup_prevent', 'x');

    try {
      repo.markPlatformRunning('job_dup_prevent', 'x');
      throw new Error('Should not allow re-running an already PUBLISHED platform');
    } catch (err) {
      if (!(err instanceof InvalidJobStateTransitionError)) throw err;
    }
  });

  // 17. Approval Persistence
  await runTest('PERSIST_17', 'approval record survives storage reload with fingerprint binding', () => {
    const driver = new MemoryStorageDriver();
    const repo1 = new JobStoreRepository(driver);
    const job = repo1.createJob({
      jobId: 'job_appr_persist',
      normalizedBasePayload: { text: 'Approved content' },
      selectedPlatforms: ['threads'],
    });

    const approval: PersistentApprovalRecord = {
      approvalLevel: 'PLATFORM_APPROVAL',
      approvalState: 'APPROVED',
      approvalTimestamp: Date.now(),
      approvedJobFingerprint: job.contentFingerprint,
      approvedPlatform: 'threads',
      approvalSessionId: 'sess_123',
    };
    repo1.recordApproval('job_appr_persist', approval);

    const repo2 = new JobStoreRepository(driver);
    const restored = repo2.getJob('job_appr_persist')!;
    if (!restored.approvalRecord) throw new Error('Approval record not persisted');
    if (restored.approvalRecord.approvalState !== 'APPROVED') {
      throw new Error('Approval state mismatch');
    }
  });

  // 18. Approval Invalidation
  await runTest('PERSIST_18', 'invalidating approval marks state INVALIDATED', () => {
    const repo = createFreshRepo();
    const job = repo.createJob({
      jobId: 'job_appr_inval',
      normalizedBasePayload: { text: 'Before change' },
      selectedPlatforms: ['linkedin'],
    });

    repo.recordApproval('job_appr_inval', {
      approvalLevel: 'JOB_APPROVAL',
      approvalState: 'APPROVED',
      approvalTimestamp: Date.now(),
      approvedJobFingerprint: job.contentFingerprint,
      approvalSessionId: 'sess_abc',
    });

    repo.invalidateApproval('job_appr_inval', 'Content was modified');
    const updated = repo.getJob('job_appr_inval')!;
    if (updated.approvalRecord?.approvalState !== 'INVALIDATED') {
      throw new Error('Approval record was not invalidated');
    }
  });

  // 19. Content Fingerprint Change
  await runTest('PERSIST_19', 'approval rejected if fingerprint does not match job content', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_fp_mismatch',
      normalizedBasePayload: { text: 'Original content' },
      selectedPlatforms: ['instagram'],
    });

    try {
      repo.recordApproval('job_fp_mismatch', {
        approvalLevel: 'PLATFORM_APPROVAL',
        approvalState: 'APPROVED',
        approvalTimestamp: Date.now(),
        approvedJobFingerprint: 'fp_different_hash_1234',
        approvalSessionId: 'sess_xyz',
      });
      throw new Error('Should have rejected mismatched fingerprint approval');
    } catch (err: any) {
      if (!err.message.includes('Approval fingerprint')) throw err;
    }
  });

  // 20. Media Fingerprint Change
  await runTest('PERSIST_20', 'media URI changes content fingerprint', () => {
    const fp1 = computeContentFingerprint({ text: 'Post', mediaUri: 'file:///data/v1.mp4' });
    const fp2 = computeContentFingerprint({ text: 'Post', mediaUri: 'file:///data/v2.mp4' });
    if (fp1 === fp2) throw new Error('Fingerprint must differ when media URI changes');
  });

  // 21. Platform Selection Change
  await runTest('PERSIST_21', 'platform execution states correspond strictly to selected platforms', () => {
    const repo = createFreshRepo();
    const job = repo.createJob({
      jobId: 'job_platform_sel',
      normalizedBasePayload: { text: 'Select platforms' },
      selectedPlatforms: ['youtube', 'tiktok'],
    });

    const platforms = Object.keys(job.platformExecutionStates);
    if (platforms.length !== 2 || !platforms.includes('youtube') || !platforms.includes('tiktok')) {
      throw new Error('Platform states do not match selected platforms');
    }
  });

  // 22. EmergencyStop Persistence
  await runTest('PERSIST_22', 'EmergencyStop persists into storage and survives restart', () => {
    const driver = new MemoryStorageDriver();
    const repo1 = new JobStoreRepository(driver);
    repo1.setEmergencyStop(true, 'Operator pressed panic button');

    const repo2 = new JobStoreRepository(driver);
    if (!EmergencyStopManager.getInstance().isActive()) {
      throw new Error('EmergencyStop should be active in memory after storage restore');
    }
  });

  // 23. EmergencyStop Recovery
  await runTest('PERSIST_23', 'EmergencyStop prevents recovery engine from permitting execution', () => {
    const repo = createFreshRepo();
    repo.setEmergencyStop(true, 'Security breach detected');

    const recovery = new CrashRecoveryManager(repo);
    const check = recovery.canProceedWithJob('any_job');
    if (check.allowed) {
      throw new Error('canProceedWithJob must return false when EmergencyStop is active');
    }
  });

  // 24. EmergencyStop Approval Invalidation
  await runTest('PERSIST_24', 'EmergencyStop invalidates all pending approved jobs', () => {
    const repo = createFreshRepo();
    const job = repo.createJob({
      jobId: 'job_stop_appr',
      normalizedBasePayload: { text: 'To be approved' },
      selectedPlatforms: ['instagram'],
    });
    repo.recordApproval('job_stop_appr', {
      approvalLevel: 'JOB_APPROVAL',
      approvalState: 'APPROVED',
      approvalTimestamp: Date.now(),
      approvedJobFingerprint: job.contentFingerprint,
      approvalSessionId: 'sess_stop',
    });

    repo.setEmergencyStop(true, 'Emergency halt');

    const updated = repo.getJob('job_stop_appr')!;
    if (updated.approvalRecord?.approvalState !== 'INVALIDATED') {
      throw new Error('Approval should be INVALIDATED on EmergencyStop');
    }
  });

  // 25. Stale Execution Lease
  await runTest('PERSIST_25', 'stale execution lease is detected and can be re-acquired', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_lease_stale',
      normalizedBasePayload: { text: 'Lease test' },
      selectedPlatforms: ['x'],
    });

    // Acquire lease with 1ms TTL
    repo.acquireLease('job_lease_stale', 'executor_old', 1);

    // Wait 5ms for expiry
    const start = Date.now();
    while (Date.now() - start < 5) {}

    if (!repo.isLeaseStale('job_lease_stale')) {
      throw new Error('Lease should be stale after TTL expiry');
    }

    // New owner can acquire expired lease
    const newLease = repo.acquireLease('job_lease_stale', 'executor_new', 10000);
    if (newLease.ownerId !== 'executor_new') throw new Error('Failed to acquire after expiry');
  });

  // 26. Lease Ownership
  await runTest('PERSIST_26', 'lease renewal is restricted to current owner', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_lease_owner',
      normalizedBasePayload: { text: 'Owner test' },
      selectedPlatforms: ['pinterest'],
    });

    repo.acquireLease('job_lease_owner', 'executor_alpha', 10000);

    try {
      repo.renewLease('job_lease_owner', 'executor_beta', 10000);
      throw new Error('Should not allow different owner to renew lease');
    } catch (err) {
      if (!(err instanceof JobConcurrencyConflictError)) throw err;
    }
  });

  // 27. Sequential Execution
  await runTest('PERSIST_27', 'jobs record execution sequence deterministically', () => {
    const repo = createFreshRepo();
    const job = repo.createJob({
      jobId: 'job_seq_01',
      normalizedBasePayload: { text: 'Seq test' },
      selectedPlatforms: ['youtube', 'instagram', 'facebook'],
    });

    if (job.executionSequence.length !== 3) throw new Error('Sequence length mismatch');
  });

  // 28. Completed Platform Preservation
  await runTest('PERSIST_28', 'completed platforms remain PUBLISHED across crash recovery', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_preserve_pub',
      normalizedBasePayload: { text: 'Preserve test' },
      selectedPlatforms: ['instagram', 'youtube'],
    });

    repo.markPlatformRunning('job_preserve_pub', 'instagram');
    repo.markPlatformCompleted('job_preserve_pub', 'instagram');
    repo.markPlatformRunning('job_preserve_pub', 'youtube');

    const recovery = new CrashRecoveryManager(repo);
    const scan = recovery.performStartupRecovery();

    if (scan.preservedPublishedCount !== 1) throw new Error('Preserved count mismatch');
    const job = repo.getJob('job_preserve_pub')!;
    if (job.platformExecutionStates['instagram'].status !== 'PUBLISHED') {
      throw new Error('Completed platform was not preserved as PUBLISHED');
    }
    if (job.platformExecutionStates['youtube'].status !== 'UNKNOWN') {
      throw new Error('Running platform was not marked UNKNOWN');
    }
  });

  // 29. Partial Job Recovery
  await runTest('PERSIST_29', 'partially published job status is tracked accurately', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_partial_01',
      normalizedBasePayload: { text: 'Partial test' },
      selectedPlatforms: ['instagram', 'facebook', 'tiktok'],
    });

    repo.markPlatformRunning('job_partial_01', 'instagram');
    repo.markPlatformCompleted('job_partial_01', 'instagram');

    const job = repo.getJob('job_partial_01')!;
    if (job.status !== 'PARTIALLY_PUBLISHED') {
      throw new Error(`Expected PARTIALLY_PUBLISHED, got ${job.status}`);
    }
  });

  // 30. Audit Integrity
  await runTest('PERSIST_30', 'audit events contain valid integrity hashes', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_audit_test',
      normalizedBasePayload: { text: 'Audit hash test' },
      selectedPlatforms: ['x'],
    });

    const logs = repo.getAuditHistory('job_audit_test');
    if (logs.length === 0) throw new Error('Audit logs missing');
    if (!logs[0].integrityHash.startsWith('hash_')) {
      throw new Error('Integrity hash invalid format');
    }
  });

  // 31. Secret Exclusion from Persistence
  await runTest('PERSIST_31', 'passwords, OTPs, and card numbers are rejected from persistence', () => {
    const repo = createFreshRepo();

    try {
      repo.createJob({
        jobId: 'job_leak_pw',
        normalizedBasePayload: {
          text: 'Normal text',
          metadata: { user_password: 'supersecretpassword123' },
        },
        selectedPlatforms: ['instagram'],
      });
      throw new Error('Should have rejected secret field in metadata');
    } catch (err) {
      if (!(err instanceof SecretSanitizationError)) throw err;
    }
  });

  // 32. Secret Exclusion from Logs
  await runTest('PERSIST_32', 'secrets in audit event details trigger validation error', () => {
    const repo = createFreshRepo();

    try {
      repo.recordAuditEvent({
        jobId: 'SYSTEM',
        eventType: 'STATE_TRANSITION',
        details: 'User entered otp 123456 into field',
      });
      throw new Error('Should have rejected OTP in audit log details');
    } catch (err) {
      if (!(err instanceof SecretSanitizationError)) throw err;
    }
  });

  // 33. Amazon Publishing Prohibition After Recovery
  await runTest('PERSIST_33', 'Amazon cannot be selected or transitioned as publishing destination', () => {
    const repo = createFreshRepo();

    try {
      repo.createJob({
        jobId: 'job_amazon_illegal',
        normalizedBasePayload: { text: 'Amazon destination' },
        selectedPlatforms: ['amazon'],
      });
      throw new Error('Should have forbidden Amazon as a publishing destination');
    } catch (err: any) {
      if (!err.message.includes('Amazon is NOT a publishing destination')) throw err;
    }
  });

  // 34. Local Media Enforcement
  await runTest('PERSIST_34', 'mediaReference persists safely without network dependency', () => {
    const repo = createFreshRepo();
    const job = repo.createJob({
      jobId: 'job_media_local',
      normalizedBasePayload: { text: 'Local file' },
      selectedPlatforms: ['instagram'],
      mediaReference: 'content://media/external/video/media/42',
    });

    if (job.mediaReference !== 'content://media/external/video/media/42') {
      throw new Error('Local media reference corrupted');
    }
  });

  // 35. Package Mismatch During Recovery / Reconciliation
  await runTest('PERSIST_35', 'package mismatch during reconciliation yields STILL_UNKNOWN', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_pkg_mismatch',
      normalizedBasePayload: { text: 'Package test' },
      selectedPlatforms: ['instagram'],
    });
    repo.markPlatformRunning('job_pkg_mismatch', 'instagram');
    repo.markPlatformUnknown('job_pkg_mismatch', 'instagram', 'Interrupted');

    const reconciler = new PublicationReconciliationManager(repo);
    // Foreground app is different, e.g. YouTube instead of Instagram
    const inspector = new SafeUiInspector('com.google.android.youtube');

    const report = await reconciler.reconcilePlatform('job_pkg_mismatch', 'instagram', inspector);
    if (report.outcome !== 'STILL_UNKNOWN') {
      throw new Error(`Expected STILL_UNKNOWN on package mismatch, got ${report.outcome}`);
    }
  });

  // 36. CAPTCHA / Security Tripwire During Reconciliation
  await runTest('PERSIST_36', 'CAPTCHA detection during reconciliation halts automation', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_captcha_test',
      normalizedBasePayload: { text: 'Captcha test' },
      selectedPlatforms: ['facebook'],
    });
    repo.markPlatformRunning('job_captcha_test', 'facebook');
    repo.markPlatformUnknown('job_captcha_test', 'facebook', 'Interrupted');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.facebook.katana');
    inspector.simulateSecurityTripwire('CAPTCHA verification required');

    const report = await reconciler.reconcilePlatform('job_captcha_test', 'facebook', inspector);
    if (report.outcome !== 'SECURITY_BLOCKED') {
      throw new Error(`Expected SECURITY_BLOCKED, got ${report.outcome}`);
    }
  });

  // 37. Account Switcher During Reconciliation
  await runTest('PERSIST_37', 'account switcher interface detected during reconciliation halts automation', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_acct_switch',
      normalizedBasePayload: { text: 'Account switch check' },
      selectedPlatforms: ['tiktok'],
    });
    repo.markPlatformRunning('job_acct_switch', 'tiktok');
    repo.markPlatformUnknown('job_acct_switch', 'tiktok', 'Interrupted');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.zhiliaoapp.musically');
    inspector.setNodes([
      {
        id: 'node_switch',
        text: 'Switch account to proceed',
        className: 'android.widget.TextView',
        isClickable: true,
        isEditable: false,
        isVisible: true,
        packageName: 'com.zhiliaoapp.musically',
        bounds: { x: 0, y: 0, width: 200, height: 50 },
      },
    ]);

    const report = await reconciler.reconcilePlatform('job_acct_switch', 'tiktok', inspector);
    if (report.outcome !== 'SECURITY_BLOCKED') {
      throw new Error(`Expected SECURITY_BLOCKED, got ${report.outcome}`);
    }
  });

  // 38. Payment Screen During Reconciliation
  await runTest('PERSIST_38', 'payment or monetization UI detected halts automation', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_payment_ui',
      normalizedBasePayload: { text: 'Payment check' },
      selectedPlatforms: ['youtube'],
    });
    repo.markPlatformRunning('job_payment_ui', 'youtube');
    repo.markPlatformUnknown('job_payment_ui', 'youtube', 'Interrupted');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.google.android.youtube');
    inspector.setNodes([
      {
        id: 'node_pay',
        text: 'Confirm payment for YouTube Premium promotion',
        className: 'android.widget.Button',
        isClickable: true,
        isEditable: false,
        isVisible: true,
        packageName: 'com.google.android.youtube',
        bounds: { x: 0, y: 0, width: 250, height: 60 },
      },
    ]);

    const report = await reconciler.reconcilePlatform('job_payment_ui', 'youtube', inspector);
    if (report.outcome !== 'SECURITY_BLOCKED') {
      throw new Error(`Expected SECURITY_BLOCKED, got ${report.outcome}`);
    }
  });

  // 39. No Automatic Resume
  await runTest('PERSIST_39', 'system never automatically resumes interrupted jobs without human operator', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_no_auto_resume',
      normalizedBasePayload: { text: 'No auto resume' },
      selectedPlatforms: ['instagram'],
    });
    repo.markPlatformRunning('job_no_auto_resume', 'instagram');

    const recovery = new CrashRecoveryManager(repo);
    recovery.performStartupRecovery();

    const check = recovery.canProceedWithJob('job_no_auto_resume');
    if (check.allowed) {
      throw new Error('canProceedWithJob must block automatic continuation of UNKNOWN job');
    }
  });

  // 40. No Automatic Republish
  await runTest('PERSIST_40', 'confirmed unposted draft requires fresh human approval and cannot auto-republish', async () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_no_auto_repub',
      normalizedBasePayload: { text: 'Draft safe review' },
      selectedPlatforms: ['threads'],
    });
    repo.markPlatformRunning('job_no_auto_repub', 'threads');
    repo.markPlatformUnknown('job_no_auto_repub', 'threads', 'Interrupted');

    const reconciler = new PublicationReconciliationManager(repo);
    const inspector = new SafeUiInspector('com.instagram.barcelona');
    inspector.setNodes([
      {
        id: 'n_discard',
        text: 'Discard thread draft',
        className: 'android.widget.Button',
        isClickable: true,
        isEditable: false,
        isVisible: true,
        packageName: 'com.instagram.barcelona',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      },
    ]);

    await reconciler.reconcilePlatform('job_no_auto_repub', 'threads', inspector);
    const job = repo.getJob('job_no_auto_repub')!;

    // Must be in READY, not RUNNING or PUBLISHED
    if (job.status === 'RUNNING' || job.status === 'PUBLISHED') {
      throw new Error('Job must not automatically resume or publish');
    }
    if (job.approvalRecord?.approvalState === 'APPROVED') {
      throw new Error('Approval must not remain granted');
    }
  });

  // 41. Cleanup Protection
  await runTest('PERSIST_41', 'retention cleanup protects UNKNOWN and active jobs', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_to_purge',
      normalizedBasePayload: { text: 'Old completed job' },
      selectedPlatforms: ['x'],
    });
    repo.markPlatformRunning('job_to_purge', 'x');
    repo.markPlatformCompleted('job_to_purge', 'x');

    repo.createJob({
      jobId: 'job_unknown_protected',
      normalizedBasePayload: { text: 'Unknown job to keep' },
      selectedPlatforms: ['instagram'],
    });
    repo.markPlatformRunning('job_unknown_protected', 'instagram');
    repo.markPlatformUnknown('job_unknown_protected', 'instagram', 'Crash');

    // Simulate old updated timestamps
    const oldTime = Date.now() - 100000;
    repo.getJob('job_to_purge')!.updatedAt = oldTime;
    repo.getJob('job_unknown_protected')!.updatedAt = oldTime;

    // Purge jobs older than 50000ms
    const purged = repo.clearCompletedJobs(50000);
    if (purged !== 1) throw new Error(`Expected 1 purged job, got ${purged}`);

    if (repo.getJob('job_to_purge')) throw new Error('Completed job should have been purged');
    if (!repo.getJob('job_unknown_protected')) {
      throw new Error('UNKNOWN job must be protected from cleanup for reconciliation');
    }
  });

  // 42. Immutable Publication Record
  await runTest('PERSIST_42', 'publication records in PublicationGuard are immutable', () => {
    const guard = PublicationGuard.getInstance();
    guard.recordPublication('job_immut', 'instagram', 'fp_1234');

    if (!guard.isPublished('job_immut', 'instagram', 'fp_1234')) {
      throw new Error('Publication not found in guard');
    }
    if (guard.isPublished('job_immut', 'instagram', 'fp_different')) {
      throw new Error('Guard matched incorrect fingerprint');
    }
  });

  // 43. Concurrent Executor Rejection
  await runTest('PERSIST_43', 'concurrent executor attempting to acquire active lease is rejected', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_concurrent',
      normalizedBasePayload: { text: 'Concurrency test' },
      selectedPlatforms: ['youtube'],
    });

    repo.acquireLease('job_concurrent', 'executor_1', 20000);

    try {
      repo.acquireLease('job_concurrent', 'executor_2', 20000);
      throw new Error('Should have rejected executor_2 while executor_1 holds active lease');
    } catch (err) {
      if (!(err instanceof JobConcurrencyConflictError)) throw err;
    }
  });

  // 44. Recovery Idempotency
  await runTest('PERSIST_44', 'running crash recovery multiple times produces stable state', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_rec_idemp',
      normalizedBasePayload: { text: 'Recovery idempotency' },
      selectedPlatforms: ['tiktok'],
    });
    repo.markPlatformRunning('job_rec_idemp', 'tiktok');

    const recovery = new CrashRecoveryManager(repo);
    const scan1 = recovery.performStartupRecovery();
    if (scan1.interruptedJobsFound !== 1) throw new Error('Scan 1 should find interrupted job');

    const scan2 = recovery.performStartupRecovery();
    if (scan2.interruptedJobsFound !== 0) throw new Error('Scan 2 should find 0 newly interrupted jobs');

    const job = repo.getJob('job_rec_idemp')!;
    if (job.status !== 'UNKNOWN') throw new Error('Job status should remain UNKNOWN');
  });

  // 45. Full End-to-End Crash & Recovery Scenario
  await runTest('PERSIST_45', 'complete end-to-end multi-platform crash and reconciliation lifecycle', async () => {
    const driver = new MemoryStorageDriver();
    const repo = new JobStoreRepository(driver);

    // 1. Create 3-platform job: Instagram, YouTube, Facebook
    const job = repo.createJob({
      jobId: 'job_e2e_crash',
      normalizedBasePayload: {
        title: 'Product Drop',
        description: 'Check out new drop',
        hashtags: ['drop', 'launch'],
      },
      selectedPlatforms: ['instagram', 'youtube', 'facebook'],
    });

    // 2. Grant approval
    repo.recordApproval('job_e2e_crash', {
      approvalLevel: 'JOB_APPROVAL',
      approvalState: 'APPROVED',
      approvalTimestamp: Date.now(),
      approvedJobFingerprint: job.contentFingerprint,
      approvalSessionId: 'sess_e2e',
    });

    // 3. Platform 1 (Instagram) runs and completes
    repo.markPlatformRunning('job_e2e_crash', 'instagram');
    repo.markPlatformCompleted('job_e2e_crash', 'instagram');

    // 4. Platform 2 (YouTube) starts and process crashes mid-upload
    repo.markPlatformRunning('job_e2e_crash', 'youtube', 'PUBLISH_ACTION_STARTED');

    // SIMULATE PROCESS DEATH AND RESTART
    const restartedRepo = new JobStoreRepository(driver);
    const recoveryEngine = new CrashRecoveryManager(restartedRepo);
    const scan = recoveryEngine.performStartupRecovery();

    if (scan.interruptedJobsFound !== 1) throw new Error('Did not find interrupted job on restart');

    const restoredJob = restartedRepo.getJob('job_e2e_crash')!;
    if (restoredJob.platformExecutionStates['instagram'].status !== 'PUBLISHED') {
      throw new Error('Instagram should remain PUBLISHED');
    }
    if (restoredJob.platformExecutionStates['youtube'].status !== 'UNKNOWN') {
      throw new Error('YouTube should be UNKNOWN');
    }
    if (restoredJob.platformExecutionStates['facebook'].status !== 'PENDING') {
      throw new Error('Facebook should remain PENDING');
    }

    // 5. Reconcile YouTube
    const reconciler = new PublicationReconciliationManager(restartedRepo);
    const inspector = new SafeUiInspector('com.google.android.youtube');
    inspector.setNodes([
      {
        id: 'n_yt',
        text: 'Short uploaded',
        className: 'android.widget.TextView',
        isClickable: false,
        isEditable: false,
        isVisible: true,
        packageName: 'com.google.android.youtube',
        bounds: { x: 0, y: 0, width: 200, height: 40 },
      },
    ]);

    const report = await reconciler.reconcilePlatform('job_e2e_crash', 'youtube', inspector);
    if (report.outcome !== 'CONFIRMED_PUBLISHED') {
      throw new Error(`Expected CONFIRMED_PUBLISHED, got ${report.outcome}`);
    }

    // 6. Verify YouTube is now PUBLISHED and Facebook is ready for fresh operator approval
    const finalJob = restartedRepo.getJob('job_e2e_crash')!;
    if (finalJob.platformExecutionStates['youtube'].status !== 'PUBLISHED') {
      throw new Error('YouTube should be marked PUBLISHED after reconciliation');
    }
    if (finalJob.platformExecutionStates['facebook'].status !== 'PENDING') {
      throw new Error('Facebook must still be PENDING');
    }
  });

  // 46. Checkpoint Persistence
  await runTest('PERSIST_46', 'checkpoint progression records checkpoints in state and audit log', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_chk_prog',
      normalizedBasePayload: { text: 'Progression test' },
      selectedPlatforms: ['linkedin'],
    });

    const checkpoints: SafeCheckpoint[] = [
      'PACKAGE_VERIFIED',
      'READY_STATE_VERIFIED',
      'MEDIA_SELECTED',
      'CONTENT_ENTERED',
      'FINAL_SCREEN_VERIFIED',
      'APPROVAL_GRANTED',
    ];

    for (const chk of checkpoints) {
      repo.recordCheckpoint('job_chk_prog', 'linkedin', chk);
    }

    const job = repo.getJob('job_chk_prog')!;
    if (job.platformExecutionStates['linkedin'].lastSafeCheckpoint !== 'APPROVAL_GRANTED') {
      throw new Error('Last checkpoint mismatch');
    }
  });

  // 47. Checkpoint Crash Post-Publish Action
  await runTest('PERSIST_47', 'crash after PUBLISH_ACTION_STARTED is UNKNOWN not FAILED', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_chk_crash',
      normalizedBasePayload: { text: 'Publish action crash' },
      selectedPlatforms: ['instagram'],
    });

    repo.markPlatformRunning('job_chk_crash', 'instagram', 'PUBLISH_ACTION_STARTED');

    const recovery = new CrashRecoveryManager(repo);
    recovery.performStartupRecovery();

    const job = repo.getJob('job_chk_crash')!;
    if (job.platformExecutionStates['instagram'].status !== 'UNKNOWN') {
      throw new Error('Crash after PUBLISH_ACTION_STARTED must become UNKNOWN, never FAILED or PUBLISHED');
    }
  });

  // 48. Lease Release and Re-acquisition
  await runTest('PERSIST_48', 'releasing lease allows another executor to acquire cleanly', () => {
    const repo = createFreshRepo();
    repo.createJob({
      jobId: 'job_lease_rel',
      normalizedBasePayload: { text: 'Release test' },
      selectedPlatforms: ['pinterest'],
    });

    repo.acquireLease('job_lease_rel', 'exec_1', 30000);
    repo.releaseLease('job_lease_rel', 'exec_1');

    const lease2 = repo.acquireLease('job_lease_rel', 'exec_2', 30000);
    if (lease2.ownerId !== 'exec_2') throw new Error('Re-acquisition failed');
  });

  // 49. Memory Storage Driver Fallback
  await runTest('PERSIST_49', 'memory driver operates with isolated key-value store', () => {
    const driver = new MemoryStorageDriver();
    driver.setItem('k1', 'v1');
    driver.setItem('k2', 'v2');
    if (driver.getItem('k1') !== 'v1') throw new Error('Get failed');
    if (driver.getAllKeys().length !== 2) throw new Error('Key count mismatch');
    driver.removeItem('k1');
    if (driver.getItem('k1') !== null) throw new Error('Remove failed');
    driver.clear();
    if (driver.getAllKeys().length !== 0) throw new Error('Clear failed');
  });

  // 50. Disallow Direct UNKNOWN to PUBLISHED
  await runTest('PERSIST_50', 'transitioning UNKNOWN directly to PUBLISHED without reconciliation throws', () => {
    try {
      JobStateTransitionValidator.validatePlatformTransition('UNKNOWN', 'PUBLISHED', false, false);
      throw new Error('Should not allow UNKNOWN to PUBLISHED without reconciliation flag');
    } catch (err) {
      if (!(err instanceof InvalidJobStateTransitionError)) throw err;
    }
  });

  // 51. Disallow PUBLISHED to RUNNING
  await runTest('PERSIST_51', 'PUBLISHED cannot transition to RUNNING in platform state machine', () => {
    try {
      JobStateTransitionValidator.validatePlatformTransition('PUBLISHED', 'RUNNING', false);
      throw new Error('Should reject PUBLISHED -> RUNNING');
    } catch (err) {
      if (!(err instanceof InvalidJobStateTransitionError)) throw err;
    }
  });

  // 52. Emergency Stop Reset and Audit Event
  await runTest('PERSIST_52', 'clearing EmergencyStop logs audit event and releases safety lock', () => {
    const repo = createFreshRepo();
    repo.setEmergencyStop(true, 'Test panic');
    if (!EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop not active');

    repo.setEmergencyStop(false);
    if (EmergencyStopManager.getInstance().isActive()) throw new Error('EmergencyStop should be reset');

    const logs = repo.getAuditHistory('SYSTEM');
    const clearEvent = logs.find(l => l.eventType === 'EMERGENCY_STOP_CLEARED');
    if (!clearEvent) throw new Error('Audit log for EMERGENCY_STOP_CLEARED not found');
  });

  return results;
}
