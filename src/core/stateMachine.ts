/**
 * Phone Agent - Job State Machine
 * Deterministic finite state machine with strict transition guards
 * and immediate Emergency Stop priority.
 */

import { JobState } from '../types/job';

// Allowed sequential transitions
const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
  RECEIVED: ['VALIDATING', 'STOPPED', 'FAILED'],
  VALIDATING: ['OPENING_APP', 'STOPPED', 'FAILED'],
  OPENING_APP: ['WAITING_FOR_READY', 'STOPPED', 'FAILED'],
  WAITING_FOR_READY: ['SELECTING_MEDIA', 'STOPPED', 'FAILED'],
  SELECTING_MEDIA: ['ENTERING_METADATA', 'STOPPED', 'FAILED'],
  ENTERING_METADATA: ['VERIFYING_PREVIEW', 'STOPPED', 'FAILED'],
  VERIFYING_PREVIEW: ['WAITING_FOR_APPROVAL', 'PUBLISHING', 'STOPPED', 'FAILED'],
  WAITING_FOR_APPROVAL: ['PUBLISHING', 'STOPPED', 'FAILED'],
  PUBLISHING: ['VERIFYING_RESULT', 'STOPPED', 'FAILED'],
  VERIFYING_RESULT: ['COMPLETED', 'STOPPED', 'FAILED'],
  COMPLETED: ['RECEIVED'],
  FAILED: ['RECEIVED'],
  STOPPED: ['RECEIVED'],
};

export class JobStateMachine {
  private currentState: JobState = 'RECEIVED';
  private previousState: JobState | null = null;
  private stateChangeListeners: ((newState: JobState, oldState: JobState | null) => void)[] = [];
  private isEmergencyStopped: boolean = false;

  constructor(initialState: JobState = 'RECEIVED') {
    this.currentState = initialState;
  }

  public getState(): JobState {
    return this.currentState;
  }

  public getPreviousState(): JobState | null {
    return this.previousState;
  }

  public isTerminal(): boolean {
    return this.currentState === 'COMPLETED' || this.currentState === 'FAILED' || this.currentState === 'STOPPED';
  }

  public canTransitionTo(targetState: JobState): boolean {
    if (this.isEmergencyStopped && targetState !== 'STOPPED' && targetState !== 'RECEIVED') {
      return false;
    }
    // Emergency stop can happen from ANY state
    if (targetState === 'STOPPED' || targetState === 'FAILED') {
      return true;
    }
    const allowed = VALID_TRANSITIONS[this.currentState] || [];
    return allowed.includes(targetState);
  }

  public transitionTo(targetState: JobState, reason?: string): boolean {
    if (targetState === 'STOPPED') {
      this.isEmergencyStopped = true;
      const old = this.currentState;
      this.previousState = old;
      this.currentState = 'STOPPED';
      this.notifyListeners('STOPPED', old);
      return true;
    }

    if (!this.canTransitionTo(targetState)) {
      console.warn(`[StateMachine] Illegal transition rejected: ${this.currentState} -> ${targetState} (${reason || 'no reason provided'})`);
      return false;
    }

    const old = this.currentState;
    this.previousState = old;
    this.currentState = targetState;
    if (targetState === 'RECEIVED') {
      this.isEmergencyStopped = false;
    }
    this.notifyListeners(targetState, old);
    return true;
  }

  public triggerEmergencyStop(reason: string = 'User Emergency Stop invoked'): void {
    this.transitionTo('STOPPED', reason);
  }

  public reset(): void {
    this.isEmergencyStopped = false;
    this.transitionTo('RECEIVED');
  }

  public addListener(listener: (newState: JobState, oldState: JobState | null) => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(newState: JobState, oldState: JobState | null): void {
    for (const listener of this.stateChangeListeners) {
      try {
        listener(newState, oldState);
      } catch (err) {
        console.error('[StateMachine] Listener error', err);
      }
    }
  }
}
