package com.phoneagent.core.planner

import com.phoneagent.core.adapter.AdapterCapabilities
import com.phoneagent.core.adapter.AppAdapter
import com.phoneagent.core.model.Platform
import com.phoneagent.core.registry.AdapterRegistry
import java.security.MessageDigest

enum class PlatformStepStatus {
    PENDING,
    VALIDATING,
    READY,
    WAITING_FOR_APPROVAL,
    RUNNING,
    PUBLISHED,
    FAILED,
    CANCELLED,
    UNKNOWN
}

enum class ApprovalLevel {
    JOB_APPROVAL,
    PLATFORM_APPROVAL
}

data class NormalizedContentPayload(
    val text: String? = null,
    val title: String? = null,
    val description: String? = null,
    val hashtags: List<String> = emptyList(),
    val mediaUri: String? = null,
    val imageUri: String? = null,
    val videoUri: String? = null,
    val coverUri: String? = null,
    val metadata: Map<String, String> = emptyMap()
)

data class PlatformExecutionStep(
    val platform: String,
    val adapterId: String,
    val action: String,
    val payload: NormalizedContentPayload,
    val requiresApproval: Boolean,
    var status: PlatformStepStatus = PlatformStepStatus.PENDING,
    val fingerprint: String,
    var error: String? = null,
    var publishedAt: Long? = null,
    var message: String? = null
)

data class MultiPlatformExecutionPlan(
    val jobId: String,
    val fingerprint: String,
    val steps: List<PlatformExecutionStep>,
    val approvalLevel: ApprovalLevel,
    val createdTimestamp: Long = System.currentTimeMillis()
)

data class PlannerError(
    val platform: String? = null,
    val field: String? = null,
    val code: String,
    val message: String
)

class PlannerValidationException(
    val errors: List<PlannerError>
) : IllegalStateException("Multi-platform planning validation failed: ${errors.joinToString("; ") { "[${it.platform ?: "General"}] ${it.message}" }}")

object ContentFingerprinter {
    fun computeFingerprint(payload: NormalizedContentPayload): String {
        val safeText = (payload.text ?: "").trim()
        val safeTitle = (payload.title ?: "").trim()
        val safeDesc = (payload.description ?: "").trim()
        val safeMedia = (payload.mediaUri ?: payload.videoUri ?: payload.imageUri ?: "").trim()
        val safeCover = (payload.coverUri ?: "").trim()
        val sortedTags = payload.hashtags.map { if (it.startsWith("#")) it else "#$it" }.sorted().joinToString(",")

        val raw = "text=$safeText|title=$safeTitle|desc=$safeDesc|media=$safeMedia|cover=$safeCover|tags=$sortedTags"
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(raw.toByteArray(Charsets.UTF_8))
        return "fp_" + digest.take(8).joinToString("") { "%02x".format(it) }
    }
}

class MultiPlatformPlanner(
    private val registry: AdapterRegistry = AdapterRegistry.getInstance()
) {
    companion object {
        val DETERMINISTIC_ORDER = listOf(
            "instagram",
            "youtube",
            "facebook",
            "tiktok",
            "pinterest",
            "x",
            "threads",
            "linkedin"
        )
    }

    fun validatePlan(
        payload: NormalizedContentPayload,
        platforms: List<String>
    ): List<PlannerError> {
        val errors = mutableListOf<PlannerError>()

        if (platforms.isEmpty()) {
            errors.add(PlannerError(code = "EMPTY_PLATFORMS", message = "At least one platform must be selected."))
            return errors
        }

        val uniquePlatforms = platforms.map { it.lowercase().trim() }.distinct()

        for (platformId in uniquePlatforms) {
            // Amazon Special Rule: Amazon is NOT a publishing destination
            if (platformId == "amazon") {
                errors.add(
                    PlannerError(
                        platform = "amazon",
                        code = "AMAZON_NOT_PUBLISHING_DESTINATION",
                        message = "Amazon is NOT a publishing destination. Amazon is restricted to product link extraction only. Explicitly rejected: Amazon -> publish/upload/post/checkout/purchase."
                    )
                )
                continue
            }

            val adapter = registry.find(platformId)
            if (adapter == null) {
                errors.add(
                    PlannerError(
                        platform = platformId,
                        code = "UNKNOWN_ADAPTER",
                        message = "Unknown adapter: $platformId"
                    )
                )
                continue
            }

            val caps = adapter.capabilities

            // Video capability
            val hasVideo = !payload.videoUri.isNullOrBlank() || (payload.mediaUri?.contains("video") == true)
            if (hasVideo && !caps.supportsVideo) {
                errors.add(
                    PlannerError(
                        platform = platformId,
                        field = "videoUri",
                        code = "UNSUPPORTED_VIDEO",
                        message = "${adapter.displayName} does not support video publishing."
                    )
                )
            }

            // Image capability
            val hasImage = !payload.imageUri.isNullOrBlank() || (payload.mediaUri?.contains("image") == true)
            if (hasImage && !hasVideo && !caps.supportsImage) {
                errors.add(
                    PlannerError(
                        platform = platformId,
                        field = "imageUri",
                        code = "UNSUPPORTED_IMAGE",
                        message = "${adapter.displayName} does not support image publishing."
                    )
                )
            }

            // Title capability
            val hasTitle = !payload.title.isNullOrBlank()
            if (hasTitle && !caps.supportsTitle) {
                errors.add(
                    PlannerError(
                        platform = platformId,
                        field = "title",
                        code = "UNSUPPORTED_TITLE",
                        message = "${adapter.displayName} does not support title field."
                    )
                )
            }

            // Description capability
            val hasDescription = !payload.description.isNullOrBlank()
            if (hasDescription && !caps.supportsDescription) {
                errors.add(
                    PlannerError(
                        platform = platformId,
                        field = "description",
                        code = "UNSUPPORTED_DESCRIPTION",
                        message = "${adapter.displayName} does not support description field."
                    )
                )
            }

            // Hashtags capability
            val hasHashtags = payload.hashtags.isNotEmpty()
            if (hasHashtags && !caps.supportsHashtags) {
                errors.add(
                    PlannerError(
                        platform = platformId,
                        field = "hashtags",
                        code = "UNSUPPORTED_HASHTAGS",
                        message = "${adapter.displayName} does not support hashtags."
                    )
                )
            }

            // Cover capability
            val hasCover = !payload.coverUri.isNullOrBlank()
            if (hasCover && !caps.supportsCover) {
                errors.add(
                    PlannerError(
                        platform = platformId,
                        field = "coverUri",
                        code = "UNSUPPORTED_COVER",
                        message = "${adapter.displayName} does not support cover image selection."
                    )
                )
            }
        }

        return errors
    }

    fun plan(
        jobId: String,
        payload: NormalizedContentPayload,
        platforms: List<String>,
        approvalLevel: ApprovalLevel = ApprovalLevel.PLATFORM_APPROVAL
    ): MultiPlatformExecutionPlan {
        val errors = validatePlan(payload, platforms)
        if (errors.isNotEmpty()) {
            throw PlannerValidationException(errors)
        }

        val fingerprint = ContentFingerprinter.computeFingerprint(payload)
        val uniquePlatforms = platforms.map { it.lowercase().trim() }.distinct()

        val sortedPlatforms = uniquePlatforms.sortedWith { a, b ->
            val idxA = DETERMINISTIC_ORDER.indexOf(a)
            val idxB = DETERMINISTIC_ORDER.indexOf(b)
            when {
                idxA != -1 && idxB != -1 -> idxA.compareTo(idxB)
                idxA != -1 -> -1
                idxB != -1 -> 1
                else -> a.compareTo(b)
            }
        }

        val steps = sortedPlatforms.map { platformId ->
            val adapter = registry.get(platformId)
            val caps = adapter.capabilities

            val action = when (platformId) {
                "instagram" -> if (!payload.videoUri.isNullOrBlank()) "publish_reel" else "publish_post"
                "youtube" -> "publish_short"
                "tiktok" -> "publish_video"
                "pinterest" -> "publish_pin"
                "threads" -> "publish_thread"
                else -> "publish_post"
            }

            val stepPayload = NormalizedContentPayload(
                text = payload.text ?: payload.description,
                title = if (caps.supportsTitle) payload.title else null,
                description = if (caps.supportsDescription) payload.description else null,
                hashtags = if (caps.supportsHashtags) payload.hashtags else emptyList(),
                mediaUri = payload.mediaUri,
                imageUri = payload.imageUri,
                videoUri = payload.videoUri,
                coverUri = if (caps.supportsCover) payload.coverUri else null,
                metadata = payload.metadata
            )

            PlatformExecutionStep(
                platform = platformId,
                adapterId = adapter.platformId,
                action = action,
                payload = stepPayload,
                requiresApproval = caps.requiresApproval,
                status = PlatformStepStatus.PENDING,
                fingerprint = fingerprint
            )
        }

        return MultiPlatformExecutionPlan(
            jobId = jobId,
            fingerprint = fingerprint,
            steps = steps,
            approvalLevel = approvalLevel
        )
    }
}
