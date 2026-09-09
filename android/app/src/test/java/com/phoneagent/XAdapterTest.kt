package com.phoneagent

import android.graphics.Rect
import com.phoneagent.adapter.XAdapter
import com.phoneagent.core.accessibility.ActionExecutor
import com.phoneagent.core.accessibility.ScrollDirection
import com.phoneagent.core.accessibility.SecurityTripwireResult
import com.phoneagent.core.accessibility.UiInspector
import com.phoneagent.core.accessibility.UiNodeInfo
import com.phoneagent.core.logging.LocalActionLogger
import com.phoneagent.core.model.JobModel
import com.phoneagent.core.safety.EmergencyStopManager
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

private class XFakeUiInspector : UiInspector {
    var currentPackage: String = "com.twitter.android"
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

private class XFakeActionExecutor : ActionExecutor {
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
        executionLog.add("scroll:${direction.name}")
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

class XAdapterTest {

    private lateinit var inspector: XFakeUiInspector
    private lateinit var executor: XFakeActionExecutor
    private lateinit var adapter: XAdapter

    @Before
    fun setUp() {
        EmergencyStopManager.reset()
        inspector = XFakeUiInspector()
        executor = XFakeActionExecutor()
        adapter = XAdapter(inspector, executor, "com.twitter.android")
    }

    // 1. Package verification
    @Test
    fun testPackageVerification_configuredPackageSuccess() = runBlocking {
        assertEquals("com.twitter.android", adapter.packageName)
        val launched = adapter.launch()
        assertTrue(launched)

        // Support Twitter Lite package
        adapter.configurePackage("com.twitter.android.lite")
        inspector.currentPackage = "com.twitter.android.lite"
        val liteLaunched = adapter.launch()
        assertTrue(liteLaunched)
    }

    // 2. Unexpected package triggers EmergencyStop
    @Test
    fun testUnexpectedPackage_triggersEmergencyStop() = runBlocking {
        inspector.currentPackage = "com.unauthorized.malicious.app"
        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on package mismatch")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("Unexpected package change") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 3. Empty URI rejection
    @Test
    fun testEmptyUriRejection() {
        try {
            adapter.validateMediaUri("")
            fail("Expected IllegalArgumentException on empty URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("empty or blank") == true)
        }

        try {
            adapter.validateMediaUri("   ")
            fail("Expected IllegalArgumentException on blank URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("empty or blank") == true)
        }
    }

    // 4. HTTP rejection
    @Test
    fun testHttpUriRejection() {
        try {
            adapter.validateMediaUri("http://example.com/video.mp4")
            fail("Expected IllegalArgumentException on HTTP URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }
    }

    // 5. HTTPS rejection
    @Test
    fun testHttpsUriRejection() {
        try {
            adapter.validateMediaUri("https://cdn.example.com/media/clip.mp4")
            fail("Expected IllegalArgumentException on HTTPS URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }
    }

    // 6. Valid content URI
    @Test
    fun testValidContentUri() {
        adapter.validateMediaUri("content://media/external/video/media/9871")
    }

    // 7. Valid file URI
    @Test
    fun testValidFileUri() {
        adapter.validateMediaUri("file:///storage/emulated/0/DCIM/Camera/VID_20260908.mp4")
        adapter.validateMediaUri("/storage/emulated/0/Movies/post.mp4")
    }

    // 8. Composer detection
    @Test
    fun testComposerDetection() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/composer_write",
                text = null,
                contentDescription = "New post",
                className = "android.widget.ImageButton",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(880, 1950, 1020, 2090)
            )
        )

        val success = adapter.openComposer()
        assertTrue(success)
        assertTrue(executor.executionLog.contains("click:com.twitter.android:id/composer_write"))
    }

    // 9. Text validation
    @Test
    fun testTextValidation_normalizesWhitespacePreservesNewlines() {
        val input = "Hello   X world!   \n\nThis is a clean post.\n\n\n\nExcessive newlines collapsed."
        val sanitized = adapter.sanitizePostText(input)
        assertTrue(sanitized.contains("Hello X world!"))
        assertTrue(sanitized.contains("This is a clean post."))
        assertFalse(sanitized.contains("   "))
        assertFalse(sanitized.contains("\n\n\n"))
    }

    // 10. Unicode text support
    @Test
    fun testUnicodeTextSupport() {
        val unicodeText = "✨ Autonomous Phone Agent 🤖 — 日本語テキスト & España café ☕"
        val sanitized = adapter.sanitizePostText(unicodeText)
        assertEquals(unicodeText, sanitized)
    }

    // 11. Text limit handling (280 chars)
    @Test
    fun testTextLimitHandling_exceedingLengthThrowsError() {
        val longText = "A".repeat(281)
        try {
            adapter.sanitizePostText(longText)
            fail("Expected IllegalArgumentException when text exceeds 280 chars")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("exceeds X composer limit") == true)
        }

        val exactText = "B".repeat(280)
        val valid = adapter.sanitizePostText(exactText)
        assertEquals(280, valid.length)
    }

    // 12. Hashtag normalization
    @Test
    fun testHashtagNormalization() {
        val tags = listOf("#AmazonFinds", "techdeals", "##gadgets", "   ")
        val normalized = adapter.sanitizeHashtags(tags)
        assertEquals(listOf("#AmazonFinds", "#techdeals", "#gadgets"), normalized)
    }

    // 13. Hashtag deduplication
    @Test
    fun testHashtagDeduplication_caseInsensitiveAndExistingText() {
        val tags = listOf("#AI", "#ai", "Ai", "#Tech", "#ExistingTag")
        val existingText = "Exploring innovations with #existingtag today."
        val result = adapter.sanitizeHashtags(tags, existingText)
        // #ExistingTag is already in existing text, #AI should be deduplicated
        assertEquals(listOf("#AI", "#Tech"), result)
    }

    // 14. Media preview verification
    @Test
    fun testMediaPreviewVerification() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/media_preview",
                text = null,
                contentDescription = "Video attachment preview",
                className = "android.widget.ImageView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(40, 600, 1040, 1400)
            )
        )

        val previewFound = adapter.verifyPreview()
        assertTrue(previewFound)
    }

    // 15. Approval required
    @Test
    fun testApprovalRequired_capabilitiesDeclared() {
        assertTrue(adapter.capabilities.requiresApproval)
        assertTrue(adapter.capabilities.supportsVideo)
        assertFalse(adapter.capabilities.supportsTitle)
        assertTrue(adapter.capabilities.supportsDescription)
        assertTrue(adapter.capabilities.supportsHashtags)
        assertFalse(adapter.capabilities.supportsCover)
    }

    // 16. Publish blocked without approval
    @Test
    fun testPublishBlockedWithoutApproval() = runBlocking {
        val result = adapter.publish()
        assertFalse(result.success)
        assertTrue(result.message.contains("explicit human approval is required"))
        assertTrue(result.requiresUserAction)
    }

    // 17. Login tripwire
    @Test
    fun testLoginTripwire_haltsImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/login_button",
                text = "Log in to X",
                contentDescription = null,
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(100, 1000, 980, 1120)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on login challenge")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("log in") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 18. OTP/2FA tripwire
    @Test
    fun testOtp2faTripwire_haltsImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/two_factor_prompt",
                text = "Enter confirmation code",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(40, 400, 800, 500)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on 2FA prompt")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("confirmation code") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 19. CAPTCHA tripwire
    @Test
    fun testCaptchaTripwire_haltsImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/arkose_frame",
                text = null,
                contentDescription = "Arkose security challenge authenticate puzzle",
                className = "android.webkit.WebView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(0, 200, 1080, 1800)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on CAPTCHA challenge")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("challenge") == true || e.message?.contains("puzzle") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 20. Account switcher tripwire
    @Test
    fun testAccountSwitcherTripwire_haltsImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/account_menu",
                text = "Switch accounts",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(40, 300, 600, 400)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on account switcher")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("switch account") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 21. Payment/subscription tripwire
    @Test
    fun testPaymentSubscriptionTripwire_haltsImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/premium_upsell",
                text = "Subscribe to Premium",
                contentDescription = null,
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(40, 700, 1040, 850)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on Premium subscription upsell")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("subscribe") == true || e.message?.contains("premium") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 22. EmergencyStop stops publish even if approved
    @Test
    fun testEmergencyStop_blocksPublishEvenIfApproved() = runBlocking {
        val job = JobModel(
            jobId = "x_test_01",
            platform = "x",
            action = "publish_post",
            caption = "Test tweet",
            requiresApproval = true
        )
        adapter.requestPublishApproval(job)

        // Emergency Stop triggered after approval
        EmergencyStopManager.trigger("Manual safety interrupt")

        val result = adapter.publish()
        assertFalse(result.success)
        assertTrue(result.message.contains("Emergency Stop is active"))
    }

    // 23. Recovery limit (max 2 attempts)
    @Test
    fun testRecoveryLimit_maxTwoAttempts() = runBlocking {
        assertEquals(0, adapter.getRecoveryAttempts())

        val rec1 = adapter.recover("UI lag 1")
        assertTrue(rec1)
        assertEquals(1, adapter.getRecoveryAttempts())

        val rec2 = adapter.recover("UI lag 2")
        assertTrue(rec2)
        assertEquals(2, adapter.getRecoveryAttempts())

        // Third attempt must fail
        val rec3 = adapter.recover("UI lag 3")
        assertFalse(rec3)
        assertEquals(2, adapter.getRecoveryAttempts())
    }

    // 24. Publication verification
    @Test
    fun testPublicationVerification_confirmedVsDraft() = runBlocking {
        // When draft / failure banner is present
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/toast_view",
                text = "Draft saved",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(40, 2100, 600, 2180)
            )
        )

        val publishedFalse = adapter.verifyPublished()
        assertFalse(publishedFalse)

        // When success banner is present
        inspector.nodes.clear()
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.twitter.android:id/toast_view",
                text = "Your post was sent",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.twitter.android",
                bounds = Rect(40, 2100, 600, 2180)
            )
        )

        val publishedTrue = adapter.verifyPublished()
        assertTrue(publishedTrue)
    }

    // 25. Audit logging
    @Test
    fun testAuditLogging_logsActionStages() = runBlocking {
        adapter.setCurrentJobId("x_job_123")
        adapter.launch()
        adapter.detectReadyState()

        val logs = LocalActionLogger.getRecentLogs()
        val xLogs = logs.filter { it.platform == "x" }
        assertTrue(xLogs.isNotEmpty())
        assertTrue(xLogs.any { it.action == "LAUNCH" })
        assertTrue(xLogs.any { it.action == "DETECT_READY_STATE" })
    }
}
