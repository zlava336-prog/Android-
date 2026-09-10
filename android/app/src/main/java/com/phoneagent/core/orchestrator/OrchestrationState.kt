package com.phoneagent.core.orchestrator

/**
 * Phone Agent - Step 2N Master AI Orchestrator States (Android Native)
 * Strictly typed enum representing canonical workflow states.
 */
enum class OrchestrationState {
    IDLE,
    INITIALIZING,
    RESEARCHING,
    WAITING_FOR_PRODUCT_REVIEW,
    GENERATING_CONTENT,
    WAITING_FOR_CONTENT_REVIEW,
    CREATING_VIDEO,
    RENDERING_VIDEO,
    WAITING_FOR_VIDEO_REVIEW,
    CAPTURING_AMAZON_LINK,
    PLANNING_PLATFORMS,
    WAITING_FOR_PUBLISH_APPROVAL,
    EXECUTING_PLATFORM,
    VERIFYING_PUBLICATION,
    RECONCILING,
    COMPLETED,
    PARTIALLY_COMPLETED,
    FAILED,
    CANCELLED,
    UNKNOWN,
    EMERGENCY_STOPPED;

    fun isApprovalGate(): Boolean = when (this) {
        WAITING_FOR_PRODUCT_REVIEW,
        WAITING_FOR_CONTENT_REVIEW,
        WAITING_FOR_VIDEO_REVIEW,
        WAITING_FOR_PUBLISH_APPROVAL -> true
        else -> false
    }

    fun isTerminal(): Boolean = when (this) {
        COMPLETED, FAILED, CANCELLED -> true
        else -> false
    }
}
