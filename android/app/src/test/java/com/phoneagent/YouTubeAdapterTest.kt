package com.phoneagent

import android.graphics.Rect
import com.phoneagent.adapter.YouTubeAdapter
import com.phoneagent.core.accessibility.ActionExecutor
import com.phoneagent.core.accessibility.ScrollDirection
import com.phoneagent.core.accessibility.SecurityTripwireResult
import com.phoneagent.core.accessibility.UiInspector
import com.phoneagent.core.accessibility.UiNodeInfo
import com.phoneagent.core.model.JobModel
import com.phoneagent.core.safety.EmergencyStopManager
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class FakeUiInspector : UiInspector {
    var currentPackage: String = "com.google.android.youtube"
    var tripwireResult: SecurityTripwireResult = SecurityTripwireResult(isTripped = false)
    val nodes: MutableList<UiNodeInfo> = mutableListOf()

    override suspend fun getRootNode(): UiNodeInfo? = nodes.firstOrNull()

    override suspend fun findNodesByText(text: String, exact: Boolean): List<UiNodeInfo> =
        nodes.filter { if (exact) it.text == text else it.text?.contains(text, ignoreCase = true) == true }

    override suspend fun findNodeByViewId(viewId: String): UiNodeInfo? =
        nodes.find { it.id == viewId }

    override suspend fun findNodeByContentDescription(desc: String): UiNodeInfo? =
        nodes.find { it.contentDescription?.contains(desc, ignoreCase = true) == true }

    override suspend fun getCurrentPackage(): String = currentPackage

    override suspend fun checkSecurityTripwires(): SecurityTripwireResult = tripwireResult

    override suspend fun dumpNodeTree(): List<UiNodeInfo> = nodes
}

class FakeActionExecutor : ActionExecutor {
    val executionLog: MutableList<String> = mutableListOf()
    val typedTexts: MutableList<String> = mutableListOf()

    override suspend fun click(node: UiNodeInfo): Boolean {
        executionLog.add("click:${node.id}")
        return true
    }

    override suspend fun clickAt(x: Int, y: Int): Boolean {
        executionLog.add("clickAt:$x,$y")
        return true
    }

    override suspend fun typeText(node: UiNodeInfo, text: String): Boolean {
        executionLog.add("typeText:${node.id}:$text")
        typedTexts.add(text)
        return true
    }

    override suspend fun clearText(node: UiNodeInfo): Boolean {
        executionLog.add("clearText:${node.id}")
        return true
    }

    override suspend fun scroll(direction: ScrollDirection): Boolean {
        executionLog.add("scroll:$direction")
        return true
    }

    override suspend fun copyToClipboard(text: String): Boolean {
        executionLog.add("copyToClipboard:$text")
        return true
    }

    override suspend fun readClipboard(): String = ""

    override suspend fun pressBack(): Boolean {
        executionLog.add("pressBack")
        return true
    }
}

class YouTubeAdapterTest {

    private lateinit var inspector: FakeUiInspector
    private lateinit var executor: FakeActionExecutor
    private lateinit var adapter: YouTubeAdapter

    @Before
    fun setUp() {
        EmergencyStopManager.reset()
        inspector = FakeUiInspector()
        executor = FakeActionExecutor()
        adapter = YouTubeAdapter(inspector, executor)
    }

    @Test
    fun testCapabilitiesMetadata() {
        val caps = adapter.capabilities
        assertTrue("YouTube Shorts must support video", caps.supportsVideo)
        assertTrue("YouTube Shorts must support title", caps.supportsTitle)
        assertTrue("YouTube Shorts must support description", caps.supportsDescription)
        assertTrue("YouTube Shorts must support hashtags", caps.supportsHashtags)
        assertFalse("YouTube Shorts cover is auto-selected or in-app", caps.supportsCover)
        assertTrue("YouTube Shorts must require human approval", caps.requiresApproval)
    }

    @Test
    fun testPackageVerificationFailureStopsJob() = runBlocking {
        // Foreground package is not YouTube
        inspector.currentPackage = "com.android.settings"

        try {
            adapter.launch()
            fail("Expected exception due to package quarantine violation")
        } catch (e: Exception) {
            assertTrue("Exception message should indicate package change", e.message?.contains("Unexpected package change") == true)
        }

        assertTrue("Emergency Stop should be triggered when package violates quarantine", EmergencyStopManager.isStopped.value)
    }

    @Test
    fun testMediaValidationRejectsBlankAndInvalidSchemes() {
        // Blank URI
        try {
            adapter.validateMediaUri("")
            fail("Should reject empty URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("cannot be empty") == true)
        }

        // Remote HTTP URI
        try {
            adapter.validateMediaUri("https://youtube.com/watch?v=123")
            fail("Should reject remote web URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Invalid media URI scheme") == true)
        }

        // Valid content scheme passes
        adapter.validateMediaUri("content://media/external/video/media/109")
        adapter.validateMediaUri("file:///storage/emulated/0/DCIM/short.mp4")
    }

    @Test
    fun testMetadataTitleTruncation() = runBlocking {
        inspector.currentPackage = "com.google.android.youtube"
        val longTitle = "T".repeat(150) // Exceeds YouTube 100-character ceiling

        adapter.enterCaption(longTitle)
        val typed = executor.typedTexts.firstOrNull()
        assertTrue("Must type title", typed != null)
        assertTrue("Title must be truncated to <= 100 chars, was ${typed?.length}", (typed?.length ?: 0) <= 100)
    }

    @Test
    fun testApprovalRequiredGate() = runBlocking {
        inspector.currentPackage = "com.google.android.youtube"
        val job = JobModel(
            jobId = "yt_test_001",
            platform = "youtube",
            action = "publish_short",
            videoUri = "content://media/external/video/1",
            caption = "Test Shorts",
            hashtags = listOf("#Shorts", "#tech"),
            requiresApproval = true
        )

        val approvalNeeded = adapter.requestPublishApproval(job)
        assertTrue("Approval must be required when job has requiresApproval = true", approvalNeeded)
    }

    @Test
    fun testSecurityTripwireHaltsJob() = runBlocking {
        inspector.currentPackage = "com.google.android.youtube"
        // Simulate security challenge node on screen
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.google.android.youtube:id/account_auth_dialog",
                text = "Verify it's you. Enter password to continue.",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.google.android.youtube",
                bounds = Rect(50, 500, 950, 700)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt immediately when security challenge appears")
        } catch (e: Exception) {
            assertTrue(EmergencyStopManager.isStopped.value)
            assertTrue(e.message?.contains("challenge") == true || e.message?.contains("password") == true)
        }
    }
}
