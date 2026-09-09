package com.phoneagent.core.safety

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object EmergencyStopManager {
    private val _isStopped = MutableStateFlow(false)
    val isStopped: StateFlow<Boolean> = _isStopped.asStateFlow()

    private var stopReason: String = ""
    private var stopTimestamp: Long = 0L

    @Synchronized
    fun trigger(reason: String = "User Emergency Stop") {
        _isStopped.value = true
        stopReason = reason
        stopTimestamp = System.currentTimeMillis()
    }

    @Synchronized
    fun activate(reason: String = "User Emergency Stop") = trigger(reason)

    @Synchronized
    fun reset() {
        _isStopped.value = false
        stopReason = ""
        stopTimestamp = 0L
    }

    fun getReason(): String = stopReason
    fun getTimestamp(): Long = stopTimestamp
}
