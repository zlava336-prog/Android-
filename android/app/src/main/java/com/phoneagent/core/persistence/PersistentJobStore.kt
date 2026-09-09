package com.phoneagent.core.persistence

import com.phoneagent.core.model.Platform
import com.phoneagent.core.safety.EmergencyStopManager
import com.phoneagent.core.planner.ApprovalLevel
import com.phoneagent.core.planner.NormalizedContentPayload
import com.phoneagent.core.planner.PlatformStepStatus
import com.phoneagent.core.planner.ContentFingerprinter
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * Step 2I - Persistent Job Store & Crash Recovery Engine for Android
 * Strictly preserves safety invariants, durable state, execution leases, and crash recovery.
 */

enum class PersistentJobStatus {
    PENDING,
    VALIDATING,
    READY,
    WAITING_FOR_APPROVAL,
    RUNNING,
    PUBLISHED,
    PARTIALLY_PUBLISHED,
    FAILED,
    CANCELLED,
    UNKNOWN
}

enum class SafeCheckpoint {
    PACKAGE_VERIFIED,
    READY_STATE_VERIFIED,
    MEDIA_SELECTED,
    CONTENT_ENTERED,
    FINAL_SCREEN_VERIFIED,
    APPROVAL_GRANTED,
    PUBLISH_ACTION_STARTED,
    PUBLICATION_VERIFICATION_STARTED,
    PUBLICATION_CONFIRMED
}

enum class ReconciliationOutcome {
    CONFIRMED_PUBLISHED,
    CONFIRMED_NOT_PUBLISHED,
    STILL_UNKNOWN,
    SECURITY_BLOCKED
}

enum class PersistentApprovalState {
    PENDING,
    APPROVED,
    REJECTED,
    INVALIDATED
}

data class PersistentApprovalRecord(
    val approvalLevel: ApprovalLevel,
    var approvalState: PersistentApprovalState,
    val approvalTimestamp: Long,
    val approvedJobFingerprint: String,
    val approvedPlatform: String? = null,
    val approvalSessionId: String,
    var invalidationReason: String? = null
)

data class PlatformExecutionState(
    val platform: String,
    var status: PlatformStepStatus = PlatformStepStatus.PENDING,
    var startedAt: Long? = null,
    var completedAt: Long? = null,
    var approvalState: PersistentApprovalState = PersistentApprovalState.PENDING,
    val expectedPackage: String,
    val contentFingerprint: String,
    var attemptCount: Int = 0,
    var lastErrorCode: String? = null,
    var lastSafeCheckpoint: SafeCheckpoint? = null,
    var publicationVerificationState: String = "UNVERIFIED",
    var errorMessage: String? = null,
    var reconciliationNotes: String? = null
)

data class ExecutionLease(
    val jobId: String,
    val ownerId: String,
    val acquiredAt: Long,
    var expiresAt: Long
)

data class PersistentJob(
    val jobId: String,
    val createdAt: Long,
    var updatedAt: Long,
    var status: PersistentJobStatus,
    val approvalLevel: ApprovalLevel,
    var approvalRecord: PersistentApprovalRecord? = null,
    val mediaReference: String? = null,
    val normalizedBasePayload: NormalizedContentPayload,
    val selectedPlatforms: List<String>,
    val platformExecutionStates: MutableMap<String, PlatformExecutionState>,
    var currentPlatform: String? = null,
    val executionSequence: List<String>,
    val contentFingerprint: String,
    var interruptedAt: Long? = null,
    val schemaVersion: Int = 2
)

data class PersistentAuditEvent(
    val id: String,
    val timestamp: Long,
    val jobId: String,
    val platform: String? = null,
    val previousState: String? = null,
    val newState: String? = null,
    val eventType: String,
    val contentFingerprint: String? = null,
    val reason: String? = null,
    val details: String? = null,
    val integrityHash: String
)

class InvalidJobStateTransitionException(
    val fromState: String,
    val toState: String,
    val context: String,
    reason: String? = null
) : IllegalStateException("Invalid transition from '$fromState' to '$toState' in $context: ${reason ?: "not allowed"}")

class JobConcurrencyConflictException(
    val jobId: String,
    val currentOwner: String,
    val attemptedOwner: String
) : IllegalStateException("Job '$jobId' is leased by '$currentOwner'. Denied for '$attemptedOwner'.")

class SecretDetectedException(message: String) : SecurityException("[Security Invariant Violation] Secret data detected: $message")

object SecretSanitizer {
    private val FORBIDDEN_PATTERNS = listOf(
        Regex("(?i)password"),
        Regex("(?i)otp"),
        Regex("(?i)\\bpin\\b"),
        Regex("(?i)auth_?token"),
        Regex("(?i)\\bbearer\\b"),
        Regex("(?i)cookie"),
        Regex("(?i)credit_?card"),
        Regex("(?i)cvv"),
        Regex("(?i)card_?number"),
        Regex("(?i)bank_?account"),
        Regex("(?i)api_?key")
    )

    fun validateNoSecrets(text: String?) {
        if (text == null) return
        for (pattern in FORBIDDEN_PATTERNS) {
            if (pattern.containsMatchIn(text)) {
                throw SecretDetectedException("Matched forbidden pattern ${pattern.pattern}")
            }
        }
    }
}

object JobStateTransitionValidator {
    fun validateJobTransition(from: PersistentJobStatus, to: PersistentJobStatus, emergencyStop: Boolean = false) {
        if (from == to) return
        if (emergencyStop && (to == PersistentJobStatus.RUNNING || to == PersistentJobStatus.READY || to == PersistentJobStatus.PUBLISHED)) {
            throw InvalidJobStateTransitionException(from.name, to.name, "Job", "EmergencyStop is active. Continuation blocked.")
        }

        when (from) {
            PersistentJobStatus.PENDING -> if (to in listOf(PersistentJobStatus.VALIDATING, PersistentJobStatus.READY, PersistentJobStatus.CANCELLED)) return
            PersistentJobStatus.VALIDATING -> if (to in listOf(PersistentJobStatus.READY, PersistentJobStatus.WAITING_FOR_APPROVAL, PersistentJobStatus.FAILED, PersistentJobStatus.CANCELLED)) return
            PersistentJobStatus.READY -> if (to in listOf(PersistentJobStatus.WAITING_FOR_APPROVAL, PersistentJobStatus.RUNNING, PersistentJobStatus.CANCELLED)) return
            PersistentJobStatus.WAITING_FOR_APPROVAL -> if (to in listOf(PersistentJobStatus.RUNNING, PersistentJobStatus.CANCELLED, PersistentJobStatus.READY)) return
            PersistentJobStatus.RUNNING -> if (to in listOf(PersistentJobStatus.PUBLISHED, PersistentJobStatus.PARTIALLY_PUBLISHED, PersistentJobStatus.FAILED, PersistentJobStatus.UNKNOWN, PersistentJobStatus.CANCELLED)) return
            PersistentJobStatus.PARTIALLY_PUBLISHED -> if (to in listOf(PersistentJobStatus.PUBLISHED, PersistentJobStatus.FAILED, PersistentJobStatus.UNKNOWN, PersistentJobStatus.CANCELLED)) return
            PersistentJobStatus.PUBLISHED -> throw InvalidJobStateTransitionException(from.name, to.name, "Job", "PUBLISHED is immutable terminal state.")
            PersistentJobStatus.FAILED -> {
                if (to == PersistentJobStatus.PUBLISHED) throw InvalidJobStateTransitionException(from.name, to.name, "Job", "Cannot jump from FAILED to PUBLISHED.")
                if (to in listOf(PersistentJobStatus.CANCELLED, PersistentJobStatus.READY)) return
            }
            PersistentJobStatus.UNKNOWN -> {
                if (to == PersistentJobStatus.PUBLISHED) throw InvalidJobStateTransitionException(from.name, to.name, "Job", "UNKNOWN cannot directly jump to PUBLISHED without reconciliation.")
                if (to in listOf(PersistentJobStatus.READY, PersistentJobStatus.FAILED, PersistentJobStatus.CANCELLED, PersistentJobStatus.PARTIALLY_PUBLISHED)) return
            }
            PersistentJobStatus.CANCELLED -> return
        }
        throw InvalidJobStateTransitionException(from.name, to.name, "Job", "Transition not permitted.")
    }

    fun validatePlatformTransition(from: PlatformStepStatus, to: PlatformStepStatus, emergencyStop: Boolean = false, reconciledPublished: Boolean = false) {
        if (from == to) return
        if (emergencyStop && (to == PlatformStepStatus.RUNNING || to == PlatformStepStatus.READY || to == PlatformStepStatus.PUBLISHED)) {
            throw InvalidJobStateTransitionException(from.name, to.name, "Platform", "EmergencyStop is active.")
        }

        when (from) {
            PlatformStepStatus.PENDING -> if (to in listOf(PlatformStepStatus.VALIDATING, PlatformStepStatus.READY, PlatformStepStatus.WAITING_FOR_APPROVAL, PlatformStepStatus.CANCELLED)) return
            PlatformStepStatus.VALIDATING -> if (to in listOf(PlatformStepStatus.READY, PlatformStepStatus.WAITING_FOR_APPROVAL, PlatformStepStatus.FAILED, PlatformStepStatus.CANCELLED)) return
            PlatformStepStatus.READY -> if (to in listOf(PlatformStepStatus.WAITING_FOR_APPROVAL, PlatformStepStatus.RUNNING, PlatformStepStatus.CANCELLED)) return
            PlatformStepStatus.WAITING_FOR_APPROVAL -> if (to in listOf(PlatformStepStatus.RUNNING, PlatformStepStatus.CANCELLED)) return
            PlatformStepStatus.RUNNING -> if (to in listOf(PlatformStepStatus.PUBLISHED, PlatformStepStatus.FAILED, PlatformStepStatus.UNKNOWN, PlatformStepStatus.CANCELLED)) return
            PlatformStepStatus.PUBLISHED -> throw InvalidJobStateTransitionException(from.name, to.name, "Platform", "Platform is already PUBLISHED. Double publishing forbidden.")
            PlatformStepStatus.FAILED -> {
                if (to == PlatformStepStatus.PUBLISHED) throw InvalidJobStateTransitionException(from.name, to.name, "Platform", "FAILED cannot jump to PUBLISHED.")
                if (to in listOf(PlatformStepStatus.CANCELLED, PlatformStepStatus.READY)) return
            }
            PlatformStepStatus.UNKNOWN -> {
                if (to == PlatformStepStatus.PUBLISHED) {
                    if (!reconciledPublished) throw InvalidJobStateTransitionException(from.name, to.name, "Platform", "Reconciliation required.")
                    return
                }
                if (to in listOf(PlatformStepStatus.READY, PlatformStepStatus.FAILED, PlatformStepStatus.CANCELLED)) return
            }
            PlatformStepStatus.CANCELLED -> return
        }
        throw InvalidJobStateTransitionException(from.name, to.name, "Platform", "Platform transition not permitted.")
    }
}

class JobStoreRepository {
    companion object {
        @Volatile
        private var instance: JobStoreRepository? = null

        fun getInstance(): JobStoreRepository {
            return instance ?: synchronized(this) {
                instance ?: JobStoreRepository().also { instance = it }
            }
        }

        fun resetInstance() {
            instance = null
        }
    }

    private val jobs = ConcurrentHashMap<String, PersistentJob>()
    private val leases = ConcurrentHashMap<String, ExecutionLease>()
    private val auditLogs = mutableListOf<PersistentAuditEvent>()
    private var emergencyStopActive: Boolean = false
    private var emergencyStopReason: String? = null

    init {
        val emInstance = EmergencyStopManager.getInstance()
        if (emInstance.isEmergencyStopActive()) {
            emergencyStopActive = true
            emergencyStopReason = emInstance.getStopReason()
        }
    }

    fun setEmergencyStop(active: Boolean, reason: String? = null) {
        emergencyStopActive = active
        emergencyStopReason = reason
        val emInstance = EmergencyStopManager.getInstance()
        if (active) {
            emInstance.triggerStop(reason ?: "Emergency Stop activated")
            leases.clear()
            jobs.values.forEach { job ->
                if (job.status == PersistentJobStatus.WAITING_FOR_APPROVAL || job.status == PersistentJobStatus.READY) {
                    job.status = PersistentJobStatus.CANCELLED
                    job.updatedAt = System.currentTimeMillis()
                }
                job.approvalRecord?.let {
                    if (it.approvalState == PersistentApprovalState.APPROVED) {
                        it.approvalState = PersistentApprovalState.INVALIDATED
                        it.invalidationReason = "EmergencyStop triggered"
                    }
                }
            }
        } else {
            emInstance.reset()
        }
        recordAuditEvent(
            jobId = "SYSTEM",
            eventType = if (active) "EMERGENCY_STOP_PERSISTED" else "EMERGENCY_STOP_CLEARED",
            reason = reason,
            newState = if (active) "STOPPED" else "NORMAL"
        )
    }

    fun acquireLease(jobId: String, ownerId: String, ttlMs: Long = 30000): ExecutionLease {
        val now = System.currentTimeMillis()
        val existing = leases[jobId]
        if (existing != null && existing.ownerId != ownerId && existing.expiresAt > now) {
            throw JobConcurrencyConflictException(jobId, existing.ownerId, ownerId)
        }
        val lease = ExecutionLease(jobId, ownerId, now, now + ttlMs)
        leases[jobId] = lease
        return lease
    }

    fun releaseLease(jobId: String, ownerId: String) {
        val existing = leases[jobId]
        if (existing != null && existing.ownerId == ownerId) {
            leases.remove(jobId)
        }
    }

    fun createJob(
        jobId: String,
        payload: NormalizedContentPayload,
        selectedPlatforms: List<String>,
        approvalLevel: ApprovalLevel = ApprovalLevel.PLATFORM_APPROVAL,
        mediaReference: String? = null
    ): PersistentJob {
        SecretSanitizer.validateNoSecrets(payload.text)
        SecretSanitizer.validateNoSecrets(payload.title)
        SecretSanitizer.validateNoSecrets(payload.description)

        if (selectedPlatforms.contains("amazon")) {
            throw SecurityException("[Security Invariant Violation] Amazon is NOT a publishing destination.")
        }

        val fingerprint = ContentFingerprinter.computeFingerprint(payload)
        val now = System.currentTimeMillis()
        val platformStates = mutableMapOf<String, PlatformExecutionState>()

        for (platform in selectedPlatforms) {
            val pkg = try { Platform.valueOf(platform.uppercase()).packageName } catch (_: Exception) { "unknown.pkg" }
            platformStates[platform] = PlatformExecutionState(
                platform = platform,
                status = PlatformStepStatus.PENDING,
                expectedPackage = pkg,
                contentFingerprint = fingerprint
            )
        }

        val job = PersistentJob(
            jobId = jobId,
            createdAt = now,
            updatedAt = now,
            status = PersistentJobStatus.PENDING,
            approvalLevel = approvalLevel,
            mediaReference = mediaReference,
            normalizedBasePayload = payload,
            selectedPlatforms = selectedPlatforms,
            platformExecutionStates = platformStates,
            executionSequence = selectedPlatforms,
            contentFingerprint = fingerprint
        )

        jobs[jobId] = job
        recordAuditEvent(
            jobId = jobId,
            eventType = "JOB_CREATED",
            newState = "PENDING",
            contentFingerprint = fingerprint,
            details = "Platforms: ${selectedPlatforms.joinToString()}"
        )
        return job
    }

    fun getJob(jobId: String): PersistentJob? = jobs[jobId]
    fun listJobs(): List<PersistentJob> = jobs.values.sortedByDescending { it.createdAt }

    fun markPlatformRunning(jobId: String, platform: String, checkpoint: SafeCheckpoint? = null) {
        val job = jobs[jobId] ?: throw IllegalArgumentException("Job $jobId not found")
        val p = job.platformExecutionStates[platform] ?: throw IllegalArgumentException("Platform $platform not found")

        JobStateTransitionValidator.validatePlatformTransition(p.status, PlatformStepStatus.RUNNING, emergencyStopActive)
        JobStateTransitionValidator.validateJobTransition(job.status, PersistentJobStatus.RUNNING, emergencyStopActive)

        p.status = PlatformStepStatus.RUNNING
        p.startedAt = System.currentTimeMillis()
        p.attemptCount++
        checkpoint?.let { p.lastSafeCheckpoint = it }

        job.status = PersistentJobStatus.RUNNING
        job.currentPlatform = platform
        job.updatedAt = System.currentTimeMillis()

        recordAuditEvent(jobId, platform, "RUNNING", "PLATFORM_STARTED", details = checkpoint?.name)
    }

    fun markPlatformCompleted(jobId: String, platform: String, checkpoint: SafeCheckpoint = SafeCheckpoint.PUBLICATION_CONFIRMED) {
        val job = jobs[jobId] ?: throw IllegalArgumentException("Job $jobId not found")
        val p = job.platformExecutionStates[platform] ?: throw IllegalArgumentException("Platform $platform not found")

        JobStateTransitionValidator.validatePlatformTransition(p.status, PlatformStepStatus.PUBLISHED, false)

        p.status = PlatformStepStatus.PUBLISHED
        p.completedAt = System.currentTimeMillis()
        p.lastSafeCheckpoint = checkpoint
        p.publicationVerificationState = "VERIFIED"

        val allPublished = job.platformExecutionStates.values.all { it.status == PlatformStepStatus.PUBLISHED }
        job.status = if (allPublished) PersistentJobStatus.PUBLISHED else PersistentJobStatus.PARTIALLY_PUBLISHED
        job.updatedAt = System.currentTimeMillis()

        recordAuditEvent(jobId, platform, "PUBLISHED", "PLATFORM_COMPLETED", details = checkpoint.name)
    }

    fun markPlatformUnknown(jobId: String, platform: String, reason: String, checkpoint: SafeCheckpoint? = null) {
        val job = jobs[jobId] ?: throw IllegalArgumentException("Job $jobId not found")
        val p = job.platformExecutionStates[platform] ?: throw IllegalArgumentException("Platform $platform not found")

        JobStateTransitionValidator.validatePlatformTransition(p.status, PlatformStepStatus.UNKNOWN, false)

        p.status = PlatformStepStatus.UNKNOWN
        p.errorMessage = reason
        checkpoint?.let { p.lastSafeCheckpoint = it }
        p.publicationVerificationState = "PENDING_VERIFICATION"

        job.status = PersistentJobStatus.UNKNOWN
        job.updatedAt = System.currentTimeMillis()

        recordAuditEvent(jobId, platform, "UNKNOWN", "PLATFORM_UNKNOWN", reason = reason)
    }

    fun cancelJob(jobId: String, reason: String) {
        val job = jobs[jobId] ?: throw IllegalArgumentException("Job $jobId not found")
        JobStateTransitionValidator.validateJobTransition(job.status, PersistentJobStatus.CANCELLED, false)

        job.status = PersistentJobStatus.CANCELLED
        job.updatedAt = System.currentTimeMillis()
        job.platformExecutionStates.values.forEach { if (it.status != PlatformStepStatus.PUBLISHED) it.status = PlatformStepStatus.CANCELLED }
        leases.remove(jobId)

        recordAuditEvent(jobId = jobId, eventType = "JOB_CANCELLED", newState = "CANCELLED", reason = reason)
    }

    fun recordApproval(jobId: String, approval: PersistentApprovalRecord) {
        val job = jobs[jobId] ?: throw IllegalArgumentException("Job $jobId not found")
        if (approval.approvedJobFingerprint != job.contentFingerprint) {
            throw SecurityException("Approval fingerprint mismatch.")
        }
        job.approvalRecord = approval
        job.updatedAt = System.currentTimeMillis()
        recordAuditEvent(jobId, approval.approvedPlatform, "APPROVED", "APPROVAL_CREATED", contentFingerprint = approval.approvedJobFingerprint)
    }

    fun invalidateApproval(jobId: String, reason: String) {
        val job = jobs[jobId] ?: return
        job.approvalRecord?.let {
            it.approvalState = PersistentApprovalState.INVALIDATED
            it.invalidationReason = reason
        }
        job.updatedAt = System.currentTimeMillis()
        recordAuditEvent(jobId = jobId, eventType = "APPROVAL_INVALIDATED", reason = reason)
    }

    fun recordAuditEvent(
        jobId: String,
        platform: String? = null,
        newState: String? = null,
        eventType: String,
        contentFingerprint: String? = null,
        reason: String? = null,
        details: String? = null
    ) {
        SecretSanitizer.validateNoSecrets(reason)
        SecretSanitizer.validateNoSecrets(details)

        val md = MessageDigest.getInstance("SHA-256")
        val raw = "$jobId|$platform|$newState|$eventType|$contentFingerprint"
        val hash = md.digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }

        val event = PersistentAuditEvent(
            id = "audit_${System.currentTimeMillis()}",
            timestamp = System.currentTimeMillis(),
            jobId = jobId,
            platform = platform,
            newState = newState,
            eventType = eventType,
            contentFingerprint = contentFingerprint,
            reason = reason,
            details = details,
            integrityHash = hash
        )
        synchronized(auditLogs) {
            auditLogs.add(event)
        }
    }

    fun getAuditHistory(jobId: String? = null): List<PersistentAuditEvent> {
        return synchronized(auditLogs) {
            if (jobId != null) auditLogs.filter { it.jobId == jobId } else auditLogs.toList()
        }
    }
}

class CrashRecoveryManager(private val repository: JobStoreRepository = JobStoreRepository.getInstance()) {
    fun performStartupRecovery(): Int {
        val allJobs = repository.listJobs()
        var recoveredCount = 0

        for (job in allJobs) {
            var interrupted = false
            for ((platform, state) in job.platformExecutionStates) {
                if (state.status == PlatformStepStatus.RUNNING) {
                    interrupted = true
                    repository.markPlatformUnknown(
                        job.jobId,
                        platform,
                        "Interrupted by Android process death/kill. Reconcile required.",
                        state.lastSafeCheckpoint
                    )
                }
            }
            if (interrupted || job.status == PersistentJobStatus.RUNNING) {
                job.status = PersistentJobStatus.UNKNOWN
                job.interruptedAt = System.currentTimeMillis()
                repository.invalidateApproval(job.jobId, "Process died during execution.")
                recoveredCount++
            }
        }
        return recoveredCount
    }
}
