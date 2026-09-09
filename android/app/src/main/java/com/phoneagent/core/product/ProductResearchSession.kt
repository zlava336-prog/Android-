package com.phoneagent.core.product

import com.phoneagent.core.safety.EmergencyStopManager

enum class ResearchState {
    CREATED,
    VALIDATING,
    OPENING_AMAZON,
    VERIFYING_AMAZON,
    SEARCHING,
    PRODUCT_CANDIDATE_FOUND,
    EXTRACTING_VISIBLE_DATA,
    VALIDATING_DATA,
    NEEDS_REVIEW,
    APPROVED,
    COMPLETED,
    CANCELLED,
    FAILED,
    EMERGENCY_STOPPED,
    BLOCKED,
    STALE
}

/**
 * Phone Agent - Step 2K Product Research Session & State Machine (Android)
 */
class ProductResearchSession(
    val sessionId: String,
    val request: ProductResearchRequest
) {
    var state: ResearchState = ResearchState.CREATED
        private set

    var candidates: List<ProductCandidate> = emptyList()
    var selectedCandidate: ProductCandidate? = null
    var productData: ProductData? = null
    var recoveryAttempts: Int = 0
        private set

    fun transitionTo(newState: ResearchState, reason: String): Boolean {
        if (state == newState) return true

        if (EmergencyStopManager.isStopped.value) {
            state = ResearchState.EMERGENCY_STOPPED
            return true
        }

        // Terminal safety guards
        if ((state == ResearchState.FAILED || state == ResearchState.STALE) && newState == ResearchState.APPROVED) {
            return false
        }
        if (state == ResearchState.EMERGENCY_STOPPED) {
            return false
        }

        state = newState
        return true
    }

    fun attemptRecovery(error: String): Boolean {
        if (recoveryAttempts >= 2) {
            EmergencyStopManager.trigger("Max recovery attempts exceeded for research session $sessionId: $error")
            state = ResearchState.EMERGENCY_STOPPED
            return false
        }
        recoveryAttempts++
        return true
    }
}
