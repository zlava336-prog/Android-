/**
 * Phone Agent - AppAdapter Interface
 * Defines the contract that every platform-specific automation module must satisfy.
 */

import { JobModel } from '../../types/job';

export interface AdapterCapabilities {
  supportsVideo: boolean;
  supportsImage: boolean;
  supportsTitle: boolean;
  supportsDescription: boolean;
  supportsHashtags: boolean;
  supportsCover: boolean;
  requiresApproval: boolean;
}

export interface AdapterResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  requiresUserAction?: boolean;
  finalState?: string;
}

export interface AppAdapter {
  readonly platformId: string;
  readonly packageName: string;
  readonly displayName: string;
  readonly capabilities?: AdapterCapabilities;

  isInstalled(): Promise<boolean>;
  launch(): Promise<boolean>;
  detectReadyState(): Promise<boolean>;
  selectMedia(mediaUri: string): Promise<boolean>;
  enterCaption(caption: string): Promise<boolean>;
  enterHashtags(hashtags: string[]): Promise<boolean>;
  selectCover(coverUri: string): Promise<boolean>;
  verifyPreview(): Promise<boolean>;
  requestPublishApproval(job: JobModel): Promise<boolean>;
  publish(): Promise<AdapterResult>;
  verifyPublished(): Promise<boolean>;
  recover(lastError: string): Promise<boolean>;
  stop(): Promise<void>;
}
