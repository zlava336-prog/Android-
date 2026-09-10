package com.phoneagent.core.orchestrator

enum class OrchestrationStepType {
    START,
    PRODUCT_RESEARCH,
    PRODUCT_REVIEW,
    CONTENT_GENERATION,
    CONTENT_REVIEW,
    VIDEO_PROJECT_CREATION,
    VIDEO_RENDER,
    VIDEO_REVIEW,
    AMAZON_LINK_CAPTURE,
    PLATFORM_PLANNING,
    HUMAN_PUBLISH_APPROVAL,
    PLATFORM_EXECUTION,
    PUBLICATION_VERIFICATION,
    FINAL_RECONCILIATION,
    COMPLETE
}

enum class StepExecutionStatus {
    PENDING,
    IN_PROGRESS,
    WAITING_APPROVAL,
    COMPLETED,
    SKIPPED,
    FAILED,
    UNKNOWN
}

data class OrchestrationStep(
    val stepId: String,
    val stepType: OrchestrationStepType,
    val sequenceIndex: Int,
    var status: StepExecutionStatus = StepExecutionStatus.PENDING,
    var startedAt: Long? = null,
    var completedAt: Long? = null,
    var error: String? = null,
    var retryCount: Int = 0,
    val approvalRequired: Boolean = false
)
