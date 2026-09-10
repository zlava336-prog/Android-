package com.phoneagent.core.orchestrator

import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList

data class AndroidAuditEvent(
    val eventId: String,
    val jobId: String,
    val previousState: OrchestrationState,
    val newState: OrchestrationState,
    val action: String,
    val actor: String,
    val timestamp: Long,
    val chainHash: String,
    val safetyCheckPassed: Boolean,
    val details: String
)

class OrchestrationAuditManager {
    private val chain = CopyOnWriteArrayList<AndroidAuditEvent>()
    private var lastHash = "0000000000000000000000000000000000000000000000000000000000000000"

    fun recordEvent(
        jobId: String,
        previousState: OrchestrationState,
        newState: OrchestrationState,
        action: String,
        actor: String,
        safetyCheckPassed: Boolean,
        details: String
    ): AndroidAuditEvent {
        val now = System.currentTimeMillis()
        val eventId = "audit_${jobId}_${now}_${chain.size + 1}"
        val sanitized = sanitize(details)
        val payload = "$lastHash|$eventId|$jobId|${previousState.name}|${newState.name}|$action|$actor|$now|$sanitized"
        val hash = sha256(payload)
        lastHash = hash

        val event = AndroidAuditEvent(
            eventId = eventId,
            jobId = jobId,
            previousState = previousState,
            newState = newState,
            action = action,
            actor = actor,
            timestamp = now,
            chainHash = hash,
            safetyCheckPassed = safetyCheckPassed,
            details = sanitized
        )
        chain.add(event)
        return event
    }

    private fun sanitize(text: String): String {
        return text.replace(Regex("(?i)(password|otp|pin|token|card|cvv)[:=\\s]+([^\\s,]+)"), "$1:[REDACTED]")
    }

    private fun sha256(input: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    companion object {
        @Volatile
        private var instance: OrchestrationAuditManager? = null
        fun getInstance(): OrchestrationAuditManager =
            instance ?: synchronized(this) {
                instance ?: OrchestrationAuditManager().also { instance = it }
            }
    }
}
