package com.phoneagent

import com.phoneagent.core.persistence.*
import com.phoneagent.core.planner.ApprovalLevel
import com.phoneagent.core.planner.NormalizedContentPayload
import com.phoneagent.core.planner.PlatformStepStatus
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class PersistentJobStoreAndRecoveryTest {

    private lateinit var repository: JobStoreRepository
    private lateinit var recoveryManager: CrashRecoveryManager

    @Before
    fun setUp() {
        JobStoreRepository.resetInstance()
        repository = JobStoreRepository.getInstance()
        repository.setEmergencyStop(false)
        recoveryManager = CrashRecoveryManager(repository)
    }

    @Test
    fun testJobCreationAndPersistence() {
        val payload = NormalizedContentPayload(
            title = "Launch Video",
            description = "Checking persistent storage",
            hashtags = listOf("mobile", "agent")
        )
        val job = repository.createJob(
            jobId = "job_test_01",
            payload = payload,
            selectedPlatforms = listOf("instagram", "youtube")
        )

        assertNotNull(job)
        assertEquals("job_test_01", job.jobId)
        assertEquals(PersistentJobStatus.PENDING, job.status)
        assertEquals(2, job.platformExecutionStates.size)
        assertTrue(job.contentFingerprint.startsWith("fp_"))
    }

    @Test
    fun testAmazonPublishingProhibition() {
        val payload = NormalizedContentPayload(text = "Unsafe Amazon Post")
        try {
            repository.createJob(
                jobId = "job_amazon_fail",
                payload = payload,
                selectedPlatforms = listOf("amazon")
            )
            fail("Expected SecurityException for Amazon as publishing destination")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("Amazon is NOT a publishing destination"))
        }
    }

    @Test
    fun testSecretDetectionRejection() {
        val unsafePayload = NormalizedContentPayload(
            text = "My secret password is 123"
        )
        try {
            repository.createJob(
                jobId = "job_secret_fail",
                payload = unsafePayload,
                selectedPlatforms = listOf("instagram")
            )
            fail("Expected SecretDetectedException")
        } catch (e: SecretDetectedException) {
            assertTrue(e.message!!.contains("password"))
        }
    }

    @Test
    fun testStateTransitionValidator() {
        // Valid progression
        JobStateTransitionValidator.validateJobTransition(PersistentJobStatus.PENDING, PersistentJobStatus.VALIDATING)
        JobStateTransitionValidator.validateJobTransition(PersistentJobStatus.VALIDATING, PersistentJobStatus.READY)
        JobStateTransitionValidator.validateJobTransition(PersistentJobStatus.READY, PersistentJobStatus.RUNNING)
        JobStateTransitionValidator.validateJobTransition(PersistentJobStatus.RUNNING, PersistentJobStatus.PUBLISHED)

        // Invalid jump: PUBLISHED -> RUNNING
        try {
            JobStateTransitionValidator.validateJobTransition(PersistentJobStatus.PUBLISHED, PersistentJobStatus.RUNNING)
            fail("Should disallow PUBLISHED -> RUNNING")
        } catch (e: InvalidJobStateTransitionException) {
            assertTrue(e.message!!.contains("PUBLISHED is immutable"))
        }

        // Invalid jump: UNKNOWN -> PUBLISHED without reconciliation
        try {
            JobStateTransitionValidator.validateJobTransition(PersistentJobStatus.UNKNOWN, PersistentJobStatus.PUBLISHED)
            fail("Should disallow UNKNOWN -> PUBLISHED without reconciliation")
        } catch (e: InvalidJobStateTransitionException) {
            assertTrue(e.message!!.contains("UNKNOWN cannot directly jump to PUBLISHED"))
        }
    }

    @Test
    fun testCrashRecoveryRunningToUnknown() {
        val payload = NormalizedContentPayload(text = "Crash recovery verification")
        val job = repository.createJob(
            jobId = "job_crash_test",
            payload = payload,
            selectedPlatforms = listOf("instagram", "youtube", "facebook")
        )

        // Mark Instagram completed
        repository.markPlatformRunning("job_crash_test", "instagram")
        repository.markPlatformCompleted("job_crash_test", "instagram")

        // YouTube was RUNNING when process crashed
        repository.markPlatformRunning("job_crash_test", "youtube")

        // Facebook is still PENDING
        val recoveredCount = recoveryManager.performStartupRecovery()
        assertEquals(1, recoveredCount)

        val updatedJob = repository.getJob("job_crash_test")!!
        assertEquals(PersistentJobStatus.UNKNOWN, updatedJob.status)
        assertEquals(PlatformStepStatus.PUBLISHED, updatedJob.platformExecutionStates["instagram"]!!.status)
        assertEquals(PlatformStepStatus.UNKNOWN, updatedJob.platformExecutionStates["youtube"]!!.status)
        assertEquals(PlatformStepStatus.PENDING, updatedJob.platformExecutionStates["facebook"]!!.status)
    }

    @Test
    fun testApprovalFingerprintBindingAndInvalidation() {
        val payload = NormalizedContentPayload(text = "Approval Test")
        val job = repository.createJob("job_approval_01", payload, listOf("instagram"))

        // Correct fingerprint approval
        val approval = PersistentApprovalRecord(
            approvalLevel = ApprovalLevel.PLATFORM_APPROVAL,
            approvalState = PersistentApprovalState.APPROVED,
            approvalTimestamp = System.currentTimeMillis(),
            approvedJobFingerprint = job.contentFingerprint,
            approvedPlatform = "instagram",
            approvalSessionId = "session_1"
        )
        repository.recordApproval("job_approval_01", approval)
        assertEquals(PersistentApprovalState.APPROVED, repository.getJob("job_approval_01")!!.approvalRecord!!.approvalState)

        // Invalid fingerprint throws
        val badApproval = approval.copy(approvedJobFingerprint = "fp_mismatch_bad")
        try {
            repository.recordApproval("job_approval_01", badApproval)
            fail("Expected SecurityException on fingerprint mismatch")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("fingerprint mismatch"))
        }

        // Invalidation
        repository.invalidateApproval("job_approval_01", "User modified content")
        assertEquals(PersistentApprovalState.INVALIDATED, repository.getJob("job_approval_01")!!.approvalRecord!!.approvalState)
    }

    @Test
    fun testExecutionLeaseConcurrency() {
        val payload = NormalizedContentPayload(text = "Lease Concurrency Test")
        val job = repository.createJob("job_lease_01", payload, listOf("tiktok"))

        val lease1 = repository.acquireLease("job_lease_01", "executor_alpha", ttlMs = 10000)
        assertNotNull(lease1)

        // Second executor cannot acquire active lease
        try {
            repository.acquireLease("job_lease_01", "executor_beta", ttlMs = 10000)
            fail("Expected JobConcurrencyConflictException")
        } catch (e: JobConcurrencyConflictException) {
            assertTrue(e.message!!.contains("is leased by 'executor_alpha'"))
        }

        // Release lease
        repository.releaseLease("job_lease_01", "executor_alpha")
        // Now beta can acquire
        val lease2 = repository.acquireLease("job_lease_01", "executor_beta", ttlMs = 10000)
        assertNotNull(lease2)
        assertEquals("executor_beta", lease2.ownerId)
    }

    @Test
    fun testEmergencyStopBlocksTransitions() {
        val payload = NormalizedContentPayload(text = "Emergency Stop Safety")
        val job = repository.createJob("job_stop_01", payload, listOf("instagram"))

        repository.setEmergencyStop(true, "Security breach")

        try {
            repository.markPlatformRunning("job_stop_01", "instagram")
            fail("Expected InvalidJobStateTransitionException when EmergencyStop is active")
        } catch (e: InvalidJobStateTransitionException) {
            assertTrue(e.message!!.contains("EmergencyStop is active"))
        }
    }
}
