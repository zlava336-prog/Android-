/**
 * Phone Agent - Step 2M Production-Grade Video Transitions
 * Deterministic transition definitions and validation for scene transitions.
 */

export type VideoTransitionType =
  | 'NONE'
  | 'FADE'
  | 'DISSOLVE'
  | 'SLIDE_LEFT'
  | 'SLIDE_RIGHT'
  | 'WIPE'
  | 'ZOOM';

export interface VideoTransition {
  type: VideoTransitionType;
  durationMs: number;
}

export const DEFAULT_TRANSITION: VideoTransition = {
  type: 'NONE',
  durationMs: 0,
};

export const MAX_TRANSITION_DURATION_MS = 2000;

export function validateTransition(transition?: VideoTransition | null): {
  valid: boolean;
  error?: string;
} {
  if (!transition) {
    return { valid: true };
  }

  const validTypes: VideoTransitionType[] = [
    'NONE',
    'FADE',
    'DISSOLVE',
    'SLIDE_LEFT',
    'SLIDE_RIGHT',
    'WIPE',
    'ZOOM',
  ];

  if (!validTypes.includes(transition.type)) {
    return { valid: false, error: `Unsupported transition type: ${transition.type}` };
  }

  if (typeof transition.durationMs !== 'number' || isNaN(transition.durationMs) || transition.durationMs < 0) {
    return { valid: false, error: `Invalid transition duration: ${transition.durationMs}. Must be non-negative number.` };
  }

  if (transition.durationMs > MAX_TRANSITION_DURATION_MS) {
    return {
      valid: false,
      error: `Transition duration ${transition.durationMs}ms exceeds maximum allowed (${MAX_TRANSITION_DURATION_MS}ms).`,
    };
  }

  if (transition.type === 'NONE' && transition.durationMs > 0) {
    return { valid: false, error: 'NONE transition type must have 0ms duration.' };
  }

  return { valid: true };
}
