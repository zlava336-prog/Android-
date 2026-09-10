package com.phoneagent.core.video

import com.phoneagent.core.safety.EmergencyStopManager
import java.security.MessageDigest

object VideoFingerprintHelper {
    fun sha256(input: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun computeProjectFingerprint(
        productFp: String,
        mediaFp: String,
        contentFp: String,
        scenesCount: Int,
        format: String
    ): String {
        return "vpf_" + sha256("$productFp:$mediaFp:$contentFp:$scenesCount:$format")
    }

    fun computeRenderFingerprint(projectFp: String, format: String, engineId: String): String {
        return "rpf_" + sha256("$projectFp:$format:$engineId")
    }

    fun computeOutputFingerprint(outputUri: String, sizeBytes: Long, durationMs: Long): String {
        return "opf_" + sha256("$outputUri:$sizeBytes:$durationMs")
    }
}

interface VideoRenderEngine {
    val engineId: String
    suspend fun isAvailable(): Boolean
    suspend fun render(project: VideoProject, job: VideoRenderJob): VideoRenderResult
}

class LocalDeterministicAndroidRenderEngine : VideoRenderEngine {
    override val engineId: String = "local-deterministic-android-engine"

    override suspend fun isAvailable(): Boolean = true

    override suspend fun render(project: VideoProject, job: VideoRenderJob): VideoRenderResult {
        if (EmergencyStopManager.isStopped.value) {
            throw IllegalStateException("Render halted: Emergency Stop is active (${EmergencyStopManager.getReason()}).")
        }

        val duration = project.timeline.totalDurationMs
        val uri = "file:///storage/emulated/0/PhoneAgent/renders/${job.jobId}.${project.outputSpec.container}"
        val sizeBytes = duration * 1000L
        val opf = VideoFingerprintHelper.computeOutputFingerprint(uri, sizeBytes, duration)

        return VideoRenderResult(
            success = true,
            outputUri = uri,
            outputFingerprint = opf,
            durationMs = duration,
            width = project.outputSpec.width,
            height = project.outputSpec.height,
            sizeBytes = sizeBytes,
            mimeType = "video/mp4",
            isSimulation = true,
            renderedAt = System.currentTimeMillis()
        )
    }
}
