/**
 * Phone Agent - Step 2I Production-Grade Persistent Job Store
 * Durable local job persistence, atomic state transitions, concurrency leases,
 * schema versioning, audit logging, and strict secret-sanitization.
 */

import {
  PersistentJob,
  PlatformExecutionState,
  PersistentJobStatus,
  PlatformExecutionStatus,
  PersistentApprovalState,
  PersistentApprovalRecord,
  SafeCheckpoint,
  ExecutionLease,
  PersistentAuditEvent,
  StorageSchema,
  CURRENT_SCHEMA_VERSION,
} from '../types/persistence';
import { SupportedPlatform, NormalizedContentPayload, ApprovalLevel } from '../types/job';
import { EmergencyStopManager } from './emergencyStop';
import { computeContentFingerprint, PublicationGuard } from './fingerprint';
import { ContentPackage } from './content/ContentPackage';

// Storage driver interface
export interface IJobStorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  getAllKeys(): string[];
  clear(): void;
}

// In-memory driver
export class MemoryStorageDriver implements IJobStorageDriver {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }
  clear(): void {
    this.store.clear();
  }
}

// LocalStorage driver with in-memory fallback
export class LocalStorageDriver implements IJobStorageDriver {
  private memoryFallback: MemoryStorageDriver = new MemoryStorageDriver();
  private hasLocalStorage: boolean;

  constructor() {
    this.hasLocalStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  getItem(key: string): string | null {
    if (this.hasLocalStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return this.memoryFallback.getItem(key);
      }
    }
    return this.memoryFallback.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (this.hasLocalStorage) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        this.memoryFallback.setItem(key, value);
      }
    } else {
      this.memoryFallback.setItem(key, value);
    }
  }

  removeItem(key: string): void {
    if (this.hasLocalStorage) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        this.memoryFallback.removeItem(key);
      }
    } else {
      this.memoryFallback.removeItem(key);
    }
  }

  getAllKeys(): string[] {
    if (this.hasLocalStorage) {
      try {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) keys.push(k);
        }
        return keys;
      } catch {
        return this.memoryFallback.getAllKeys();
      }
    }
    return this.memoryFallback.getAllKeys();
  }

  clear(): void {
    if (this.hasLocalStorage) {
      try {
        window.localStorage.clear();
      } catch {
        this.memoryFallback.clear();
      }
    } else {
      this.memoryFallback.clear();
    }
  }
}

// Secret Scrubber & Sanitization
const FORBIDDEN_SECRET_PATTERNS = [
  /password/i,
  /passwd/i,
  /otp/i,
  /pin\b/i,
  /auth_?token/i,
  /bearer\b/i,
  /cookie/i,
  /credit_?card/i,
  /cvv/i,
  /card_?number/i,
  /bank_?account/i,
  /api_?key/i,
  /secret_?key/i,
];

export class SecretSanitizationError extends Error {
  constructor(message: string) {
    super(`[Security Invariant Violation] Secret data detected: ${message}`);
    this.name = 'SecretSanitizationError';
  }
}

export function validateNoSecrets(data: unknown, path: string = ''): void {
  if (!data) return;

  if (typeof data === 'string') {
    // Check for obvious API key patterns or payment tokens
    if (data.startsWith('AIzaSy') || data.startsWith('sk_live_') || data.startsWith('ghp_')) {
      throw new SecretSanitizationError(`Secret token prefix found at path "${path}"`);
    }
    // Check for explicit credential patterns or keywords in content/logs
    if (/\b(?:otp\s*\d+|password\s*[:=]|cvv\s*\d+)/i.test(data) || /\b(?:user_password|auth_token|bearer\s+[A-Za-z0-9_-]{10,})\b/i.test(data)) {
      throw new SecretSanitizationError(`Forbidden credential content detected at path "${path}"`);
    }
    return;
  }

  if (Array.isArray(data)) {
    data.forEach((item, idx) => validateNoSecrets(item, `${path}[${idx}]`));
    return;
  }

  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
        if (pattern.test(key)) {
          throw new SecretSanitizationError(`Forbidden credential field "${key}" at path "${path}"`);
        }
      }
      validateNoSecrets(value, path ? `${path}.${key}` : key);
    }
  }
}

export function sanitizeObject<T>(obj: T): T {
  validateNoSecrets(obj);
  return JSON.parse(JSON.stringify(obj));
}

// Atomic State Transition Validation
export class InvalidJobStateTransitionError extends Error {
  public from: string;
  public to: string;
  public context: string;

  constructor(from: string, to: string, context: string, reason?: string) {
    super(`Invalid transition from "${from}" to "${to}" in ${context}${reason ? `: ${reason}` : ''}`);
    this.name = 'InvalidJobStateTransitionError';
    this.from = from;
    this.to = to;
    this.context = context;
  }
}

export class JobConcurrencyConflictError extends Error {
  public jobId: string;
  public currentOwner: string;
  public attemptedOwner: string;

  constructor(jobId: string, currentOwner: string, attemptedOwner: string) {
    super(`Job "${jobId}" is currently leased by owner "${currentOwner}". Owner "${attemptedOwner}" denied.`);
    this.name = 'JobConcurrencyConflictError';
    this.jobId = jobId;
    this.currentOwner = currentOwner;
    this.attemptedOwner = attemptedOwner;
  }
}

export class IncompatibleSchemaVersionError extends Error {
  public version: number;
  constructor(version: number) {
    super(`Cannot load data with schema version ${version}. Max supported version is ${CURRENT_SCHEMA_VERSION}. Failing closed.`);
    this.name = 'IncompatibleSchemaVersionError';
    this.version = version;
  }
}

export class JobStateTransitionValidator {
  /**
   * Validates high-level job state transition
   */
  public static validateJobTransition(
    from: PersistentJobStatus,
    to: PersistentJobStatus,
    emergencyStopActive: boolean = false
  ): void {
    if (from === to) return;

    // Safety Invariant: EmergencyStop permanently blocks transition to RUNNING or READY
    if (emergencyStopActive && (to === 'RUNNING' || to === 'READY' || to === 'PUBLISHED')) {
      throw new InvalidJobStateTransitionError(
        from,
        to,
        'Job',
        'EmergencyStop is active. Continuation blocked.'
      );
    }

    // Strict state machine
    switch (from) {
      case 'PENDING':
        if (['VALIDATING', 'READY', 'WAITING_FOR_APPROVAL', 'RUNNING', 'CANCELLED'].includes(to)) return;
        break;
      case 'VALIDATING':
        if (['READY', 'WAITING_FOR_APPROVAL', 'FAILED', 'CANCELLED'].includes(to)) return;
        break;
      case 'READY':
        if (['WAITING_FOR_APPROVAL', 'RUNNING', 'CANCELLED'].includes(to)) return;
        break;
      case 'WAITING_FOR_APPROVAL':
        if (['RUNNING', 'CANCELLED', 'READY'].includes(to)) return;
        break;
      case 'RUNNING':
        if (['PUBLISHED', 'PARTIALLY_PUBLISHED', 'FAILED', 'UNKNOWN', 'CANCELLED'].includes(to)) return;
        break;
      case 'PARTIALLY_PUBLISHED':
        if (['RUNNING', 'PUBLISHED', 'FAILED', 'UNKNOWN', 'CANCELLED'].includes(to)) return;
        break;
      case 'PUBLISHED':
        // NEVER allow PUBLISHED -> RUNNING or PUBLISHED -> PENDING
        throw new InvalidJobStateTransitionError(
          from,
          to,
          'Job',
          'PUBLISHED is an immutable terminal state. Re-running is strictly forbidden.'
        );
      case 'FAILED':
        // FAILED cannot directly become PUBLISHED without fresh execution
        if (to === 'PUBLISHED') {
          throw new InvalidJobStateTransitionError(
            from,
            to,
            'Job',
            'FAILED cannot transition directly to PUBLISHED without fresh validated execution.'
          );
        }
        if (to === 'CANCELLED') return;
        break;
      case 'UNKNOWN':
        // UNKNOWN cannot become PUBLISHED without safe reconciliation
        if (to === 'PUBLISHED') {
          throw new InvalidJobStateTransitionError(
            from,
            to,
            'Job',
            'UNKNOWN cannot transition directly to PUBLISHED without verified reconciliation.'
          );
        }
        if (['READY', 'FAILED', 'CANCELLED', 'PARTIALLY_PUBLISHED'].includes(to)) return;
        break;
      case 'CANCELLED':
        // Terminal state
        break;
    }

    throw new InvalidJobStateTransitionError(from, to, 'Job', 'Transition not allowed by state machine.');
  }

  /**
   * Validates per-platform execution status transition
   */
  public static validatePlatformTransition(
    from: PlatformExecutionStatus,
    to: PlatformExecutionStatus,
    emergencyStopActive: boolean = false,
    reconciledPublished: boolean = false
  ): void {
    if (from === to) return;

    if (emergencyStopActive && (to === 'RUNNING' || to === 'READY' || to === 'PUBLISHED')) {
      throw new InvalidJobStateTransitionError(
        from,
        to,
        'Platform',
        'EmergencyStop is active. Platform continuation blocked.'
      );
    }

    switch (from) {
      case 'PENDING':
        if (['VALIDATING', 'READY', 'WAITING_FOR_APPROVAL', 'RUNNING', 'CANCELLED'].includes(to)) return;
        break;
      case 'VALIDATING':
        if (['READY', 'WAITING_FOR_APPROVAL', 'FAILED', 'CANCELLED'].includes(to)) return;
        break;
      case 'READY':
        if (['WAITING_FOR_APPROVAL', 'RUNNING', 'CANCELLED'].includes(to)) return;
        break;
      case 'WAITING_FOR_APPROVAL':
        if (['RUNNING', 'CANCELLED'].includes(to)) return;
        break;
      case 'RUNNING':
        if (['PUBLISHED', 'FAILED', 'UNKNOWN', 'CANCELLED'].includes(to)) return;
        break;
      case 'PUBLISHED':
        // Immutable terminal state
        throw new InvalidJobStateTransitionError(
          from,
          to,
          'Platform',
          'Platform is already PUBLISHED. Double publishing is strictly forbidden.'
        );
      case 'FAILED':
        if (to === 'CANCELLED' || to === 'READY') return;
        if (to === 'PUBLISHED') {
          throw new InvalidJobStateTransitionError(
            from,
            to,
            'Platform',
            'FAILED platform cannot jump to PUBLISHED without a new validated attempt.'
          );
        }
        break;
      case 'UNKNOWN':
        if (to === 'PUBLISHED') {
          if (!reconciledPublished) {
            throw new InvalidJobStateTransitionError(
              from,
              to,
              'Platform',
              'UNKNOWN platform cannot be marked PUBLISHED without confirmed reconciliation.'
            );
          }
          return;
        }
        if (['READY', 'FAILED', 'CANCELLED'].includes(to)) return;
        break;
      case 'CANCELLED':
        break;
    }

    throw new InvalidJobStateTransitionError(from, to, 'Platform', 'Transition not allowed by state machine.');
  }
}

// Compute integrity hash for audit logging
export function computeIntegrityHash(data: unknown): string {
  const serialized = JSON.stringify(data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < serialized.length; i++) {
    const ch = serialized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `hash_${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export const STORAGE_KEY_MAIN = 'phone_agent_job_store_v2';

export class JobStoreRepository {
  private static instance: JobStoreRepository | null = null;
  private driver: IJobStorageDriver;
  private schema: StorageSchema;
  private memoryEmergencyStop: EmergencyStopManager;

  constructor(driver?: IJobStorageDriver) {
    this.driver = driver || new LocalStorageDriver();
    this.memoryEmergencyStop = EmergencyStopManager.getInstance();
    this.schema = this.loadSchema();
    this.syncEmergencyStopFromStorage();
  }

  public static getInstance(driver?: IJobStorageDriver): JobStoreRepository {
    if (!JobStoreRepository.instance) {
      JobStoreRepository.instance = new JobStoreRepository(driver);
    }
    return JobStoreRepository.instance;
  }

  public static resetInstance(): void {
    JobStoreRepository.instance = null;
  }

  /**
   * Initializes or loads the persistent storage schema with version migration.
   */
  private loadSchema(): StorageSchema {
    const raw = this.driver.getItem(STORAGE_KEY_MAIN);
    if (!raw) {
      return this.createEmptySchema();
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return this.createEmptySchema();
      }

      // Check schema version
      const version = parsed.version || 1;
      if (version > CURRENT_SCHEMA_VERSION) {
        throw new IncompatibleSchemaVersionError(version);
      }

      if (version < CURRENT_SCHEMA_VERSION) {
        return this.migrateSchema(parsed, version, CURRENT_SCHEMA_VERSION);
      }

      return parsed as StorageSchema;
    } catch (err) {
      if (err instanceof IncompatibleSchemaVersionError) {
        throw err;
      }
      console.error('[JobStoreRepository] Failed to parse storage schema, creating safe empty store:', err);
      return this.createEmptySchema();
    }
  }

  private createEmptySchema(): StorageSchema {
    const schema: StorageSchema = {
      version: CURRENT_SCHEMA_VERSION,
      jobs: {},
      auditLogs: [],
      leases: {},
      emergencyStop: {
        active: false,
      },
    };
    this.saveSchema(schema);
    return schema;
  }

  private saveSchema(schema?: StorageSchema): void {
    const toSave = schema || this.schema;
    // Security check: verify no secrets
    validateNoSecrets(toSave);
    this.driver.setItem(STORAGE_KEY_MAIN, JSON.stringify(toSave));
  }

  /**
   * Fail-safe schema migration framework (v1 -> v2)
   */
  private migrateSchema(oldData: any, fromVersion: number, toVersion: number): StorageSchema {
    const migrated: StorageSchema = {
      version: toVersion,
      jobs: {},
      auditLogs: Array.isArray(oldData.auditLogs) ? oldData.auditLogs : [],
      leases: {},
      emergencyStop: oldData.emergencyStop || { active: false },
      migratedAt: Date.now(),
    };

    if (oldData.jobs && typeof oldData.jobs === 'object') {
      for (const [jobId, job] of Object.entries(oldData.jobs as Record<string, any>)) {
        migrated.jobs[jobId] = {
          ...job,
          schemaVersion: toVersion,
          retryMetadata: job.retryMetadata || {
            totalAttempts: 1,
            maxAttempts: 3,
          },
          emergencyStopState: job.emergencyStopState || {
            isActive: false,
          },
          auditMetadata: job.auditMetadata || {
            clientVersion: '2.0.0',
            creationSource: 'migration',
            checksum: computeIntegrityHash(jobId),
          },
        };
      }
    }

    // Record migration audit event
    migrated.auditLogs.unshift({
      id: `audit_mig_${Date.now()}`,
      timestamp: Date.now(),
      jobId: 'SYSTEM',
      eventType: 'STATE_TRANSITION',
      previousState: `SCHEMA_V${fromVersion}`,
      newState: `SCHEMA_V${toVersion}`,
      reason: `Automated schema migration from v${fromVersion} to v${toVersion}`,
      integrityHash: computeIntegrityHash({ fromVersion, toVersion }),
    });

    this.saveSchema(migrated);
    return migrated;
  }

  /**
   * Synchronizes EmergencyStopManager state with persistent store on startup
   */
  private syncEmergencyStopFromStorage(): void {
    if (this.schema.emergencyStop.active) {
      this.memoryEmergencyStop.trigger(
        this.schema.emergencyStop.reason || 'Restored active Emergency Stop from persistent store'
      );
    }
  }

  /**
   * Persists EmergencyStop trigger
   */
  public setEmergencyStop(active: boolean, reason?: string): void {
    this.schema.emergencyStop = {
      active,
      reason: reason || (active ? 'Emergency stop triggered' : ''),
      timestamp: Date.now(),
    };

    if (active) {
      this.memoryEmergencyStop.trigger(reason);
      // Invalidate active leases
      this.schema.leases = {};
      // Invalidate pending approvals and halt pending jobs
      for (const job of Object.values(this.schema.jobs)) {
        job.emergencyStopState = {
          isActive: true,
          reason,
          stoppedAt: Date.now(),
        };
        if (job.status === 'WAITING_FOR_APPROVAL' || job.status === 'READY') {
          job.status = 'CANCELLED';
          job.updatedAt = Date.now();
        }
        if (job.approvalRecord && job.approvalRecord.approvalState === 'APPROVED') {
          job.approvalRecord.approvalState = 'INVALIDATED';
          job.approvalRecord.invalidationReason = 'EmergencyStop triggered';
        }
      }
    } else {
      this.memoryEmergencyStop.reset();
      for (const job of Object.values(this.schema.jobs)) {
        job.emergencyStopState = { isActive: false };
      }
    }

    this.recordAuditEvent({
      jobId: 'SYSTEM',
      eventType: active ? 'EMERGENCY_STOP_PERSISTED' : 'EMERGENCY_STOP_CLEARED',
      reason,
      newState: active ? 'STOPPED' : 'NORMAL',
    });

    this.saveSchema();
  }

  // ==========================================
  // Execution Lease Operations (Requirement 15)
  // ==========================================

  public acquireLease(jobId: string, ownerId: string, ttlMs: number = 30000): ExecutionLease {
    const existing = this.schema.leases[jobId];
    const now = Date.now();

    if (existing && existing.ownerId !== ownerId && existing.expiresAt > now) {
      throw new JobConcurrencyConflictError(jobId, existing.ownerId, ownerId);
    }

    const lease: ExecutionLease = {
      jobId,
      ownerId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
    };

    this.schema.leases[jobId] = lease;
    this.recordAuditEvent({
      jobId,
      eventType: 'LEASE_ACQUIRED',
      details: `Lease acquired by owner "${ownerId}" with TTL ${ttlMs}ms`,
    });
    this.saveSchema();
    return lease;
  }

  public renewLease(jobId: string, ownerId: string, ttlMs: number = 30000): ExecutionLease {
    const existing = this.schema.leases[jobId];
    if (!existing || existing.ownerId !== ownerId) {
      throw new JobConcurrencyConflictError(jobId, existing?.ownerId || 'none', ownerId);
    }

    existing.expiresAt = Date.now() + ttlMs;
    this.saveSchema();
    return existing;
  }

  public releaseLease(jobId: string, ownerId: string): void {
    const existing = this.schema.leases[jobId];
    if (existing && existing.ownerId === ownerId) {
      delete this.schema.leases[jobId];
      this.recordAuditEvent({
        jobId,
        eventType: 'LEASE_RELEASED',
        details: `Lease released by owner "${ownerId}"`,
      });
      this.saveSchema();
    }
  }

  public isLeaseActive(jobId: string): boolean {
    const existing = this.schema.leases[jobId];
    return !!existing && existing.expiresAt > Date.now();
  }

  public isLeaseStale(jobId: string): boolean {
    const existing = this.schema.leases[jobId];
    return !!existing && existing.expiresAt <= Date.now();
  }

  // ==========================================
  // Core Job CRUD & State Transitions
  // ==========================================

  public createJob(params: {
    jobId: string;
    normalizedBasePayload: NormalizedContentPayload;
    selectedPlatforms: SupportedPlatform[];
    approvalLevel?: ApprovalLevel;
    mediaReference?: string;
  }): PersistentJob {
    // Security check: verify no secrets in payload
    validateNoSecrets(params.normalizedBasePayload);

    // Amazon Special Rule: Amazon is NEVER a publishing destination
    if (params.selectedPlatforms.includes('amazon')) {
      throw new Error('[Security Invariant Violation] Amazon is NOT a publishing destination. Only product link extraction is supported.');
    }

    const now = Date.now();
    const fingerprint = computeContentFingerprint(params.normalizedBasePayload);

    // Build initial platform execution states
    const platformStates: Record<SupportedPlatform, PlatformExecutionState> = {} as any;
    for (const platform of params.selectedPlatforms) {
      platformStates[platform] = {
        platform,
        status: 'PENDING',
        approvalState: 'PENDING',
        expectedPackage: this.getExpectedPackageForPlatform(platform),
        contentFingerprint: fingerprint,
        attemptCount: 0,
        publicationVerificationState: 'UNVERIFIED',
      };
    }

    const newJob: PersistentJob = {
      jobId: params.jobId,
      createdAt: now,
      updatedAt: now,
      status: 'PENDING',
      approvalLevel: params.approvalLevel || 'PLATFORM_APPROVAL',
      mediaReference: params.mediaReference,
      normalizedBasePayload: sanitizeObject(params.normalizedBasePayload),
      selectedPlatforms: [...params.selectedPlatforms],
      platformExecutionStates: platformStates,
      executionSequence: [...params.selectedPlatforms],
      contentFingerprint: fingerprint,
      retryMetadata: {
        totalAttempts: 0,
        maxAttempts: 3,
      },
      emergencyStopState: {
        isActive: this.schema.emergencyStop.active,
        reason: this.schema.emergencyStop.reason,
      },
      auditMetadata: {
        clientVersion: '2.0.0',
        creationSource: 'ui_composer',
        checksum: computeIntegrityHash({ jobId: params.jobId, fingerprint }),
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };

    this.schema.jobs[params.jobId] = newJob;
    this.recordAuditEvent({
      jobId: params.jobId,
      eventType: 'JOB_CREATED',
      newState: 'PENDING',
      contentFingerprint: fingerprint,
      details: `Created job for platforms: ${params.selectedPlatforms.join(', ')}`,
    });

    this.saveSchema();
    return newJob;
  }

  /**
   * Creates and persists a durable PersistentJob directly from an approved ContentPackage.
   * Strictly enforces approval invariants, copies fingerprints, and links package state.
   */
  public createJobFromContentPackage(
    pkg: ContentPackage,
    options?: {
      jobId?: string;
      approvalLevel?: ApprovalLevel;
    }
  ): PersistentJob {
    if (pkg.reviewState !== 'APPROVED' || pkg.approvalState !== 'APPROVED') {
      throw new Error(
        `[Persistence Security Invariant Violation] Cannot create PersistentJob from ContentPackage "${pkg.contentId}" with state '${pkg.reviewState}'. Package must be explicitly APPROVED.`
      );
    }

    if (pkg.selectedPlatforms.includes('amazon')) {
      throw new Error(
        '[Security Invariant Violation] Amazon is NOT a publishing destination. Only product link extraction is supported.'
      );
    }

    const jobId = options?.jobId || `job_${pkg.contentId}_${Date.now()}`;
    const approvalLevel: ApprovalLevel = options?.approvalLevel || 'PLATFORM_APPROVAL';

    const normalizedBasePayload: NormalizedContentPayload = {
      text: pkg.baseCaption || pkg.description,
      title: pkg.title,
      description: pkg.description,
      hashtags: pkg.hashtags,
      mediaUri: pkg.mediaAssets[0]?.localUri,
      videoUri: pkg.mediaAssets.find(a => a.mediaType === 'VIDEO')?.localUri,
      imageUri: pkg.mediaAssets.find(a => a.mediaType === 'IMAGE')?.localUri,
      metadata: {
        contentId: pkg.contentId,
        sourceType: pkg.sourceType,
        sourceReference: pkg.sourceReference,
      },
    };

    const newJob = this.createJob({
      jobId,
      normalizedBasePayload,
      selectedPlatforms: pkg.selectedPlatforms,
      approvalLevel,
      mediaReference: pkg.mediaAssets[0]?.localUri,
    });

    // Populate Step 2J metadata and fingerprints
    const overrideFps: Record<string, string> = {};
    for (const [p, o] of Object.entries(pkg.platformOverrides)) {
      if (o?.overrideFingerprint) {
        overrideFps[p] = o.overrideFingerprint;
      }
    }

    newJob.contentFingerprint = pkg.contentFingerprint;
    newJob.mediaFingerprint = pkg.mediaFingerprint;
    newJob.contentPackageId = pkg.contentId;
    newJob.contentValidationState = pkg.validationState;
    newJob.contentReviewState = pkg.reviewState;
    newJob.platformOverrideFingerprints = overrideFps;

    // Persist approval record if approved
    if (pkg.currentApproval) {
      newJob.approvalRecord = {
        approvalLevel,
        approvalState: 'APPROVED',
        approvalTimestamp: pkg.currentApproval.approvedAt,
        approvedJobFingerprint: pkg.currentApproval.contentFingerprint,
        approvalSessionId: pkg.currentApproval.approvalSessionId,
        approvedBy: pkg.currentApproval.approvedBy || 'Operator',
      };
    }

    this.schema.jobs[jobId] = newJob;
    this.saveSchema();

    this.recordAuditEvent({
      jobId,
      eventType: 'JOB_CREATED',
      newState: newJob.status,
      contentFingerprint: pkg.contentFingerprint,
      details: `Created PersistentJob from ContentPackage "${pkg.contentId}" with approval session "${pkg.currentApproval?.approvalSessionId || 'none'}"`,
    });

    return newJob;
  }

  public getJob(jobId: string): PersistentJob | undefined {
    return this.schema.jobs[jobId];
  }

  public listJobs(filter?: {
    status?: PersistentJobStatus;
    platform?: SupportedPlatform;
  }): PersistentJob[] {
    let list = Object.values(this.schema.jobs);
    if (filter?.status) {
      list = list.filter(j => j.status === filter.status);
    }
    if (filter?.platform) {
      list = list.filter(j => j.selectedPlatforms.includes(filter.platform!));
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public updateJob(job: PersistentJob): PersistentJob {
    validateNoSecrets(job);
    job.updatedAt = Date.now();
    this.schema.jobs[job.jobId] = job;
    this.saveSchema();
    return job;
  }

  public deleteJob(jobId: string): boolean {
    const job = this.schema.jobs[jobId];
    if (!job) return false;

    // Safety Invariant: cannot delete UNKNOWN or active jobs needed for audit reconciliation
    if (job.status === 'RUNNING' || job.status === 'UNKNOWN') {
      throw new Error(`Cannot delete job "${jobId}" while in ${job.status} state. Reconcile or cancel first.`);
    }

    delete this.schema.jobs[jobId];
    delete this.schema.leases[jobId];
    this.recordAuditEvent({
      jobId,
      eventType: 'JOB_ARCHIVED',
      details: `Job "${jobId}" purged from active store.`,
    });
    this.saveSchema();
    return true;
  }

  // ==========================================
  // Platform Status Mutations
  // ==========================================

  public markPlatformRunning(jobId: string, platform: SupportedPlatform, checkpoint?: SafeCheckpoint): void {
    const job = this.schema.jobs[jobId];
    if (!job) throw new Error(`Job "${jobId}" not found`);

    const pState = job.platformExecutionStates[platform];
    if (!pState) throw new Error(`Platform "${platform}" not configured in job "${jobId}"`);

    JobStateTransitionValidator.validatePlatformTransition(
      pState.status,
      'RUNNING',
      this.schema.emergencyStop.active
    );

    const prevJobStatus = job.status;
    JobStateTransitionValidator.validateJobTransition(job.status, 'RUNNING', this.schema.emergencyStop.active);

    pState.status = 'RUNNING';
    pState.startedAt = Date.now();
    pState.attemptCount += 1;
    if (checkpoint) pState.lastSafeCheckpoint = checkpoint;

    job.status = 'RUNNING';
    job.currentPlatform = platform;
    job.updatedAt = Date.now();

    this.recordAuditEvent({
      jobId,
      platform,
      previousState: prevJobStatus,
      newState: 'RUNNING',
      eventType: 'PLATFORM_STARTED',
      details: checkpoint ? `Checkpoint: ${checkpoint}` : undefined,
    });

    this.saveSchema();
  }

  public markPlatformCompleted(
    jobId: string,
    platform: SupportedPlatform,
    checkpoint: SafeCheckpoint = 'PUBLICATION_CONFIRMED',
    isReconciliation: boolean = false
  ): void {
    const job = this.schema.jobs[jobId];
    if (!job) throw new Error(`Job "${jobId}" not found`);

    const pState = job.platformExecutionStates[platform];
    if (!pState) throw new Error(`Platform "${platform}" not in job`);

    JobStateTransitionValidator.validatePlatformTransition(pState.status, 'PUBLISHED', false, isReconciliation);

    pState.status = 'PUBLISHED';
    pState.completedAt = Date.now();
    pState.lastSafeCheckpoint = checkpoint;
    pState.publicationVerificationState = 'VERIFIED';

    // Record in PublicationGuard for local idempotency
    PublicationGuard.getInstance().recordPublication(jobId, platform, pState.contentFingerprint);

    // Evaluate overall job status
    const allPlatforms = Object.values(job.platformExecutionStates);
    const allPublished = allPlatforms.every(p => p.status === 'PUBLISHED');
    const prevStatus = job.status;

    if (allPublished) {
      job.status = 'PUBLISHED';
      job.currentPlatform = null;
    } else {
      job.status = 'PARTIALLY_PUBLISHED';
    }
    job.updatedAt = Date.now();

    this.recordAuditEvent({
      jobId,
      platform,
      previousState: prevStatus,
      newState: pState.status,
      eventType: 'PLATFORM_COMPLETED',
      details: `Published to ${platform} at checkpoint ${checkpoint}`,
    });

    this.saveSchema();
  }

  public markPlatformFailed(jobId: string, platform: SupportedPlatform, errorCode: string, checkpoint?: SafeCheckpoint): void {
    const job = this.schema.jobs[jobId];
    if (!job) throw new Error(`Job "${jobId}" not found`);

    const pState = job.platformExecutionStates[platform];
    if (!pState) throw new Error(`Platform "${platform}" not in job`);

    JobStateTransitionValidator.validatePlatformTransition(pState.status, 'FAILED', false);

    pState.status = 'FAILED';
    pState.lastErrorCode = errorCode;
    if (checkpoint) pState.lastSafeCheckpoint = checkpoint;
    pState.publicationVerificationState = 'FAILED_VERIFICATION';

    job.status = 'FAILED';
    job.updatedAt = Date.now();

    this.recordAuditEvent({
      jobId,
      platform,
      previousState: 'RUNNING',
      newState: 'FAILED',
      eventType: 'PLATFORM_FAILED',
      reason: errorCode,
    });

    this.saveSchema();
  }

  public markPlatformUnknown(jobId: string, platform: SupportedPlatform, reason: string, checkpoint?: SafeCheckpoint): void {
    const job = this.schema.jobs[jobId];
    if (!job) throw new Error(`Job "${jobId}" not found`);

    const pState = job.platformExecutionStates[platform];
    if (!pState) throw new Error(`Platform "${platform}" not in job`);

    JobStateTransitionValidator.validatePlatformTransition(pState.status, 'UNKNOWN', false);

    pState.status = 'UNKNOWN';
    pState.errorMessage = reason;
    if (checkpoint) pState.lastSafeCheckpoint = checkpoint;
    pState.publicationVerificationState = 'PENDING_VERIFICATION';

    job.status = 'UNKNOWN';
    job.updatedAt = Date.now();

    this.recordAuditEvent({
      jobId,
      platform,
      previousState: 'RUNNING',
      newState: 'UNKNOWN',
      eventType: 'PLATFORM_UNKNOWN',
      reason,
      details: 'Platform execution interrupted. Safety invariant requires safe reconciliation.',
    });

    this.saveSchema();
  }

  public cancelJob(jobId: string, reason: string): void {
    const job = this.schema.jobs[jobId];
    if (!job) throw new Error(`Job "${jobId}" not found`);

    JobStateTransitionValidator.validateJobTransition(job.status, 'CANCELLED', false);

    job.status = 'CANCELLED';
    job.currentPlatform = null;
    job.updatedAt = Date.now();

    // Cancel all incomplete platform steps
    for (const p of Object.values(job.platformExecutionStates)) {
      if (p.status !== 'PUBLISHED') {
        p.status = 'CANCELLED';
        p.errorMessage = reason;
      }
    }

    delete this.schema.leases[jobId];

    this.recordAuditEvent({
      jobId,
      eventType: 'JOB_CANCELLED',
      newState: 'CANCELLED',
      reason,
    });

    this.saveSchema();
  }

  public recordCheckpoint(jobId: string, platform: SupportedPlatform, checkpoint: SafeCheckpoint): void {
    const job = this.schema.jobs[jobId];
    if (!job) return;

    const pState = job.platformExecutionStates[platform];
    if (!pState) return;

    pState.lastSafeCheckpoint = checkpoint;
    job.updatedAt = Date.now();

    this.recordAuditEvent({
      jobId,
      platform,
      eventType: 'CHECKPOINT_REACHED',
      details: checkpoint,
    });

    this.saveSchema();
  }

  // ==========================================
  // Approval Persistence & Invalidation (Req 8)
  // ==========================================

  public recordApproval(jobId: string, approval: PersistentApprovalRecord): void {
    const job = this.schema.jobs[jobId];
    if (!job) throw new Error(`Job "${jobId}" not found`);

    validateNoSecrets(approval);

    // Bind approval to exact content fingerprint
    if (approval.approvedJobFingerprint !== job.contentFingerprint) {
      throw new Error(`[Security Invariant Violation] Approval fingerprint "${approval.approvedJobFingerprint}" does not match job content fingerprint "${job.contentFingerprint}".`);
    }

    job.approvalRecord = approval;
    job.updatedAt = Date.now();

    if (approval.approvedPlatform) {
      const p = job.platformExecutionStates[approval.approvedPlatform];
      if (p) p.approvalState = approval.approvalState;
    }

    this.recordAuditEvent({
      jobId,
      platform: approval.approvedPlatform,
      eventType: 'APPROVAL_CREATED',
      contentFingerprint: approval.approvedJobFingerprint,
      details: `Approval granted for ${approval.approvedPlatform || 'ALL'}`,
    });

    this.saveSchema();
  }

  public invalidateApproval(jobId: string, reason: string): void {
    const job = this.schema.jobs[jobId];
    if (!job || !job.approvalRecord) return;

    job.approvalRecord.approvalState = 'INVALIDATED';
    job.approvalRecord.invalidationReason = reason;
    job.updatedAt = Date.now();

    for (const p of Object.values(job.platformExecutionStates)) {
      if (p.approvalState === 'APPROVED') {
        p.approvalState = 'INVALIDATED';
      }
    }

    this.recordAuditEvent({
      jobId,
      eventType: 'APPROVAL_INVALIDATED',
      reason,
    });

    this.saveSchema();
  }

  // ==========================================
  // Audit Trail & Clean-up (Req 13, 16)
  // ==========================================

  public recordAuditEvent(event: Omit<PersistentAuditEvent, 'id' | 'timestamp' | 'integrityHash'>): PersistentAuditEvent {
    validateNoSecrets(event);
    const fullEvent: PersistentAuditEvent = {
      ...event,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      integrityHash: computeIntegrityHash(event),
    };

    this.schema.auditLogs.unshift(fullEvent);
    // Keep bounded history of last 1000 logs
    if (this.schema.auditLogs.length > 1000) {
      this.schema.auditLogs.length = 1000;
    }

    return fullEvent;
  }

  public getAuditHistory(jobId?: string): PersistentAuditEvent[] {
    if (jobId) {
      return this.schema.auditLogs.filter(l => l.jobId === jobId);
    }
    return [...this.schema.auditLogs];
  }

  /**
   * Cleans up completed/cancelled jobs older than retention window.
   * Safety Invariant: UNKNOWN, active, and failed jobs needed for audit are preserved.
   */
  public clearCompletedJobs(retentionMs: number = 86400000): number {
    const cutoff = Date.now() - retentionMs;
    let purgedCount = 0;

    for (const [jobId, job] of Object.entries(this.schema.jobs)) {
      if ((job.status === 'PUBLISHED' || job.status === 'CANCELLED') && job.updatedAt < cutoff) {
        delete this.schema.jobs[jobId];
        delete this.schema.leases[jobId];
        purgedCount++;
      }
    }

    if (purgedCount > 0) {
      this.saveSchema();
    }
    return purgedCount;
  }

  private getExpectedPackageForPlatform(platform: SupportedPlatform): string {
    const map: Record<SupportedPlatform, string> = {
      instagram: 'com.instagram.android',
      facebook: 'com.facebook.katana',
      youtube: 'com.google.android.youtube',
      tiktok: 'com.zhiliaoapp.musically',
      pinterest: 'com.pinterest',
      x: 'com.twitter.android',
      threads: 'com.instagram.barcelona',
      linkedin: 'com.linkedin.android',
      amazon: 'com.amazon.mShop.android.shopping',
    };
    return map[platform] || 'unknown.package';
  }

  // --- Step 2K Product Research & Intelligence Persistence ---

  public saveProduct(product: any): void {
    if (!this.schema.products) {
      this.schema.products = {};
    }
    const key = product.dataFingerprint || product.productId || `prod_${Date.now()}`;
    const serialized = JSON.parse(JSON.stringify(product));
    this.schema.products[key] = serialized;
    if (product.dataFingerprint) {
      this.schema.products[product.dataFingerprint] = serialized;
    }
    if (product.productId) {
      this.schema.products[product.productId] = serialized;
    }
    this.saveSchema();
  }

  public getProduct(key: string): any | null {
    if (!this.schema.products) return null;
    return this.schema.products[key] || null;
  }

  public saveProductApproval(approval: any): void {
    if (!this.schema.productApprovals) {
      this.schema.productApprovals = {};
    }
    this.schema.productApprovals[approval.approvalId] = JSON.parse(JSON.stringify(approval));
    this.saveSchema();
  }

  public getProductApproval(approvalId: string): any | null {
    if (!this.schema.productApprovals) return null;
    return this.schema.productApprovals[approvalId] || null;
  }

  public saveResearchSession(session: any): void {
    if (!this.schema.researchSessions) {
      this.schema.researchSessions = {};
    }
    this.schema.researchSessions[session.sessionId] = {
      sessionId: session.sessionId,
      state: session.state || (typeof session.getState === 'function' ? session.getState() : 'CREATED'),
      request: session.request,
      candidates: session.candidates || (typeof session.getCandidates === 'function' ? session.getCandidates() : []),
      productData: session.productData || (typeof session.getProductData === 'function' ? session.getProductData() : undefined),
      recoveryAttempts: session.recoveryAttempts || (typeof session.getRecoveryAttempts === 'function' ? session.getRecoveryAttempts() : 0),
      createdAt: session.createdAt || Date.now(),
    };
    this.saveSchema();
  }

  public getResearchSession(sessionId: string): any | null {
    if (!this.schema.researchSessions) return null;
    return this.schema.researchSessions[sessionId] || null;
  }
}

export { JobStoreRepository as PersistentJobStore };


