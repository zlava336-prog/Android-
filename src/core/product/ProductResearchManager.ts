/**
 * Phone Agent - Step 2K Product Research Manager
 * High-level coordinator orchestrating deterministic, safe Amazon product research sessions.
 * Enforces safety boundaries, recovery attempt limits, and transitions to review.
 */

import { ProductResearchSession, ProductResearchState } from './ProductResearchSession';
import { ProductResearchRequest, ProductCandidate } from './ProductCandidate';
import { ProductData } from './ProductData';
import { AmazonResearchAdapter } from './AmazonResearchAdapter';
import { ProductPolicyValidator } from './ProductPolicyValidator';
import { ProductFingerprintIndex } from './ProductFingerprintIndex';
import { ProductScorer, ProductScoreBreakdown } from './ProductScorer';
import { EmergencyStopManager } from '../emergencyStop';
import { LocalActionLogger } from '../logger';
import { UiInspector, ActionExecutor } from '../inspector';

export interface ResearchExecutionResult {
  session: ProductResearchSession;
  candidates: ProductCandidate[];
  selectedProduct?: ProductData;
  scoreBreakdown?: ProductScoreBreakdown;
  success: boolean;
  error?: string;
}

export class ProductResearchManager {
  private static instance: ProductResearchManager | null = null;
  private activeSessions: Map<string, ProductResearchSession> = new Map();
  private policyValidator: ProductPolicyValidator;
  private fingerprintIndex: ProductFingerprintIndex;

  constructor(
    policyValidator?: ProductPolicyValidator,
    fingerprintIndex?: ProductFingerprintIndex
  ) {
    this.policyValidator = policyValidator || ProductPolicyValidator.getInstance();
    this.fingerprintIndex = fingerprintIndex || ProductFingerprintIndex.getInstance();
  }

  public static getInstance(): ProductResearchManager {
    if (!ProductResearchManager.instance) {
      ProductResearchManager.instance = new ProductResearchManager();
    }
    return ProductResearchManager.instance;
  }

  public static resetInstance(): void {
    ProductResearchManager.instance = null;
  }

  /**
   * Initializes a new research session.
   */
  public createSession(request: ProductResearchRequest): ProductResearchSession {
    if (EmergencyStopManager.getInstance().isActive()) {
      throw new Error('Cannot create research session: Emergency Stop is active.');
    }

    const sessionId = `rs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const session = new ProductResearchSession(sessionId, request);
    this.activeSessions.set(sessionId, session);

    LocalActionLogger.getInstance().log({
      platform: 'amazon',
      action: 'RESEARCH_SESSION_CREATED',
      details: `Created research session "${sessionId}" for query: "${request.query}".`,
      severity: 'INFO',
      safetyCheckPassed: true,
    });

    return session;
  }

  /**
   * Executes a safe research pipeline using the provided inspector and executor.
   */
  public async executeResearch(
    session: ProductResearchSession,
    inspector: UiInspector,
    executor: ActionExecutor
  ): Promise<ResearchExecutionResult> {
    const adapter = new AmazonResearchAdapter(inspector, executor);
    adapter.setSessionId(session.sessionId);

    try {
      // 1. Validating
      session.transitionTo('VALIDATING', 'Validating request parameters');
      if (!session.request.query || session.request.query.trim().length === 0) {
        throw new Error('Search query cannot be empty.');
      }

      // 2. Opening Amazon
      session.transitionTo('OPENING_AMAZON', 'Opening Amazon app safely');
      await adapter.openAmazon();

      // 3. Verifying Amazon
      session.transitionTo('VERIFYING_AMAZON', 'Verifying package and no security challenges');
      await adapter.verifySafetyBoundary('VERIFY_AMAZON');

      // 4. Searching
      session.transitionTo('SEARCHING', `Submitting query: "${session.request.query}"`);
      await adapter.enterSearchQuery(session.request.query);

      // 5. Detect Candidates
      const candidates = await adapter.detectCandidates(session.request.maximumCandidates || 5);
      session.setCandidates(candidates);
      session.transitionTo('PRODUCT_CANDIDATE_FOUND', `Discovered ${candidates.length} candidates`);

      // 6. Select Top Candidate
      const primaryCandidate = candidates[0];
      session.setSelectedCandidate(primaryCandidate);
      await adapter.selectProduct(primaryCandidate);

      // 7. Extract Visible Data
      session.transitionTo('EXTRACTING_VISIBLE_DATA', 'Reading visible product details');
      const product = await adapter.readVisibleProductData(primaryCandidate);

      // 8. Safe Link Extraction
      const { url, urlFingerprint } = await adapter.copyProductLink();
      product.sourceUrl = url;
      product.sourceUrlFingerprint = urlFingerprint;

      // 9. Validating Data & Policy Checks
      session.transitionTo('VALIDATING_DATA', 'Running policy, completeness, and duplicate checks');
      const policyResult = this.policyValidator.evaluateProduct(product);
      const duplicateResult = this.fingerprintIndex.checkProductDuplicate(product);
      const scoreBreakdown = ProductScorer.calculateScore(product, policyResult, duplicateResult);

      session.setProductData(product);

      // 10. Needs Review
      session.transitionTo(
        'NEEDS_REVIEW',
        `Data extraction complete. Score: ${scoreBreakdown.finalScore}. Ready for human review.`
      );

      return {
        session,
        candidates,
        selectedProduct: product,
        scoreBreakdown,
        success: true,
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown research error';

      if (EmergencyStopManager.getInstance().isActive()) {
        session.transitionTo('EMERGENCY_STOPPED', `Emergency Stop active: ${errorMsg}`);
      } else {
        // Attempt recovery if possible
        const canRecover = session.attemptRecovery(errorMsg);
        if (!canRecover) {
          session.transitionTo('FAILED', errorMsg);
        }
      }

      return {
        session,
        candidates: session.getCandidates(),
        selectedProduct: session.getProductData(),
        success: false,
        error: errorMsg,
      };
    }
  }

  public getSession(sessionId: string): ProductResearchSession | undefined {
    return this.activeSessions.get(sessionId);
  }
}
