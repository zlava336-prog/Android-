/**
 * Phone Agent - Step 2J Content Pipeline State Machine
 * Strictly enforces lifecycle transitions from DRAFT to EXECUTING and COMPLETED.
 * Guarantees that DRAFT, NEEDS_REVIEW, REJECTED, or STALE_APPROVAL content cannot execute.
 */

import { ContentPipelineState } from './ContentPackage';
import { LocalActionLogger } from '../logger';

export class ContentPipelineTransitionError extends Error {
  readonly fromState: ContentPipelineState;
  readonly toState: ContentPipelineState;

  constructor(fromState: ContentPipelineState, toState: ContentPipelineState, reason?: string) {
    super(
      `[Content Pipeline State Machine Invariant Violation] Illegal transition from '${fromState}' to '${toState}'. ${reason || ''}`
    );
    this.name = 'ContentPipelineTransitionError';
    this.fromState = fromState;
    this.toState = toState;
  }
}

/**
 * Valid allowed transitions for ContentPipelineState.
 */
export const ALLOWED_PIPELINE_TRANSITIONS: Record<ContentPipelineState, Set<ContentPipelineState>> = {
  DRAFT: new Set(['VALIDATING', 'CANCELLED']),
  VALIDATING: new Set(['VALIDATING', 'VALIDATION_FAILED', 'NEEDS_REVIEW', 'READY_FOR_REVIEW', 'DRAFT', 'CANCELLED']),
  VALIDATION_FAILED: new Set(['DRAFT', 'VALIDATING', 'CANCELLED']),
  NEEDS_REVIEW: new Set(['DRAFT', 'VALIDATING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED']),
  READY_FOR_REVIEW: new Set(['DRAFT', 'VALIDATING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'CANCELLED']),
  APPROVED: new Set(['PLANNED', 'WAITING_FOR_APPROVAL', 'STALE_APPROVAL', 'REJECTED', 'DRAFT', 'CANCELLED']),
  PLANNED: new Set(['WAITING_FOR_APPROVAL', 'EXECUTING', 'STALE_APPROVAL', 'REJECTED', 'CANCELLED']),
  WAITING_FOR_APPROVAL: new Set(['EXECUTING', 'APPROVED', 'STALE_APPROVAL', 'REJECTED', 'CANCELLED']),
  EXECUTING: new Set(['COMPLETED', 'VALIDATION_FAILED', 'STALE_APPROVAL', 'CANCELLED']),
  COMPLETED: new Set(['DRAFT']), // Can clone or create new draft
  REJECTED: new Set(['DRAFT', 'VALIDATING', 'CANCELLED']),
  STALE_APPROVAL: new Set(['DRAFT', 'VALIDATING', 'NEEDS_REVIEW', 'READY_FOR_REVIEW', 'CANCELLED']),
  CANCELLED: new Set(['DRAFT']),
};

export class ContentPipelineStateMachine {
  private static instance: ContentPipelineStateMachine | null = null;

  public static getInstance(): ContentPipelineStateMachine {
    if (!ContentPipelineStateMachine.instance) {
      ContentPipelineStateMachine.instance = new ContentPipelineStateMachine();
    }
    return ContentPipelineStateMachine.instance;
  }

  /**
   * Checks if transition is structurally permitted.
   */
  public canTransition(from: ContentPipelineState, to: ContentPipelineState): boolean {
    const allowed = ALLOWED_PIPELINE_TRANSITIONS[from];
    return Boolean(allowed && allowed.has(to));
  }

  /**
   * Validates and asserts that the transition satisfies all state invariants.
   * Throws ContentPipelineTransitionError if illegal.
   */
  public validateTransition(
    from: ContentPipelineState,
    to: ContentPipelineState,
    context?: { contentId?: string; reason?: string }
  ): void {
    // 1. Direct forbidden checks
    if (to === 'EXECUTING') {
      if (from === 'DRAFT') {
        throw new ContentPipelineTransitionError(
          from,
          to,
          'Direct execution from DRAFT is strictly forbidden. Content must be validated, reviewed, and explicitly approved.'
        );
      }
      if (from === 'NEEDS_REVIEW') {
        throw new ContentPipelineTransitionError(
          from,
          to,
          'Content marked as NEEDS_REVIEW cannot execute. Unresolved claim warnings or incomplete data must be resolved and approved.'
        );
      }
      if (from === 'STALE_APPROVAL') {
        throw new ContentPipelineTransitionError(
          from,
          to,
          'Stale approved content cannot execute. Content or media modifications require re-approval.'
        );
      }
      if (from === 'REJECTED') {
        throw new ContentPipelineTransitionError(
          from,
          to,
          'Rejected content cannot execute. It must return to DRAFT or re-validation.'
        );
      }
      if (from === 'VALIDATION_FAILED') {
        throw new ContentPipelineTransitionError(
          from,
          to,
          'Content with failed validation cannot execute.'
        );
      }
    }

    if (!this.canTransition(from, to)) {
      throw new ContentPipelineTransitionError(
        from,
        to,
        `Transition from '${from}' to '${to}' is not permitted by pipeline invariants.`
      );
    }

    if (context?.contentId) {
      LocalActionLogger.getInstance().log({
        action: 'PIPELINE_STATE_TRANSITION',
        details: `ContentPackage "${context.contentId}" transitioned: ${from} -> ${to} ${context.reason ? `(${context.reason})` : ''}`,
        severity: 'INFO',
        safetyCheckPassed: true,
      });
    }
  }
}
