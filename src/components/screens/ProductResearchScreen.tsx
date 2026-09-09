/**
 * Phone Agent - Step 2K Product Research & Intelligence Screen
 * Visual dashboard for safe Amazon product research, candidate selection, visible data extraction,
 * field-level provenance tracking, policy validation, and human approval binding.
 *
 * HARD SAFETY INVARIANTS:
 * - Amazon remains strictly Product Link Source.
 * - Zero purchasing, payments, checkout, cart, or automated publishing.
 * - No "Auto-Approve" or "Auto-Publish" buttons.
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ShoppingBag,
  Sparkles,
  AlertOctagon,
  Eye,
  RefreshCw,
  Edit3,
  Lock,
  FileText,
  DollarSign,
  Star,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { ProductResearchManager } from '../../core/product/ProductResearchManager';
import { ProductResearchSession, ProductResearchState } from '../../core/product/ProductResearchSession';
import { ProductCandidate, ProductResearchRequest } from '../../core/product/ProductCandidate';
import { ProductData, createDefaultProductData } from '../../core/product/ProductData';
import { ProductPolicyValidator, ProductPolicyResult } from '../../core/product/ProductPolicyValidator';
import { ProductFingerprintIndex, DuplicateCheckResult } from '../../core/product/ProductFingerprintIndex';
import { ProductReviewManager, ProductApprovalRecord, ProductReviewState } from '../../core/product/ProductReviewManager';
import { ProductScorer, ProductScoreBreakdown } from '../../core/product/ProductScorer';
import { computeProductFingerprint, computeProductUrlFingerprint, validateAmazonProductUrl } from '../../core/product/ProductFingerprint';
import { SafeUiInspector, SafeActionExecutor } from '../../core/inspector';
import { EmergencyStopManager } from '../../core/emergencyStop';
import { LocalActionLogger } from '../../core/logger';
import { PersistentJobStore } from '../../core/PersistentJobStore';

interface ProductResearchScreenProps {
  theme: 'dark' | 'light';
  onNavigateToContentReview?: (productData: ProductData) => void;
}

export const ProductResearchScreen: React.FC<ProductResearchScreenProps> = ({
  theme,
  onNavigateToContentReview,
}) => {
  const isLight = theme === 'light';

  // Managers
  const researchManager = useMemo(() => ProductResearchManager.getInstance(), []);
  const reviewManager = useMemo(() => ProductReviewManager.getInstance(), []);
  const policyValidator = useMemo(() => ProductPolicyValidator.getInstance(), []);
  const fingerprintIndex = useMemo(() => ProductFingerprintIndex.getInstance(), []);
  const jobStore = useMemo(() => PersistentJobStore.getInstance(), []);
  const eStop = useMemo(() => EmergencyStopManager.getInstance(), []);

  // Form state
  const [query, setQuery] = useState('ergonomic wireless mouse');
  const [category, setCategory] = useState('Electronics');
  const [minPrice, setMinPrice] = useState<number | undefined>(15);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(60);
  const [reviewerId, setReviewerId] = useState('Operator_Alice');

  // Session & Execution state
  const [session, setSession] = useState<ProductResearchSession | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ProductCandidate | null>(null);
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [approvalRecord, setApprovalRecord] = useState<ProductApprovalRecord | null>(null);
  const [reviewState, setReviewState] = useState<ProductReviewState>('NEEDS_REVIEW');
  const [policyResult, setPolicyResult] = useState<ProductPolicyResult | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<ProductScoreBreakdown | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'PROVENANCE' | 'POLICY' | 'SCORE'>('OVERVIEW');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Manual editing for testing tampering / stale approval
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedPrice, setEditedPrice] = useState<number | undefined>(undefined);

  // Run Research Session
  const handleStartResearch = async () => {
    if (eStop.isActive()) {
      setStatusMessage('Cannot initiate research: Emergency Stop is active.');
      return;
    }

    if (!query.trim()) {
      setStatusMessage('Please enter a search query.');
      return;
    }

    setIsResearching(true);
    setStatusMessage('Initiating safe Amazon research session...');
    setApprovalRecord(null);

    const request: ProductResearchRequest = {
      requestId: `req_${Date.now()}`,
      query: query.trim(),
      category: category.trim() || undefined,
      priceRange: minPrice || maxPrice ? { min: minPrice, max: maxPrice, currency: 'USD' } : undefined,
      maximumCandidates: 5,
      createdAt: Date.now(),
    };

    const newSession = researchManager.createSession(request);
    setSession(newSession);

    // Mock UI tree with realistic Amazon nodes
    const mockNodes = [
      {
        id: 'com.amazon.mShop.android.shopping:id/rs_search_src_text',
        text: query,
        isClickable: true,
        isVisible: true,
        className: 'android.widget.EditText',
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 100, width: 900, height: 100 },
      },
      {
        id: 'com.amazon.mShop.android.shopping:id/item_title_1',
        text: 'Anker Ergonomic Optical Wireless Vertical Mouse with 2.4G USB Receiver',
        contentDescription: 'Anker Ergonomic Optical Wireless Vertical Mouse $27.99 4.5 out of 5 stars 12,450 reviews',
        isClickable: true,
        isVisible: true,
        className: 'android.widget.TextView',
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 300, width: 900, height: 200 },
      },
      {
        id: 'com.amazon.mShop.android.shopping:id/item_price_1',
        text: '$27.99',
        isClickable: false,
        isVisible: true,
        className: 'android.widget.TextView',
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 520, width: 200, height: 50 },
      },
      {
        id: 'com.amazon.mShop.android.shopping:id/feature_bullets_1',
        text: '• Scientific ergonomic design encourages healthy neutral "handshake" wrist positions.',
        isClickable: false,
        isVisible: true,
        className: 'android.widget.TextView',
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 600, width: 900, height: 80 },
      },
      {
        id: 'com.amazon.mShop.android.shopping:id/feature_bullets_2',
        text: '• 800 / 1200 / 1600 DPI Resolution Optical Tracking Technology provides smooth tracking.',
        isClickable: false,
        isVisible: true,
        className: 'android.widget.TextView',
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 700, width: 900, height: 80 },
      },
      {
        id: 'com.amazon.mShop.android.shopping:id/availability',
        text: 'In Stock. Ships from and sold by Amazon.com.',
        isClickable: false,
        isVisible: true,
        className: 'android.widget.TextView',
        packageName: 'com.amazon.mShop.android.shopping',
        bounds: { x: 50, y: 800, width: 900, height: 50 },
      },
    ];

    const inspector = new SafeUiInspector('com.amazon.mShop.android.shopping', mockNodes);
    const executor = new SafeActionExecutor();

    const result = await researchManager.executeResearch(newSession, inspector, executor);
    setIsResearching(false);

    if (result.success && result.selectedProduct) {
      setCandidates(result.candidates);
      setSelectedCandidate(result.candidates[0] || null);
      setProductData(result.selectedProduct);

      // Re-evaluate policy and score
      const policy = policyValidator.evaluateProduct(result.selectedProduct);
      const duplicate = fingerprintIndex.checkProductDuplicate(result.selectedProduct);
      const score = ProductScorer.calculateScore(result.selectedProduct, policy, duplicate);

      setPolicyResult(policy);
      setDuplicateResult(duplicate);
      setScoreBreakdown(score);
      setReviewState('READY_FOR_REVIEW');

      setEditedTitle(result.selectedProduct.title);
      setEditedPrice(result.selectedProduct.price);

      // Persist
      jobStore.saveResearchSession(newSession);
      jobStore.saveProduct(result.selectedProduct);

      setStatusMessage(`Research finished! Discovered candidate: "${result.selectedProduct.title}".`);
    } else {
      setStatusMessage(`Research failed or stopped: ${result.error || 'Unknown error'}`);
    }
  };

  // Human Approval
  const handleApprove = () => {
    if (!productData || !session) return;

    try {
      const { approvedProduct, approvalRecord: record } = reviewManager.approveProduct(
        productData,
        session.sessionId,
        reviewerId.trim() || 'Operator'
      );

      setProductData(approvedProduct);
      setApprovalRecord(record);
      setReviewState('APPROVED');
      session.transitionTo('APPROVED', `Approved by ${record.reviewerId}`);

      // Save to persistence
      jobStore.saveProduct(approvedProduct);
      jobStore.saveProductApproval(record);

      setStatusMessage(`Product approved successfully! Approval ID: ${record.approvalId.slice(0, 14)}...`);
    } catch (err: any) {
      setStatusMessage(`Approval blocked: ${err.message}`);
    }
  };

  // Human Rejection
  const handleReject = () => {
    if (!productData || !session) return;
    const record = reviewManager.rejectProduct(
      productData,
      session.sessionId,
      reviewerId.trim() || 'Operator',
      'Operator rejected during review'
    );
    setApprovalRecord(record);
    setReviewState('REJECTED');
    session.transitionTo('CANCELLED', 'Product rejected by operator');
    setStatusMessage('Product research candidate rejected.');
  };

  // Edit Product Field (Tests Stale Approval Invariant)
  const handleSaveEdits = () => {
    if (!productData) return;

    const updated: ProductData = {
      ...productData,
      title: editedTitle.trim(),
      productName: editedTitle.trim(),
      price: editedPrice,
      dataFingerprint: undefined, // Recalculate
    };
    updated.dataFingerprint = computeProductFingerprint(updated);

    setProductData(updated);
    setIsEditing(false);

    // Re-verify approval status
    if (approvalRecord) {
      const check = reviewManager.verifyApprovalStatus(updated, approvalRecord);
      setReviewState(check.state);
      if (check.state === 'STALE_APPROVAL') {
        setStatusMessage('STALE APPROVAL: Product data was modified. Previous approval has been invalidated.');
      }
    }

    // Recalculate policy & score
    const policy = policyValidator.evaluateProduct(updated);
    const duplicate = fingerprintIndex.checkProductDuplicate(updated);
    const score = ProductScorer.calculateScore(updated, policy, duplicate);
    setPolicyResult(policy);
    setDuplicateResult(duplicate);
    setScoreBreakdown(score);
  };

  // Send to Step 2J Content Pipeline
  const handleSendToPipeline = () => {
    if (!productData || !approvalRecord) {
      setStatusMessage('Cannot proceed: Product must be approved before sending to Content Pipeline.');
      return;
    }

    const check = reviewManager.verifyApprovalStatus(productData, approvalRecord);
    if (!check.isApproved) {
      setStatusMessage(`Cannot proceed: Product approval is ${check.state}: ${check.reason}`);
      return;
    }

    if (onNavigateToContentReview) {
      onNavigateToContentReview(productData);
    } else {
      setStatusMessage('Approved Product is ready for Step 2J Content Package creation.');
    }
  };

  return (
    <div id="product-research-screen" className="flex flex-col h-full overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-amber-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Product Research & Intelligence
            </h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Step 2K · Source-only Amazon research, visible UI extraction, provenance verification, and human sign-off.
          </p>
        </div>

        {/* Safety Invariant Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5" />
            Source Only
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Lock className="w-3.5 h-3.5" />
            Zero Purchase / Pay
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            <Eye className="w-3.5 h-3.5" />
            Human Review Required
          </span>
        </div>
      </div>

      {/* Emergency Stop Notice */}
      {eStop.isActive() && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 flex items-center gap-3">
          <AlertOctagon className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <h3 className="font-semibold text-rose-900 dark:text-rose-200">Emergency Stop is Active</h3>
            <p className="text-sm text-rose-700 dark:text-rose-300">
              All automation and research interactions are locked. Clear Emergency Stop to resume.
            </p>
          </div>
        </div>
      )}

      {/* Research Session Initiator Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Search className="w-4 h-4 text-amber-500" />
          Safe Amazon Research Session
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Search Query
            </label>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. ergonomic wireless mouse"
              disabled={isResearching || eStop.isActive()}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. Electronics"
              disabled={isResearching || eStop.isActive()}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Reviewer ID
            </label>
            <input
              type="text"
              value={reviewerId}
              onChange={e => setReviewerId(e.target.value)}
              placeholder="e.g. Operator_Alice"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Price Range: ${minPrice} – ${maxPrice}</span>
            <span>Target: Amazon Shopping App</span>
            {session && <span>Session: {session.sessionId}</span>}
          </div>

          <button
            onClick={handleStartResearch}
            disabled={isResearching || eStop.isActive()}
            className="px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-colors"
          >
            {isResearching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Searching Amazon UI...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Start Safe Research
              </>
            )}
          </button>
        </div>

        {statusMessage && (
          <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {productData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Product Details & Tabs */}
          <div className="lg:col-span-2 space-y-6">
            {/* Review Status Banner */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between ${
                reviewState === 'APPROVED'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : reviewState === 'STALE_APPROVAL'
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : reviewState === 'REJECTED'
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  : 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
              }`}
            >
              <div className="flex items-center gap-3">
                {reviewState === 'APPROVED' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                ) : reviewState === 'STALE_APPROVAL' ? (
                  <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                ) : reviewState === 'REJECTED' ? (
                  <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                ) : (
                  <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                )}
                <div>
                  <h3 className="font-semibold text-sm">Status: {reviewState}</h3>
                  <p className="text-xs opacity-90">
                    {reviewState === 'APPROVED'
                      ? `Cryptographically signed by ${approvalRecord?.reviewerId || 'Operator'}. Ready for Step 2J pipeline.`
                      : reviewState === 'STALE_APPROVAL'
                      ? 'Product data modified after approval. Cryptographic signature invalidated.'
                      : reviewState === 'REJECTED'
                      ? 'Candidate rejected by operator.'
                      : 'Candidate discovered. Awaiting operator verification.'}
                  </p>
                </div>
              </div>

              {approvalRecord && (
                <div className="text-right text-xs font-mono opacity-80 hidden md:block">
                  <div>ID: {approvalRecord.approvalId.slice(0, 14)}...</div>
                  <div>PFP: {approvalRecord.productFingerprint.slice(0, 12)}...</div>
                </div>
              )}
            </div>

            {/* Product Card */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={e => setEditedTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500">Price ($):</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editedPrice ?? ''}
                          onChange={e => setEditedPrice(parseFloat(e.target.value) || undefined)}
                          className="w-32 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                        />
                        <button
                          onClick={handleSaveEdits}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {productData.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-slate-200 text-sm">
                          ${productData.price?.toFixed(2) || 'N/A'} {productData.currency}
                        </span>
                        {productData.rating && (
                          <span className="flex items-center gap-1 text-amber-500 font-medium">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            {productData.rating} ({productData.reviewCount?.toLocaleString() || 0})
                          </span>
                        )}
                        {productData.availability && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {productData.availability}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-slate-400">
                          {productData.dataFingerprint?.slice(0, 16)}...
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800"
                    title="Simulate modifying product data"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Source Link */}
              {productData.sourceUrl && (
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{productData.sourceUrl}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400 ml-auto">
                    {productData.sourceUrlFingerprint?.slice(0, 12)}...
                  </span>
                </div>
              )}

              {/* Bullet Features */}
              {productData.keyFeatures && productData.keyFeatures.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Visible Key Features:
                  </h4>
                  <ul className="space-y-1">
                    {productData.keyFeatures.map((feat, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"
                      >
                        <span className="text-amber-500 mt-0.5">•</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Navigation Tabs for Deep Inspection */}
            <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4 text-xs font-medium">
              <button
                onClick={() => setActiveTab('OVERVIEW')}
                className={`pb-2 border-b-2 transition-colors ${
                  activeTab === 'OVERVIEW'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Candidates ({candidates.length})
              </button>
              <button
                onClick={() => setActiveTab('PROVENANCE')}
                className={`pb-2 border-b-2 transition-colors ${
                  activeTab === 'PROVENANCE'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Field Provenance ({productData.fieldProvenance?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('POLICY')}
                className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'POLICY'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Policy & Claims
                {policyResult && policyResult.verdict !== 'PASS' && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      policyResult.verdict === 'BLOCK' ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab('SCORE')}
                className={`pb-2 border-b-2 transition-colors ${
                  activeTab === 'SCORE'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Suitability Score ({scoreBreakdown?.finalScore ?? 'N/A'})
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-3">
                {candidates.map(cand => (
                  <div
                    key={cand.candidateId}
                    onClick={() => setSelectedCandidate(cand)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      selectedCandidate?.candidateId === cand.candidateId
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Rank #{cand.sourcePosition}
                      </span>
                      {cand.visiblePrice && (
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          ${cand.visiblePrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 mt-1">
                      {cand.title}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                      {cand.rating && (
                        <span>
                          ★ {cand.rating} ({cand.reviewCount})
                        </span>
                      )}
                      <span>Confidence: {(cand.confidence * 100).toFixed(0)}%</span>
                      <span className="font-mono text-[10px]">{cand.sourceFingerprint.slice(0, 10)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'PROVENANCE' && (
              <div className="space-y-3">
                {productData.fieldProvenance?.map((prov, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        Field: {prov.fieldName}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {prov.sourceType}
                      </span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      Screen: {prov.sourceScreen || 'Visible UI'} · Confidence:{' '}
                      {(prov.confidence * 100).toFixed(0)}%
                    </div>
                    {prov.sourceText && (
                      <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/80 font-mono text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                        "{prov.sourceText}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'POLICY' && (
              <div className="space-y-3">
                {policyResult ? (
                  <>
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                        policyResult.verdict === 'PASS'
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                          : policyResult.verdict === 'WARN'
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                          : 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>{policyResult.summary}</span>
                    </div>

                    {policyResult.warnings.map(w => (
                      <div
                        key={w.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {w.category}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              w.severity === 'BLOCK'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {w.severity}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">{w.reason}</p>
                        <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/80 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          Matched: "{w.flaggedText}"
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-slate-500">No policy analysis executed yet.</p>
                )}
              </div>
            )}

            {activeTab === 'SCORE' && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-3">
                {scoreBreakdown ? (
                  <>
                    <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
                      <div>
                        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                          {scoreBreakdown.finalScore} / 100
                        </span>
                        <p className="text-[11px] text-slate-500">Deterministic advisory quality score</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {scoreBreakdown.recommendation}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>Valid Source: {scoreBreakdown.hasValidSource ? '✓ 15 pts' : '✗ 0 pts'}</div>
                      <div>Title Quality: {scoreBreakdown.hasTitle ? '✓ 15 pts' : '✗ 0 pts'}</div>
                      <div>Visible Price: {scoreBreakdown.hasPrice ? '✓ 15 pts' : '✗ 0 pts'}</div>
                      <div>Features: {scoreBreakdown.hasFeatures ? '✓ 10 pts' : '✗ 0 pts'}</div>
                      <div>Description: {scoreBreakdown.hasDescription ? '✓ 10 pts' : '✗ 0 pts'}</div>
                      <div>Completeness: {scoreBreakdown.dataCompleteness} / 10 pts</div>
                    </div>

                    {(scoreBreakdown.policyPenalty > 0 || scoreBreakdown.duplicatePenalty > 0) && (
                      <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 text-xs">
                        Deductions: Policy (-{scoreBreakdown.policyPenalty} pts) · Duplicate (-
                        {scoreBreakdown.duplicatePenalty} pts)
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Score not yet calculated.</p>
                )}
              </div>
            )}
          </div>

          {/* Right Col: Human Review Action Panel */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 sticky top-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                Human Review & Approval
              </h3>

              <p className="text-xs text-slate-600 dark:text-slate-400">
                Approving this candidate will cryptographically bind your reviewer signature to the product
                fingerprint. Any future edits will automatically invalidate approval.
              </p>

              {/* Review Decision Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleApprove}
                  disabled={
                    reviewState === 'APPROVED' ||
                    policyResult?.verdict === 'BLOCK' ||
                    eStop.isActive()
                  }
                  className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Product
                </button>

                <button
                  onClick={handleReject}
                  disabled={reviewState === 'REJECTED' || eStop.isActive()}
                  className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-800 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Product
                </button>
              </div>

              {/* Step 2J Pipeline Transition */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  onClick={handleSendToPipeline}
                  disabled={reviewState !== 'APPROVED' || eStop.isActive()}
                  className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <span>Send to Content Pipeline</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                  Sends approved ProductData to Step 2J Content Review.
                </p>
              </div>

              {/* Emergency Stop Action */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    eStop.trigger('Operator triggered Emergency Stop from Product Research.');
                    setStatusMessage('Emergency Stop activated.');
                  }}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  Emergency Stop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
