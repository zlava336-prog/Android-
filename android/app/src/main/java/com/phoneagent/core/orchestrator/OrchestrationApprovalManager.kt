package com.phoneagent.core.orchestrator

import com.phoneagent.core.model.SupportedPlatform
import java.util.concurrent.ConcurrentHashMap

enum class ApprovalGateType {
    PRODUCT_REVIEW,
    CONTENT_REVIEW,
    VIDEO_REVIEW,
    FINAL_PUBLISH_APPROVAL
}

enum class GateApprovalStatus {
    PENDING,
    APPROVED,
    REJECTED,
    STALE_APPROVAL
}

data class GateApprovalRecord(
    val approvalId: String,
    val gateType: ApprovalGateType,
    val jobId: String,
    val reviewerId: String,
    val sessionId: String,
    val timestamp: Long,
    var status: GateApprovalStatus = GateApprovalStatus.APPROVED,
    val productFingerprint: String? = null,
    val contentFingerprint: String? = null,
    val mediaFingerprint: String? = null,
    val videoFingerprint: String? = null,
    val outputFingerprint: String? = null,
    val platformPlanFingerprint: String? = null,
    val platforms: List<SupportedPlatform>? = null,
    val notes: String? = null
)

class OrchestrationApprovalManager {
    private val approvals = ConcurrentHashMap<String, GateApprovalRecord>()

    fun submitApproval(
        gateType: ApprovalGateType,
        jobId: String,
        reviewerId: String,
        sessionId: String,
        productFingerprint: String? = null,
        contentFingerprint: String? = null,
        mediaFingerprint: String? = null,
        videoFingerprint: String? = null,
        outputFingerprint: String? = null,
        platformPlanFingerprint: String? = null,
        platforms: List<SupportedPlatform>? = null,
        notes: String? = null
    ): GateApprovalRecord {
        val normalizedReviewer = reviewerId.trim().uppercase()
        if (normalizedReviewer.contains("AI") || normalizedReviewer.contains("BOT") || normalizedReviewer.contains("SYSTEM")) {
            throw SecurityException("Approval gate $gateType must be approved by a verified human operator. AI auto-approval is prohibited.")
        }

        val approvalId = "appr_${gateType.name.lowercase()}_${jobId}_${System.currentTimeMillis()}"
        val record = GateApprovalRecord(
            approvalId = approvalId,
            gateType = gateType,
            jobId = jobId,
            reviewerId = reviewerId.trim(),
            sessionId = sessionId,
            timestamp = System.currentTimeMillis(),
            status = GateApprovalStatus.APPROVED,
            productFingerprint = productFingerprint,
            contentFingerprint = contentFingerprint,
            mediaFingerprint = mediaFingerprint,
            videoFingerprint = videoFingerprint,
            outputFingerprint = outputFingerprint,
            platformPlanFingerprint = platformPlanFingerprint,
            platforms = platforms,
            notes = notes
        )
        approvals[approvalId] = record
        return record
    }

    companion object {
        @Volatile
        private var instance: OrchestrationApprovalManager? = null
        fun getInstance(): OrchestrationApprovalManager =
            instance ?: synchronized(this) {
                instance ?: OrchestrationApprovalManager().also { instance = it }
            }
    }
}
