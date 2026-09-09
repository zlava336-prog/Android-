package com.phoneagent.core.product

/**
 * Phone Agent - Step 2K Product Candidate Model (Android)
 */
data class ProductCandidate(
    val candidateId: String,
    val title: String,
    val visiblePrice: Double? = null,
    val priceQualifier: String? = null,
    val currency: String? = null,
    val rating: Double? = null,
    val reviewCount: Int? = null,
    val thumbnailUri: String? = null,
    val productUrl: String? = null,
    val sourcePosition: Int,
    val sourceFingerprint: String,
    val confidence: Double = 1.0,
    val rawTextSnippet: String? = null,
    val isSponsored: Boolean = false
)

data class ProductResearchRequest(
    val requestId: String,
    val query: String,
    val category: String? = null,
    val minPrice: Double? = null,
    val maxPrice: Double? = null,
    val currency: String? = "USD",
    val desiredAttributes: List<String> = emptyList(),
    val maximumCandidates: Int = 5,
    val createdAt: Long = System.currentTimeMillis()
)
