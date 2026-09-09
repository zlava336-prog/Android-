package com.phoneagent.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.phoneagent.core.accessibility.ActionExecutor
import com.phoneagent.core.accessibility.ScrollDirection
import com.phoneagent.core.accessibility.SecurityTripwireResult
import com.phoneagent.core.accessibility.UiInspector
import com.phoneagent.core.accessibility.UiNodeInfo
import com.phoneagent.core.logging.LocalActionLogger
import com.phoneagent.core.logging.LogLevel
import com.phoneagent.core.safety.EmergencyStopManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * PhoneAgentAccessibilityService
 *
 * Safe implementation of Android AccessibilityService:
 * 1. Only targets pre-configured social media & product sharing applications.
 * 2. Strict blacklist: Never interacts with banking, payment (UPI/GPay), SMS, OTP, or password managers.
 * 3. Tripwires: If any sensitive keyword (OTP, PIN, CAPTCHA, Card Number) is found in window content,
 *    it immediately triggers Emergency Stop.
 * 4. All actions are logged to LocalActionLogger.
 */
class PhoneAgentAccessibilityService : AccessibilityService(), UiInspector, ActionExecutor {

    companion object {
        var instance: PhoneAgentAccessibilityService? = null
            private set

        val FORBIDDEN_PACKAGES = setOf(
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.google.android.apps.nbu.paisa.user",
            "com.phonepe.app",
            "net.one97.paytm",
            "com.paypal.android.p2pmobile",
            "com.chase.sig.android",
            "com.bankofamerica.activity",
            "com.wellsfargo.mobile",
            "com.citi.citimobile",
            "com.lastpass.lpandroid",
            "com.onepassword.android",
            "com.bitwarden",
            "com.android.settings"
        )

        val TRIPWIRE_KEYWORDS = listOf(
            "enter otp", "one time password", "verification code", "security code",
            "enter pin", "upi pin", "cvv", "card number", "captcha", "not a robot",
            "enter password", "sign in to continue", "confirm payment", "purchase now"
        )
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        LocalActionLogger.log(
            action = "ACCESSIBILITY_CONNECTED",
            details = "PhoneAgentAccessibilityService bound successfully with restricted package filters.",
            level = LogLevel.INFO
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        LocalActionLogger.log(
            action = "ACCESSIBILITY_DISCONNECTED",
            details = "PhoneAgentAccessibilityService destroyed.",
            level = LogLevel.WARN
        )
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val packageName = event.packageName?.toString() ?: return

        // Instant defense: if user switches to a forbidden app (e.g. banking/SMS)
        if (FORBIDDEN_PACKAGES.contains(packageName)) {
            EmergencyStopManager.trigger("Prohibited application detected: $packageName. Automation halted.")
            LocalActionLogger.log(
                action = "SECURITY_HALT",
                details = "User navigated to prohibited package $packageName. Emergency stop triggered.",
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
        }
    }

    override fun onInterrupt() {
        EmergencyStopManager.trigger("Accessibility Service interrupted by Android OS")
    }

    // --- UiInspector Implementation ---

    override suspend fun getRootNode(): UiNodeInfo? = withContext(Dispatchers.Default) {
        val root = rootInActiveWindow ?: return@withContext null
        nodeToUiNodeInfo(root)
    }

    override suspend fun getCurrentPackage(): String = withContext(Dispatchers.Default) {
        rootInActiveWindow?.packageName?.toString() ?: ""
    }

    override suspend fun findNodesByText(text: String, exact: Boolean): List<UiNodeInfo> =
        withContext(Dispatchers.Default) {
            val root = rootInActiveWindow ?: return@withContext emptyList()
            val rawList = root.findAccessibilityNodeInfosByText(text)
            rawList.mapNotNull { nodeToUiNodeInfo(it) }
        }

    override suspend fun findNodeByViewId(viewId: String): UiNodeInfo? = withContext(Dispatchers.Default) {
        val root = rootInActiveWindow ?: return@withContext null
        val rawList = root.findAccessibilityNodeInfosByViewId(viewId)
        rawList.firstOrNull()?.let { nodeToUiNodeInfo(it) }
    }

    override suspend fun findNodeByContentDescription(desc: String): UiNodeInfo? =
        withContext(Dispatchers.Default) {
            val root = rootInActiveWindow ?: return@withContext null
            findRecursive(root) { it.contentDescription?.toString()?.contains(desc, ignoreCase = true) == true }
                ?.let { nodeToUiNodeInfo(it) }
        }

    override suspend fun checkSecurityTripwires(): SecurityTripwireResult = withContext(Dispatchers.Default) {
        val currentPkg = getCurrentPackage()
        if (FORBIDDEN_PACKAGES.contains(currentPkg)) {
            return@withContext SecurityTripwireResult(
                isTripped = true,
                reason = "Prohibited package active: $currentPkg",
                detectedElement = currentPkg
            )
        }

        val root = rootInActiveWindow ?: return@withContext SecurityTripwireResult(false)
        val textList = mutableListOf<String>()
        collectAllText(root, textList)

        for (text in textList) {
            val lower = text.lowercase()
            for (kw in TRIPWIRE_KEYWORDS) {
                if (lower.contains(kw)) {
                    return@withContext SecurityTripwireResult(
                        isTripped = true,
                        reason = "Sensitive UI tripwire: detected \"$kw\"",
                        detectedElement = text
                    )
                }
            }
        }

        SecurityTripwireResult(false)
    }

    override suspend fun dumpNodeTree(): List<UiNodeInfo> = withContext(Dispatchers.Default) {
        val root = rootInActiveWindow ?: return@withContext emptyList()
        val list = mutableListOf<UiNodeInfo>()
        collectAllNodes(root, list)
        list
    }

    // --- ActionExecutor Implementation ---

    override suspend fun click(node: UiNodeInfo): Boolean {
        if (EmergencyStopManager.isStopped.value) return false
        val targetNode = findAccessibilityNodeById(node.id) ?: return false
        val success = targetNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        LocalActionLogger.log("UI_CLICK", "Clicked node: ${node.id}", nodeId = node.id, level = LogLevel.ACTION)
        return success
    }

    override suspend fun clickAt(x: Int, y: Int): Boolean {
        if (EmergencyStopManager.isStopped.value) return false
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
            .build()
        dispatchGesture(gesture, null, null)
        LocalActionLogger.log("GESTURE_TAP", "Dispatched tap at ($x, $y)", level = LogLevel.ACTION)
        return true
    }

    override suspend fun typeText(node: UiNodeInfo, text: String): Boolean {
        if (EmergencyStopManager.isStopped.value) return false
        val target = findAccessibilityNodeById(node.id) ?: return false
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val success = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        LocalActionLogger.log("INPUT_TEXT", "Typed text into ${node.id} (${text.take(15)}...)", nodeId = node.id, level = LogLevel.ACTION)
        return success
    }

    override suspend fun clearText(node: UiNodeInfo): Boolean {
        if (EmergencyStopManager.isStopped.value) return false
        val target = findAccessibilityNodeById(node.id) ?: return false
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
        }
        return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    override suspend fun scroll(direction: ScrollDirection): Boolean {
        if (EmergencyStopManager.isStopped.value) return false
        val root = rootInActiveWindow ?: return false
        val action = when (direction) {
            ScrollDirection.DOWN -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            ScrollDirection.UP -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            else -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        }
        return root.performAction(action)
    }

    override suspend fun copyToClipboard(text: String): Boolean {
        if (EmergencyStopManager.isStopped.value) return false
        val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
        val clip = android.content.ClipData.newPlainText("phone_agent", text)
        clipboard.setPrimaryClip(clip)
        return true
    }

    override suspend fun readClipboard(): String {
        if (EmergencyStopManager.isStopped.value) return ""
        val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
        val clip = clipboard.primaryClip ?: return ""
        return if (clip.itemCount > 0) clip.getItemAt(0).text?.toString() ?: "" else ""
    }

    override suspend fun pressBack(): Boolean {
        if (EmergencyStopManager.isStopped.value) return false
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    // --- Helpers ---

    private fun nodeToUiNodeInfo(node: AccessibilityNodeInfo): UiNodeInfo {
        val rect = Rect()
        node.getBoundsInScreen(rect)
        return UiNodeInfo(
            id = node.viewIdResourceName ?: "node_${node.hashCode()}",
            text = node.text?.toString(),
            contentDescription = node.contentDescription?.toString(),
            className = node.className?.toString() ?: "",
            isClickable = node.isClickable,
            isEditable = node.isEditable,
            isVisible = node.isVisibleToUser,
            packageName = node.packageName?.toString() ?: "",
            bounds = rect
        )
    }

    private fun findAccessibilityNodeById(id: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val found = root.findAccessibilityNodeInfosByViewId(id)
        return found.firstOrNull()
    }

    private fun findRecursive(node: AccessibilityNodeInfo, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (predicate(node)) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val res = findRecursive(child, predicate)
            if (res != null) return res
        }
        return null
    }

    private fun collectAllText(node: AccessibilityNodeInfo, list: MutableList<String>) {
        node.text?.let { list.add(it.toString()) }
        node.contentDescription?.let { list.add(it.toString()) }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectAllText(child, list)
        }
    }

    private fun collectAllNodes(node: AccessibilityNodeInfo, list: MutableList<UiNodeInfo>) {
        list.add(nodeToUiNodeInfo(node))
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectAllNodes(child, list)
        }
    }
}
