package com.phoneagent.core.product

enum class ProductValidationStatus {
    VALID,
    NEEDS_REVIEW,
    INVALID,
    CONFLICT
}

/**
 * Phone Agent - Step 2K Product Data Model (Android)
 * Deterministic, source-backed product information extracted from the visible Amazon UI.
 */
data class ProductData(
    val productId: String? = null,
    val source: String = "AMAZON",
    val sourceUrl: String? = null,
    val sourceUrlFingerprint: String? = null,
    val title: String,
    val productName: String = title,
    val brand: String? = null,
    val category: String? = null,
    val price: Double? = null,
    val currency: String = "USD",
    val priceQualifier: String? = null,
    val availability: String? = null,
    val rating: Double? = null,
    val reviewCount: Int? = null,
    val description: String? = null,
    val keyFeatures: List<String> = emptyList(),
    val benefits: List<String> = emptyList(),
    val specifications: Map<String, String> = emptyMap(),
    val imageUris: List<String> = emptyList(),
    val sourceTimestamp: Long = System.currentTimeMillis(),
    val dataFingerprint: String? = null,
    val researchSessionId: String? = null,
    val overallConfidence: Double = 1.0,
    val validationStatus: ProductValidationStatus = ProductValidationStatus.NEEDS_REVIEW,
    val fieldProvenance: List<ProductFieldProvenance> = emptyList(),
    val conflicts: List<ProductFieldConflict> = emptyList(),
    val affiliateLink: String? = null
)
