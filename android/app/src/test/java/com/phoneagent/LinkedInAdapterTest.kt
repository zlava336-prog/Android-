package com.phoneagent

import android.graphics.Rect
import com.phoneagent.adapter.LinkedInAdapter
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

private class LinkedInFakeUiInspector : UiInspector {
    var currentPackage: String = "com.linkedin.android"
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

private class LinkedInFakeActionExecutor : ActionExecutor {
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

class LinkedInAdapterTest {

    private lateinit var inspector: LinkedInFakeUiInspector
    private lateinit var executor: LinkedInFakeActionExecutor
    private lateinit var adapter: LinkedInAdapter

    @Before
    fun setUp() {
        EmergencyStopManager.reset()
        inspector = LinkedInFakeUiInspector()
        executor = LinkedInFakeActionExecutor()
        adapter = LinkedInAdapter(inspector, executor, "com.linkedin.android")
    }

    @Test
    fun test01_CorrectForegroundPackagePassesVerification() = runBlocking {
        inspector.currentPackage = "com.linkedin.android"
        val verified = adapter.verifyLinkedIn()
        assertTrue(verified)
    }

    @Test
    fun test02_UnexpectedForegroundPackageTriggersEmergencyStop() = runBlocking {
        inspector.currentPackage = "com.unauthorized.malicious.app"
        try {
            adapter.verifyLinkedIn()
            fail("Expected SecurityException on unexpected package")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
            assertEquals("UNEXPECTED_PACKAGE", EmergencyStopManager.lastReason.value)
        }
    }

    @Test
    fun test03_EmergencyStopBeforeActionRejectsExecution() = runBlocking {
        EmergencyStopManager.activate("Pre-existing safety lockout")
        val result = adapter.verifyLinkedIn()
        assertFalse(result)
    }

    @Test
    fun test04_EmergencyStopDuringWorkflowHaltsAdapter() = runBlocking {
        adapter.stop()
        val result = adapter.detectReadyState()
        assertFalse(result)
    }

    @Test
    fun test05_ReadyStateDetectedViaDynamicUI() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/share_box",
                text = "Start a post",
                contentDescription = "Start a post",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(40, 200, 1000, 300)
            )
        )
        val ready = adapter.detectReadyState()
        assertTrue(ready)
    }

    @Test
    fun test06_ComposerDetectedSuccessfully() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/composer_edit_text",
                text = "What do you want to talk about?",
                contentDescription = "What do you want to talk about?",
                className = "android.widget.EditText",
                isClickable = true,
                isEditable = true,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(40, 200, 1000, 600)
            )
        )
        val isOpen = adapter.verifyComposer()
        assertTrue(isOpen)
    }

    @Test
    fun test07_ComposerFailureTriggersRecovery() = runBlocking {
        // No trigger node in tree
        val opened = adapter.openComposer()
        assertFalse(opened)
        assertEquals(1, adapter.getRecoveryAttempts())
    }

    @Test
    fun test08_ValidContentUriAccepted() {
        adapter.validateMediaUri("content://media/external/images/media/4412")
    }

    @Test
    fun test09_ValidFileUriAccepted() {
        adapter.validateMediaUri("file:///storage/emulated/0/DCIM/Camera/photo.jpg")
    }

    @Test
    fun test10_RemoteHttpUriRejected() {
        try {
            adapter.validateMediaUri("http://example.com/malicious.mp4")
            fail("Expected SecurityException for http URI")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS media URIs are strictly prohibited") == true)
        }
    }

    @Test
    fun test11_RemoteHttpsUriRejected() {
        try {
            adapter.validateMediaUri("https://cdn.example.com/exploit.jpg")
            fail("Expected SecurityException for https URI")
        } catch (e: SecurityException) {
            assertTrue(e.message?.contains("Remote HTTP/HTTPS media URIs are strictly prohibited") == true)
        }
    }

    @Test
    fun test12_MalformedUriRejected() {
        try {
            adapter.validateMediaUri("ftp://server/file.mp4")
            fail("Expected IllegalArgumentException for unsupported scheme")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Unsupported media URI scheme") == true)
        }
    }

    @Test
    fun test13_PayloadWhitespaceNormalized() {
        val input = "Hello   LinkedIn   network!   \r\n\r\n\r\n\r\nExcited   to announce..."
        val sanitized = adapter.sanitizePostText(input)
        assertEquals("Hello LinkedIn network!\n\nExcited to announce...", sanitized)
    }

    @Test
    fun test14_UnicodePreservedInText() {
        val input = "Greetings to our global partners in 東京 and São Paulo!"
        val sanitized = adapter.sanitizePostText(input)
        assertEquals(input, sanitized)
    }

    @Test
    fun test15_EmojiPreservedInText() {
        val input = "Exciting milestone reached 🚀💼📈 Honored to lead this team! 🤝"
        val sanitized = adapter.sanitizePostText(input)
        assertEquals(input, sanitized)
    }

    @Test
    fun test16_OversizedPayloadRejectedWithStructuredError() {
        val oversized = "A".repeat(3001)
        try {
            adapter.sanitizePostText(oversized)
            fail("Expected IllegalArgumentException on oversized post")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("Post text exceeds maximum allowed length of 3000 characters") == true)
        }
    }

    @Test
    fun test17_HashtagsNormalized() {
        val raw = listOf("leadership", "#innovation", "tech_news")
        val sanitized = adapter.sanitizeHashtags(raw)
        assertEquals(listOf("#leadership", "#innovation", "#technews"), sanitized)
    }

    @Test
    fun test18_HashtagsDeduplicatedCaseInsensitively() {
        val raw = listOf("#AI", "#ai", "#Ai", "#Engineering")
        val sanitized = adapter.sanitizeHashtags(raw)
        assertEquals(listOf("#AI", "#Engineering"), sanitized)
    }

    @Test
    fun test19_HashtagBodyOverlapExcluded() {
        val body = "Big announcement regarding #Leadership and growth."
        val tags = listOf("#leadership", "#Management", "#Careers")
        val sanitized = adapter.sanitizeHashtags(tags, body)
        assertEquals(listOf("#Management", "#Careers"), sanitized)
    }

    @Test
    fun test20_MalformedHashtagFiltered() {
        val raw = listOf("#", "  ", "#valid")
        val sanitized = adapter.sanitizeHashtags(raw)
        assertEquals(listOf("#valid"), sanitized)
    }

    @Test
    fun test21_LoginTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/sign_in_button",
                text = "Sign in to LinkedIn",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 1000, 900, 1150)
            )
        )
        try {
            adapter.verifyLinkedIn()
            fail("Expected SecurityException on login prompt")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
            assertEquals("SECURITY_TRIPWIRE", EmergencyStopManager.lastReason.value)
        }
    }

    @Test
    fun test22_PasswordTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/password_edit_text",
                text = "Enter your password",
                className = "android.widget.EditText",
                isClickable = true,
                isEditable = true,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 800, 900, 950)
            )
        )
        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on password field")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test23_OtpTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/pin_input",
                text = "Enter 6-digit verification code",
                className = "android.widget.EditText",
                isClickable = true,
                isEditable = true,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 700, 900, 850)
            )
        )
        try {
            adapter.verifyLinkedIn()
            fail("Expected SecurityException on verification code prompt")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test24_2FaTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/two_factor_auth",
                text = "Two-step verification required",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 500, 900, 600)
            )
        )
        try {
            adapter.verifyLinkedIn()
            fail("Expected SecurityException on 2FA prompt")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test25_CaptchaArkoseTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/captcha_container",
                text = "Quick security check: solve this puzzle",
                className = "android.webkit.WebView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(50, 400, 950, 1400)
            )
        )
        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on puzzle challenge")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test26_PasskeyBiometricTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/biometric_prompt",
                text = "Use biometric or passkey to continue",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 600, 900, 700)
            )
        )
        try {
            adapter.verifyLinkedIn()
            fail("Expected SecurityException on passkey/biometric prompt")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test27_AccountSwitcherTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/switch_account_dialog",
                text = "Choose an account to continue",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 500, 900, 700)
            )
        )
        try {
            adapter.verifyLinkedIn()
            fail("Expected SecurityException on account switcher")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test28_PremiumMonetizationTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/premium_upsell",
                text = "Try LinkedIn Premium free for 1 month",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 800, 900, 950)
            )
        )
        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on Premium upsell")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test29_PaymentBillingTripwireTriggersEmergencyStop() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/payment_flow",
                text = "Add payment method - Credit card required",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 400, 900, 550)
            )
        )
        try {
            adapter.verifyLinkedIn()
            fail("Expected SecurityException on billing prompt")
        } catch (e: SecurityException) {
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test30_HumanApprovalRequiredPriorToPublish() = runBlocking {
        val job = JobModel(
            jobId = "li_test_approval",
            platform = "linkedin",
            action = "publish_post",
            caption = "Thought leadership update on #AI"
        )
        val approvalRequested = adapter.requestPublishApproval(job)
        assertTrue(approvalRequested)
        assertFalse(adapter.isApprovalGranted())
    }

    @Test
    fun test31_PublishBlockedWithoutApproval() = runBlocking {
        val result = adapter.publish()
        assertFalse(result.success)
        assertTrue(result.message.contains("Operator approval required"))
    }

    @Test
    fun test32_PublishExecutesWhenApproved() = runBlocking {
        adapter.approvePublish()
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/post_button",
                text = "Post",
                className = "android.widget.Button",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(800, 100, 1000, 200)
            )
        )
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/toast",
                text = "Post shared",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 2000, 900, 2100)
            )
        )

        val result = adapter.publish()
        assertTrue(result.success)
        assertTrue(executor.executionLog.contains("click:com.linkedin.android:id/post_button"))
    }

    @Test
    fun test33_PublicationVerificationConfirmsSuccess() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/snackbar",
                text = "Your post was shared",
                className = "android.widget.TextView",
                isClickable = false,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 2000, 900, 2100)
            )
        )
        val verified = adapter.verifyPublished()
        assertTrue(verified)
    }

    @Test
    fun test34_PublicationVerificationDetectsFailureSignal() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.linkedin.android:id/error_banner",
                text = "Couldn't share post. Tap to retry.",
                className = "android.widget.TextView",
                isClickable = true,
                isEditable = false,
                isVisible = true,
                packageName = "com.linkedin.android",
                bounds = Rect(100, 300, 900, 450)
            )
        )
        val verified = adapter.verifyPublished()
        assertFalse(verified)
    }

    @Test
    fun test35_BoundedRecoveryEnforcesMaxTwoAttempts() = runBlocking {
        assertEquals(0, adapter.getRecoveryAttempts())
        val r1 = adapter.recover("Transient error 1")
        assertTrue(r1)
        assertEquals(1, adapter.getRecoveryAttempts())

        val r2 = adapter.recover("Transient error 2")
        assertTrue(r2)
        assertEquals(2, adapter.getRecoveryAttempts())

        // Third attempt must fail-stop
        val r3 = adapter.recover("Transient error 3")
        assertFalse(r3)
        assertTrue(EmergencyStopManager.isStopped.value)
        assertEquals("RECOVERY_LIMIT_EXCEEDED", EmergencyStopManager.lastReason.value)
    }

    @Test
    fun test36_RecoveryBlockedWhenEmergencyStopActive() = runBlocking {
        EmergencyStopManager.activate("Manual stop")
        val recovered = adapter.recover("Test failure")
        assertFalse(recovered)
    }
}
