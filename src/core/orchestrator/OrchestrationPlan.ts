/**
 * Phone Agent - Step 2N Orchestration Plan
 * Configures the complete end-to-end master workflow parameters.
 */

import { SupportedPlatform } from '../../types/job';
import { CANONICAL_PLATFORM_ORDER } from './OrchestrationPolicy';
import { VideoOutputSpec, VIDEO_OUTPUT_PRESETS } from '../video/VideoProject';

export interface OrchestrationPlanConfig {
  searchQuery: string;
  asin?: string;
  targetPlatforms: SupportedPlatform[];
  videoSpec?: VideoOutputSpec;
  operatorId: string;
  enableVoiceover?: boolean;
  enableCaptions?: boolean;
}

export interface OrchestrationPlan {
  planId: string;
  searchQuery: string;
  asin?: string;
  targetPlatforms: SupportedPlatform[];
  videoSpec: VideoOutputSpec;
  operatorId: string;
  enableVoiceover: boolean;
  enableCaptions: boolean;
  createdAt: number;
}

export function createOrchestrationPlan(config: OrchestrationPlanConfig): OrchestrationPlan {
  if (!config.searchQuery && !config.asin) {
    throw new Error('[OrchestrationPlan] Either searchQuery or asin must be provided.');
  }

  if (!config.targetPlatforms || config.targetPlatforms.length === 0) {
    throw new Error('[OrchestrationPlan] At least one target platform must be specified.');
  }

  // Reject Amazon as a publishing target platform
  if (config.targetPlatforms.includes('amazon')) {
    throw new Error('[OrchestrationPlan] Amazon is restricted to source-only and cannot be a target publishing platform.');
  }

  // Filter and sort deterministically
  const uniquePlatforms = Array.from(new Set(config.targetPlatforms));
  const sortedPlatforms = uniquePlatforms.sort((a, b) => {
    const idxA = CANONICAL_PLATFORM_ORDER.indexOf(a);
    const idxB = CANONICAL_PLATFORM_ORDER.indexOf(b);
    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  return {
    planId: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    searchQuery: config.searchQuery,
    asin: config.asin,
    targetPlatforms: sortedPlatforms,
    videoSpec: config.videoSpec || VIDEO_OUTPUT_PRESETS.VERTICAL_SHORT,
    operatorId: config.operatorId || 'operator_default',
    enableVoiceover: config.enableVoiceover ?? true,
    enableCaptions: config.enableCaptions ?? true,
    createdAt: Date.now(),
  };
}
