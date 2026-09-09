package com.phoneagent.core.logging

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.CopyOnWriteArrayList

enum class LogLevel {
    INFO, WARN, ERROR, SECURITY, ACTION
}

data class ActionLogEntry(
    val id: String,
    val timestamp: Long,
    val jobId: String? = null,
    val platform: String? = null,
    val action: String,
    val details: String,
    val nodeId: String? = null,
    val level: LogLevel = LogLevel.INFO,
    val safetyVerified: Boolean = true
)

object LocalActionLogger {
    private val logList = CopyOnWriteArrayList<ActionLogEntry>()
    private val _logsFlow = MutableStateFlow<List<ActionLogEntry>>(emptyList())
    val logsFlow: StateFlow<List<ActionLogEntry>> = _logsFlow.asStateFlow()

    init {
        log(
            action = "AGENT_INITIALIZED",
            details = "Phone Agent local audit logging initialized with zero-trust security policy.",
            level = LogLevel.INFO
        )
    }

    fun log(
        action: String,
        details: String,
        jobId: String? = null,
        platform: String? = null,
        nodeId: String? = null,
        level: LogLevel = LogLevel.INFO,
        safetyVerified: Boolean = true
    ) {
        val entry = ActionLogEntry(
            id = "log_${System.currentTimeMillis()}_${(100..999).random()}",
            timestamp = System.currentTimeMillis(),
            jobId = jobId,
            platform = platform,
            action = action,
            details = details,
            nodeId = nodeId,
            level = level,
            safetyVerified = safetyVerified
        )
        logList.add(0, entry)
        if (logList.size > 500) {
            logList.removeAt(logList.lastIndex)
        }
        _logsFlow.value = logList.toList()
    }

    fun clear() {
        logList.clear()
        _logsFlow.value = emptyList()
        log(action = "LOGS_CLEARED", details = "Audit trail cleared by user.", level = LogLevel.WARN)
    }

    fun getAllLogs(): List<ActionLogEntry> = logList.toList()
}
