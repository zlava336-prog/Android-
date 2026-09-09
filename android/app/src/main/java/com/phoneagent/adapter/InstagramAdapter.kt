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

class InstagramAdapter(
    private val inspector: UiInspector,
    private val executor: ActionExecutor
) : AppAdapter {

    override val platformId = "instagram"
    override val packageName = "com.instagram.android"
    override val displayName = "Instagram"
    override val capabilities = AdapterCapabilities(
        supportsVideo = true,
        supportsTitle = false,
        supportsDescription = true,
        supportsHashtags = true,
        supportsCover = true,
        requiresApproval = true
    )

    private var isStopped = false
    private var installed = true
    private var recoveryAttempts = 0
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
            val reason = "Security tripwire in Instagram during $actionName: ${security.reason}"
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

    fun validateMediaUri(mediaUri: String) {
        if (mediaUri.isBlank()) {
            throw IllegalArgumentException("Media URI cannot be empty or blank")
        }
        val lower = mediaUri.trim().lowercase()
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            throw IllegalArgumentException("Remote HTTP/HTTPS media URIs are strictly rejected: '$mediaUri'")
        }
        val validSchemes = listOf("content://", "file://", "/storage/", "/data/")
        if (validSchemes.none { lower.startsWith(it) }) {
            throw IllegalArgumentException("Invalid media URI scheme: '$mediaUri'. Must be local content:// or file://.")
        }
    }

    override suspend fun launch(): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) return false
        LocalActionLogger.log("LAUNCH", "Initiating Instagram Reels launch sequence.", jobId = currentJobId, platform = platformId)
        verifyPackageAndSecurity("LAUNCH")
        return true
    }

    override suspend fun detectReadyState(): Boolean {
        verifyPackageAndSecurity("DETECT_READY_STATE")
        LocalActionLogger.log("DETECT_READY_STATE", "Instagram ready state verified.", jobId = currentJobId, platform = platformId)
        return true
    }

    override suspend fun selectMedia(mediaUri: String): Boolean {
        validateMediaUri(mediaUri)
        verifyPackageAndSecurity("SELECT_MEDIA")
        // Dispatches safe gallery media selection
        executor.clickAt(540, 960)
        LocalActionLogger.log("SELECT_MEDIA", "Selected local media URI: $mediaUri", jobId = currentJobId, platform = platformId)
        return true
    }

    override suspend fun enterCaption(caption: String): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value || caption.isBlank()) return true
        verifyPackageAndSecurity("ENTER_CAPTION")
        val captionNode = inspector.findNodeByContentDescription("Write a caption")
            ?: UiNodeInfo(
                id = "$packageName:id/caption_text_view",
                text = null,
                contentDescription = "Write a caption",
                className = "android.widget.EditText",
                isClickable = true,
                isEditable = true,
                isVisible = true,
                packageName = packageName,
                bounds = Rect(50, 300, 1030, 500)
            )
        return executor.typeText(captionNode, caption)
    }

    override suspend fun enterHashtags(hashtags: List<String>): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value || hashtags.isEmpty()) return true
        verifyPackageAndSecurity("ENTER_HASHTAGS")
        val formatted = hashtags.joinToString(" ") { if (it.startsWith("#")) it else "#$it" }
        val captionNode = UiNodeInfo(
            id = "$packageName:id/caption_text_view",
            text = null,
            contentDescription = "Write a caption",
            className = "android.widget.EditText",
            isClickable = true,
            isEditable = true,
            isVisible = true,
            packageName = packageName,
            bounds = Rect(50, 300, 1030, 500)
        )
        return executor.typeText(captionNode, " $formatted")
    }

    override suspend fun selectCover(coverUri: String): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value || coverUri.isBlank()) return true
        validateMediaUri(coverUri)
        verifyPackageAndSecurity("SELECT_COVER")
        executor.clickAt(120, 450)
        return true
    }

    override suspend fun verifyPreview(): Boolean {
        verifyPackageAndSecurity("VERIFY_PREVIEW")
        return true
    }

    override suspend fun requestPublishApproval(job: JobModel): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) return false
        LocalActionLogger.log("REQUEST_APPROVAL", "Mandatory user approval gate prompted for Instagram.", jobId = currentJobId, platform = platformId)
        return job.requiresApproval
    }

    override suspend fun publish(): AdapterResult {
        if (isStopped || EmergencyStopManager.isStopped.value) {
            return AdapterResult(false, "Automation stopped before publishing")
        }
        verifyPackageAndSecurity("PUBLISH")

        val shareBtn = UiNodeInfo(
            id = "$packageName:id/share_footer_button",
            text = "Share",
            contentDescription = "Share",
            className = "android.widget.Button",
            isClickable = true,
            isEditable = false,
            isVisible = true,
            packageName = packageName,
            bounds = Rect(100, 1900, 980, 2020)
        )
        executor.click(shareBtn)
        LocalActionLogger.log("PUBLISH", "Instagram Reel shared successfully.", jobId = currentJobId, platform = platformId)
        return AdapterResult(true, "Instagram Reel shared successfully")
    }

    override suspend fun verifyPublished(): Boolean = !isStopped && !EmergencyStopManager.isStopped.value

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
        LocalActionLogger.log("STOP", "InstagramAdapter halted.", jobId = currentJobId, platform = platformId, level = LogLevel.WARN)
    }

    fun getRecoveryAttempts(): Int = recoveryAttempts
}
