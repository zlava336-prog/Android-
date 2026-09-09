package com.phoneagent.core.product

/**
 * Phone Agent - Step 2K Product Scorer (Android)
 * Deterministic quality scoring; advisory only; never auto-approves or auto-publishes.
 */
object ProductScorer {

    data class ScoreResult(
        val finalScore: Int,
        val recommendation: String
    )

    fun calculateScore(product: ProductData, policy: ProductPolicyResult?): ScoreResult {
        var score = 0

        if (!product.sourceUrl.isNullOrBlank()) score += 15
        if (product.title.length >= 10) score += 15
        if (product.price != null && product.price > 0) score += 15
        if (product.description?.isNotBlank() == true) score += 15
        if (product.keyFeatures.isNotEmpty()) score += 15
        if (product.specifications.isNotEmpty()) score += 10
        if (product.rating != null) score += 15

        if (policy?.verdict == PolicyVerdict.BLOCK) {
            score -= 50
        } else if (policy?.verdict == PolicyVerdict.WARN) {
            score -= 10
        }

        val finalScore = score.coerceIn(0, 100)
        val rec = when {
            policy?.verdict == PolicyVerdict.BLOCK -> "HIGH_RISK_BLOCKED"
            finalScore >= 70 -> "EXCELLENT"
            finalScore >= 45 -> "GOOD"
            else -> "NEEDS_COMPLETION"
        }

        return ScoreResult(finalScore, rec)
    }
}
