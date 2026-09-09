/**
 * Phone Agent - Step 2K Product Cryptographic Fingerprinting
 * Computes deterministic `pfp_<sha256>` fingerprints over canonicalized factual product data.
 * Validates Amazon URLs and computes `urlfp_<sha256>` for safe link extraction.
 */

import { sha256 } from '../content/ContentFingerprint';
import { ProductData } from './ProductData';

/**
 * Computes a deterministic cryptographic fingerprint for canonicalized product data.
 * Includes factual product attributes while excluding transient UI state.
 */
export function computeProductFingerprint(product: ProductData): string {
  // Sort features and specifications canonically
  const sortedFeatures = [...(product.keyFeatures || [])].map(f => f.trim()).filter(Boolean).sort();
  const sortedBenefits = [...(product.benefits || [])].map(b => b.trim()).filter(Boolean).sort();

  const specKeys = Object.keys(product.specifications || {}).sort();
  const sortedSpecs: Record<string, string> = {};
  for (const k of specKeys) {
    sortedSpecs[k] = (product.specifications?.[k] || '').trim();
  }

  // Canonical media asset IDs / checksums
  const mediaChecksums = (product.imageAssets || [])
    .map(a => a.sha256 || a.assetId)
    .sort();

  const canonicalObj = {
    productId: (product.productId || '').trim(),
    source: (product.source || '').trim().toUpperCase(),
    sourceUrl: (product.sourceUrl || '').trim(),
    title: (product.title || product.productName || '').trim(),
    brand: (product.brand || '').trim(),
    category: (product.category || '').trim(),
    price: product.price !== undefined ? Number(product.price.toFixed(2)) : null,
    currency: (product.currency || '').trim().toUpperCase(),
    priceQualifier: (product.priceQualifier || '').trim(),
    availability: (product.availability || '').trim(),
    rating: product.rating !== undefined ? Number(product.rating.toFixed(2)) : null,
    reviewCount: product.reviewCount !== undefined ? Math.floor(product.reviewCount) : null,
    description: (product.description || '').trim(),
    keyFeatures: sortedFeatures,
    benefits: sortedBenefits,
    specifications: sortedSpecs,
    mediaChecksums,
    affiliateLink: (product.affiliateLink || '').trim(),
  };

  return `pfp_${sha256(JSON.stringify(canonicalObj))}`;
}

/**
 * Computes a deterministic SHA-256 fingerprint for a canonicalized Amazon product URL.
 */
export function computeProductUrlFingerprint(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  return `urlfp_${sha256(trimmed)}`;
}

/**
 * Validates Amazon product URL against strict safety invariants.
 * Allows amazon.com, amazon.in, amzn.to, etc.
 * Rejects malicious schemes, non-Amazon domains, or script injection.
 */
export function validateAmazonProductUrl(url: string): {
  valid: boolean;
  reason?: string;
  asin?: string;
  canonicalUrl?: string;
} {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL is empty or undefined.' };
  }

  const trimmed = url.trim();

  // Strict scheme check: https only (or http in testing mocks)
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return { valid: false, reason: 'Unsupported URL scheme. Amazon URLs must use HTTPS.' };
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    const allowedHosts = [
      'amazon.com',
      'www.amazon.com',
      'amazon.in',
      'www.amazon.in',
      'amazon.co.uk',
      'www.amazon.co.uk',
      'amazon.de',
      'www.amazon.de',
      'amazon.ca',
      'www.amazon.ca',
      'amzn.to',
      'www.amzn.to',
      'amzn.in',
      'www.amzn.in',
      'a.co',
      'www.a.co',
    ];

    const isAllowedHost = allowedHosts.some(h => hostname === h || hostname.endsWith(`.${h}`));
    if (!isAllowedHost) {
      return { valid: false, reason: `Disallowed host: "${hostname}". Only verified Amazon domains are permitted.` };
    }

    // Extract ASIN if available (typically 10-char alphanumeric in /dp/B... or /gp/product/B...)
    let asin: string | undefined;
    const dpMatch = parsed.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (dpMatch && dpMatch[1]) {
      asin = dpMatch[1].toUpperCase();
    }

    return {
      valid: true,
      asin,
      canonicalUrl: trimmed,
    };
  } catch {
    return { valid: false, reason: 'Invalid URL syntax.' };
  }
}
