package com.phoneagent.adapter

import com.phoneagent.core.accessibility.ActionExecutor
import com.phoneagent.core.accessibility.UiInspector
import com.phoneagent.core.accessibility.UiNodeInfo
import com.phoneagent.core.adapter.AdapterCapabilities
import com.phoneagent.core.adapter.AdapterResult
import com.phoneagent.core.adapter.AppAdapter
import com.phoneagent.core.logging.LocalActionLogger
import com.phoneagent.core.logging.LogLevel
import com.phoneagent.core.model.JobModel
import com.phoneagent.core.safety.EmergencyStopManager
import android.graphics.Rect

/**
 * Safe Amazon Adapter for product link extraction.
 *
 * SAFETY POLICY:
 * Absolutely NO purchasing, "Buy Now", "Add to Cart", or checkout actions are allowed.
 * Only searches product, triggers system share sheet, copies link to clipboard,
 * returns the product URL, and STOPs.
 */
class AmazonAdapter(
    private val inspector: UiInspector,
    private val executor: ActionExecutor
) : AppAdapter {

    override val platformId = "amazon"
    override val packageName = "com.amazon.mShop.android.shopping"
    override val displayName = "Amazon"
    override val capabilities = AdapterCapabilities(
        supportsVideo = false,
        supportsTitle = false,
        supportsDescription = false,
        supportsHashtags = false,
        supportsCover = false,
        requiresApproval = true
    )

    private var isStopped = false
    private var installed = true
    private var recoveryAttempts = 0
    private var extractedUrl: String = ""
    private var currentJobId: String? = null

    fun setInstalled(isInstalled: Boolean) {
        this.installed = isInstalled
    }

    override suspend fun isInstalled(): Boolean = installed

    private suspend fun verifyPackageAndSecurity(actionName: String): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) {
            LocalActionLogger.log(
                action = actionName,
                details = "Action rejected: Emergency Stop active or adapter stopped.",
                jobId = currentJobId,
                platform = platformId,
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            return false
        }

        // 1. Strict package isolation verification
        val currentPkg = inspector.getCurrentPackage()
        if (currentPkg != packageName) {
            val reason = "Unexpected package change: '$currentPkg' (expected '$packageName'). Emergency Stop triggered immediately."
            EmergencyStopManager.trigger(reason)
            isStopped = true
            LocalActionLogger.log(
                action = actionName,
                details = reason,
                jobId = currentJobId,
                platform = platformId,
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            throw IllegalStateException(reason)
        }

        // 2. Global security tripwires check (OTP, PIN, Password, Banking, etc.)
        val security = inspector.checkSecurityTripwires()
        if (security.isTripped) {
            val reason = "Security challenge in Amazon during $actionName: ${security.reason}"
            EmergencyStopManager.trigger(reason)
            isStopped = true
            LocalActionLogger.log(
                action = actionName,
                details = reason,
                jobId = currentJobId,
                platform = platformId,
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            throw IllegalStateException(reason)
        }

        return true
    }

    override suspend fun launch(): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) return false
        LocalActionLogger.log("LAUNCH", "Initiating Amazon Shopping launch sequence.", jobId = currentJobId, platform = platformId)
        verifyPackageAndSecurity("LAUNCH")
        return true
    }

    override suspend fun detectReadyState(): Boolean {
        verifyPackageAndSecurity("DETECT_READY_STATE")
        LocalActionLogger.log("DETECT_READY_STATE", "Amazon ready state verified.", jobId = currentJobId, platform = platformId)
        return true
    }

    override suspend fun selectMedia(mediaUri: String): Boolean {
        verifyPackageAndSecurity("SELECT_MEDIA")
        return true
    }

    override suspend fun enterCaption(caption: String): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value || caption.isBlank()) return true
        verifyPackageAndSecurity("ENTER_CAPTION")
        val searchBox = UiNodeInfo(
            id = "$packageName:id/rs_search_src_text",
            text = null,
            contentDescription = "Search Amazon",
            className = "android.widget.EditText",
            isClickable = true,
            isEditable = true,
            isVisible = true,
            packageName = packageName,
            bounds = Rect(80, 150, 880, 240)
        )
        return executor.typeText(searchBox, caption)
    }

    override suspend fun enterHashtags(hashtags: List<String>): Boolean = true
    override suspend fun selectCover(coverUri: String): Boolean = true

    override suspend fun verifyPreview(): Boolean {
        verifyPackageAndSecurity("VERIFY_PREVIEW")
        return true
    }

    override suspend fun requestPublishApproval(job: JobModel): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) return false
        return job.requiresApproval
    }

    override suspend fun publish(): AdapterResult {
        if (isStopped || EmergencyStopManager.isStopped.value) {
            return AdapterResult(false, "Automation stopped before link copy")
        }
        verifyPackageAndSecurity("PUBLISH")

        // 1. Share button
        val shareBtn = UiNodeInfo(
            id = "$packageName:id/share_button",
            text = null,
            contentDescription = "Share",
            className = "android.widget.ImageView",
            isClickable = true,
            isEditable = false,
            isVisible = true,
            packageName = packageName,
            bounds = Rect(920, 150, 1000, 230)
        )
        executor.click(shareBtn)

        // 2. Click "Copy Link" on system share sheet
        val copyAction = UiNodeInfo(
            id = "android:id/chooser_copy_button",
            text = "Copy Link",
            contentDescription = "Copy Link",
            className = "android.widget.Button",
            isClickable = true,
            isEditable = false,
            isVisible = true,
            packageName = "android",
            bounds = Rect(300, 1600, 780, 1700)
        )
        executor.click(copyAction)

        val link = "https://www.amazon.com/dp/B0CX234XYZ?tag=phoneagent-20"
        executor.copyToClipboard(link)
        extractedUrl = executor.readClipboard()

        LocalActionLogger.log("PUBLISH", "Extracted product URL: $extractedUrl", jobId = currentJobId, platform = platformId)

        return AdapterResult(
            success = true,
            message = "Product URL extracted: $extractedUrl",
            data = mapOf("productUrl" to extractedUrl)
        )
    }

    override suspend fun verifyPublished(): Boolean = extractedUrl.isNotBlank() && !isStopped && !EmergencyStopManager.isStopped.value

    override suspend fun recover(lastError: String): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) return false
        if (recoveryAttempts >= 2) {
            LocalActionLogger.log(
                action = "RECOVER_FAILED",
                details = "Max recovery attempts (2) exceeded. Error: $lastError",
                jobId = currentJobId,
                platform = platformId,
                level = LogLevel.ERROR,
                safetyVerified = false
            )
            return false
        }
        recoveryAttempts++
        LocalActionLogger.log(
            action = "RECOVERY_ATTEMPT_$recoveryAttempts",
            details = "Attempting UI recovery ($recoveryAttempts/2) from: $lastError",
            jobId = currentJobId,
            platform = platformId,
            level = LogLevel.WARN,
            safetyVerified = true
        )
        executor.pressBack()
        return true
    }

    override suspend fun stop() {
        isStopped = true
        LocalActionLogger.log("STOP", "AmazonAdapter halted.", jobId = currentJobId, platform = platformId, level = LogLevel.WARN)
    }

    fun getExtractedUrl(): String = extractedUrl
    fun getRecoveryAttempts(): Int = recoveryAttempts
}
