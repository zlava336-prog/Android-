package com.phoneagent.core.video

import kotlinx.serialization.Serializable

@Serializable
enum class VideoTransitionType {
    NONE, FADE, DISSOLVE, SLIDE_LEFT, SLIDE_RIGHT, WIPE, ZOOM
}

@Serializable
data class VideoTransition(
    val type: VideoTransitionType = VideoTransitionType.NONE,
    val durationMs: Long = 0L
)

@Serializable
data class VideoAsset(
    val assetId: String,
    val localUri: String,
    val mimeType: String,
    val mediaType: String, // "IMAGE" or "VIDEO"
    val sizeBytes: Long,
    val width: Int,
    val height: Int,
    val durationMs: Long? = null,
    val sha256: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class AudioAsset(
    val audioId: String,
    val localUri: String,
    val mimeType: String,
    val durationMs: Long,
    val sizeBytes: Long,
    val sha256: String,
    val type: String, // "VOICEOVER", "BACKGROUND_MUSIC", "SOUND_EFFECT"
    val volume: Float = 1.0f,
    val startTimeMs: Long = 0L,
    val endTimeMs: Long,
    val fadeInMs: Long? = null,
    val fadeOutMs: Long? = null,
    val isMuted: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class AudioTrackConfig(
    val voiceover: AudioAsset? = null,
    val backgroundMusic: AudioAsset? = null,
    val soundEffects: List<AudioAsset> = emptyList(),
    val masterVolume: Float = 1.0f,
    val isMasterMuted: Boolean = false
)

@Serializable
enum class TextOverlayType {
    HEADLINE, HOOK, PRODUCT_FEATURE, CTA, PRICE, PROMOTION, BADGE, DISCLAIMER, CUSTOM
}

@Serializable
enum class TextOverlayPosition {
    TOP, CENTER, BOTTOM, LOWER_THIRD, UPPER_THIRD, CUSTOM
}

@Serializable
data class TextOverlay(
    val overlayId: String,
    val type: TextOverlayType,
    val text: String,
    val startTimeMs: Long,
    val endTimeMs: Long,
    val position: TextOverlayPosition = TextOverlayPosition.LOWER_THIRD,
    val isFactualClaim: Boolean = false
)

@Serializable
data class SubtitleSegment(
    val id: String,
    val sequenceIndex: Int,
    val text: String,
    val startTimeMs: Long,
    val endTimeMs: Long
)

@Serializable
data class SubtitleTrack(
    val trackId: String,
    val language: String = "en",
    val segments: List<SubtitleSegment> = emptyList()
)

@Serializable
enum class SceneRole {
    HOOK, PROBLEM, PRODUCT, KEY_BENEFITS, DEMONSTRATION, CTA, CUSTOM
}

@Serializable
enum class SceneCropMode {
    COVER, CONTAIN, FIT
}

@Serializable
enum class SceneScaleMode {
    ORIGINAL, FILL_16_9, FILL_9_16, FILL_1_1
}

@Serializable
data class VideoClip(
    val clipId: String,
    val asset: VideoAsset,
    val sourceStartMs: Long? = null,
    val sourceEndMs: Long? = null,
    val playbackSpeed: Float = 1.0f,
    val volume: Float = 1.0f,
    val isMuted: Boolean = false
)

@Serializable
data class VideoScene(
    val sceneId: String,
    val sceneIndex: Int,
    val role: SceneRole = SceneRole.CUSTOM,
    val mediaAsset: VideoAsset,
    val startTimeMs: Long,
    val endTimeMs: Long,
    val durationMs: Long,
    val cropMode: SceneCropMode = SceneCropMode.COVER,
    val scaleMode: SceneScaleMode = SceneScaleMode.ORIGINAL,
    val transition: VideoTransition = VideoTransition(),
    val textOverlays: List<TextOverlay> = emptyList(),
    val subtitleSegments: List<SubtitleSegment> = emptyList(),
    val clip: VideoClip? = null
)

@Serializable
data class VideoTimeline(
    val totalDurationMs: Long,
    val sceneCount: Int,
    val scenes: List<VideoScene>
)

@Serializable
enum class VideoFormatType {
    VERTICAL_SHORT, SQUARE, LANDSCAPE, CUSTOM
}

@Serializable
data class VideoOutputSpec(
    val format: VideoFormatType,
    val width: Int,
    val height: Int,
    val aspectRatio: String,
    val fps: Int = 30,
    val maxDurationMs: Long = 60000L,
    val container: String = "mp4",
    val videoBitrateKbps: Int = 8000,
    val audioBitrateKbps: Int = 192
)

@Serializable
enum class VideoReviewStatus {
    DRAFT, VALIDATING, NEEDS_REVIEW, READY_FOR_REVIEW, APPROVED, STALE_APPROVAL, REJECTED
}

@Serializable
data class VideoApprovalRecord(
    val approvalId: String,
    val projectId: String,
    val reviewerId: String,
    val approvedAt: Long,
    val projectFingerprint: String,
    val renderedMediaFingerprint: String,
    val contentFingerprint: String,
    val productFingerprint: String,
    val notes: String? = null
)

@Serializable
data class VideoProject(
    val projectId: String,
    val title: String,
    val contentPackageId: String? = null,
    val productFingerprint: String,
    val mediaFingerprint: String,
    val contentFingerprint: String,
    val scenes: List<VideoScene>,
    val timeline: VideoTimeline,
    val audioTrack: AudioTrackConfig? = null,
    val overlays: List<TextOverlay> = emptyList(),
    val subtitles: SubtitleTrack? = null,
    val outputSpec: VideoOutputSpec,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val projectFingerprint: String, // "vpf_<sha256>"
    val reviewStatus: VideoReviewStatus = VideoReviewStatus.DRAFT,
    val approvalRecord: VideoApprovalRecord? = null
)

@Serializable
enum class VideoRenderStatus {
    QUEUED, VALIDATING, RENDERING, RENDERED, VALIDATING_OUTPUT, READY_FOR_REVIEW, APPROVED, FAILED, CANCELLED, UNKNOWN
}

@Serializable
data class VideoRenderResult(
    val success: Boolean,
    val outputUri: String,
    val outputFingerprint: String,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val sizeBytes: Long,
    val mimeType: String,
    val isSimulation: Boolean,
    val renderedAt: Long,
    val error: String? = null
)

@Serializable
data class VideoValidationResult(
    val valid: Boolean,
    val errors: List<String> = emptyList(),
    val warnings: List<String> = emptyList(),
    val checkedAt: Long = System.currentTimeMillis()
)

@Serializable
data class VideoRenderJob(
    val jobId: String,
    val projectId: String,
    val projectFingerprint: String,
    val renderFingerprint: String,
    var status: VideoRenderStatus = VideoRenderStatus.QUEUED,
    val outputSpec: VideoOutputSpec,
    var progress: Int = 0,
    var recoveryAttempts: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    var startedAt: Long? = null,
    var completedAt: Long? = null,
    var outputResult: VideoRenderResult? = null,
    var validationResult: VideoValidationResult? = null,
    var error: String? = null,
    var cancellationReason: String? = null
)

@Serializable
data class ApprovedVideoArtifact(
    val artifactId: String,
    val projectId: String,
    val artifactUri: String,
    val outputFingerprint: String,
    val contentFingerprint: String,
    val productFingerprint: String,
    val projectFingerprint: String,
    val approvedPlatformTargets: List<String>,
    val approvedBy: String,
    val approvedAt: Long,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val notes: String? = null
)
