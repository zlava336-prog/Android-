package com.phoneagent

import android.graphics.Rect
import com.phoneagent.adapter.ThreadsAdapter
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

private class ThreadsFakeUiInspector : UiInspector {
    var currentPackage: String = "com.instagram.barcelona"
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

private class ThreadsFakeActionExecutor : ActionExecutor {
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

class ThreadsAdapterTest {

    private lateinit var inspector: ThreadsFakeUiInspector
    private lateinit var executor: ThreadsFakeActionExecutor
    private lateinit var adapter: ThreadsAdapter

    @Before
    fun setUp() {
        EmergencyStopManager.reset()
        inspector = ThreadsFakeUiInspector()
        executor = ThreadsFakeActionExecutor()
        adapter = ThreadsAdapter(inspector, executor, "com.instagram.barcelona")
    }

    @Test
    fun test01_correctPackageAccepted() = runBlocking {
        inspector.currentPackage = "com.instagram.barcelona"
        assertTrue(adapter.verifyThreads())
    }

    @Test
    fun test02_unexpectedPackageRejected() = runBlocking {
        inspector.currentPackage = "com.unauthorized.malicious.app"
        try {
            adapter.verifyThreads()
            fail("Expected SecurityException on foreign package")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("Unexpected package"))
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test03_supportedPackageListContainsBarcelona() {
        assertTrue(adapter.supportedPackages.contains("com.instagram.barcelona"))
        assertEquals(1, adapter.supportedPackages.size)
    }

    @Test
    fun test04_emergencyStopBeforeAction() = runBlocking {
        EmergencyStopManager.trigger("Manual safety halt")
        val success = adapter.verifyThreads()
        assertFalse(success)
    }

    @Test
    fun test05_emergencyStopDuringWorkflow() = runBlocking {
        EmergencyStopManager.trigger("Global emergency interrupt")
        val res = adapter.publish()
        assertFalse(res.success)
        assertEquals("ABORTED_EMERGENCY_STOP", res.finalState)
    }

    @Test
    fun test06_composerDetectionSuccessful() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/creation_tab",
                text = "New thread",
                className = "android.widget.FrameLayout",
                isClickable = true,
                bounds = Rect(450, 2000, 630, 2180)
            )
        )
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/post_text_view",
                text = "Start a thread...",
                className = "android.widget.EditText",
                isClickable = true,
                bounds = Rect(50, 300, 1000, 500)
            )
        )
        val success = adapter.openComposer()
        assertTrue(success)
        assertTrue(executor.executionLog.contains("click:com.instagram.barcelona:id/creation_tab"))
    }

    @Test
    fun test07_composerMissingTriggersRecovery() = runBlocking {
        val success = adapter.openComposer()
        assertFalse(success)
        assertEquals(1, adapter.getRecoveryAttempts())
    }

    @Test
    fun test08_localContentUriAccepted() {
        adapter.validateMediaUri("content://media/external/images/media/3392")
    }

    @Test
    fun test09_localFileUriAccepted() {
        adapter.validateMediaUri("file:///storage/emulated/0/DCIM/video.mp4")
    }

    @Test
    fun test10_remoteHttpRejected() {
        try {
            adapter.validateMediaUri("http://example.com/media.mp4")
            fail("Expected SecurityException on http:// URI")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("Remote HTTP/HTTPS media URIs are strictly prohibited"))
        }
    }

    @Test
    fun test11_remoteHttpsRejected() {
        try {
            adapter.validateMediaUri("https://cdn.example.com/asset.png")
            fail("Expected SecurityException on https:// URI")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("Remote HTTP/HTTPS media URIs are strictly prohibited"))
        }
    }

    @Test
    fun test12_malformedUriRejected() {
        try {
            adapter.validateMediaUri("ftp://server/image.jpg")
            fail("Expected IllegalArgumentException on invalid URI")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("Unsupported media URI scheme"))
        }
    }

    @Test
    fun test13_payloadNormalization() {
        val raw = "Hello   from   Threads!   \n\n\n\nNew   updates!   "
        val clean = adapter.sanitizePostText(raw)
        assertEquals("Hello from Threads!\n\nNew updates!", clean)
    }

    @Test
    fun test14_oversizedPayloadRejected() {
        val longText = "A".repeat(501)
        try {
            adapter.sanitizePostText(longText)
            fail("Expected IllegalArgumentException on oversized text")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("Post text exceeds maximum allowed length"))
        }
    }

    @Test
    fun test15_unicodePreservation() {
        val input = "Threads 🚀 Bonjour le monde 🌍 こんにちは世界"
        val clean = adapter.sanitizePostText(input)
        assertEquals(input, clean)
    }

    @Test
    fun test16_emojiPreservation() {
        val input = "Personal android companion 🤖⚡️🔥"
        val clean = adapter.sanitizePostText(input)
        assertEquals(input, clean)
    }

    @Test
    fun test17_hashtagDeduplication() {
        val tags = listOf("#Android", "android", "#TECH", "tech", "#OpenSource")
        val clean = adapter.sanitizeHashtags(tags)
        assertEquals(listOf("#Android", "#TECH", "#OpenSource"), clean)
    }

    @Test
    fun test18_hashtagBodyOverlapRemoval() {
        val body = "Excited about modern #Android development!"
        val tags = listOf("#Android", "#Kotlin", "#Mobile")
        val clean = adapter.sanitizeHashtags(tags, body)
        assertEquals(listOf("#Kotlin", "#Mobile"), clean)
    }

    @Test
    fun test19_malformedHashtagsRejected() {
        val tags = listOf("#", "   ", "##", "#valid_tag")
        val clean = adapter.sanitizeHashtags(tags)
        assertEquals(listOf("#valid_tag"), clean)
    }

    @Test
    fun test20_loginTripwire() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/login_button",
                text = "Log in with Instagram",
                className = "android.widget.Button",
                bounds = Rect(100, 1000, 900, 1120)
            )
        )
        try {
            adapter.verifyThreads()
            fail("Expected SecurityException on login prompt")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("challenge detected"))
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test21_otpTripwire() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/otp_entry",
                text = "Enter 6-digit confirmation code",
                className = "android.widget.EditText",
                bounds = Rect(100, 800, 900, 950)
            )
        )
        try {
            adapter.detectReadyState()
            fail("Expected SecurityException on OTP tripwire")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("challenge detected"))
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test22_captchaTripwire() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/arkose_container",
                text = "Security challenge: solve the puzzle",
                className = "android.view.View",
                bounds = Rect(0, 0, 1080, 1920)
            )
        )
        try {
            adapter.verifyThreads()
            fail("Expected SecurityException on CAPTCHA tripwire")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("challenge detected"))
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test23_accountSwitcherTripwire() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/account_picker",
                text = "Switch accounts",
                className = "android.widget.TextView",
                bounds = Rect(100, 400, 800, 500)
            )
        )
        try {
            adapter.verifyThreads()
            fail("Expected SecurityException on account switcher")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("challenge detected"))
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test24_monetizationTripwire() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/meta_verified_banner",
                text = "Subscribe to Meta Verified",
                className = "android.widget.Button",
                bounds = Rect(100, 500, 980, 650)
            )
        )
        try {
            adapter.verifyThreads()
            fail("Expected SecurityException on monetization prompt")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.contains("challenge detected"))
            assertTrue(EmergencyStopManager.isStopped.value)
        }
    }

    @Test
    fun test25_approvalRequired() = runBlocking {
        val job = JobModel(
            jobId = "th_test_01",
            platform = "threads",
            action = "publish_thread",
            requiresApproval = true
        )
        adapter.requestPublishApproval(job)
        assertFalse(adapter.isApprovalGranted())
    }

    @Test
    fun test26_publishBlockedWithoutApproval() = runBlocking {
        val res = adapter.publish()
        assertFalse(res.success)
        assertEquals("WAITING_FOR_APPROVAL", res.finalState)
    }

    @Test
    fun test27_publishSucceedsWithApproval() = runBlocking {
        adapter.approvePublish()
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/button_post",
                text = "Post",
                className = "android.widget.Button",
                isClickable = true,
                bounds = Rect(800, 100, 1000, 200)
            )
        )
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/toast",
                text = "Your thread was posted",
                className = "android.widget.TextView",
                bounds = Rect(50, 2000, 600, 2100)
            )
        )
        val res = adapter.publish()
        assertTrue(res.success)
        assertEquals("COMPLETED", res.finalState)
    }

    @Test
    fun test28_ambiguousPublicationResult() = runBlocking {
        adapter.approvePublish()
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/button_post",
                text = "Post",
                className = "android.widget.Button",
                isClickable = true,
                bounds = Rect(800, 100, 1000, 200)
            )
        )
        // Keep composer open without success toast -> ambiguous
        val res = adapter.publish()
        assertFalse(res.success)
        assertEquals("UNCONFIRMED", res.finalState)
    }

    @Test
    fun test29_recoveryAttemptLimits() = runBlocking {
        val r1 = adapter.recover("Initial transient error")
        assertTrue(r1)
        assertEquals(1, adapter.getRecoveryAttempts())

        val r2 = adapter.recover("Second transient error")
        assertTrue(r2)
        assertEquals(2, adapter.getRecoveryAttempts())

        val r3 = adapter.recover("Third error exceeding limit")
        assertFalse(r3)
        assertTrue(EmergencyStopManager.isStopped.value)
    }

    @Test
    fun test30_recoveryBlockedWhileEmergencyStopActive() = runBlocking {
        EmergencyStopManager.trigger("Safety active")
        val recovered = adapter.recover("Attempt while halted")
        assertFalse(recovered)
    }

    @Test
    fun test31_auditLogGenerated() = runBlocking {
        adapter.verifyThreads()
        val logs = LocalActionLogger.getLogs()
        assertTrue(logs.any { it.action == "VERIFY_THREADS" && it.platform == "threads" })
    }

    @Test
    fun test32_combineTextAndHashtagsEnforcesLimit() {
        val body = "A".repeat(480)
        val tags = listOf("#Android", "#Tech", "#Mobile")
        try {
            adapter.combineTextAndHashtags(body, tags)
            fail("Expected exception when combined exceeds 500 chars")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("exceed 500 characters"))
        }
    }

    @Test
    fun test33_verifyMediaConfirmed() = runBlocking {
        inspector.nodes.add(
            UiNodeInfo(
                id = "com.instagram.barcelona:id/media_preview",
                text = "Media preview",
                className = "android.widget.ImageView",
                bounds = Rect(100, 400, 500, 800)
            )
        )
        val verified = adapter.verifyMedia()
        assertTrue(verified)
    }

    @Test
    fun test34_capabilitiesExactMatch() {
        val caps = adapter.capabilities
        assertTrue(caps.supportsVideo)
        assertFalse(caps.supportsTitle)
        assertTrue(caps.supportsDescription)
        assertTrue(caps.supportsHashtags)
        assertFalse(caps.supportsCover)
        assertTrue(caps.requiresApproval)
    }
}
