/**
 * Phone Agent - Step 2N Orchestration Validator
 * Central verification engine validating transitions, typed actions, fingerprint chains,
 * platform safety preconditions, and prohibited screen tripwires.
 */

import { SupportedPlatform } from '../../types/job';
import { AdapterRegistry } from '../AdapterRegistry';
import { PublicationGuard } from '../fingerprint';
import { EmergencyStopManager } from '../emergencyStop';
import { OrchestrationState, isValidStateTransition } from './OrchestrationState';
import { OrchestrationContext } from './OrchestrationContext';
import {
  TypedOrchestratorAction,
  isAllowedTypedAction,
  scanForProhibitedKeywords,
  PROHIBITED_APP_PACKAGES,
} from './OrchestrationPolicy';
import { OrchestrationApprovalManager } from './OrchestrationApprovalManager';

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  fatal: boolean;
}

export class OrchestrationValidator {
  private static instance: OrchestrationValidator | null = null;
  private registry = AdapterRegistry.getInstance();
  private publicationGuard = PublicationGuard.getInstance();
  private emergencyStop = EmergencyStopManager.getInstance();
  private approvalManager = OrchestrationApprovalManager.getInstance();

  public static getInstance(): OrchestrationValidator {
    if (!OrchestrationValidator.instance) {
      OrchestrationValidator.instance = new OrchestrationValidator();
    }
    return OrchestrationValidator.instance;
  }

  /**
   * Validates that an action string is a typed orchestrator action.
   */
  public validateAction(action: string): { valid: boolean; error?: string } {
    if (!isAllowedTypedAction(action)) {
      return {
        valid: false,
        error: `[OrchestrationValidator] Arbitrary action "${action}" rejected. Only predefined typed actions are allowed.`,
      };
    }
    return { valid: true };
  }

  /**
   * Validates a state transition from currentState to targetState.
   */
  public validateTransition(from: OrchestrationState, to: OrchestrationState): { valid: boolean; error?: string } {
    if (!isValidStateTransition(from, to)) {
      return {
        valid: false,
        error: `[OrchestrationValidator] Invalid state transition from "${from}" to "${to}".`,
      };
    }
    return { valid: true };
  }

  /**
   * Validates the complete cryptographic fingerprint dependency chain.
   * PRODUCT -> CONTENT -> VIDEO -> PLATFORM PLAN -> PUBLICATION
   */
  public validateFingerprintDependencyChain(context: OrchestrationContext): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. If content exists, it must reference matching product
    if (context.contentPackage && context.productData) {
      const contentProductFp = context.contentPackage.productData?.dataFingerprint || (context.contentPackage as any).productFingerprint;
      if (
        contentProductFp &&
        context.productFingerprint &&
        contentProductFp !== context.productFingerprint
      ) {
        errors.push(`ContentPackage product fingerprint mismatch: package has ${contentProductFp}, current product is ${context.productFingerprint}`);
      }
    }

    // 2. If video project exists, it must reference matching product and content
    if (context.videoProject) {
      if (
        context.productFingerprint &&
        context.videoProject.productFingerprint &&
        context.videoProject.productFingerprint !== context.productFingerprint
      ) {
        errors.push(`VideoProject product fingerprint mismatch: project has ${context.videoProject.productFingerprint}, current product is ${context.productFingerprint}`);
      }

      if (
        context.contentFingerprint &&
        context.videoProject.contentFingerprint &&
        context.videoProject.contentFingerprint !== context.contentFingerprint
      ) {
        errors.push(`VideoProject content fingerprint mismatch: project has ${context.videoProject.contentFingerprint}, current content is ${context.contentFingerprint}`);
      }
    }

    // 3. If platform plan exists, it must match content fingerprint
    if (context.platformPlan && context.contentFingerprint) {
      if (context.platformPlan.fingerprint !== context.contentFingerprint) {
        errors.push(`Platform plan fingerprint mismatch: plan has ${context.platformPlan.fingerprint}, current content is ${context.contentFingerprint}`);
      }
    }

    // 4. Verify human approvals against current fingerprints
    if (context.productApproval) {
      const check = this.approvalManager.verifyGateApproval({
        record: context.productApproval,
        currentProductFingerprint: context.productFingerprint,
      });
      if (!check.isValid) {
        errors.push(`Product approval invalid or stale: ${check.reason}`);
      }
    }

    if (context.contentApproval) {
      const check = this.approvalManager.verifyGateApproval({
        record: context.contentApproval,
        currentProductFingerprint: context.productFingerprint,
        currentContentFingerprint: context.contentFingerprint,
        currentMediaFingerprint: context.mediaFingerprint,
      });
      if (!check.isValid) {
        errors.push(`Content approval invalid or stale: ${check.reason}`);
      }
    }

    if (context.videoApproval) {
      const check = this.approvalManager.verifyGateApproval({
        record: context.videoApproval,
        currentProductFingerprint: context.productFingerprint,
        currentContentFingerprint: context.contentFingerprint,
        currentMediaFingerprint: context.mediaFingerprint,
        currentVideoFingerprint: context.videoFingerprint,
        currentOutputFingerprint: context.outputFingerprint,
      });
      if (!check.isValid) {
        errors.push(`Video approval invalid or stale: ${check.reason}`);
      }
    }

    if (context.publishApproval) {
      const check = this.approvalManager.verifyGateApproval({
        record: context.publishApproval,
        currentProductFingerprint: context.productFingerprint,
        currentContentFingerprint: context.contentFingerprint,
        currentMediaFingerprint: context.mediaFingerprint,
        currentVideoFingerprint: context.videoFingerprint,
        currentOutputFingerprint: context.outputFingerprint,
        currentPlatformPlanFingerprint: context.platformPlanFingerprint,
      });
      if (!check.isValid) {
        errors.push(`Final publish approval invalid or stale: ${check.reason}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates platform publication safety invariants before execution.
   */
  public validatePlatformPublication(params: {
    context: OrchestrationContext;
    platform: SupportedPlatform;
    foregroundPackage?: string;
  }): { valid: boolean; error?: string } {
    // 1. EmergencyStop check
    if (this.emergencyStop.isActive()) {
      return { valid: false, error: 'Emergency Stop is active. Publishing blocked.' };
    }

    // 2. Amazon special rule: Never publish to Amazon
    if (params.platform === 'amazon') {
      return { valid: false, error: 'Amazon is SOURCE-ONLY. Amazon is never a publishing destination.' };
    }

    // 3. Adapter availability
    if (!this.registry.has(params.platform)) {
      return { valid: false, error: `No registered adapter for platform "${params.platform}".` };
    }

    // 4. Duplicate publication check via PublicationGuard
    const fingerprint = params.context.contentFingerprint || 'unknown';
    if (this.publicationGuard.isPublished(params.context.orchestrationId, params.platform, fingerprint)) {
      return { valid: false, error: `Platform "${params.platform}" is already PUBLISHED for job "${params.context.orchestrationId}". Duplicate publication prevented.` };
    }

    // 5. Final publish approval check
    if (!params.context.publishApproval || params.context.publishApproval.status !== 'APPROVED') {
      return { valid: false, error: 'Final publish approval is missing or not APPROVED.' };
    }

    // 5b. Verify upstream dependency integrity & freshness
    const chainCheck = this.validateFingerprintDependencyChain(params.context);
    if (!chainCheck.valid) {
      return { valid: false, error: `Upstream dependency check failed or stale approval: ${chainCheck.errors.join('; ')}` };
    }

    // 6. Foreground package check
    if (params.foregroundPackage) {
      if (PROHIBITED_APP_PACKAGES.includes(params.foregroundPackage)) {
        return { valid: false, error: `Prohibited foreground package detected: ${params.foregroundPackage}. Execution blocked.` };
      }
      const adapter = this.registry.get(params.platform);
      if (adapter.packageName && params.foregroundPackage !== adapter.packageName) {
        return { valid: false, error: `Expected package "${adapter.packageName}" for platform "${params.platform}", but found "${params.foregroundPackage}".` };
      }
    }

    return { valid: true };
  }

  /**
   * Validates screen text against prohibited financial/security keywords.
   */
  public validateScreenText(text: string): { valid: boolean; matchedKeyword?: string } {
    const scan = scanForProhibitedKeywords(text);
    if (scan.prohibited) {
      return { valid: false, matchedKeyword: scan.matchedKeyword };
    }
    return { valid: true };
  }

  /**
   * Validates media URIs for strict isolation and security.
   */
  public validateMediaUri(uri: string): { valid: boolean; error?: string } {
    if (!uri) {
      return { valid: false, error: 'Media URI is required.' };
    }
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return { valid: false, error: 'Remote HTTP/HTTPS media URIs are strictly prohibited.' };
    }
    if (uri.startsWith('file:///system/') || uri.startsWith('file:///bin/') || uri.startsWith('file:///etc/')) {
      return { valid: false, error: 'System file URIs are prohibited.' };
    }
    if (!uri.startsWith('content://') && !uri.startsWith('file:///data/user/0/com.phoneagent/files/')) {
      return { valid: false, error: 'Only authorized local or content URIs are permitted.' };
    }
    return { valid: true };
  }
}
