/**
 * Phone Agent - Step 2N Orchestration Events & Subscriptions
 * Typed event dispatching for workflow observables and dashboard reactivity.
 */

import { OrchestrationState } from './OrchestrationState';
import { OrchestrationStepType, StepExecutionStatus } from './OrchestrationStep';
import { ApprovalGateType, GateApprovalRecord } from './OrchestrationApprovalManager';
import { SupportedPlatform } from '../../types/job';

export type OrchestrationEventType =
  | 'STATE_TRANSITION'
  | 'STEP_STATUS_CHANGED'
  | 'APPROVAL_NEEDED'
  | 'APPROVAL_SUBMITTED'
  | 'APPROVAL_REJECTED'
  | 'APPROVAL_INVALIDATED'
  | 'PLATFORM_PUBLISHED'
  | 'WORKFLOW_PAUSED'
  | 'WORKFLOW_RESUMED'
  | 'WORKFLOW_CANCELLED'
  | 'TRIPWIRE_TRIGGERED'
  | 'EMERGENCY_STOP_TRIGGERED'
  | 'RECOVERY_ATTEMPTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED';

export interface OrchestrationEventPayload {
  type: OrchestrationEventType;
  orchestrationId: string;
  timestamp: number;
  previousState?: OrchestrationState;
  newState?: OrchestrationState;
  step?: OrchestrationStepType;
  stepStatus?: StepExecutionStatus;
  gateType?: ApprovalGateType;
  approvalRecord?: GateApprovalRecord;
  platform?: SupportedPlatform;
  message: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type OrchestrationEventListener = (event: OrchestrationEventPayload) => void;

export class OrchestrationEventEmitter {
  private listeners: Set<OrchestrationEventListener> = new Set();

  public addListener(listener: OrchestrationEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: OrchestrationEventPayload): void {
    this.listeners.forEach(fn => {
      try {
        fn(event);
      } catch (err) {
        console.error('[OrchestrationEventEmitter] Listener error:', err);
      }
    });
  }

  public clearListeners(): void {
    this.listeners.clear();
  }
}
