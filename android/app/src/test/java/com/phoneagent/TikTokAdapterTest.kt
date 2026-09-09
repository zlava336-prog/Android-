package com.phoneagent

import android.graphics.Rect
import com.phoneagent.adapter.TikTokAdapter
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

private class TikTokFakeUiInspector : UiInspector {
    var currentPackage: String = "com.zhiliaoapp.musically"
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

private class TikTokFakeActionExecutor : ActionExecutor {
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

class TikTokAdapterTest {

    private lateinit var inspector: TikTokFakeUiInspector
    private lateinit var executor: TikTokFakeActionExecutor
    private lateinit var adapter: TikTokAdapter

    @Before
    fun setUp() {
        EmergencyStopManager.reset()
        inspector = TikTokFakeUiInspector()
        executor = TikTokFakeActionExecutor()
        adapter = TikTokAdapter(inspector, executor, "com.zhiliaoapp.musically")
    }

    // 1. Package verification
    @Test
    fun testPackageVerification_configuredPackageSuccess() = runBlocking {
        assertEquals("com.zhiliaoapp.musically", adapter.packageName)
        val launched = adapter.launch()
        assertTrue(launched)

        // Switch to regional TikTok package
        adapter.configurePackage("com.ss.android.ugc.trill")
        inspector.currentPackage = "com.ss.android.ugc.trill"
        val regionalLaunched = adapter.launch()
        assertTrue(regionalLaunched)
    }

    // 2. Wrong package rejection
    @Test
    fun testWrongPackage_triggersEmergencyStopAndThrows() = runBlocking {
        inspector.currentPackage = "com.fake.tiktok.malware"

        try {
            adapter.launch()
            fail("Should have thrown IllegalStateException for unexpected package")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("Unexpected package change") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 3. Dynamic UI inspection
    @Test
    fun testDynamicUiInspection_detectsReadyState() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/tab_publish",
                text = "+",
                contentDescription = "Create",
                className = "android.widget.ImageView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(460, 2180, 580, 2300)
            )
        )

        val ready = adapter.detectReadyState()
        assertTrue(ready)
    }

    // 4. Create / Upload detection
    @Test
    fun testCreateAndUpload_clicksDynamicButtons() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/upload_button",
                text = "Upload",
                contentDescription = "Upload",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(820, 2050, 980, 2180)
            )
        )

        adapter.selectUpload()
        assertTrue(executor.executionLog.any { it.contains("upload_button") })
    }

    // 5. Media URI validation - valid local URIs
    @Test
    fun testValidateMediaUri_acceptsLocalSchemes() {
        adapter.validateMediaUri("content://media/external/video/media/100")
        adapter.validateMediaUri("file:///storage/emulated/0/DCIM/tiktok_clip.mp4")
        adapter.validateMediaUri("/storage/emulated/0/Movies/edit.mp4")
        adapter.validateMediaUri("/data/user/0/com.phoneagent/files/render.mp4")
    }

    // 6. Remote media rejection
    @Test
    fun testValidateMediaUri_rejectsRemoteUris() {
        try {
            adapter.validateMediaUri("http://example.com/dance.mp4")
            fail("Should reject http:// URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }

        try {
            adapter.validateMediaUri("https://tiktokcdn.com/v/123.mp4")
            fail("Should reject https:// URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS URIs are prohibited") == true)
        }
    }

    // 7. Inaccessible / empty media rejection
    @Test
    fun testValidateMediaUri_rejectsEmptyOrBlankUris() {
        try {
            adapter.validateMediaUri("")
            fail("Should reject empty URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("cannot be empty or blank") == true)
        }

        try {
            adapter.validateMediaUri("   ")
            fail("Should reject blank URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("cannot be empty or blank") == true)
        }
    }

    // 8. Caption sanitization (whitespace normalization & line-break preservation)
    @Test
    fun testCaptionSanitization_preservesNewlinesAndNormalizesWhitespace() {
        val raw = "  First line with   spaces  \n\nSecond line with   details  \n   Third line  "
        val sanitized = adapter.sanitizeCaption(raw)
        val expected = "First line with spaces\n\nSecond line with details\nThird line"
        assertEquals(expected, sanitized)
    }

    // 9. Unicode caption handling
    @Test
    fun testCaptionSanitization_handlesUnicodeProperly() = runBlocking {
        val unicodeCaption = "Exploring new creative frontiers! 🚀✨ 日本語テキスト العربية 🎨"
        val sanitized = adapter.sanitizeCaption(unicodeCaption)
        assertEquals(unicodeCaption, sanitized)

        adapter.enterCaption(sanitized)
        assertTrue(executor.typedTexts.any { it.contains("🚀✨") })
    }

    // 10. Hashtag deduplication
    @Test
    fun testHashtagDeduplication_stripsDuplicatesAndNormalizes() {
        val rawTags = listOf("tiktok", "#TIKTOK", "fyp", "#FYP", "#viral", "viral")
        val deduplicated = adapter.sanitizeHashtags(rawTags)
        assertEquals(listOf("#tiktok", "#fyp", "#viral"), deduplicated)

        // Should not duplicate hashtag already in caption
        val existingCaption = "Dancing to the beat #fyp"
        val filtered = adapter.sanitizeHashtags(listOf("fyp", "dance"), existingCaption)
        assertEquals(listOf("#dance"), filtered)
    }

    // 11. Caption length limit handling (rejects when exceeding max length)
    @Test
    fun testCaptionLengthLimit_rejectsWhenContentCannotFit() {
        adapter.maxCaptionLength = 20
        try {
            adapter.sanitizeCaption("This is an excessively long caption that cannot safely fit.")
            fail("Should reject caption that cannot safely fit within limits")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("exceeds TikTok limit of 20 characters") == true)
        }
    }

    // 12. Cover detection
    @Test
    fun testCoverDetection_interactsWhenDetectedAndSupported() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/cover_picker",
                text = "Select cover",
                contentDescription = "Select cover",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(750, 400, 950, 600)
            )
        )

        // When supportsCover is enabled and control is present
        adapter.setCapabilities(adapter.capabilities.copy(supportsCover = true))
        val coverResult = adapter.selectCover("file:///storage/cover.jpg")
        assertTrue(coverResult)
        assertTrue(executor.executionLog.any { it.contains("cover_picker") })
    }

    // 13. Cover safely skipped when unavailable
    @Test
    fun testCoverSkipped_whenUnavailableOrDisabled() = runBlocking {
        // Default: supportsCover = false
        assertFalse(adapter.capabilities.supportsCover)
        val coverResult = adapter.selectCover("file:///storage/cover.jpg")
        assertTrue(coverResult)
        assertFalse(executor.executionLog.any { it.contains("cover") })
    }

    // 14. Approval requirement
    @Test
    fun testApprovalGate_haltsAndRequiresOperatorApproval() = runBlocking {
        val job = JobModel(
            jobId = "tt_job_101",
            platform = "tiktok",
            action = "publish_video",
            videoUri = "content://media/external/video/media/55",
            caption = "Morning routine",
            hashtags = listOf("#vlog", "#morning"),
            requiresApproval = true
        )

        val approvalNeeded = adapter.requestPublishApproval(job)
        assertTrue(approvalNeeded)
    }

    // 15. Login tripwire
    @Test
    fun testLoginTripwire_triggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/login_title",
                text = "Log in to TikTok",
                contentDescription = "Log in to TikTok",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(100, 300, 900, 500)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on login screen")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("TikTok security/auth/account-switcher/payment challenge detected") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 16. OTP / 2FA tripwire
    @Test
    fun testOtpTwoFactorTripwire_triggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/verification_code_entry",
                text = "Enter 6-digit code sent to your phone",
                contentDescription = null,
                className = "android.widget.EditText",
                isClickable = true,
                isEditable = true,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(100, 600, 900, 750)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on OTP challenge")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("verification code") == true || e.message?.contains("enter 6-digit code") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 17. CAPTCHA / Security challenge tripwire
    @Test
    fun testCaptchaTripwire_triggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/captcha_slider",
                text = "Drag the slider to complete the puzzle",
                contentDescription = "Security check: Drag the slider",
                className = "android.view.View",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(150, 800, 850, 1100)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on CAPTCHA challenge")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("drag the slider") == true || e.message?.contains("puzzle") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 18. Account-switcher tripwire
    @Test
    fun testAccountSwitcher_triggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/account_dialog",
                text = "Switch account or log into another account",
                contentDescription = "Switch account",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(100, 400, 900, 600)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on account switcher")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("switch account") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 19. Coins / Wallet / Payment tripwire
    @Test
    fun testCoinsPaymentTripwire_triggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/recharge_coins",
                text = "Recharge coins with Google Pay",
                contentDescription = "TikTok Coins balance",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(100, 700, 900, 900)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on coins recharge prompt")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("coins") == true || e.message?.contains("recharge") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 20. Promote / Boost tripwire
    @Test
    fun testPromoteBoostTripwire_triggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/promote_banner",
                text = "Promote video to get more views",
                contentDescription = "Promote ad budget",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(100, 500, 900, 700)
            )
        )

        try {
            adapter.detectReadyState()
            fail("Should halt on promote prompt")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("promote") == true)
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    // 21. Recovery limit (max 2 attempts)
    @Test
    fun testRecoveryLimit_allowsOnlyTwoAttempts() = runBlocking {
        assertEquals(0, adapter.getRecoveryAttempts())
        val r1 = adapter.recover("Network delay 1")
        assertTrue(r1)
        assertEquals(1, adapter.getRecoveryAttempts())

        val r2 = adapter.recover("Network delay 2")
        assertTrue(r2)
        assertEquals(2, adapter.getRecoveryAttempts())

        val r3 = adapter.recover("Network delay 3")
        assertFalse(r3)
        assertEquals(2, adapter.getRecoveryAttempts())
    }

    // 22. Publication verification: distinguishes verified upload from draft save / failure
    @Test
    fun testPublicationVerification_distinguishesSuccessFromFailureAndDraft() = runBlocking {
        // Without confirmation nodes
        assertFalse(adapter.verifyPublished())

        // Draft saved node -> returns false
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/draft_toast",
                text = "Video saved to drafts",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(50, 2000, 950, 2150)
            )
        )
        assertFalse(adapter.verifyPublished())

        // Confirmed publication node -> returns true
        inspector.nodes.clear()
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.zhiliaoapp.musically:id/upload_toast",
                text = "Your video was uploaded",
                contentDescription = null,
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.zhiliaoapp.musically",
                bounds = Rect(50, 2000, 950, 2150)
            )
        )
        assertTrue(adapter.verifyPublished())
    }

    // 23. Emergency stop halts actions immediately
    @Test
    fun testEmergencyStop_haltsAllActions() = runBlocking {
        EmergencyStopManager.trigger("Operator hit emergency stop")
        val result = adapter.publish()
        assertFalse(result.success)
        assertTrue(result.message.contains("stopped"))
    }
}
