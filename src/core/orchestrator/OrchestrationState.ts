/**
 * Phone Agent - Step 2N Master AI Orchestrator States
 * Strictly typed enumeration of all lifecycle states for the master orchestrator.
 * No arbitrary string states allowed.
 */

export type OrchestrationState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'RESEARCHING'
  | 'WAITING_FOR_PRODUCT_REVIEW'
  | 'GENERATING_CONTENT'
  | 'WAITING_FOR_CONTENT_REVIEW'
  | 'CREATING_VIDEO'
  | 'RENDERING_VIDEO'
  | 'WAITING_FOR_VIDEO_REVIEW'
  | 'CAPTURING_AMAZON_LINK'
  | 'PLANNING_PLATFORMS'
  | 'WAITING_FOR_PUBLISH_APPROVAL'
  | 'EXECUTING_PLATFORM'
  | 'VERIFYING_PUBLICATION'
  | 'RECONCILING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'EMERGENCY_STOPPED';

/**
 * Complete state transition matrix defining valid directed edges.
 */
export const VALID_STATE_TRANSITIONS: Record<OrchestrationState, OrchestrationState[]> = {
  IDLE: ['INITIALIZING', 'CANCELLED', 'EMERGENCY_STOPPED'],
  INITIALIZING: ['RESEARCHING', 'CAPTURING_AMAZON_LINK', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  RESEARCHING: ['WAITING_FOR_PRODUCT_REVIEW', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  WAITING_FOR_PRODUCT_REVIEW: ['GENERATING_CONTENT', 'RESEARCHING', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  GENERATING_CONTENT: ['WAITING_FOR_CONTENT_REVIEW', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  WAITING_FOR_CONTENT_REVIEW: ['CREATING_VIDEO', 'PLANNING_PLATFORMS', 'GENERATING_CONTENT', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  CREATING_VIDEO: ['RENDERING_VIDEO', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  RENDERING_VIDEO: ['WAITING_FOR_VIDEO_REVIEW', 'FAILED', 'CANCELLED', 'UNKNOWN', 'EMERGENCY_STOPPED'],
  WAITING_FOR_VIDEO_REVIEW: ['CAPTURING_AMAZON_LINK', 'PLANNING_PLATFORMS', 'CREATING_VIDEO', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  CAPTURING_AMAZON_LINK: ['PLANNING_PLATFORMS', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  PLANNING_PLATFORMS: ['WAITING_FOR_PUBLISH_APPROVAL', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  WAITING_FOR_PUBLISH_APPROVAL: ['EXECUTING_PLATFORM', 'PLANNING_PLATFORMS', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  EXECUTING_PLATFORM: ['VERIFYING_PUBLICATION', 'EXECUTING_PLATFORM', 'FAILED', 'PARTIALLY_COMPLETED', 'UNKNOWN', 'CANCELLED', 'EMERGENCY_STOPPED'],
  VERIFYING_PUBLICATION: ['EXECUTING_PLATFORM', 'COMPLETED', 'PARTIALLY_COMPLETED', 'RECONCILING', 'FAILED', 'UNKNOWN', 'EMERGENCY_STOPPED'],
  RECONCILING: ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'UNKNOWN', 'EMERGENCY_STOPPED'],
  COMPLETED: [],
  PARTIALLY_COMPLETED: ['RECONCILING', 'EXECUTING_PLATFORM', 'FAILED', 'CANCELLED', 'EMERGENCY_STOPPED'],
  FAILED: ['INITIALIZING', 'RECONCILING', 'EMERGENCY_STOPPED'],
  CANCELLED: ['INITIALIZING'],
  UNKNOWN: ['RECONCILING', 'FAILED', 'EMERGENCY_STOPPED'],
  EMERGENCY_STOPPED: ['IDLE', 'FAILED'], // Can only reset to IDLE or FAILED after explicit emergency stop reset
};

/**
 * Checks if a transition between two states is valid according to the formal state machine.
 */
export function isValidStateTransition(from: OrchestrationState, to: OrchestrationState): boolean {
  if (from === to) return true; // Idempotent self-transition
  // Emergency stop can interrupt any non-terminal state
  if (to === 'EMERGENCY_STOPPED') {
    return from !== 'COMPLETED' && from !== 'CANCELLED';
  }
  const allowed = VALID_STATE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Returns whether a state is a human approval gate.
 */
export function isApprovalGateState(state: OrchestrationState): boolean {
  return (
    state === 'WAITING_FOR_PRODUCT_REVIEW' ||
    state === 'WAITING_FOR_CONTENT_REVIEW' ||
    state === 'WAITING_FOR_VIDEO_REVIEW' ||
    state === 'WAITING_FOR_PUBLISH_APPROVAL'
  );
}

/**
 * Returns whether a state is terminal.
 */
export function isTerminalState(state: OrchestrationState): boolean {
  return state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED';
}
