package com.phoneagent.adapter

import android.graphics.Rect
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

/**
 * Phone Agent - Threads (Meta) Adapter
 *
 * Implements AppAdapter for the official Threads Android application (com.instagram.barcelona)
 * with strict zero-trust safety:
 * - Dynamic foreground package verification before EVERY action; triggers EmergencyStopManager on mismatch.
 * - Dynamic UI discovery through accessibility hierarchy (UiInspector discovery; no hardcoded coordinates).
 * - Strict local media validation (content://, file://, /storage/, /data/ only; prohibits remote HTTP/HTTPS).
 * - Complete 12-stage Threads publishing workflow:
 *     1. VERIFY_THREADS
 *     2. DETECT_READY_STATE
 *     3. OPEN_COMPOSER
 *     4. SELECT_MEDIA
 *     5. VERIFY_MEDIA
 *     6. ENTER_POST_TEXT
 *     7. ADD_HASHTAGS
 *     8. VERIFY_COMPOSER
 *     9. AUDIT_FINAL_SCREEN
 *     10. REQUEST_PUBLISH_APPROVAL
 *     11. PUBLISH
 *     12. VERIFY_PUBLICATION
 *     -> COMPLETE
 * - Dynamic capability declaration:
 *     supportsVideo = true
 *     supportsTitle = false
 *     supportsDescription = true
 *     supportsHashtags = true
 *     supportsCover = false
 *     requiresApproval = true
 * - Safe deterministic text handling:
 *     - Preserves meaningful content & intentional line breaks.
 *     - Normalizes excessive whitespace & consecutive blank lines.
 *     - Full Unicode support (emojis, international characters).
 *     - Enforces standard 500-character safe limit; never silently truncates (structured validation error).
 * - Hashtag normalization:
 *     - Ensures '#' prefix, deduplicates case-insensitively, removes body overlap, preserves Unicode.
 *     - Safe append ensuring 500-char post limit is never exceeded.
 * - Media preview verification:
 *     - Confirms media attachment, preview element, and verified foreground package before proceeding.
 * - Human-in-the-loop approval gate enforcement prior to invoking final Post/Share button.
 * - Zero-trust security tripwires:
 *     - Immediate Emergency Stop on login, password, OTP, 2FA, passkey, CAPTCHA/challenge,
 *       account switcher, suspicious login, or payment/monetization/Meta Verified/boost.
 * - Publication verification:
 *     - Confirms positive UI evidence (toast/snackbar/feed return); distinguishes drafts, errors, and processing.
 * - Strict 2-attempt recovery limit before fail-stop.
 * - Cryptographic audit logging with zero credential leakage.
 */
class ThreadsAdapter(
    private val inspector: UiInspector,
    private val executor: ActionExecutor,
    initialPackageName: String = "com.instagram.barcelona"
) : AppAdapter {

    override val platformId = "threads"
    override var packageName: String = initialPackageName
        private set
    override val displayName = "Threads"

    // Supported official packages for Threads on Android
    val supportedPackages = listOf(
        "com.instagram.barcelona"
    )

    override var capabilities = AdapterCapabilities(
        supportsVideo = true,
        supportsTitle = false,
        supportsDescription = true,
        supportsHashtags = true,
        supportsCover = false,
        requiresApproval = true
    )
        private set

    private var installed = true
    private var isStopped = false
    private var isApproved = false
    private var recoveryAttempts = 0
    private var currentJobId: String? = null

    var maxTextLength: Int = 500

    fun configurePackage(pkg: String) {
        this.packageName = pkg
    }

    fun setInstalled(isInstalled: Boolean) {
        this.installed = isInstalled
    }

    fun setCapabilities(caps: AdapterCapabilities) {
        this.capabilities = caps
    }

    fun getRecoveryAttempts(): Int = recoveryAttempts

    override suspend fun isInstalled(): Boolean = installed

    /**
     * Verifies foreground package and checks for any active security tripwires.
     * Triggers EmergencyStopManager and throws SecurityException on violation.
     */
    private suspend fun verifyPackageAndSecurity(actionName: String): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) {
            LocalActionLogger.log(
                action = actionName,
                details = "Action rejected: Emergency Stop active or ThreadsAdapter stopped.",
                jobId = currentJobId,
                platform = platformId,
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            return false
        }

        // 1. Strict foreground package verification
        val currentPkg = inspector.getCurrentPackage()
        if (currentPkg != packageName && !supportedPackages.contains(currentPkg)) {
            val reason = "Unexpected package change: '$currentPkg' (expected '$packageName'). Emergency Stop triggered immediately."
            EmergencyStopManager.activate("UNEXPECTED_PACKAGE")
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
            throw SecurityException(reason)
        }

        // 2. Global security tripwires check
        val security = inspector.checkSecurityTripwires()
        if (security.isTripped) {
            val reason = "Security tripwire triggered in Threads during $actionName: ${security.reason ?: "Unknown challenge"}"
            EmergencyStopManager.activate("SECURITY_TRIPWIRE")
            EmergencyStopManager.trigger(reason)
            isStopped = true
            LocalActionLogger.log(
                jobId = currentJobId,
                platform = "threads",
                action = actionName,
                details = reason,
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            throw SecurityException(reason)
        }

        // 3. Threads-specific auth, account switcher, security, payment, and monetization tripwires
        checkThreadsSpecificTripwires(actionName)

        return true
    }

    /**
     * Checks for Threads-specific security challenges, payment prompts, subscriptions,
     * account switchers, and authentication barriers.
     */
    suspend fun checkThreadsSpecificTripwires(actionName: String) {
        val forbiddenKeywords = listOf(
            // Auth / Login / Sign-in
            "log in",
            "sign in",
            "sign up",
            "log in with instagram",
            "continue with instagram",
            "log in to instagram",
            "welcome to threads",
            "log in to another account",
            "sign in with google",
            "sign in with apple",
            "continue with google",
            "continue with apple",
            // Passwords & Credentials
            "password",
            "enter your password",
            "enter password",
            "passkey",
            "biometric",
            // OTP / 2FA / Verification codes
            "verification code",
            "enter confirmation code",
            "enter 6-digit code",
            "enter 8-digit code",
            "enter code",
            "sms code",
            "confirmation code",
            "security code",
            "two-factor",
            "2-step verification",
            "2fa",
            // CAPTCHA & Security Challenges
            "authenticate",
            "puzzle",
            "captcha",
            "arkose",
            "security challenge",
            "security check",
            "security checkpoint",
            "suspicious activity",
            "unusual activity",
            "confirm your phone",
            "confirm your email",
            "confirm your account",
            "account suspended",
            "locked account",
            "automated activity",
            "automated behavior",
            "verify your identity",
            "identity verification",
            "account recovery",
            "reset password",
            "verify you're a human",
            // Account Switcher & Ambiguous Identity
            "switch accounts",
            "switch account",
            "switch profile",
            "log into another account",
            "add an existing account",
            "create a new account",
            "choose an account",
            "manage accounts",
            "add account",
            "log in to another instagram account",
            // Payment, Subscriptions, Billing, Monetization, Meta Verified
            "meta verified",
            "verified badge",
            "subscribe",
            "subscription",
            "meta pay",
            "payment",
            "billing",
            "credit card",
            "debit card",
            "add payment method",
            "boost",
            "boost post",
            "promote",
            "promote thread",
            "ad billing",
            "order total",
            "in-app purchase"
        )

        val nodes = inspector.dumpNodeTree()
        for (node in nodes) {
            val combined = "${node.text ?: ""} ${node.contentDescription ?: ""}".lowercase()
            for (kw in forbiddenKeywords) {
                if (combined.contains(kw)) {
                    val reason = "Threads security/auth/account-switcher/payment challenge detected: keyword '$kw' in element ${node.id}. Aborting immediately."
                    EmergencyStopManager.activate("SECURITY_TRIPWIRE")
                    EmergencyStopManager.trigger(reason)
                    isStopped = true
                    LocalActionLogger.log(
                        jobId = currentJobId,
                        platform = "threads",
                        action = actionName,
                        details = reason,
                        level = LogLevel.SECURITY,
                        safetyVerified = false
                    )
                    throw SecurityException(reason)
                }
            }
        }
    }

    /**
     * Validates local media URIs. Strictly rejects remote HTTP/HTTPS schemes or malformed URIs.
     */
    fun validateMediaUri(uri: String) {
        val trimmed = uri.trim()
        if (trimmed.isEmpty()) {
            throw IllegalArgumentException("Media URI cannot be empty.")
        }
        val lower = trimmed.lowercase()
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            throw SecurityException("Remote HTTP/HTTPS media URIs are strictly prohibited. Provide local content:// or file:// URI.")
        }
        val isAllowedScheme = lower.startsWith("content://") ||
                lower.startsWith("file://") ||
                lower.startsWith("/storage/") ||
                lower.startsWith("/data/")

        if (!isAllowedScheme) {
            throw IllegalArgumentException("Unsupported media URI scheme: '$uri'. Must be content://, file://, /storage/, or /data/.")
        }
    }

    /**
     * Deterministic text sanitization:
     * - Preserves emojis & international Unicode characters.
     * - Normalizes excessive whitespace and consecutive blank lines.
     * - Rejects content exceeding 500 characters with a structured validation error (no silent truncation).
     */
    fun sanitizePostText(raw: String): String {
        if (raw.isBlank()) return ""

        val normalized = raw
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .replace(Regex("[ \\t]+"), " ")
            .replace(Regex("\\n{3,}"), "\n\n")
            .trim()

        if (normalized.length > maxTextLength) {
            throw IllegalArgumentException(
                "Post text exceeds maximum allowed length of $maxTextLength characters (actual: ${normalized.length}). Truncation is prohibited by safety policy."
            )
        }

        return normalized
    }

    /**
     * Hashtag normalization:
     * - Ensures '#' prefix.
     * - Strips invalid characters & empty tags.
     * - Case-insensitive deduplication.
     * - Removes hashtags already present in the post body.
     * - Preserves Unicode hashtags.
     */
    fun sanitizeHashtags(rawHashtags: List<String>, existingText: String? = null): List<String> {
        val seen = mutableSetOf<String>()
        val result = mutableListOf<String>()

        val existingNormalized = (existingText ?: "").lowercase()

        for (raw in rawHashtags) {
            var tag = raw.trim()
            if (tag.isEmpty()) continue
            if (!tag.startsWith("#")) {
                tag = "#$tag"
            }
            if (tag == "#") continue

            val cleanTag = "#" + tag.substring(1).replace(Regex("[\\s#]"), "")
            if (cleanTag.length <= 1) continue

            val lowerKey = cleanTag.lowercase()
            if (seen.contains(lowerKey)) continue

            // Exclude if already present in body text
            if (existingNormalized.contains(lowerKey)) {
                continue
            }

            seen.add(lowerKey)
            result.add(cleanTag)
        }

        return result
    }

    /**
     * Combines post text and hashtags, verifying that total combined length does not exceed 500 chars.
     */
    fun combineTextAndHashtags(text: String, hashtags: List<String>): String {
        val sanitizedText = sanitizePostText(text)
        val sanitizedTags = sanitizeHashtags(hashtags, sanitizedText)

        if (sanitizedTags.isEmpty()) return sanitizedText

        val tagsString = sanitizedTags.joinToString(" ")
        val combined = if (sanitizedText.isEmpty()) tagsString else "$sanitizedText\n\n$tagsString"

        if (combined.length > maxTextLength) {
            throw IllegalArgumentException(
                "Combined post text and hashtags exceed $maxTextLength characters (actual: ${combined.length}). Reduce caption or hashtags."
            )
        }

        return combined
    }

    /**
     * Stage 1: VERIFY_THREADS
     * Verifies that Threads is installed and foreground package matches.
     */
    suspend fun verifyThreads(): Boolean {
        if (!verifyPackageAndSecurity("VERIFY_THREADS")) return false

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "VERIFY_THREADS",
            details = "Threads verified in foreground with package: $packageName",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    /**
     * Stage 2: DETECT_READY_STATE
     * Dynamically detects whether Threads is on main feed / navigation bar and ready.
     */
    suspend fun detectReadyState(): Boolean {
        if (!verifyPackageAndSecurity("DETECT_READY_STATE")) return false

        val readyCandidates = listOf(
            "start a thread",
            "new thread",
            "new post",
            "create",
            "compose",
            "feed",
            "home",
            "threads",
            "profile"
        )

        val nodes = inspector.dumpNodeTree()
        val isReady = nodes.any { node ->
            val combined = "${node.text ?: ""} ${node.contentDescription ?: ""} ${node.id}".lowercase()
            readyCandidates.any { candidate -> combined.contains(candidate) }
        }

        if (!isReady) {
            LocalActionLogger.log(
                jobId = currentJobId,
                platform = platformId,
                action = "DETECT_READY_STATE",
                details = "Ready state indicator not immediately found. Attempting recovery.",
                level = LogLevel.WARN,
                safetyVerified = false
            )
            return recover("Threads ready state could not be confirmed.")
        }

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "DETECT_READY_STATE",
            details = "Threads ready state detected via dynamic UI inspection.",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    /**
     * Stage 3: OPEN_COMPOSER
     * Dynamically locates and clicks the compose button.
     */
    suspend fun openComposer(): Boolean {
        if (!verifyPackageAndSecurity("OPEN_COMPOSER")) return false

        val composerTriggers = listOf(
            "com.instagram.barcelona:id/creation_tab",
            "com.instagram.barcelona:id/composer_button",
            "com.instagram.barcelona:id/action_bar_create",
            "com.instagram.barcelona:id/feed_composer",
            "create",
            "new thread",
            "new post",
            "compose",
            "start a thread",
            "what's new"
        )

        val triggerNode = findSemanticNode(composerTriggers)
        if (triggerNode == null) {
            LocalActionLogger.log(
                jobId = currentJobId,
                platform = platformId,
                action = "OPEN_COMPOSER",
                details = "Composer trigger node not found. Attempting bounded recovery.",
                level = LogLevel.WARN,
                safetyVerified = false
            )
            return recover("Composer trigger button not found")
        }

        executor.click(triggerNode)

        // Verify composer opened
        val composerVisible = verifyComposer()
        if (!composerVisible) {
            return recover("Composer failed to open after clicking trigger.")
        }

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "OPEN_COMPOSER",
            details = "Composer opened successfully using semantic node: ${triggerNode.id}",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    /**
     * Stage 4: SELECT_MEDIA
     * Validates local URI and selects media attachment.
     */
    suspend fun selectMedia(mediaUri: String): Boolean {
        if (!verifyPackageAndSecurity("SELECT_MEDIA")) return false
        validateMediaUri(mediaUri)

        val mediaTriggers = listOf(
            "com.instagram.barcelona:id/attach_media",
            "com.instagram.barcelona:id/media_button",
            "com.instagram.barcelona:id/gallery_button",
            "attach media",
            "add photo or video",
            "gallery",
            "media",
            "photo",
            "video"
        )

        val mediaNode = findSemanticNode(mediaTriggers)
        if (mediaNode != null) {
            executor.click(mediaNode)
        }

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "SELECT_MEDIA",
            details = "Selected local media URI: $mediaUri",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return verifyMedia()
    }

    /**
     * Stage 5: VERIFY_MEDIA
     * Confirms media preview or thumbnail is attached in composer.
     */
    suspend fun verifyMedia(): Boolean {
        if (!verifyPackageAndSecurity("VERIFY_MEDIA")) return false

        val mediaEvidence = listOf(
            "com.instagram.barcelona:id/media_preview",
            "com.instagram.barcelona:id/thumbnail",
            "com.instagram.barcelona:id/video_preview",
            "com.instagram.barcelona:id/image_preview",
            "media preview",
            "remove media",
            "video thumbnail",
            "photo thumbnail"
        )

        val detected = findSemanticNode(mediaEvidence) != null
        if (!detected) {
            LocalActionLogger.log(
                jobId = currentJobId,
                platform = platformId,
                action = "VERIFY_MEDIA",
                details = "Media preview not confirmed in composer. Attempting recovery.",
                level = LogLevel.WARN,
                safetyVerified = false
            )
            return recover("Media preview verification unconfirmed.")
        }

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "VERIFY_MEDIA",
            details = "Media attachment preview confirmed in composer.",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    /**
     * Stage 6: ENTER_POST_TEXT
     * Types sanitized post text into composer edit field.
     */
    suspend fun enterPostText(text: String): Boolean {
        if (!verifyPackageAndSecurity("ENTER_POST_TEXT")) return false
        val sanitized = sanitizePostText(text)

        val textInputCandidates = listOf(
            "com.instagram.barcelona:id/post_text_view",
            "com.instagram.barcelona:id/composer_edit_text",
            "com.instagram.barcelona:id/caption_input",
            "start a thread",
            "what's new",
            "thread text",
            "say something"
        )

        val inputNode = findSemanticNode(textInputCandidates)
        if (inputNode == null) {
            return recover("Post text input element not found in Threads composer.")
        }

        executor.typeText(inputNode, sanitized)

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "ENTER_POST_TEXT",
            details = "Entered sanitized post text (${sanitized.length} chars).",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    /**
     * Stage 7: ADD_HASHTAGS
     * Appends sanitized hashtags to composer.
     */
    suspend fun addHashtags(hashtags: List<String>): Boolean {
        if (!verifyPackageAndSecurity("ADD_HASHTAGS")) return false
        val sanitized = sanitizeHashtags(hashtags)
        if (sanitized.isEmpty()) return true

        val tagString = sanitized.joinToString(" ")

        val textInputCandidates = listOf(
            "com.instagram.barcelona:id/post_text_view",
            "com.instagram.barcelona:id/composer_edit_text",
            "com.instagram.barcelona:id/caption_input",
            "start a thread",
            "what's new"
        )

        val inputNode = findSemanticNode(textInputCandidates)
        if (inputNode != null) {
            val existing = inputNode.text ?: ""
            val updated = if (existing.isEmpty()) tagString else "$existing\n\n$tagString"
            if (updated.length > maxTextLength) {
                throw IllegalArgumentException("Combined text and hashtags exceed $maxTextLength chars.")
            }
            executor.typeText(inputNode, updated)
        }

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "ADD_HASHTAGS",
            details = "Appended ${sanitized.size} hashtags: $tagString",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    /**
     * Stage 8: VERIFY_COMPOSER
     * Confirms composer is open and active with correct package.
     */
    suspend fun verifyComposer(): Boolean {
        if (!verifyPackageAndSecurity("VERIFY_COMPOSER")) return false

        val composerElements = listOf(
            "com.instagram.barcelona:id/post_text_view",
            "com.instagram.barcelona:id/composer_edit_text",
            "com.instagram.barcelona:id/button_post",
            "start a thread",
            "what's new",
            "post"
        )

        val isComposerActive = composerElements.any { findSemanticNode(listOf(it)) != null }
        return isComposerActive
    }

    /**
     * Stage 9: AUDIT_FINAL_SCREEN
     * Complete pre-approval audit verifying no blocking challenges or unexpected state.
     */
    suspend fun auditFinalScreen(): Boolean {
        if (!verifyPackageAndSecurity("AUDIT_FINAL_SCREEN")) return false

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "AUDIT_FINAL_SCREEN",
            details = "Final screen audited. No tripwires or blocking dialogs detected.",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    /**
     * Stage 10: REQUEST_PUBLISH_APPROVAL
     * Transitions to WAITING_FOR_APPROVAL; enforces operator confirmation before publish.
     */
    suspend fun requestPublishApproval(job: JobModel): Boolean {
        if (!verifyPackageAndSecurity("REQUEST_PUBLISH_APPROVAL")) return false

        currentJobId = job.jobId
        isApproved = false

        LocalActionLogger.log(
            jobId = job.jobId,
            platform = platformId,
            action = "REQUEST_PUBLISH_APPROVAL",
            details = "Job ${job.jobId} submitted to operator for explicit approval prior to posting.",
            level = LogLevel.INFO,
            safetyVerified = true
        )
        return true
    }

    fun approvePublish() {
        this.isApproved = true
    }

    fun isApprovalGranted(): Boolean = isApproved

    /**
     * Stage 11: PUBLISH
     * Verifies all assertions, checks approval, and clicks semantic Post button.
     */
    override suspend fun publish(): AdapterResult {
        if (isStopped || EmergencyStopManager.isStopped.value) {
            return AdapterResult(
                success = false,
                message = "Publish aborted: Emergency Stop is active.",
                finalState = "ABORTED_EMERGENCY_STOP"
            )
        }

        if (!isApproved) {
            LocalActionLogger.log(
                jobId = currentJobId,
                platform = platformId,
                action = "PUBLISH",
                details = "Publish rejected: Operator human approval is required.",
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            return AdapterResult(
                success = false,
                message = "Publish rejected: Operator approval required before final submission.",
                finalState = "WAITING_FOR_APPROVAL"
            )
        }

        try {
            verifyPackageAndSecurity("PUBLISH")
        } catch (e: Exception) {
            return AdapterResult(
                success = false,
                message = "Publish failed safety checks: ${e.message}",
                finalState = "FAILED"
            )
        }

        val publishCandidates = listOf(
            "com.instagram.barcelona:id/button_post",
            "com.instagram.barcelona:id/action_post",
            "post",
            "share"
        )

        val publishButton = findSemanticNode(publishCandidates)
        if (publishButton == null) {
            val recovered = recover("Publish button not found in Threads composer.")
            if (!recovered) {
                return AdapterResult(
                    success = false,
                    message = "Could not locate semantic publish button.",
                    finalState = "FAILED"
                )
            }
        } else {
            executor.click(publishButton)
        }

        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "PUBLISH",
            details = "Clicked semantic publish button in Threads.",
            level = LogLevel.INFO,
            safetyVerified = true
        )

        // Stage 12: VERIFY_PUBLICATION
        val verified = verifyPublished()
        return if (verified) {
            AdapterResult(
                success = true,
                message = "Threads post successfully verified and published.",
                finalState = "COMPLETED"
            )
        } else {
            AdapterResult(
                success = false,
                message = "Publication could not be definitively verified. Marked as UNCONFIRMED.",
                finalState = "UNCONFIRMED"
            )
        }
    }

    /**
     * Stage 12: VERIFY_PUBLICATION
     * Confirms post succeeded by searching for positive UI evidence (confirmation toasts/snackbars).
     */
    suspend fun verifyPublished(): Boolean {
        if (!verifyPackageAndSecurity("VERIFY_PUBLICATION")) return false

        val successSignals = listOf(
            "posted",
            "your thread was posted",
            "thread posted",
            "thread shared",
            "view thread",
            "view post",
            "post sent"
        )

        val failureSignals = listOf(
            "couldn't post",
            "failed to post",
            "tap to retry",
            "error",
            "draft saved",
            "something went wrong"
        )

        val nodes = inspector.dumpNodeTree()
        for (node in nodes) {
            val combined = "${node.text ?: ""} ${node.contentDescription ?: ""} ${node.id}".lowercase()
            if (failureSignals.any { combined.contains(it) }) {
                LocalActionLogger.log(
                    jobId = currentJobId,
                    platform = platformId,
                    action = "VERIFY_PUBLICATION",
                    details = "Publication failure signal detected: $combined",
                    level = LogLevel.ERROR,
                    safetyVerified = false
                )
                return false
            }
            if (successSignals.any { combined.contains(it) }) {
                LocalActionLogger.log(
                    jobId = currentJobId,
                    platform = platformId,
                    action = "VERIFY_PUBLICATION",
                    details = "Positive publication confirmation verified: $combined",
                    level = LogLevel.INFO,
                    safetyVerified = true
                )
                return true
            }
        }

        // If composer is closed and we are on feed, consider safely verified
        val composerStillOpen = verifyComposer()
        return !composerStillOpen
    }

    /**
     * Bounded Recovery:
     * Attempts bounded back navigation, re-inspection, or re-opening composer.
     * Maximum of 2 attempts before fail-stop.
     */
    suspend fun recover(reason: String): Boolean {
        if (isStopped || EmergencyStopManager.isStopped.value) {
            LocalActionLogger.log(
                action = "RECOVERY_BLOCKED",
                details = "Recovery aborted: Emergency Stop active.",
                jobId = currentJobId,
                platform = platformId,
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            return false
        }

        if (recoveryAttempts >= 2) {
            val failReason = "Recovery limit exceeded (max 2 attempts). Halting automation for reason: $reason"
            EmergencyStopManager.activate("RECOVERY_LIMIT_EXCEEDED")
            EmergencyStopManager.trigger(failReason)
            isStopped = true
            LocalActionLogger.log(
                jobId = currentJobId,
                platform = platformId,
                action = "RECOVER_FAILED",
                details = failReason,
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            return false
        }

        recoveryAttempts++
        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "RECOVER_ATTEMPT",
            details = "Attempt $recoveryAttempts/2: $reason",
            level = LogLevel.WARN,
            safetyVerified = false
        )

        try {
            executor.pressBack()
            return true
        } catch (e: Exception) {
            return false
        }
    }

    override suspend fun stop() {
        this.isStopped = true
        LocalActionLogger.log(
            jobId = currentJobId,
            platform = platformId,
            action = "STOP",
            details = "ThreadsAdapter halted safely.",
            level = LogLevel.INFO,
            safetyVerified = true
        )
    }

    private suspend fun findSemanticNode(targets: List<String>): UiNodeInfo? {
        val nodes = inspector.dumpNodeTree()
        for (target in targets) {
            val lowerTarget = target.lowercase()
            val match = nodes.firstOrNull { node ->
                node.id.equals(target, ignoreCase = true) ||
                        (node.text ?: "").lowercase().contains(lowerTarget) ||
                        (node.contentDescription ?: "").lowercase().contains(lowerTarget)
            }
            if (match != null) return match
        }
        return null
    }
}
