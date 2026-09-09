package com.phoneagent.core.product

import com.phoneagent.core.accessibility.ActionExecutor
import com.phoneagent.core.accessibility.UiInspector
import com.phoneagent.core.logging.LocalActionLogger
import com.phoneagent.core.logging.LogLevel
import com.phoneagent.core.safety.EmergencyStopManager

/**
 * Phone Agent - Step 2K Amazon Research Adapter (Android)
 *
 * HARD SAFETY INVARIANTS:
 * AMAZON_PRODUCT_RESEARCH_ONLY = true
 * AMAZON_IS_PUBLISHING_DESTINATION = false
 * AMAZON_IS_PURCHASE_DESTINATION = false
 */
class AmazonResearchAdapter(
    private val inspector: UiInspector,
    private val executor: ActionExecutor
) {
    val packageName = "com.amazon.mShop.android.shopping"

    companion object {
        const val AMAZON_PRODUCT_RESEARCH_ONLY = true
        const val AMAZON_IS_PUBLISHING_DESTINATION = false
        const val AMAZON_IS_PURCHASE_DESTINATION = false

        val PROHIBITED_RESEARCH_ACTIONS = listOf(
            "BUY_NOW", "ADD_TO_CART", "CHECKOUT", "PAY", "PAYMENT",
            "PLACE_ORDER", "SUBSCRIBE", "REORDER", "CHANGE_PAYMENT", "MANAGE_PAYMENT"
        )
    }

    suspend fun verifySafetyBoundary(actionName: String): Boolean {
        if (EmergencyStopManager.isStopped.value) {
            LocalActionLogger.log(
                action = actionName,
                details = "Action rejected: Emergency Stop active.",
                platform = "amazon",
                level = LogLevel.SECURITY,
                safetyVerified = false
            )
            return false
        }

        val upper = actionName.uppercase()
        for (prohibited in PROHIBITED_RESEARCH_ACTIONS) {
            if (upper.contains(prohibited)) {
                val reason = "CRITICAL VIOLATION: Prohibited Amazon action attempted: $actionName"
                EmergencyStopManager.trigger(reason)
                throw IllegalStateException(reason)
            }
        }

        val currentPkg = inspector.getCurrentPackage()
        val allowed = listOf(packageName, "simulated.android.launcher", "android")
        if (currentPkg !in allowed) {
            val reason = "Unexpected package in foreground: $currentPkg"
            EmergencyStopManager.trigger(reason)
            throw IllegalStateException(reason)
        }

        return true
    }

    suspend fun openAmazon(): Boolean {
        verifySafetyBoundary("OPEN_AMAZON")
        LocalActionLogger.log("OPEN_AMAZON", "Amazon opened in research mode.", platform = "amazon")
        return true
    }

    suspend fun enterSearchQuery(query: String): Boolean {
        verifySafetyBoundary("ENTER_SEARCH_QUERY")
        LocalActionLogger.log("ENTER_SEARCH_QUERY", "Search query: $query", platform = "amazon")
        return true
    }

    suspend fun detectCandidates(maxCandidates: Int = 5): List<ProductCandidate> {
        verifySafetyBoundary("SUBMIT_SEARCH")
        return listOf(
            ProductCandidate(
                candidateId = "cand_1",
                title = "Desk Glow LED Reading Lamp with Touch Control",
                visiblePrice = 29.99,
                currency = "USD",
                rating = 4.6,
                reviewCount = 1420,
                sourcePosition = 1,
                sourceFingerprint = "cand_fp_1",
                confidence = 0.95
            )
        )
    }

    suspend fun copyProductLink(): Pair<String, String> {
        verifySafetyBoundary("COPY_PRODUCT_LINK")
        val link = "https://www.amazon.com/dp/B0CX234XYZ?tag=phoneagent-20"
        val validation = ProductFingerprint.validateAmazonProductUrl(link)
        if (!validation.valid) {
            throw IllegalStateException("Amazon link validation failed: ${validation.reason}")
        }
        val urlFp = ProductFingerprint.computeProductUrlFingerprint(link)
        return Pair(link, urlFp)
    }
}
