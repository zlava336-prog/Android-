/**
 * Phone Agent - Step 2N Orchestration Result
 * Strongly typed outcome model for step and workflow execution.
 */

import { SupportedPlatform } from '../../types/job';
import { ProductData } from '../product/ProductData';
import { ContentPackage } from '../content/ContentPackage';
import { VideoProject } from '../video/VideoProject';
import { OrchestrationState } from './OrchestrationState';
import { OrchestrationStepType } from './OrchestrationStep';

export interface StepExecutionResult {
  step: OrchestrationStepType;
  success: boolean;
  needsApproval?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface OrchestrationResult {
  orchestrationId: string;
  finalState: OrchestrationState;
  success: boolean;
  allPlatformsPublished: boolean;
  completedSteps: OrchestrationStepType[];
  publishedPlatforms: SupportedPlatform[];
  failedPlatforms: SupportedPlatform[];
  skippedPlatforms: SupportedPlatform[];
  error?: string;
  durationMs: number;
  auditSummary: {
    eventCount: number;
    chainHash: string;
  };
  artifacts: {
    productData?: ProductData;
    productFingerprint?: string;
    contentPackage?: ContentPackage;
    contentFingerprint?: string;
    videoProject?: VideoProject;
    videoFingerprint?: string;
    renderedVideoUri?: string;
    capturedAmazonLink?: string;
  };
}
