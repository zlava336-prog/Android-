package com.phoneagent.core.orchestrator

import com.phoneagent.core.model.SupportedPlatform

data class OrchestrationPlan(
    val planId: String,
    val searchQuery: String,
    val asin: String? = null,
    val targetPlatforms: List<SupportedPlatform>,
    val operatorId: String,
    val enableVoiceover: Boolean = true,
    val enableCaptions: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)
