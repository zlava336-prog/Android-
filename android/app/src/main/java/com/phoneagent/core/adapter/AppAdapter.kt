package com.phoneagent.core.adapter

import com.phoneagent.core.model.JobModel

data class AdapterCapabilities(
    val supportsVideo: Boolean = true,
    val supportsImage: Boolean = true,
    val supportsTitle: Boolean = true,
    val supportsDescription: Boolean = true,
    val supportsHashtags: Boolean = true,
    val supportsCover: Boolean = false,
    val requiresApproval: Boolean = true
)

data class AdapterResult(
    val success: Boolean,
    val message: String,
    val data: Map<String, String> = emptyMap()
)

interface AppAdapter {
    val platformId: String
    val packageName: String
    val displayName: String
    val capabilities: AdapterCapabilities get() = AdapterCapabilities()

    suspend fun isInstalled(): Boolean
    suspend fun launch(): Boolean
    suspend fun detectReadyState(): Boolean
    suspend fun selectMedia(mediaUri: String): Boolean
    suspend fun enterCaption(caption: String): Boolean
    suspend fun enterHashtags(hashtags: List<String>): Boolean
    suspend fun selectCover(coverUri: String): Boolean
    suspend fun verifyPreview(): Boolean
    suspend fun requestPublishApproval(job: JobModel): Boolean
    suspend fun publish(): AdapterResult
    suspend fun verifyPublished(): Boolean
    suspend fun recover(lastError: String): Boolean
    suspend fun stop()
}
