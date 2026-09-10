/**
 * Phone Agent - Step 2N Canonical Workflow Steps
 * Defines the 15 canonical steps of the Master AI Orchestrator.
 */

export type OrchestrationStepType =
  | 'START'
  | 'PRODUCT_RESEARCH'
  | 'PRODUCT_REVIEW'
  | 'CONTENT_GENERATION'
  | 'CONTENT_REVIEW'
  | 'VIDEO_PROJECT_CREATION'
  | 'VIDEO_RENDER'
  | 'VIDEO_REVIEW'
  | 'AMAZON_LINK_CAPTURE'
  | 'PLATFORM_PLANNING'
  | 'HUMAN_PUBLISH_APPROVAL'
  | 'PLATFORM_EXECUTION'
  | 'PUBLICATION_VERIFICATION'
  | 'FINAL_RECONCILIATION'
  | 'COMPLETE';

export const CANONICAL_STEP_SEQUENCE: OrchestrationStepType[] = [
  'START',
  'PRODUCT_RESEARCH',
  'PRODUCT_REVIEW',
  'CONTENT_GENERATION',
  'CONTENT_REVIEW',
  'VIDEO_PROJECT_CREATION',
  'VIDEO_RENDER',
  'VIDEO_REVIEW',
  'AMAZON_LINK_CAPTURE',
  'PLATFORM_PLANNING',
  'HUMAN_PUBLISH_APPROVAL',
  'PLATFORM_EXECUTION',
  'PUBLICATION_VERIFICATION',
  'FINAL_RECONCILIATION',
  'COMPLETE',
];

export type StepExecutionStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'FAILED'
  | 'UNKNOWN';

export interface OrchestrationStep {
  stepId: string;
  stepType: OrchestrationStepType;
  sequenceIndex: number;
  status: StepExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  approvalRequired: boolean;
  metadata?: Record<string, unknown>;
}

export function createInitialWorkflowSteps(): OrchestrationStep[] {
  return CANONICAL_STEP_SEQUENCE.map((stepType, index) => {
    const isApproval =
      stepType === 'PRODUCT_REVIEW' ||
      stepType === 'CONTENT_REVIEW' ||
      stepType === 'VIDEO_REVIEW' ||
      stepType === 'HUMAN_PUBLISH_APPROVAL';

    return {
      stepId: `step_${index + 1}_${stepType.toLowerCase()}`,
      stepType,
      sequenceIndex: index,
      status: index === 0 ? 'COMPLETED' : 'PENDING',
      retryCount: 0,
      approvalRequired: isApproval,
      startedAt: index === 0 ? Date.now() : undefined,
      completedAt: index === 0 ? Date.now() : undefined,
    };
  });
}
