package com.phoneagent.core.orchestrator

import com.phoneagent.core.model.SupportedPlatform

object OrchestrationPolicy {
    const val MAX_STEP_RETRIES = 2
    const val CONSECUTIVE_FAILURES_EMERGENCY_STOP_THRESHOLD = 3

    val CANONICAL_PLATFORM_ORDER = listOf(
        SupportedPlatform.INSTAGRAM,
        SupportedPlatform.YOUTUBE,
        SupportedPlatform.FACEBOOK,
        SupportedPlatform.TIKTOK,
        SupportedPlatform.PINTEREST,
        SupportedPlatform.X,
        SupportedPlatform.THREADS,
        SupportedPlatform.LINKEDIN
    )

    val PROHIBITED_KEYWORDS = listOf(
        "password",
        "enter pin",
        "passcode",
        "otp",
        "one-time password",
        "2-step verification",
        "security code",
        "card number",
        "cvv",
        "billing address",
        "buy now",
        "place your order",
        "complete purchase",
        "add to cart",
        "proceed to checkout"
    )
}
