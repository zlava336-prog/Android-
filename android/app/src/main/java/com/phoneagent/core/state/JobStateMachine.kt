package com.phoneagent.core.state

import com.phoneagent.core.model.JobState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.ConcurrentHashMap

/**
 * Deterministic State Machine for Job execution.
 * Guarantees that only strictly valid transitions are allowed,
 * and allows immediate transition to STOPPED or FAILED at any point.
 */
class JobStateMachine(initialState: JobState = JobState.RECEIVED) {

    private val _state = MutableStateFlow(initialState)
    val state: StateFlow<JobState> = _state.asStateFlow()

    private var previousState: JobState? = null
    private var emergencyHalted: Boolean = false

    private val validTransitions: Map<JobState, Set<JobState>> = mapOf(
        JobState.RECEIVED to setOf(JobState.VALIDATING, JobState.STOPPED, JobState.FAILED),
        JobState.VALIDATING to setOf(JobState.OPENING_APP, JobState.STOPPED, JobState.FAILED),
        JobState.OPENING_APP to setOf(JobState.WAITING_FOR_READY, JobState.STOPPED, JobState.FAILED),
        JobState.WAITING_FOR_READY to setOf(JobState.SELECTING_MEDIA, JobState.STOPPED, JobState.FAILED),
        JobState.SELECTING_MEDIA to setOf(JobState.ENTERING_METADATA, JobState.STOPPED, JobState.FAILED),
        JobState.ENTERING_METADATA to setOf(JobState.VERIFYING_PREVIEW, JobState.STOPPED, JobState.FAILED),
        JobState.VERIFYING_PREVIEW to setOf(JobState.WAITING_FOR_APPROVAL, JobState.PUBLISHING, JobState.STOPPED, JobState.FAILED),
        JobState.WAITING_FOR_APPROVAL to setOf(JobState.PUBLISHING, JobState.STOPPED, JobState.FAILED),
        JobState.PUBLISHING to setOf(JobState.VERIFYING_RESULT, JobState.STOPPED, JobState.FAILED),
        JobState.VERIFYING_RESULT to setOf(JobState.COMPLETED, JobState.STOPPED, JobState.FAILED),
        JobState.COMPLETED to setOf(JobState.RECEIVED),
        JobState.FAILED to setOf(JobState.RECEIVED),
        JobState.STOPPED to setOf(JobState.RECEIVED)
    )

    fun getCurrentState(): JobState = _state.value
    fun getPreviousState(): JobState? = previousState
    fun isEmergencyHalted(): Boolean = emergencyHalted

    @Synchronized
    fun transitionTo(target: JobState, reason: String = ""): Boolean {
        val current = _state.value

        // Emergency Stop can happen from ANY state
        if (target == JobState.STOPPED) {
            emergencyHalted = true
            previousState = current
            _state.value = JobState.STOPPED
            return true
        }

        if (emergencyHalted && target != JobState.RECEIVED) {
            return false
        }

        // FAILED can happen from any non-terminal state
        if (target == JobState.FAILED) {
            previousState = current
            _state.value = JobState.FAILED
            return true
        }

        val allowed = validTransitions[current] ?: emptySet()
        if (target in allowed) {
            previousState = current
            _state.value = target
            if (target == JobState.RECEIVED) {
                emergencyHalted = false
            }
            return true
        }

        return false
    }

    fun emergencyStop(reason: String = "User Emergency Stop") {
        transitionTo(JobState.STOPPED, reason)
    }

    fun reset() {
        emergencyHalted = false
        transitionTo(JobState.RECEIVED, "Reset")
    }
}
