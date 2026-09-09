package com.phoneagent.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phoneagent.core.logging.LocalActionLogger
import com.phoneagent.core.logging.LogLevel
import com.phoneagent.core.model.JobModel
import com.phoneagent.core.model.JobState
import com.phoneagent.core.safety.EmergencyStopManager
import com.phoneagent.core.state.JobStateMachine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val connectionStatus: String = "CONNECTED_STANDBY",
    val currentJob: JobModel? = null,
    val currentJobState: JobState = JobState.RECEIVED,
    val isEmergencyStopped: Boolean = false,
    val isAccessibilityEnabled: Boolean = false,
    val currentActionDescription: String = "Ready for authorized job"
)

class DashboardViewModel : ViewModel() {

    private val stateMachine = JobStateMachine()
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            EmergencyStopManager.isStopped.collect { stopped ->
                _uiState.value = _uiState.value.copy(
                    isEmergencyStopped = stopped,
                    currentJobState = if (stopped) JobState.STOPPED else _uiState.value.currentJobState
                )
            }
        }
        viewModelScope.launch {
            stateMachine.state.collect { state ->
                _uiState.value = _uiState.value.copy(currentJobState = state)
            }
        }
    }

    fun triggerEmergencyStop(reason: String) {
        stateMachine.emergencyStop(reason)
        EmergencyStopManager.trigger(reason)
        LocalActionLogger.log(
            action = "EMERGENCY_STOP",
            details = "Emergency stop triggered: $reason",
            level = LogLevel.WARN
        )
    }

    fun resetStateMachine() {
        stateMachine.reset()
        EmergencyStopManager.reset()
        LocalActionLogger.log(
            action = "AGENT_RESET",
            details = "Phone agent state machine and safety locks reset.",
            level = LogLevel.INFO
        )
    }
}
