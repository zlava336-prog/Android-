package com.phoneagent

import android.graphics.Rect
import com.phoneagent.adapter.FacebookAdapter
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

private class FbFakeUiInspector : UiInspector {
    var currentPackage: String = "com.facebook.katana"
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

private class FbFakeActionExecutor : ActionExecutor {
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

class FacebookAdapterTest {

    private lateinit var inspector: FbFakeUiInspector
    private lateinit var executor: FbFakeActionExecutor
    private lateinit var adapter: FacebookAdapter

    @Before
    fun setUp() {
        EmergencyStopManager.reset()
        inspector = FbFakeUiInspector()
        executor = FbFakeActionExecutor()
        adapter = FacebookAdapter(inspector, executor, "com.facebook.katana")
    }

    // 1. Facebook package verification
    @Test
    fun test1_FacebookPackageVerification() = runBlocking {
        inspector.currentPackage = "com.facebook.katana"
        assertTrue(adapter.launch())
        assertEquals("com.facebook.katana", adapter.packageName)

        // Switch to supported Facebook Lite
        adapter.configurePackage("com.facebook.lite")
        inspector.currentPackage = "com.facebook.lite"
        assertTrue(adapter.launch())
        assertEquals("com.facebook.lite", adapter.packageName)
    }

    // 2. Unexpected package triggers EmergencyStop
    @Test
    fun test2_UnexpectedPackageTriggersEmergencyStop() = runBlocking {
        inspector.currentPackage = "com.malicious.app"
        try {
            adapter.launch()
            fail("Should throw when unexpected package is detected")
        } catch (e: Exception) {
            assertTrue(e.message?.contains("Unexpected package change") == true)
        }
        assertTrue("Emergency stop must be triggered", EmergencyStopManager.isStopped.value)
    }

    // 3. Empty URI rejection
    @Test
    fun test3_EmptyUriRejection() {
        try {
            adapter.validateMediaUri("")
            fail("Should reject empty string")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("cannot be empty") == true)
        }

        try {
            adapter.validateMediaUri("   ")
            fail("Should reject whitespace string")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("cannot be empty") == true)
        }
    }

    // 4. HTTP/HTTPS URI rejection
    @Test
    fun test4_HttpHttpsUriRejection() {
        try {
            adapter.validateMediaUri("http://example.com/video.mp4")
            fail("Should reject http URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }

        try {
            adapter.validateMediaUri("https://facebook.com/reel/123.mp4")
            fail("Should reject https URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }
    }

    // 5. Valid local media URI
    @Test
    fun test5_ValidLocalMediaUri() {
        // Should not throw any exception
        adapter.validateMediaUri("content://media/external/video/media/42")
        adapter.validateMediaUri("file:///storage/emulated/0/DCIM/fb_video.mp4")
        adapter.validateMediaUri("/storage/emulated/0/Movies/reel.mp4")
    }

    // 6. Caption handling
    @Test
    fun test6_CaptionHandling() = runBlocking {
        inspector.currentPackage = "com.facebook.katana"
        val caption = "Check out our latest update!\nLine 2 with special formatting."
        adapter.enterCaption(caption)

        val typed = executor.typedTexts.firstOrNull()
        assertEquals(caption, typed)

        // Test length limit enforcement
        adapter.maxCaptionLength = 20
        adapter.enterCaption("This is an excessively long caption exceeding max length")
        val secondTyped = executor.typedTexts[1]
        assertEquals(20, secondTyped.length)
    }

    // 7. Hashtag formatting
    @Test
    fun test7_HashtagFormatting() {
        val rawTags = listOf("marketing", "#social", "updates")
        val formatted = adapter.sanitizeHashtags(rawTags)
        assertEquals(listOf("#marketing", "#social", "#updates"), formatted)
    }

    // 8. Duplicate hashtag removal
    @Test
    fun test8_DuplicateHashtagRemoval() {
        val rawTags = listOf("tech", "#TECH", "tech", "#ai", "AI", "#tech")
        val deduplicated = adapter.sanitizeHashtags(rawTags)
        assertEquals(listOf("#tech", "#ai"), deduplicated)

        // When tag is already in existing text
        val dedupExisting = adapter.sanitizeHashtags(listOf("cool", "nature"), existingText = "Enjoying the #cool vibes")
        assertEquals(listOf("#nature"), dedupExisting)
    }

    // 9. Approval-required workflow
    @Test
    fun test9_ApprovalRequiredWorkflow() = runBlocking {
        val job = JobModel(
            jobId = "fb_job_001",
            platform = "facebook",
            action = "publish_post",
            videoUri = "content://media/external/video/1",
            caption = "Test post",
            requiresApproval = true
        )
        val approvalNeeded = adapter.requestPublishApproval(job)
        assertTrue(approvalNeeded)
    }

    // 10. Publish blocked before approval
    @Test
    fun test10_PublishBlockedWhenStopped() = runBlocking {
        adapter.stop()
        val result = adapter.publish()
        assertFalse(result.success)
        assertTrue(result.message.contains("stopped"))
    }

    // 11. Security tripwire
    @Test
    fun test11_SecurityTripwire() = runBlocking {
        inspector.currentPackage = "com.facebook.katana"
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.facebook.katana:id/security_checkpoint",
                text = "Two-factor authentication required. Enter the 6-digit confirmation code.",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.facebook.katana",
                bounds = Rect(40, 200, 1000, 600)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt immediately when two-factor/security prompt appears")
        } catch (e: Exception) {
            assertTrue(EmergencyStopManager.isStopped.value)
            assertTrue(e.message?.contains("challenge detected") == true)
        }
    }

    // 12. Account-switcher detection
    @Test
    fun test12_AccountSwitcherDetection() = runBlocking {
        inspector.currentPackage = "com.facebook.katana"
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.facebook.katana:id/account_switcher",
                text = "Switch account or choose a profile to continue",
                contentDescription = "Switch profile",
                className = "android.view.View",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.facebook.katana",
                bounds = Rect(100, 300, 900, 500)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt immediately when account switcher is detected")
        } catch (e: Exception) {
            assertTrue(EmergencyStopManager.isStopped.value)
            assertTrue(e.message?.contains("challenge detected") == true)
        }
    }

    // 13. Payment/billing detection
    @Test
    fun test13_PaymentBillingDetection() = runBlocking {
        inspector.currentPackage = "com.facebook.katana"
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.facebook.katana:id/boost_post_banner",
                text = "Boost post with Meta Pay. Enter payment details or credit card.",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.facebook.katana",
                bounds = Rect(50, 400, 950, 600)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt immediately on payment or billing screen")
        } catch (e: Exception) {
            assertTrue(EmergencyStopManager.isStopped.value)
            assertTrue(e.message?.contains("payment") == true || e.message?.contains("challenge detected") == true)
        }
    }

    // 14. Publish verification
    @Test
    fun test14_PublishVerification() = runBlocking {
        inspector.currentPackage = "com.facebook.katana"

        // Without confirmation nodes, verification returns false (not completed merely because button clicked)
        assertFalse(adapter.verifyPublished())

        // Add confirmed publication node in UI
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.facebook.katana:id/snackbar_text",
                text = "Your post was shared to your feed",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.facebook.katana",
                bounds = Rect(40, 2100, 960, 2220)
            )
        )

        assertTrue(adapter.verifyPublished())
    }

    // 15. Recovery limit
    @Test
    fun test15_RecoveryLimit() = runBlocking {
        assertEquals(0, adapter.getRecoveryAttempts())
        assertTrue("Recovery attempt 1 should succeed", adapter.recover("Transient UI glitch 1"))
        assertEquals(1, adapter.getRecoveryAttempts())
        assertTrue("Recovery attempt 2 should succeed", adapter.recover("Transient UI glitch 2"))
        assertEquals(2, adapter.getRecoveryAttempts())
        assertFalse("Recovery attempt 3 should fail due to 2-attempt limit", adapter.recover("Transient UI glitch 3"))
        assertEquals(2, adapter.getRecoveryAttempts())
    }

    // 16. Capability metadata
    @Test
    fun test16_CapabilityMetadata() {
        val caps = adapter.capabilities
        assertTrue("Facebook supports video", caps.supportsVideo)
        assertFalse("Facebook does not support separate title in post composer", caps.supportsTitle)
        assertTrue("Facebook supports description", caps.supportsDescription)
        assertTrue("Facebook supports hashtags", caps.supportsHashtags)
        assertFalse("Facebook cover is not exposed unless detected", caps.supportsCover)
        assertTrue("Facebook requires human approval", caps.requiresApproval)
    }
}
