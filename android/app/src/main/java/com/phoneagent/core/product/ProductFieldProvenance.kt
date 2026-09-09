package com.phoneagent.core.product

/**
 * Phone Agent - Step 2K Field-Level Provenance & Evidence Contracts (Android)
 */
enum class ProvenanceSourceType {
    AMAZON_VISIBLE_UI,
    USER_PROVIDED,
    LOCAL_MEDIA,
    SYSTEM_DERIVED,
    UNKNOWN
}

data class ProductFieldProvenance(
    val fieldName: String,
    val sourceType: ProvenanceSourceType,
    val sourceScreen: String? = null,
    val sourceText: String? = null,
    val extractedValue: Any? = null,
    val extractedAt: Long = System.currentTimeMillis(),
    val confidence: Double = 1.0,
    val fingerprint: String? = null,
    val isVerified: Boolean = sourceType == ProvenanceSourceType.AMAZON_VISIBLE_UI || sourceType == ProvenanceSourceType.USER_PROVIDED,
    val notes: String? = null
)

data class ProductFieldConflict(
    val fieldName: String,
    val valueA: Any?,
    val sourceA: String,
    val valueB: Any?,
    val sourceB: String,
    val detectedAt: Long = System.currentTimeMillis(),
    var resolved: Boolean = false,
    var resolvedValue: Any? = null
)
