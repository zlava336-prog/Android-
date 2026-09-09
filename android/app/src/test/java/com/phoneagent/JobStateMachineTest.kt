package com.phoneagent

import com.phoneagent.core.model.JobModel
import com.phoneagent.core.model.JobState
import com.phoneagent.core.safety.EmergencyStopManager
import com.phoneagent.core.state.JobStateMachine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class JobStateMachineTest {

    private lateinit var stateMachine: JobStateMachine

    @Before
    fun setUp() {
        stateMachine = JobStateMachine()
        EmergencyStopManager.reset()
    }

    @Test
    fun testInitialStateIsReceived() {
        assertEquals(JobState.RECEIVED, stateMachine.getCurrentState())
    }

    @Test
    fun testValidSequentialPublishingFlow() {
        val path = listOf(
            JobState.VALIDATING,
            JobState.OPENING_APP,
            JobState.WAITING_FOR_READY,
            JobState.SELECTING_MEDIA,
            JobState.ENTERING_METADATA,
            JobState.VERIFYING_PREVIEW,
            JobState.WAITING_FOR_APPROVAL,
            JobState.PUBLISHING,
            JobState.VERIFYING_RESULT,
            JobState.COMPLETED
        )

        for (state in path) {
            val success = stateMachine.transitionTo(state)
            assertTrue("Transition to $state should be allowed", success)
            assertEquals(state, stateMachine.getCurrentState())
        }
    }

    @Test
    fun testIllegalDirectTransitionIsRejected() {
        val success = stateMachine.transitionTo(JobState.PUBLISHING)
        assertFalse("Direct jump from RECEIVED to PUBLISHING must be rejected", success)
        assertEquals(JobState.RECEIVED, stateMachine.getCurrentState())
    }

    @Test
    fun testEmergencyStopFromAnyState() {
        stateMachine.transitionTo(JobState.VALIDATING)
        stateMachine.transitionTo(JobState.OPENING_APP)
        stateMachine.emergencyStop("User Emergency Button")

        assertEquals(JobState.STOPPED, stateMachine.getCurrentState())
        assertTrue(stateMachine.isEmergencyHalted())

        // Ensure cannot transition forward after emergency stop
        val blocked = stateMachine.transitionTo(JobState.WAITING_FOR_READY)
        assertFalse("Cannot proceed forward after Emergency Stop", blocked)
    }

    @Test
    fun testEmergencyStopManagerSingleton() {
        assertFalse(EmergencyStopManager.isStopped.value)
        EmergencyStopManager.trigger("Sensor abort")
        assertTrue(EmergencyStopManager.isStopped.value)
        assertEquals("Sensor abort", EmergencyStopManager.getReason())
        EmergencyStopManager.reset()
        assertFalse(EmergencyStopManager.isStopped.value)
    }

    @Test
    fun testJobModelProperties() {
        val job = JobModel(
            jobId = "reel_001",
            platform = "instagram",
            action = "publish_reel",
            videoUri = "content://media/external/video/1",
            caption = "Test reel caption",
            hashtags = listOf("#amazonfinds", "#deals"),
            requiresApproval = true
        )
        assertEquals("reel_001", job.jobId)
        assertEquals("instagram", job.platform)
        assertTrue(job.requiresApproval)
        assertEquals(2, job.hashtags.size)
    }
}
