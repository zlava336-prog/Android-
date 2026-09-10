/**
 * Phone Agent - Step 2N Orchestration Audit Manager
 * Cryptographic audit chaining and strict credential sanitization.
 * Never persists or logs passwords, OTPs, tokens, API keys, or payment data.
 */

import { sha256 } from '../content/ContentFingerprint';
import { LocalActionLogger } from '../logger';
import { OrchestrationState } from './OrchestrationState';
import { OrchestrationStepType } from './OrchestrationStep';

export interface AuditEvent {
  eventId: string;
  jobId: string;
  previousState: OrchestrationState;
  newState: OrchestrationState;
  step?: OrchestrationStepType;
  action: string;
  actor: string;
  timestamp: number;
  fingerprintChainHash: string;
  hash: string;
  previousHash: string;
  safetyCheckPassed: boolean;
  approvalReference?: string;
  details: string;
}

const SENSITIVE_PATTERNS = [
  /password["':\s=]+([^"',\s&]+)/gi,
  /otp["':\s=]+([^"',\s&]+)/gi,
  /pin["':\s=]+([^"',\s&]+)/gi,
  /token["':\s=]+([^"',\s&]+)/gi,
  /api[_-]?key["':\s=]+([^"',\s&]+)/gi,
  /bearer\s+[A-Za-z0-9_\-\.]+/gi,
  /card["':\s=]+(\d{12,19})/gi,
  /cvv["':\s=]+(\d{3,4})/gi,
];

export class OrchestrationAuditManager {
  private static instance: OrchestrationAuditManager | null = null;
  private logger = LocalActionLogger.getInstance();
  private auditChain: AuditEvent[] = [];
  private lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

  public static getInstance(): OrchestrationAuditManager {
    if (!OrchestrationAuditManager.instance) {
      OrchestrationAuditManager.instance = new OrchestrationAuditManager();
    }
    return OrchestrationAuditManager.instance;
  }

  public static resetInstance(): void {
    OrchestrationAuditManager.instance = null;
  }

  /**
   * Sanitizes text to strictly purge any credential or secret leaks.
   */
  public sanitize(text: string): string {
    let sanitized = text;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }

  /**
   * Records a cryptographically chained audit event.
   */
  public recordEvent(params: {
    jobId: string;
    previousState: OrchestrationState;
    newState: OrchestrationState;
    step?: OrchestrationStepType;
    action: string;
    actor: string;
    safetyCheckPassed: boolean;
    approvalReference?: string;
    details: string;
  }): AuditEvent {
    const sanitizedDetails = this.sanitize(params.details);
    const now = Date.now();
    const eventId = `audit_${params.jobId}_${now}_${this.auditChain.length + 1}`;

    const previousHash = this.lastHash;
    const chainPayload = `${this.lastHash}|${eventId}|${params.jobId}|${params.previousState}|${params.newState}|${params.action}|${params.actor}|${now}|${sanitizedDetails}`;
    const fingerprintChainHash = sha256(chainPayload);
    this.lastHash = fingerprintChainHash;

    const event: AuditEvent = {
      eventId,
      jobId: params.jobId,
      previousState: params.previousState,
      newState: params.newState,
      step: params.step,
      action: params.action,
      actor: params.actor,
      timestamp: now,
      fingerprintChainHash,
      hash: fingerprintChainHash,
      previousHash,
      safetyCheckPassed: params.safetyCheckPassed,
      approvalReference: params.approvalReference,
      details: sanitizedDetails,
    };

    this.auditChain.push(event);

    this.logger.log({
      action: `ORCH_${params.action}`,
      details: `[${params.previousState} -> ${params.newState}] ${sanitizedDetails} (Chain: ${fingerprintChainHash.slice(0, 10)})`,
      severity: params.safetyCheckPassed ? 'INFO' : 'SECURITY',
      safetyCheckPassed: params.safetyCheckPassed,
    });

    return event;
  }

  public getEvents(jobId?: string): AuditEvent[] {
    if (jobId) {
      return this.auditChain.filter(e => e.jobId === jobId);
    }
    return [...this.auditChain];
  }

  public verifyChainIntegrity(): boolean {
    let currentHash = '0000000000000000000000000000000000000000000000000000000000000000';
    for (const event of this.auditChain) {
      const computed = sha256(
        `${currentHash}|${event.eventId}|${event.jobId}|${event.previousState}|${event.newState}|${event.action}|${event.actor}|${event.timestamp}|${event.details}`
      );
      if (computed !== event.fingerprintChainHash) {
        return false;
      }
      currentHash = computed;
    }
    return true;
  }

  public restoreChain(events: AuditEvent[]): void {
    this.auditChain = [...events];
    if (events.length > 0) {
      this.lastHash = events[events.length - 1].fingerprintChainHash;
    }
  }
}
