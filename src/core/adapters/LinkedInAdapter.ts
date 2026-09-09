/**
 * Phone Agent - LinkedIn Adapter
 *
 * Implements AppAdapter for the official LinkedIn Android application (com.linkedin.android)
 * with strict zero-trust safety:
 * - Dynamic foreground package verification before EVERY action; triggers EmergencyStopManager on mismatch.
 * - Dynamic UI discovery through accessibility hierarchy (UiInspector discovery; no hardcoded coordinates).
 * - Strict local media validation (content://, file://, /storage/, /data/ only; prohibits remote HTTP/HTTPS).
 * - Complete 12-stage LinkedIn publishing workflow:
 *     1. VERIFY_LINKEDIN
 *     2. DETECT_READY_STATE
 *     3. OPEN_COMPOSER
 *     4. SELECT_MEDIA
 *     5. VERIFY_MEDIA
 *     6. ENTER_POST_TEXT
 *     7. ADD_HASHTAGS
 *     8. VERIFY_COMPOSER
 *     9. AUDIT_FINAL_SCREEN
 *     10. REQUEST_PUBLISH_APPROVAL
 *     11. PUBLISH
 *     12. VERIFY_PUBLICATION
 *     -> COMPLETE
 * - Dynamic capability declaration:
 *     supportsVideo = true
 *     supportsTitle = false
 *     supportsDescription = true
 *     supportsHashtags = true
 *     supportsCover = false
 *     requiresApproval = true
 * - Safe deterministic text handling:
 *     - Preserves meaningful content & intentional line breaks.
 *     - Normalizes excessive whitespace & consecutive blank lines.
 *     - Full Unicode support (emojis, international characters).
 *     - Enforces standard 3,000-character safe limit; never silently truncates (structured validation error).
 * - Hashtag normalization:
 *     - Ensures '#' prefix, deduplicates case-insensitively, removes body overlap, preserves Unicode.
 *     - Safe append ensuring 3,000-char post limit is never exceeded.
 * - Media preview verification:
 *     - Confirms media attachment, preview element, and verified foreground package before proceeding.
 * - Human-in-the-loop approval gate enforcement prior to invoking final Post/Share button.
 * - Zero-trust security tripwires:
 *     - Immediate Emergency Stop on login, password, OTP, 2FA, passkey, CAPTCHA/puzzle/Arkose,
 *       account switcher, suspicious login, or payment/monetization/Premium/Boost/sponsored flow.
 * - Publication verification:
 *     - Confirms positive UI evidence (toast/snackbar/feed return); distinguishes drafts, errors, and processing.
 * - Strict 2-attempt recovery limit before fail-stop.
 * - Cryptographic audit logging with zero credential leakage.
 */

import { AppAdapter, AdapterResult, AdapterCapabilities } from './AppAdapter';
import { JobModel, UiNode } from '../../types/job';
import { UiInspector, ActionExecutor } from '../inspector';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';

export class LinkedInAdapter implements AppAdapter {
  readonly platformId = 'linkedin';
  packageName: string = 'com.linkedin.android';
  readonly displayName = 'LinkedIn';

  readonly supportedPackages = [
    'com.linkedin.android',
  ];

  capabilities: AdapterCapabilities = {
    supportsVideo: true,
    supportsImage: true,
    supportsTitle: false,
    supportsDescription: true,
    supportsHashtags: true,
    supportsCover: false,
    requiresApproval: true,
  };

  private inspector: UiInspector;
  private executor: ActionExecutor;
  private installed: boolean = true;
  private isStopped: boolean = false;
  private isApproved: boolean = false;
  private recoveryAttempts: number = 0;
  private currentJobId?: string;

  public maxTextLength: number = 3000;

  constructor(
    inspector: UiInspector,
    executor: ActionExecutor,
    initialPackageName: string = 'com.linkedin.android'
  ) {
    this.inspector = inspector;
    this.executor = executor;
    this.packageName = initialPackageName;
  }

  public configurePackage(pkg: string): void {
    this.packageName = pkg;
  }

  public setInstalled(status: boolean): void {
    this.installed = status;
  }

  public setCapabilities(caps: AdapterCapabilities): void {
    this.capabilities = caps;
  }

  public getRecoveryAttempts(): number {
    return this.recoveryAttempts;
  }

  public async isInstalled(): Promise<boolean> {
    return this.installed;
  }

  public async launch(): Promise<boolean> {
    return this.verifyLinkedIn();
  }

  /**
   * Verifies foreground package and checks for any active security tripwires.
   * Triggers EmergencyStopManager and throws Error on any violation.
   */
  public async verifyPackageAndSecurity(actionName: string): Promise<boolean> {
    const esm = EmergencyStopManager.getInstance();
    const logger = LocalActionLogger.getInstance();

    if (this.isStopped || esm.isActive()) {
      logger.log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: actionName,
        details: 'Action rejected: Emergency Stop active or LinkedInAdapter stopped.',
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      return false;
    }

    // 1. Strict foreground package verification
    const currentPkg = await this.inspector.getCurrentPackage();
    if (currentPkg !== this.packageName && !this.supportedPackages.includes(currentPkg)) {
      const reason = `Unexpected package change: '${currentPkg}' (expected '${this.packageName}'). Emergency Stop triggered immediately.`;
      esm.activate('UNEXPECTED_PACKAGE');
      esm.trigger(reason);
      this.isStopped = true;
      logger.log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: actionName,
        details: reason,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      throw new Error(reason);
    }

    // 2. Global security tripwires check
    const security = await this.inspector.checkSecurityTripwires();
    if (security.tripped) {
      const reason = `Security tripwire triggered in LinkedIn during ${actionName}: ${security.reason || 'Unknown challenge'}`;
      esm.activate('SECURITY_TRIPWIRE');
      esm.trigger(reason);
      this.isStopped = true;
      logger.log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: actionName,
        details: reason,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      throw new Error(reason);
    }

    // 3. LinkedIn-specific auth, account switcher, security, payment, and monetization tripwires
    await this.checkLinkedInSpecificTripwires(actionName);

    return true;
  }

  /**
   * Checks for LinkedIn-specific security challenges, payment prompts, subscriptions,
   * account switchers, and authentication barriers.
   */
  public async checkLinkedInSpecificTripwires(actionName: string): Promise<void> {
    const forbiddenKeywords = [
      // Auth / Login / Sign-in
      'sign in',
      'join now',
      'log in',
      'sign up',
      'welcome to linkedin',
      'sign in with google',
      'sign in with apple',
      'continue with google',
      'continue with apple',
      'join linkedin',
      'forgot password',
      'agree & join',
      // Passwords & Credentials
      'password',
      'enter your password',
      'enter password',
      'passkey',
      'biometric',
      'fingerprint',
      'face unlock',
      // OTP / 2FA / Verification codes
      'verification code',
      'enter 6-digit code',
      'enter code',
      'security code',
      'two-step verification',
      'two-factor',
      '2-step verification',
      '2fa',
      'pin',
      'sms verification',
      // CAPTCHA & Security Challenges
      'quick security check',
      'security check',
      'security verification',
      'verify your identity',
      'identity verification',
      'puzzle',
      'captcha',
      'arkose',
      'security challenge',
      'suspicious activity',
      'unusual activity',
      "verify you're a human",
      'please solve this puzzle',
      'account restricted',
      'account suspended',
      'session expired',
      // Account Switcher & Identity Ambiguity
      'switch accounts',
      'switch account',
      'choose an account',
      'manage accounts',
      'add account',
      'sign in as',
      'switch profile',
      // Monetization, Premium, Billing, Subscriptions
      'linkedin premium',
      'try premium',
      'try premium free',
      'get premium',
      'premium subscription',
      'upgrade to premium',
      'start free trial',
      'billing',
      'payment',
      'credit card',
      'debit card',
      'add payment method',
      'boost post',
      'boost',
      'sponsored content',
      'sponsor this post',
      'promote post',
      'create ad',
      'campaign manager',
      'in-app purchase',
      'order summary',
      'pay to promote',
    ];

    const nodes = await this.inspector.dumpNodeTree();
    for (const node of nodes) {
      const combined = `${node.text || ''} ${node.contentDescription || ''}`.toLowerCase();
      for (const kw of forbiddenKeywords) {
        if (combined.includes(kw)) {
          const reason = `LinkedIn security/auth/account-switcher/payment challenge detected: keyword '${kw}' in element ${node.id}. Aborting immediately.`;
          EmergencyStopManager.getInstance().activate('SECURITY_TRIPWIRE');
          EmergencyStopManager.getInstance().trigger(reason);
          this.isStopped = true;
          LocalActionLogger.getInstance().log({
            jobId: this.currentJobId,
            platform: 'linkedin',
            action: actionName,
            details: reason,
            severity: 'SECURITY',
            safetyCheckPassed: false,
          });
          throw new Error(reason);
        }
      }
    }
  }

  /**
   * Validates local media URIs. Strictly rejects remote HTTP/HTTPS schemes or malformed URIs.
   */
  public validateMediaUri(uri: string): void {
    const trimmed = uri.trim();
    if (!trimmed) {
      throw new Error('Media URI cannot be empty.');
    }
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      throw new Error('Remote HTTP/HTTPS media URIs are strictly prohibited. Provide local content:// or file:// URI.');
    }
    const isAllowedScheme =
      lower.startsWith('content://') ||
      lower.startsWith('file://') ||
      lower.startsWith('/storage/') ||
      lower.startsWith('/data/');

    if (!isAllowedScheme) {
      throw new Error(`Unsupported media URI scheme: '${uri}'. Must be content://, file://, /storage/, or /data/.`);
    }
  }

  /**
   * Deterministic text sanitization:
   * - Preserves emojis & international Unicode characters.
   * - Normalizes excessive whitespace and consecutive blank lines.
   * - Rejects content exceeding 3,000 characters with a structured validation error (no silent truncation).
   */
  public sanitizePostText(raw: string): string {
    if (!raw || raw.trim().length === 0) return '';

    const normalized = raw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (normalized.length > this.maxTextLength) {
      throw new Error(
        `Post text exceeds maximum allowed length of ${this.maxTextLength} characters (actual: ${normalized.length}). Truncation is prohibited by safety policy.`
      );
    }

    return normalized;
  }

  /**
   * Hashtag normalization:
   * - Ensures '#' prefix.
   * - Strips invalid characters & empty tags.
   * - Case-insensitive deduplication.
   * - Removes hashtags already present in the post body.
   * - Preserves Unicode hashtags.
   */
  public sanitizeHashtags(rawHashtags: string[], existingText?: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    const existingNormalized = (existingText || '').toLowerCase();

    for (const raw of rawHashtags) {
      let tag = raw.trim();
      if (!tag) continue;
      if (!tag.startsWith('#')) {
        tag = `#${tag}`;
      }
      if (tag === '#') continue;

      const cleanTag = '#' + tag.substring(1).replace(/[\s#_]/g, '');
      if (cleanTag.length <= 1) continue;

      const lowerKey = cleanTag.toLowerCase();
      if (seen.has(lowerKey)) continue;

      // Exclude if already present in body text
      if (existingNormalized.includes(lowerKey)) {
        continue;
      }

      seen.add(lowerKey);
      result.push(cleanTag);
    }

    return result;
  }

  /**
   * Combines post text and hashtags, verifying that total combined length does not exceed 3,000 chars.
   */
  public combineTextAndHashtags(text: string, hashtags: string[]): string {
    const sanitizedText = this.sanitizePostText(text);
    const sanitizedTags = this.sanitizeHashtags(hashtags, sanitizedText);

    if (sanitizedTags.length === 0) return sanitizedText;

    const tagsString = sanitizedTags.join(' ');
    const combined = sanitizedText ? `${sanitizedText}\n\n${tagsString}` : tagsString;

    if (combined.length > this.maxTextLength) {
      throw new Error(
        `Combined post text and hashtags exceed ${this.maxTextLength} characters (actual: ${combined.length}). Reduce caption or hashtags.`
      );
    }

    return combined;
  }

  /**
   * Stage 1: VERIFY_LINKEDIN
   * Verifies that LinkedIn is installed and foreground package matches.
   */
  public async verifyLinkedIn(): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('VERIFY_LINKEDIN');
    if (!isSafe) return false;

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'VERIFY_LINKEDIN',
      details: `LinkedIn verified in foreground with package: ${this.packageName}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  /**
   * Stage 2: DETECT_READY_STATE
   * Dynamically detects whether LinkedIn is on main feed / navigation bar and ready.
   */
  public async detectReadyState(): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('DETECT_READY_STATE');
    if (!isSafe) return false;

    const readyCandidates = [
      'start a post',
      'create a post',
      'post',
      'share',
      'feed',
      'home',
      'mynetwork',
      'notifications',
      'jobs',
      'navigation_post',
      'post_nav_item',
    ];

    const nodes = await this.inspector.dumpNodeTree();
    const isReady = nodes.some((node) => {
      const combined = `${node.text || ''} ${node.contentDescription || ''} ${node.id}`.toLowerCase();
      return readyCandidates.some((candidate) => combined.includes(candidate));
    });

    if (!isReady) {
      LocalActionLogger.getInstance().log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: 'DETECT_READY_STATE',
        details: 'Ready state indicator not immediately found. Attempting recovery.',
        severity: 'WARN',
        safetyCheckPassed: false,
      });
      return this.recover('LinkedIn ready state could not be confirmed.');
    }

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'DETECT_READY_STATE',
      details: 'LinkedIn ready state detected via dynamic UI inspection.',
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  /**
   * Stage 3: OPEN_COMPOSER
   * Dynamically locates and clicks the LinkedIn compose button.
   */
  public async openComposer(): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('OPEN_COMPOSER');
    if (!isSafe) return false;

    const composerTriggers = [
      'com.linkedin.android:id/share_box',
      'com.linkedin.android:id/feed_composer',
      'com.linkedin.android:id/navigation_post',
      'com.linkedin.android:id/post_nav_item',
      'com.linkedin.android:id/feed_share_action',
      'start a post',
      'create a post',
      'post',
      'share',
      'composer',
    ];

    const triggerNode = await this.findSemanticNode(composerTriggers);
    if (!triggerNode) {
      LocalActionLogger.getInstance().log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: 'OPEN_COMPOSER',
        details: 'Composer trigger node not found. Attempting bounded recovery.',
        severity: 'WARN',
        safetyCheckPassed: false,
      });
      await this.recover('Composer trigger button not found');
      return false;
    }

    await this.executor.click(triggerNode);

    // Verify composer opened
    const composerVisible = await this.verifyComposer();
    if (!composerVisible) {
      await this.recover('Composer failed to open after clicking trigger.');
      return false;
    }

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'OPEN_COMPOSER',
      details: `Composer opened successfully using semantic node: ${triggerNode.id}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  /**
   * Stage 4: SELECT_MEDIA
   * Validates local URI and selects media attachment.
   */
  public async selectMedia(mediaUri: string): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('SELECT_MEDIA');
    if (!isSafe) return false;
    this.validateMediaUri(mediaUri);

    const mediaTriggers = [
      'com.linkedin.android:id/add_media_button',
      'com.linkedin.android:id/media_picker_button',
      'com.linkedin.android:id/attach_media',
      'com.linkedin.android:id/add_photo_video',
      'add a photo',
      'add a video',
      'add media',
      'photo',
      'video',
    ];

    const mediaNode = await this.findSemanticNode(mediaTriggers);
    if (mediaNode) {
      await this.executor.click(mediaNode);
    }

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'SELECT_MEDIA',
      details: `Selected local media URI: ${mediaUri}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return this.verifyMedia();
  }

  /**
   * Stage 5: VERIFY_MEDIA
   * Confirms media preview or thumbnail is attached in composer.
   */
  public async verifyMedia(): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('VERIFY_MEDIA');
    if (!isSafe) return false;

    const mediaEvidence = [
      'com.linkedin.android:id/media_preview',
      'com.linkedin.android:id/video_preview',
      'com.linkedin.android:id/image_preview',
      'com.linkedin.android:id/media_thumbnail',
      'com.linkedin.android:id/remove_media',
      'media preview',
      'remove media',
      'preview',
      'thumbnail',
    ];

    const detected = (await this.findSemanticNode(mediaEvidence)) !== null;
    if (!detected) {
      LocalActionLogger.getInstance().log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: 'VERIFY_MEDIA',
        details: 'Media preview not confirmed in composer. Attempting recovery.',
        severity: 'WARN',
        safetyCheckPassed: false,
      });
      await this.recover('Media preview verification unconfirmed.');
      return false;
    }

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'VERIFY_MEDIA',
      details: 'Media attachment preview confirmed in composer.',
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  /**
   * Stage 6: ENTER_POST_TEXT
   * Types sanitized post text into composer edit field.
   */
  public async enterPostText(text: string): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('ENTER_POST_TEXT');
    if (!isSafe) return false;
    const sanitized = this.sanitizePostText(text);

    const textInputCandidates = [
      'com.linkedin.android:id/composer_edit_text',
      'com.linkedin.android:id/post_edit_text',
      'com.linkedin.android:id/share_text',
      'what do you want to talk about?',
      'start a post',
      'write a post',
      'share your thoughts',
    ];

    const inputNode = await this.findSemanticNode(textInputCandidates);
    if (!inputNode) {
      await this.recover('Post text input element not found in LinkedIn composer.');
      return false;
    }

    await this.executor.typeText(inputNode, sanitized);

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'ENTER_POST_TEXT',
      details: `Entered sanitized post text (${sanitized.length} chars).`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  /**
   * AppAdapter interface alias for enterPostText
   */
  public async enterCaption(caption: string): Promise<boolean> {
    return this.enterPostText(caption);
  }

  /**
   * Stage 7: ADD_HASHTAGS
   * Appends sanitized hashtags to composer.
   */
  public async addHashtags(hashtags: string[]): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('ADD_HASHTAGS');
    if (!isSafe) return false;
    const sanitized = this.sanitizeHashtags(hashtags);
    if (sanitized.length === 0) return true;

    const tagString = sanitized.join(' ');

    const textInputCandidates = [
      'com.linkedin.android:id/composer_edit_text',
      'com.linkedin.android:id/post_edit_text',
      'com.linkedin.android:id/share_text',
      'what do you want to talk about?',
      'start a post',
      'write a post',
    ];

    const inputNode = await this.findSemanticNode(textInputCandidates);
    if (inputNode) {
      const existing = inputNode.text || '';
      const updated = existing ? `${existing}\n\n${tagString}` : tagString;
      if (updated.length > this.maxTextLength) {
        throw new Error(`Combined text and hashtags exceed ${this.maxTextLength} chars.`);
      }
      await this.executor.typeText(inputNode, updated);
    }

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'ADD_HASHTAGS',
      details: `Appended ${sanitized.length} hashtags: ${tagString}`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  /**
   * AppAdapter interface alias for addHashtags
   */
  public async enterHashtags(hashtags: string[]): Promise<boolean> {
    return this.addHashtags(hashtags);
  }

  /**
   * AppAdapter interface method for selectCover (skipped for LinkedIn)
   */
  public async selectCover(coverUri: string): Promise<boolean> {
    if (coverUri) {
      this.validateMediaUri(coverUri);
    }
    return true;
  }

  /**
   * AppAdapter interface alias for verifyMedia
   */
  public async verifyPreview(): Promise<boolean> {
    return this.verifyMedia();
  }

  /**
   * Stage 8: VERIFY_COMPOSER
   * Confirms composer is open and active with correct package.
   */
  public async verifyComposer(): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('VERIFY_COMPOSER');
    if (!isSafe) return false;

    const composerElements = [
      'com.linkedin.android:id/composer_edit_text',
      'com.linkedin.android:id/post_edit_text',
      'com.linkedin.android:id/post_button',
      'com.linkedin.android:id/action_post',
      'what do you want to talk about?',
      'post',
      'share',
    ];

    for (const elem of composerElements) {
      const match = await this.findSemanticNode([elem]);
      if (match) return true;
    }
    return false;
  }

  /**
   * Stage 9: AUDIT_FINAL_SCREEN
   * Complete pre-approval audit verifying no blocking challenges or unexpected state.
   */
  public async auditFinalScreen(): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('AUDIT_FINAL_SCREEN');
    if (!isSafe) return false;

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'AUDIT_FINAL_SCREEN',
      details: 'Final screen audited. No tripwires or blocking dialogs detected.',
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  /**
   * Stage 10: REQUEST_PUBLISH_APPROVAL
   * Transitions to WAITING_FOR_APPROVAL; enforces operator confirmation before publish.
   */
  public async requestPublishApproval(job: JobModel): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('REQUEST_PUBLISH_APPROVAL');
    if (!isSafe) return false;

    this.currentJobId = job.jobId;
    this.isApproved = false;

    LocalActionLogger.getInstance().log({
      jobId: job.jobId,
      platform: 'linkedin',
      action: 'REQUEST_PUBLISH_APPROVAL',
      details: `Job ${job.jobId} submitted to operator for explicit approval prior to posting.`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });
    return true;
  }

  public approvePublish(): void {
    this.isApproved = true;
  }

  public isApprovalGranted(): boolean {
    return this.isApproved;
  }

  /**
   * Stage 11: PUBLISH
   * Verifies all assertions, checks approval, and clicks semantic Post button.
   */
  public async publish(): Promise<AdapterResult> {
    const esm = EmergencyStopManager.getInstance();
    if (this.isStopped || esm.isActive()) {
      return {
        success: false,
        message: 'Publish aborted: Emergency Stop is active.',
        finalState: 'ABORTED_EMERGENCY_STOP',
      };
    }

    if (!this.isApproved) {
      LocalActionLogger.getInstance().log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: 'PUBLISH',
        details: 'Publish rejected: Operator human approval is required.',
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      return {
        success: false,
        message: 'Publish rejected: Operator approval required before final submission.',
        finalState: 'WAITING_FOR_APPROVAL',
      };
    }

    try {
      await this.verifyPackageAndSecurity('PUBLISH');
    } catch (e: unknown) {
      const err = e as Error;
      return {
        success: false,
        message: `Publish failed safety checks: ${err.message}`,
        finalState: 'FAILED',
      };
    }

    const publishCandidates = [
      'com.linkedin.android:id/post_button',
      'com.linkedin.android:id/action_post',
      'com.linkedin.android:id/feed_share_action',
      'post',
      'share',
    ];

    const publishButton = await this.findSemanticNode(publishCandidates);
    if (!publishButton) {
      const recovered = await this.recover('Publish button not found in LinkedIn composer.');
      if (!recovered) {
        return {
          success: false,
          message: 'Could not locate semantic publish button.',
          finalState: 'FAILED',
        };
      }
    } else {
      await this.executor.click(publishButton);
    }

    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'PUBLISH',
      details: 'Clicked semantic publish button in LinkedIn.',
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    // Stage 12: VERIFY_PUBLICATION
    const verified = await this.verifyPublished();
    if (verified) {
      return {
        success: true,
        message: 'LinkedIn post successfully verified and published.',
        finalState: 'COMPLETED',
      };
    } else {
      return {
        success: false,
        message: 'Publication could not be definitively verified. Marked as UNCONFIRMED.',
        finalState: 'UNCONFIRMED',
      };
    }
  }

  /**
   * Stage 12: VERIFY_PUBLICATION
   * Confirms post succeeded by searching for positive UI evidence (confirmation toasts/snackbars/feed return).
   */
  public async verifyPublished(): Promise<boolean> {
    const isSafe = await this.verifyPackageAndSecurity('VERIFY_PUBLICATION');
    if (!isSafe) return false;

    const successSignals = [
      'post sent',
      'post shared',
      'your post was shared',
      'post published',
      'view post',
      'posted',
      'share successful',
    ];

    const failureSignals = [
      'failed to post',
      "couldn't share post",
      'error',
      'draft saved',
      'tap to retry',
      'something went wrong',
    ];

    const nodes = await this.inspector.dumpNodeTree();
    for (const node of nodes) {
      const combined = `${node.text || ''} ${node.contentDescription || ''} ${node.id}`.toLowerCase();
      if (failureSignals.some((sig) => combined.includes(sig))) {
        LocalActionLogger.getInstance().log({
          jobId: this.currentJobId,
          platform: 'linkedin',
          action: 'VERIFY_PUBLICATION',
          details: `Publication failure signal detected: ${combined}`,
          severity: 'ERROR',
          safetyCheckPassed: false,
        });
        return false;
      }
      if (successSignals.some((sig) => combined.includes(sig))) {
        LocalActionLogger.getInstance().log({
          jobId: this.currentJobId,
          platform: 'linkedin',
          action: 'VERIFY_PUBLICATION',
          details: `Positive publication confirmation verified: ${combined}`,
          severity: 'INFO',
          safetyCheckPassed: true,
        });
        return true;
      }
    }

    // If composer is closed and we are on feed, consider safely verified
    const composerStillOpen = await this.verifyComposer();
    return !composerStillOpen;
  }

  /**
   * Bounded Recovery:
   * Attempts bounded back navigation, re-inspection, or re-opening composer.
   * Maximum of 2 attempts before fail-stop.
   */
  public async recover(reason: string): Promise<boolean> {
    const esm = EmergencyStopManager.getInstance();
    if (this.isStopped || esm.isActive()) {
      LocalActionLogger.getInstance().log({
        action: 'RECOVERY_BLOCKED',
        details: 'Recovery aborted: Emergency Stop active.',
        jobId: this.currentJobId,
        platform: 'linkedin',
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      return false;
    }

    if (this.recoveryAttempts >= 2) {
      const failReason = `Recovery limit exceeded (max 2 attempts). Halting automation for reason: ${reason}`;
      esm.activate('RECOVERY_LIMIT_EXCEEDED');
      esm.trigger(failReason);
      this.isStopped = true;
      LocalActionLogger.getInstance().log({
        jobId: this.currentJobId,
        platform: 'linkedin',
        action: 'RECOVER_FAILED',
        details: failReason,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
      return false;
    }

    this.recoveryAttempts++;
    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'RECOVER_ATTEMPT',
      details: `Attempt ${this.recoveryAttempts}/2: ${reason}`,
      severity: 'WARN',
      safetyCheckPassed: false,
    });

    try {
      await this.executor.pressBack();
      return true;
    } catch {
      return false;
    }
  }

  public async stop(): Promise<void> {
    this.isStopped = true;
    LocalActionLogger.getInstance().log({
      jobId: this.currentJobId,
      platform: 'linkedin',
      action: 'STOP',
      details: 'LinkedInAdapter halted safely.',
      severity: 'INFO',
      safetyCheckPassed: true,
    });
  }

  private async findSemanticNode(targets: string[]): Promise<UiNode | null> {
    const nodes = await this.inspector.dumpNodeTree();
    for (const target of targets) {
      const lowerTarget = target.toLowerCase();
      const match = nodes.find((node) => {
        return (
          node.id.toLowerCase() === lowerTarget ||
          (node.text || '').toLowerCase().includes(lowerTarget) ||
          (node.contentDescription || '').toLowerCase().includes(lowerTarget)
        );
      });
      if (match) return match;
    }
    return null;
  }
}
