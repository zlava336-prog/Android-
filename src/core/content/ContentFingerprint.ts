/**
 * Phone Agent - Deterministic Content & Media Cryptographic Fingerprinting
 * Synchronous, zero-dependency, pure SHA-256 cryptographic hashing.
 * Guarantees strict canonicalization across all platforms, runtimes, and recovery events.
 */

import { ContentPackage, MediaAsset, PlatformContentOverride, ProductData } from './ContentPackage';

/**
 * Standard SHA-256 implementation in pure TypeScript.
 * Produces standard 64-character lowercase hex output.
 */
export function sha256(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;

  // SHA-256 constants
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Initial hash values
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // Pre-processing: padding
  const l = bytes.length;
  const bitLen = l * 8;
  const rem = (l + 9) % 64;
  const padLen = rem === 0 ? 0 : 64 - rem;
  const totalLen = l + 1 + padLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[l] = 0x80;

  // Append length in bits (big-endian 64-bit int)
  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  view.setUint32(totalLen - 8, highBits, false);
  view.setUint32(totalLen - 4, lowBits, false);

  // Process 512-bit (64-byte) chunks
  const w = new Uint32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < totalLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const hex = [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => v.toString(16).padStart(8, '0'))
    .join('');

  return hex;
}

/**
 * Computes deterministic SHA-256 fingerprint for a single media asset.
 */
export function computeMediaFingerprint(asset: MediaAsset): string {
  const canonical = JSON.stringify({
    localUri: asset.localUri.trim(),
    mimeType: asset.mimeType.trim().toLowerCase(),
    mediaType: asset.mediaType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs || 0,
    sha256: (asset.sha256 || '').trim().toLowerCase(),
  });
  return `mfp_${sha256(canonical)}`;
}

/**
 * Computes deterministic fingerprint across a list of media assets.
 */
export function computeMediaCollectionFingerprint(assets: MediaAsset[]): string {
  if (!assets || assets.length === 0) return 'mfp_empty';
  const sorted = [...assets]
    .sort((a, b) => a.assetId.localeCompare(b.assetId))
    .map(computeMediaFingerprint);
  return `mfp_coll_${sha256(sorted.join('::'))}`;
}

/**
 * Computes deterministic SHA-256 fingerprint for a platform override.
 */
export function computePlatformOverrideFingerprint(override: PlatformContentOverride): string {
  const canonical = JSON.stringify({
    platform: override.platform.toLowerCase().trim(),
    caption: (override.caption || '').trim(),
    title: (override.title || '').trim(),
    description: (override.description || '').trim(),
    hashtags: (override.hashtags || [])
      .map(h => (h.startsWith('#') ? h : `#${h}`).trim().toLowerCase())
      .filter(Boolean)
      .sort(),
    callToAction: (override.callToAction || '').trim(),
    coverUri: (override.coverUri || '').trim(),
    mediaAssetId: (override.mediaAssetId || '').trim(),
  });
  return `ofp_${sha256(canonical)}`;
}

/**
 * Computes deterministic SHA-256 content fingerprint for a complete ContentPackage.
 * Includes canonicalized:
 * - base content (caption, title, description)
 * - hashtags (sorted)
 * - callToAction
 * - canonical product data
 * - selected platforms (sorted)
 * - media fingerprint
 * - platform overrides (sorted by platform)
 */
export function computeDeterministicContentFingerprint(pkg: {
  baseCaption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  callToAction?: string;
  selectedPlatforms?: string[];
  productData?: ProductData;
  mediaFingerprint?: string;
  platformOverrides?: Partial<Record<string, PlatformContentOverride>>;
}): string {
  const canonicalProduct = pkg.productData
    ? {
        productName: (pkg.productData.productName || '').trim(),
        productUrl: (pkg.productData.productUrl || '').trim(),
        source: pkg.productData.source,
        price: pkg.productData.price || 0,
        currency: (pkg.productData.currency || '').trim().toUpperCase(),
        affiliateLink: (pkg.productData.affiliateLink || '').trim(),
        productId: (pkg.productData.productId || '').trim(),
      }
    : null;

  const sortedHashtags = (pkg.hashtags || [])
    .map(h => (h.startsWith('#') ? h : `#${h}`).trim().toLowerCase())
    .filter(Boolean)
    .sort();

  const sortedPlatforms = [...(pkg.selectedPlatforms || [])]
    .map(p => p.trim().toLowerCase())
    .sort();

  // Canonicalize overrides by platform name
  const overrideKeys = Object.keys(pkg.platformOverrides || {}).sort();
  const canonicalOverrides: Record<string, string> = {};
  for (const k of overrideKeys) {
    const o = pkg.platformOverrides?.[k];
    if (o) {
      canonicalOverrides[k] = computePlatformOverrideFingerprint(o);
    }
  }

  const canonicalObj = {
    baseCaption: (pkg.baseCaption || '').trim(),
    title: (pkg.title || '').trim(),
    description: (pkg.description || '').trim(),
    hashtags: sortedHashtags,
    callToAction: (pkg.callToAction || '').trim(),
    selectedPlatforms: sortedPlatforms,
    productData: canonicalProduct,
    mediaFingerprint: (pkg.mediaFingerprint || '').trim(),
    platformOverrides: canonicalOverrides,
  };

  return `cfp_${sha256(JSON.stringify(canonicalObj))}`;
}
