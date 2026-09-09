/**
 * Phone Agent - Step 2K Product Research Session & State Machine
 * Strictly deterministic lifecycle controller for autonomous Amazon product research.
 * Enforces legal state transitions, terminal safety locks, and recovery limits.
 */

import { ProductData } from './ProductData';
import { ProductCandidate, ProductResearchRequest } from './ProductCandidate';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';

export type ProductResearchState =
  | 'CREATED'
  | 'VALIDATING'
  | 'OPENING_AMAZON'
  | 'VERIFYING_AMAZON'
  | 'SEARCHING'
  | 'PRODUCT_CANDIDATE_FOUND'
  | 'EXTRACTING_VISIBLE_DATA'
  | 'VALIDATING_DATA'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'COMPLETED'
  // Terminal / Error states
  | 'CANCELLED'
  | 'FAILED'
  | 'EMERGENCY_STOPPED'
  | 'BLOCKED'
  | 'STALE';

export interface ResearchStateTransitionEvent {
  from: ProductResearchState;
  to: ProductResearchState;
  reason: string;
  timestamp: number;
}

export class ProductResearchStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<ProductResearchState, ProductResearchState[]> = {
    CREATED: ['VALIDATING', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    VALIDATING: ['OPENING_AMAZON', 'BLOCKED', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    OPENING_AMAZON: ['VERIFYING_AMAZON', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    VERIFYING_AMAZON: ['SEARCHING', 'BLOCKED', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    SEARCHING: ['PRODUCT_CANDIDATE_FOUND', 'SEARCHING', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    PRODUCT_CANDIDATE_FOUND: ['EXTRACTING_VISIBLE_DATA', 'SEARCHING', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    EXTRACTING_VISIBLE_DATA: ['VALIDATING_DATA', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    VALIDATING_DATA: ['NEEDS_REVIEW', 'BLOCKED', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED'],
    NEEDS_REVIEW: ['APPROVED', 'CANCELLED', 'EMERGENCY_STOPPED', 'FAILED', 'STALE'],
    APPROVED: ['COMPLETED', 'STALE', 'CANCELLED', 'EMERGENCY_STOPPED'],
    COMPLETED: [],
    CANCELLED: [],
    FAILED: [],
    EMERGENCY_STOPPED: [],
    BLOCKED: ['CANCELLED', 'FAILED'],
    STALE: ['CANCELLED', 'FAILED'],
  };

  /**
   * Validates if a transition is legal according to state machine invariants.
   */
  public static canTransition(from: ProductResearchState, to: ProductResearchState): boolean {
    if (from === to) return true;

    // Safety Invariant: Emergency Stop active permanently blocks active state transitions
    if (EmergencyStopManager.getInstance().isActive()) {
      return to === 'EMERGENCY_STOPPED';
    }

    // Safety Invariant: FAILED or STALE can NEVER transition to APPROVED directly
    if ((from === 'FAILED' || from === 'STALE') && to === 'APPROVED') {
      return false;
    }

    // Safety Invariant: EMERGENCY_STOPPED is terminal; requires a fresh session
    if (from === 'EMERGENCY_STOPPED') {
      return false;
    }

    const allowed = this.ALLOWED_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }
}

export class ProductResearchSession {
  readonly sessionId: string;
  readonly request: ProductResearchRequest;
  private state: ProductResearchState = 'CREATED';
  private history: ResearchStateTransitionEvent[] = [];
  private candidates: ProductCandidate[] = [];
  private selectedCandidate?: ProductCandidate;
  private productData?: ProductData;
  private recoveryAttempts: number = 0;
  private maxRecoveryAttempts: number = 2;
  readonly createdAt: number;
  private updatedAt: number;

  constructor(sessionId: string, request: ProductResearchRequest) {
    this.sessionId = sessionId;
    this.request = request;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  public getState(): ProductResearchState {
    return this.state;
  }

  public getHistory(): ResearchStateTransitionEvent[] {
    return [...this.history];
  }

  public getCandidates(): ProductCandidate[] {
    return [...this.candidates];
  }

  public getSelectedCandidate(): ProductCandidate | undefined {
    return this.selectedCandidate;
  }

  public getProductData(): ProductData | undefined {
    return this.productData;
  }

  public getRecoveryAttempts(): number {
    return this.recoveryAttempts;
  }

  public setCandidates(candidates: ProductCandidate[]): void {
    this.candidates = [...candidates];
  }

  public setSelectedCandidate(candidate: ProductCandidate): void {
    this.selectedCandidate = candidate;
  }

  public setProductData(product: ProductData): void {
    this.productData = product;
  }

  /**
   * Transitions to a new state if invariants pass.
   */
  public transitionTo(to: ProductResearchState, reason: string): boolean {
    if (this.state === to) return true;

    if (!ProductResearchStateMachine.canTransition(this.state, to)) {
      const errorMsg = `Illegal state transition in research session "${this.sessionId}": "${this.state}" -> "${to}". Reason: ${reason}`;
      LocalActionLogger.getInstance().log({
        platform: 'amazon',
        action: 'RESEARCH_STATE_TRANSITION_REJECTED',
        details: errorMsg,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      throw new Error(errorMsg);
    }

    const from = this.state;
    this.state = to;
    this.updatedAt = Date.now();
    this.history.push({
      from,
      to,
      reason,
      timestamp: this.updatedAt,
    });

    LocalActionLogger.getInstance().log({
      platform: 'amazon',
      action: 'RESEARCH_STATE_TRANSITION',
      details: `Research session "${this.sessionId}" transitioned "${from}" -> "${to}": ${reason}`,
      severity: to === 'EMERGENCY_STOPPED' ? 'SECURITY' : 'INFO',
      safetyCheckPassed: true,
    });

    return true;
  }

  /**
   * Attempts crash recovery with maximum 2 consecutive attempts.
   */
  public attemptRecovery(lastError: string): boolean {
    if (EmergencyStopManager.getInstance().isActive()) {
      this.transitionTo('EMERGENCY_STOPPED', 'Emergency Stop active during recovery attempt');
      return false;
    }

    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      const reason = `Maximum recovery attempts (${this.maxRecoveryAttempts}) exceeded for research session "${this.sessionId}". Error: ${lastError}`;
      EmergencyStopManager.getInstance().trigger(reason);
      this.transitionTo('EMERGENCY_STOPPED', reason);
      return false;
    }

    this.recoveryAttempts++;
    LocalActionLogger.getInstance().log({
      platform: 'amazon',
      action: 'RESEARCH_RECOVERY_ATTEMPT',
      details: `Attempting research recovery (${this.recoveryAttempts}/${this.maxRecoveryAttempts}) for state "${this.state}". Reason: ${lastError}`,
      severity: 'WARN',
      safetyCheckPassed: true,
    });

    return true;
  }
}
