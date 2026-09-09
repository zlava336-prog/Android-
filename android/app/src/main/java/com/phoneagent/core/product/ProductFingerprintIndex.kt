package com.phoneagent.core.product

/**
 * Phone Agent - Step 2K Product Duplicate Detection Index (Android)
 */
class ProductFingerprintIndex private constructor() {

    data class IndexedProduct(
        val productFingerprint: String,
        val urlFingerprint: String,
        val sourceUrl: String?,
        val title: String,
        val firstSeenAt: Long,
        var lastSeenAt: Long
    )

    data class DuplicateResult(
        val isDuplicate: Boolean,
        val reason: String? = null,
        val hasConflict: Boolean = false
    )

    private val fingerprintMap = mutableMapOf<String, IndexedProduct>()
    private val urlMap = mutableMapOf<String, String>()

    fun checkProductDuplicate(product: ProductData): DuplicateResult {
        val pfp = product.dataFingerprint ?: ProductFingerprint.computeProductFingerprint(product)
        if (fingerprintMap.containsKey(pfp)) {
            return DuplicateResult(true, "Exact product fingerprint match.", false)
        }

        val url = product.sourceUrl
        if (!url.isNullOrBlank()) {
            val urlFp = product.sourceUrlFingerprint ?: ProductFingerprint.computeProductUrlFingerprint(url)
            if (urlMap.containsKey(urlFp)) {
                return DuplicateResult(true, "URL previously researched with different details.", true)
            }
        }

        return DuplicateResult(false)
    }

    fun indexProduct(product: ProductData) {
        val pfp = product.dataFingerprint ?: ProductFingerprint.computeProductFingerprint(product)
        val url = product.sourceUrl
        val urlFp = if (!url.isNullOrBlank()) ProductFingerprint.computeProductUrlFingerprint(url) else ""
        val now = System.currentTimeMillis()

        val existing = fingerprintMap[pfp]
        if (existing != null) {
            existing.lastSeenAt = now
            return
        }

        val entry = IndexedProduct(pfp, urlFp, url, product.title, now, now)
        fingerprintMap[pfp] = entry
        if (urlFp.isNotEmpty()) {
            urlMap[urlFp] = pfp
        }
    }

    companion object {
        val instance = ProductFingerprintIndex()
    }
}
