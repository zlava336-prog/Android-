package com.phoneagent

import android.graphics.Rect
import com.phoneagent.adapter.PinterestAdapter
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

private class PinterestFakeUiInspector : UiInspector {
    var currentPackage: String = "com.pinterest"
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

private class PinterestFakeActionExecutor : ActionExecutor {
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

    override suspend fun scroll(direction: ScrollDirection): Boolean {
        executionLog.add("scroll:${direction.name}")
        return true
    }

    override suspend fun pressBack(): Boolean {
        executionLog.add("pressBack")
        return true
    }
}

class PinterestAdapterTest {

    private lateinit var inspector: PinterestFakeUiInspector
    private lateinit var executor: PinterestFakeActionExecutor
    private lateinit var adapter: PinterestAdapter

    @Before
    fun setUp() {
        EmergencyStopManager.reset()
        inspector = PinterestFakeUiInspector()
        executor = PinterestFakeActionExecutor()
        adapter = PinterestAdapter(inspector, executor, "com.pinterest")
    }

    // 1. Package verification
    @Test
    fun testPackageVerification_configuredPackageSuccess() = runBlocking {
        assertEquals("com.pinterest", adapter.packageName)
        val launched = adapter.launch()
        assertTrue(launched)

        // Support regional/lite packages
        adapter.configurePackage("com.pinterest.tiramisu")
        inspector.currentPackage = "com.pinterest.tiramisu"
        val tiramisuLaunched = adapter.launch()
        assertTrue(tiramisuLaunched)
    }

    // 2. Unexpected package triggers Emergency Stop
    @Test
    fun testUnexpectedPackage_triggersEmergencyStop() = runBlocking {
        inspector.currentPackage = "com.unauthorized.malicious.app"
        try {
            adapter.launch()
            fail("Should have thrown IllegalStateException on unexpected package")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("Unexpected package change") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 3. Media URI validation - empty/blank
    @Test
    fun testMediaUriValidation_rejectsEmptyOrBlank() {
        try {
            adapter.validateMediaUri("")
            fail("Should reject empty URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("empty or blank") == true)
        }

        try {
            adapter.validateMediaUri("   ")
            fail("Should reject blank URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("empty or blank") == true)
        }
    }

    // 4. Media URI validation - HTTP/HTTPS rejection
    @Test
    fun testMediaUriValidation_rejectsRemoteHttpHttps() {
        try {
            adapter.validateMediaUri("http://example.com/pin_image.jpg")
            fail("Should reject HTTP URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }

        try {
            adapter.validateMediaUri("https://cdn.pinterest.com/pin_video.mp4")
            fail("Should reject HTTPS URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }
    }

    // 5. Valid local URI accepted
    @Test
    fun testMediaUriValidation_acceptsValidLocalSchemes() {
        adapter.validateMediaUri("content://media/external/images/media/4421")
        adapter.validateMediaUri("file:///storage/emulated/0/DCIM/Camera/IMG_2026.jpg")
        adapter.validateMediaUri("/storage/emulated/0/Movies/pin_reel.mp4")
        adapter.validateMediaUri("/data/user/0/com.phoneagent/cache/pin.png")
    }

    // 6. Title capability detection
    @Test
    fun testTitleCapabilityDetection_dynamicallySetsSupportsTitle() = runBlocking {
        // Initially false
        assertFalse(adapter.capabilities.supportsTitle)

        // Title input present in UI
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/pin_title_edit_text",
                text = "",
                contentDescription = "Add a title",
                className = "android.widget.EditText",
                isClickable = true,
                isEditable = true,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(40, 200, 1000, 300)
            )
        )

        val entered = adapter.enterTitleIfSupported("Modern Minimalist Architecture")
        assertTrue(entered)
        assertTrue(adapter.capabilities.supportsTitle)
        assertTrue(executor.typedTexts.contains("Modern Minimalist Architecture"))
    }

    // 7. Description handling and length ceiling
    @Test
    fun testDescriptionHandling_preservesNewlinesAndEnforcesLimit() = runBlocking {
        val multilineDesc = "Stunning architectural pin.\nDesigned for modern living.\nPure inspiration."
        val sanitized = adapter.sanitizeDescription(multilineDesc)
        assertEquals(multilineDesc, sanitized)

        // Exceed limit
        val overLimit = "A".repeat(501)
        try {
            adapter.sanitizeDescription(overLimit)
            fail("Should have rejected description over 500 characters")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("exceeds Pinterest limit") == true)
        }
    }

    // 8. Hashtag normalization
    @Test
    fun testHashtagNormalization_prependsHashAndPreservesUnicode() {
        val rawTags = listOf("interiors", "#architecture", "  decor  ", "#minimalism", "#デザイン")
        val sanitized = adapter.sanitizeHashtags(rawTags)
        assertEquals(listOf("#interiors", "#architecture", "#decor", "#minimalism", "#デザイン"), sanitized)
    }

    // 9. Hashtag deduplication
    @Test
    fun testHashtagDeduplication_filtersDuplicatesAndExistingTags() {
        val rawTags = listOf("#design", "Design", "#DESIGN", "crafts", "decor", "crafts")
        val sanitized = adapter.sanitizeHashtags(rawTags, existingText = "Great home #decor inspiration")
        assertEquals(listOf("#design", "#crafts"), sanitized)
        assertFalse(sanitized.contains("#decor"))
    }

    // 10. Board detection
    @Test
    fun testBoardDetection_selectsUnambiguousTargetBoard() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/board_list",
                text = "Pick a board",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(0, 100, 1080, 200)
            )
        )
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/board_item_1",
                text = "Dream Home",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(40, 250, 1000, 350)
            )
        )
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/board_item_2",
                text = "Healthy Recipes",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(40, 360, 1000, 460)
            )
        )

        val selected = adapter.selectBoardIfRequired("Dream Home")
        assertTrue(selected)
        assertTrue(executor.executionLog.contains("click:com.pinterest:id/board_item_1"))
    }

    // 11. Ambiguous board selection halts automation
    @Test
    fun testAmbiguousBoardSelection_haltsAutomation() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/board_list",
                text = "Choose a board",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(0, 100, 1080, 200)
            )
        )
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/board_item_1",
                text = "Modern Tech",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(40, 250, 1000, 350)
            )
        )
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/board_item_2",
                text = "Vintage Tech",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(40, 360, 1000, 460)
            )
        )

        try {
            // "Tech" matches both Modern Tech and Vintage Tech
            adapter.selectBoardIfRequired("Tech")
            fail("Should halt on ambiguous board target")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("Ambiguous board selection") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 12. Cover detection
    @Test
    fun testCoverDetection_interactsWhenDetectedAndEnabled() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/edit_cover",
                text = "Edit cover",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(800, 200, 1000, 300)
            )
        )
        adapter.setCapabilities(adapter.capabilities.copy(supportsCover = true))

        val covered = adapter.selectCover("file:///storage/emulated/0/DCIM/cover.jpg")
        assertTrue(covered)
        assertTrue(executor.executionLog.contains("click:com.pinterest:id/edit_cover"))
    }

    // 13. Cover safely skipped if absent
    @Test
    fun testCoverSafelySkipped_whenNoControlPresent() = runBlocking {
        // No cover node in inspector
        val skipped = adapter.selectCover("file:///storage/emulated/0/DCIM/cover.jpg")
        assertTrue(skipped)
        assertFalse(adapter.capabilities.supportsCover)
        assertFalse(executor.executionLog.any { it.contains("cover") })
    }

    // 14. Approval gate
    @Test
    fun testApprovalGate_requiresOperatorAuthorization() = runBlocking {
        assertTrue(adapter.capabilities.requiresApproval)
        val job = JobModel(
            jobId = "pin_001",
            platform = "pinterest",
            action = "publish_pin",
            imageUri = "content://media/pin.jpg",
            title = "Living Room Aesthetic",
            caption = "Earthy tones and warm lights.",
            hashtags = listOf("#aesthetic", "#home"),
            board = "Interior Inspiration",
            requiresApproval = true
        )

        val requested = adapter.requestPublishApproval(job)
        assertTrue(requested)
    }

    // 15. Publish blocked before approval / if stopped
    @Test
    fun testPublishBlocked_whenEmergencyStopActive() = runBlocking {
        EmergencyStopManager.activate("Manual test lock")
        val result = adapter.publish()
        assertFalse(result.success)
        assertTrue(result.message.contains("Emergency Stop active or PinterestAdapter stopped") || result.message.contains("Automation was stopped"))
    }

    // 16. Login tripwire
    @Test
    fun testLoginTripwire_stopsAutomationImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/login_button",
                text = "Log in to Pinterest",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(100, 800, 980, 920)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on login screen")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("Pinterest security/auth/account-switcher/payment challenge detected") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 17. OTP/2FA tripwire
    @Test
    fun testOtpTwoFactorTripwire_stopsAutomationImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/otp_input",
                text = "Enter 6-digit code",
                className = "android.widget.EditText",
                isClickable = true,
                isEditable = true,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(100, 500, 980, 620)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on OTP challenge")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("Enter 6-digit code") == true || e.message?.contains("challenge detected") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 18. CAPTCHA tripwire
    @Test
    fun testCaptchaTripwire_stopsAutomationImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/captcha_challenge",
                text = "Verify you're a human",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(100, 400, 980, 550)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on CAPTCHA challenge")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("challenge detected") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 19. Account-switcher tripwire
    @Test
    fun testAccountSwitcherTripwire_stopsAutomationImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/account_list",
                text = "Switch account",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(100, 600, 980, 720)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on account switcher")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("switch account") == true || e.message?.contains("challenge detected") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 20. Payment/promoted-pin tripwire
    @Test
    fun testPaymentPromotedPinTripwire_stopsAutomationImmediately() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/promote_pin_banner",
                text = "Promote pin with $10 ad budget",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(100, 700, 980, 820)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on promote pin prompt")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("challenge detected") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 21. Recovery limit enforced
    @Test
    fun testRecoveryLimit_capsAtTwoAttempts() = runBlocking {
        assertEquals(0, adapter.getRecoveryAttempts())

        val attempt1 = adapter.recover("Transient lag")
        assertTrue(attempt1)
        assertEquals(1, adapter.getRecoveryAttempts())

        val attempt2 = adapter.recover("UI not settled")
        assertTrue(attempt2)
        assertEquals(2, adapter.getRecoveryAttempts())

        // Third attempt must fail and abandon recovery
        val attempt3 = adapter.recover("Network timeout")
        assertFalse(attempt3)
        assertEquals(2, adapter.getRecoveryAttempts())
    }

    // 22. Publication verification distinguishing success from failure
    @Test
    fun testPublicationVerification_distinguishesConfirmedUploadFromFailure() = runBlocking {
        // Success state
        inspector.nodes.clear()
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/toast_message",
                text = "Saved to Dream Home!",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(200, 2000, 880, 2100)
            )
        )
        val verifiedSuccess = adapter.verifyPublished()
        assertTrue(verifiedSuccess)

        // Failure state (draft saved)
        inspector.nodes.clear()
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.pinterest:id/toast_message",
                text = "Saved to drafts",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.pinterest",
                bounds = Rect(200, 2000, 880, 2100)
            )
        )
        val verifiedDraft = adapter.verifyPublished()
        assertFalse(verifiedDraft)
    }

    // 23. Emergency stop halts further calls
    @Test
    fun testEmergencyStop_haltsFurtherOperations() = runBlocking {
        adapter.stop()
        val launched = adapter.launch()
        assertFalse(launched)
    }

    // 24. Audit logging
    @Test
    fun testAuditLogging_recordsOperationsSafely() = runBlocking {
        val initialLogSize = LocalActionLogger.getLogs().size
        adapter.launch()
        val newLogSize = LocalActionLogger.getLogs().size
        assertTrue(newLogSize > initialLogSize)

        val lastLog = LocalActionLogger.getLogs().last()
        assertEquals("pinterest", lastLog.platform)
        assertEquals("LAUNCH", lastLog.action)
    }
}
