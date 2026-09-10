/**
 * Phone Agent - Step 2N Orchestration Policy & Safety Invariants
 * Centralizes all policy constraints, safety tripwires, and execution bounds.
 */

import { SupportedPlatform } from '../../types/job';

export const MAX_STEP_RETRIES = 2;
export const CONSECUTIVE_FAILURES_EMERGENCY_STOP_THRESHOLD = 3;

/**
 * Strict canonical platform order for sequential execution.
 */
export const CANONICAL_PLATFORM_ORDER: SupportedPlatform[] = [
  'instagram',
  'youtube',
  'facebook',
  'tiktok',
  'pinterest',
  'x',
  'threads',
  'linkedin',
];

/**
 * Prohibited foreground packages that immediately trip the safety system.
 */
export const PROHIBITED_APP_PACKAGES = [
  'com.android.vending',
  'com.google.android.apps.walletnfcrel',
  'com.paypal.android.p2pmobile',
  'com.venmo',
  'com.squareup.cash',
  'com.chase.sig.android',
  'com.android.settings',
  'com.google.android.gms.auth',
];

/**
 * Forbidden UI text keywords that indicate sensitive/credential/financial screens.
 */
export const PROHIBITED_UI_KEYWORDS = [
  'password',
  'enter pin',
  'passcode',
  'otp',
  'one-time password',
  '2-step verification',
  'security code',
  'card number',
  'credit card',
  'cvv',
  'expiration date',
  'billing address',
  'payment method',
  'buy now',
  'place your order',
  'complete purchase',
  'add to cart',
  'proceed to checkout',
  'subscribe now',
  'subscribe',
  'boost post',
  'promote reel',
  'switch account',
  'log in',
  'login',
  'captcha',
];

/**
 * Predefined, strongly typed action operations allowed by the orchestrator.
 * Arbitrary string commands ("tap here", "run shell") are strictly rejected.
 */
export type TypedOrchestratorAction =
  | 'INIT_WORKFLOW'
  | 'EXECUTE_PRODUCT_RESEARCH'
  | 'SUBMIT_PRODUCT_REVIEW'
  | 'EXECUTE_CONTENT_GENERATION'
  | 'SUBMIT_CONTENT_REVIEW'
  | 'EXECUTE_VIDEO_CREATION'
  | 'EXECUTE_VIDEO_RENDER'
  | 'SUBMIT_VIDEO_REVIEW'
  | 'EXECUTE_AMAZON_LINK_CAPTURE'
  | 'EXECUTE_PLATFORM_PLANNING'
  | 'SUBMIT_PUBLISH_APPROVAL'
  | 'EXECUTE_PLATFORM_PUBLISH'
  | 'EXECUTE_PUBLICATION_VERIFY'
  | 'EXECUTE_RECONCILIATION'
  | 'PAUSE_WORKFLOW'
  | 'RESUME_WORKFLOW'
  | 'CANCEL_WORKFLOW'
  | 'TRIGGER_EMERGENCY_STOP';

export const ALLOWED_TYPED_ACTIONS: ReadonlySet<TypedOrchestratorAction> = new Set([
  'INIT_WORKFLOW',
  'EXECUTE_PRODUCT_RESEARCH',
  'SUBMIT_PRODUCT_REVIEW',
  'EXECUTE_CONTENT_GENERATION',
  'SUBMIT_CONTENT_REVIEW',
  'EXECUTE_VIDEO_CREATION',
  'EXECUTE_VIDEO_RENDER',
  'SUBMIT_VIDEO_REVIEW',
  'EXECUTE_AMAZON_LINK_CAPTURE',
  'EXECUTE_PLATFORM_PLANNING',
  'SUBMIT_PUBLISH_APPROVAL',
  'EXECUTE_PLATFORM_PUBLISH',
  'EXECUTE_PUBLICATION_VERIFY',
  'EXECUTE_RECONCILIATION',
  'PAUSE_WORKFLOW',
  'RESUME_WORKFLOW',
  'CANCEL_WORKFLOW',
  'TRIGGER_EMERGENCY_STOP',
]);

/**
 * Validates if an action is a recognized typed orchestrator action.
 */
export function isAllowedTypedAction(action: string): action is TypedOrchestratorAction {
  return ALLOWED_TYPED_ACTIONS.has(action as TypedOrchestratorAction);
}

/**
 * Inspects any text payload or UI inspection node for prohibited keywords.
 */
export function scanForProhibitedKeywords(text: string): { prohibited: boolean; matchedKeyword?: string } {
  const normalized = text.toLowerCase();
  for (const keyword of PROHIBITED_UI_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { prohibited: true, matchedKeyword: keyword };
    }
  }
  return { prohibited: false };
}
