package com.phoneagent.core.product

import java.security.MessageDigest

/**
 * Phone Agent - Step 2K Product Review & Cryptographic Approval Manager (Android)
 */
class ProductReviewManager {

    data class ApprovalRecord(
        val approvalId: String,
        val researchSessionId: String,
        val reviewerId: String,
        val approvedAt: Long,
        val productFingerprint: String,
        val sourceUrlFingerprint: String,
        val policyFingerprint: String,
        var isRevoked: Boolean = false
    )

    private val approvals = mutableMapOf<String, ApprovalRecord>()

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }
    }

    fun approveProduct(
        product: ProductData,
        sessionId: String,
        reviewerId: String,
        policyResult: ProductPolicyResult
    ): Pair<ProductData, ApprovalRecord> {
        if (policyResult.verdict == PolicyVerdict.BLOCK) {
            throw IllegalStateException("Cannot approve product with policy BLOCK verdict")
        }

        val pfp = product.dataFingerprint ?: ProductFingerprint.computeProductFingerprint(product)
        val urlFp = product.sourceUrl?.let { ProductFingerprint.computeProductUrlFingerprint(it) } ?: ""
        val now = System.currentTimeMillis()
        val approvalId = "prod_appr_${sha256("$pfp:$reviewerId:$now")}"

        val record = ApprovalRecord(
            approvalId = approvalId,
            researchSessionId = sessionId,
            reviewerId = reviewerId,
            approvedAt = now,
            productFingerprint = pfp,
            sourceUrlFingerprint = urlFp,
            policyFingerprint = policyResult.policyFingerprint
        )

        approvals[approvalId] = record
        val approvedProduct = product.copy(
            dataFingerprint = pfp,
            sourceUrlFingerprint = urlFp,
            validationStatus = ProductValidationStatus.VALID
        )

        ProductFingerprintIndex.instance.indexProduct(approvedProduct)

        return Pair(approvedProduct, record)
    }

    fun isApprovalValid(product: ProductData, record: ApprovalRecord?): Boolean {
        if (record == null || record.isRevoked) return false
        val currentPfp = ProductFingerprint.computeProductFingerprint(product)
        return currentPfp == record.productFingerprint
    }

    companion object {
        val instance = ProductReviewManager()
    }
}
