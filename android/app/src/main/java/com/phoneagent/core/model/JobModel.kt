package com.phoneagent.core.model

import kotlinx.serialization.Serializable

/**
 * Job States representing the exact automation lifecycle.
 */
enum class JobState {
    RECEIVED,
    VALIDATING,
    OPENING_APP,
    WAITING_FOR_READY,
    SELECTING_MEDIA,
    ENTERING_METADATA,
    VERIFYING_PREVIEW,
    WAITING_FOR_APPROVAL,
    PUBLISHING,
    VERIFYING_RESULT,
    COMPLETED,
    FAILED,
    STOPPED
}

enum class Platform(val id: String, val packageName: String) {
    INSTAGRAM("instagram", "com.instagram.android"),
    FACEBOOK("facebook", "com.facebook.katana"),
    YOUTUBE("youtube", "com.google.android.youtube"),
    TIKTOK("tiktok", "com.zhiliaoapp.musically"),
    PINTEREST("pinterest", "com.pinterest"),
    X("x", "com.twitter.android"),
    THREADS("threads", "com.instagram.barcelona"),
    LINKEDIN("linkedin", "com.linkedin.android"),
    AMAZON("amazon", "com.amazon.mShop.android.shopping")
}

@Serializable
data class JobModel(
    val jobId: String,
    val platform: String,
    val action: String,
    val videoUri: String? = null,
    val imageUri: String? = null,
    val caption: String? = null,
    val title: String? = null,
    val description: String? = null,
    val board: String? = null,
    val hashtags: List<String> = emptyList(),
    val coverUri: String? = null,
    val productSearchQuery: String? = null,
    val requiresApproval: Boolean = true,
    val timestamp: Long = System.currentTimeMillis()
)
