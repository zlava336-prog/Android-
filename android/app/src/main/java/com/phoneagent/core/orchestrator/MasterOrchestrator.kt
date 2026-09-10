package com.phoneagent.core.orchestrator

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MasterOrchestrator {
    private val _state = MutableStateFlow(OrchestrationState.IDLE)
    val state: StateFlow<OrchestrationState> = _state.asStateFlow()

    private val approvalManager = OrchestrationApprovalManager.getInstance()
    private val auditManager = OrchestrationAuditManager.getInstance()

    var activePlan: OrchestrationPlan? = null
        private set

    fun initialize(plan: OrchestrationPlan) {
        activePlan = plan
        _state.value = OrchestrationState.INITIALIZING
        auditManager.recordEvent(
            jobId = plan.planId,
            previousState = OrchestrationState.IDLE,
            newState = OrchestrationState.INITIALIZING,
            action = "INIT_WORKFLOW",
            actor = plan.operatorId,
            safetyCheckPassed = true,
            details = "Initialized workflow for ${plan.searchQuery}"
        )
    }

    companion object {
        @Volatile
        private var instance: MasterOrchestrator? = null
        fun getInstance(): MasterOrchestrator =
            instance ?: synchronized(this) {
                instance ?: MasterOrchestrator().also { instance = it }
            }
    }
}
