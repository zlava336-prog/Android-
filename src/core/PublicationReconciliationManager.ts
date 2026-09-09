/**
 * Phone Agent - Step 2I Publication Reconciliation Engine
 * Safely resolves UNKNOWN platform states following unexpected interruptions,
 * inspecting UI safely without guessing, honoring security tripwires and EmergencyStop.
 */

import { JobStoreRepository } from './PersistentJobStore';
import { SupportedPlatform } from '../types/job';
import { ReconciliationOutcome } from '../types/persistence';
import { UiInspector, PROHIBITED_PACKAGES, FORBIDDEN_TEXT_KEYWORDS } from './inspector';
import { EmergencyStopManager } from './emergencyStop';
import { PublicationGuard } from './fingerprint';

export interface ReconciliationReport {
  jobId: string;
  platform: SupportedPlatform;
  outcome: ReconciliationOutcome;
  reason: string;
  timestamp: number;
  foregroundPackage: string;
  auditId?: string;
}

export class PublicationReconciliationManager {
  private static instance: PublicationReconciliationManager | null = null;
  private repository: JobStoreRepository;

  constructor(repository?: JobStoreRepository) {
    this.repository = repository || JobStoreRepository.getInstance();
  }

  public static getInstance(repository?: JobStoreRepository): PublicationReconciliationManager {
    if (!PublicationReconciliationManager.instance) {
      PublicationReconciliationManager.instance = new PublicationReconciliationManager(repository);
    }
    return PublicationReconciliationManager.instance;
  }

  public static resetInstance(): void {
    PublicationReconciliationManager.instance = null;
  }

  /**
   * Safely attempts to reconcile an UNKNOWN platform state.
   * STRICT INVARIANT: If publication cannot be safely confirmed, REMAIN UNKNOWN. NEVER GUESS.
   */
  public async reconcilePlatform(
    jobId: string,
    platform: SupportedPlatform,
    inspector: UiInspector
  ): Promise<ReconciliationReport> {
    const now = Date.now();
    const job = this.repository.getJob(jobId);
    if (!job) {
      throw new Error(`Job "${jobId}" not found for reconciliation.`);
    }

    const pState = job.platformExecutionStates[platform];
    if (!pState) {
      throw new Error(`Platform "${platform}" not in job "${jobId}".`);
    }

    // 1. Honor EmergencyStop state
    if (EmergencyStopManager.getInstance().isActive()) {
      return {
        jobId,
        platform,
        outcome: 'SECURITY_BLOCKED',
        reason: 'EmergencyStop is active. Reconciliation blocked for safety.',
        timestamp: now,
        foregroundPackage: 'unknown',
      };
    }

    // If platform was already published and recorded in guard
    if (pState.status === 'PUBLISHED' || PublicationGuard.getInstance().isPublished(jobId, platform, pState.contentFingerprint)) {
      return {
        jobId,
        platform,
        outcome: 'CONFIRMED_PUBLISHED',
        reason: 'Publication is already cryptographically confirmed in publication guard.',
        timestamp: now,
        foregroundPackage: pState.expectedPackage,
      };
    }

    this.repository.recordAuditEvent({
      jobId,
      platform,
      eventType: 'RECONCILIATION_STARTED',
      details: `Starting safe UI reconciliation for platform ${platform}`,
    });

    // 2. Inspect Foreground Package
    const currentPkg = await inspector.getCurrentPackage();

    // Check prohibited packages (banking, payment, settings, messaging)
    if (PROHIBITED_PACKAGES.includes(currentPkg)) {
      EmergencyStopManager.getInstance().trigger(`Prohibited package "${currentPkg}" detected during reconciliation.`);
      this.repository.setEmergencyStop(true, `Prohibited package "${currentPkg}" detected.`);
      return {
        jobId,
        platform,
        outcome: 'SECURITY_BLOCKED',
        reason: `Prohibited package "${currentPkg}" detected. EmergencyStop engaged.`,
        timestamp: now,
        foregroundPackage: currentPkg,
      };
    }

    // Check expected package match
    if (currentPkg !== pState.expectedPackage) {
      return {
        jobId,
        platform,
        outcome: 'STILL_UNKNOWN',
        reason: `Foreground package "${currentPkg}" does not match expected package "${pState.expectedPackage}". Cannot safely inspect platform UI.`,
        timestamp: now,
        foregroundPackage: currentPkg,
      };
    }

    // 3. Check Security Tripwires (Passwords, OTPs, PINs, Payment screens)
    const tripwire = await inspector.checkSecurityTripwires();
    if (tripwire.tripped) {
      EmergencyStopManager.getInstance().trigger(`Security tripwire tripped during reconciliation: ${tripwire.reason}`);
      this.repository.setEmergencyStop(true, `Tripwire: ${tripwire.reason}`);
      return {
        jobId,
        platform,
        outcome: 'SECURITY_BLOCKED',
        reason: `Security tripwire detected: ${tripwire.reason}. EmergencyStop engaged.`,
        timestamp: now,
        foregroundPackage: currentPkg,
      };
    }

    // 4. Safe UI Inspection of Nodes
    const nodes = await inspector.dumpNodeTree();

    // Check for Account Switcher or Payment/Monetization screens
    for (const node of nodes) {
      const text = `${node.text || ''} ${node.contentDescription || ''}`.toLowerCase();
      if (
        text.includes('switch account') ||
        text.includes('add account') ||
        text.includes('choose account') ||
        text.includes('payment method') ||
        text.includes('subscribe now') ||
        text.includes('billing')
      ) {
        EmergencyStopManager.getInstance().trigger(`Monetization or account switching detected during reconciliation: "${text.trim()}"`);
        this.repository.setEmergencyStop(true, 'Monetization or account switching UI detected.');
        return {
          jobId,
          platform,
          outcome: 'SECURITY_BLOCKED',
          reason: 'Monetization or account switcher interface detected. Automation halted.',
          timestamp: now,
          foregroundPackage: currentPkg,
        };
      }
    }

    // 5. Inspect for Confirmed Published Indicators
    const publishedKeywords = [
      'reel shared',
      'reel posted',
      'post shared',
      'your post was shared',
      'video uploaded',
      'short uploaded',
      'pin saved',
      'pin created',
      'your post is now live',
      'tweet sent',
      'post published',
    ];

    let confirmedPublished = false;
    for (const node of nodes) {
      const text = `${node.text || ''} ${node.contentDescription || ''}`.toLowerCase();
      if (publishedKeywords.some(kw => text.includes(kw))) {
        confirmedPublished = true;
        break;
      }
    }

    if (confirmedPublished) {
      // Confirmed published: record in PublicationGuard & update repository state
      PublicationGuard.getInstance().recordPublication(jobId, platform, pState.contentFingerprint);
      this.repository.markPlatformCompleted(jobId, platform, 'PUBLICATION_CONFIRMED', true);

      const audit = this.repository.recordAuditEvent({
        jobId,
        platform,
        eventType: 'RECONCILIATION_RESULT',
        newState: 'PUBLISHED',
        contentFingerprint: pState.contentFingerprint,
        details: 'Reconciliation safely confirmed content was published.',
      });

      return {
        jobId,
        platform,
        outcome: 'CONFIRMED_PUBLISHED',
        reason: 'Safe UI inspection confirmed post completion toast/banner.',
        timestamp: now,
        foregroundPackage: currentPkg,
        auditId: audit.id,
      };
    }

    // 6. Inspect for Confirmed NOT Published (e.g. still in composer draft with 'Discard', 'Share', or 'Post' button)
    const draftKeywords = ['discard', 'save draft', 'edit reel', 'create post', 'share reel', 'post short'];
    let confirmedNotPublished = false;
    for (const node of nodes) {
      const text = `${node.text || ''} ${node.contentDescription || ''}`.toLowerCase();
      if (draftKeywords.some(kw => text.includes(kw))) {
        confirmedNotPublished = true;
        break;
      }
    }

    if (confirmedNotPublished) {
      // Confirmed NOT published: mark platform as READY or FAILED, NEVER auto-republish!
      pState.status = 'READY';
      pState.reconciliationNotes = 'Confirmed unposted draft in foreground. Ready for operator review.';
      job.status = 'READY';
      this.repository.updateJob(job);

      const audit = this.repository.recordAuditEvent({
        jobId,
        platform,
        eventType: 'RECONCILIATION_RESULT',
        newState: 'READY',
        details: 'Reconciliation confirmed draft remained unposted. Ready for operator decision.',
      });

      return {
        jobId,
        platform,
        outcome: 'CONFIRMED_NOT_PUBLISHED',
        reason: 'Composer UI still active with unposted draft. Reset to READY for manual operator review.',
        timestamp: now,
        foregroundPackage: currentPkg,
        auditId: audit.id,
      };
    }

    // 7. If neither can be verified with high confidence: REMAIN UNKNOWN
    pState.reconciliationNotes = 'UI inspection did not locate conclusive completion or draft elements. Remained UNKNOWN.';
    this.repository.updateJob(job);

    const audit = this.repository.recordAuditEvent({
      jobId,
      platform,
      eventType: 'RECONCILIATION_RESULT',
      newState: 'UNKNOWN',
      details: 'Reconciliation could not verify publication status. Preserved as UNKNOWN.',
    });

    return {
      jobId,
      platform,
      outcome: 'STILL_UNKNOWN',
      reason: 'Publication status could not be safely determined. Remained UNKNOWN per safety invariant.',
      timestamp: now,
      foregroundPackage: currentPkg,
      auditId: audit.id,
    };
  }
}
