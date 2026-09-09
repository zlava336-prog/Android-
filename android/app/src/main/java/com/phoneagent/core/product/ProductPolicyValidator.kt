package com.phoneagent.core.product

enum class PolicyVerdict {
    PASS,
    WARN,
    BLOCK
}

data class PolicyWarning(
    val category: String,
    val flaggedText: String,
    val reason: String,
    val severity: String
)

data class ProductPolicyResult(
    val verdict: PolicyVerdict,
    val blockedCount: Int,
    val warnCount: Int,
    val warnings: List<PolicyWarning>,
    val policyFingerprint: String
)

/**
 * Phone Agent - Step 2K Product Policy Validator (Android)
 */
class ProductPolicyValidator {

    fun evaluateProduct(product: ProductData): ProductPolicyResult {
        val warnings = mutableListOf<PolicyWarning>()
        val texts = listOfNotNull(
            product.title,
            product.description,
            product.keyFeatures.joinToString(" "),
            product.benefits.joinToString(" ")
        )

        val blockRegexes = listOf(
            Regex("""\b(?:cures?|heals?|treats?)\s+(?:cancer|diabetes|infection|depression)\b""", RegexOption.IGNORE_CASE) to "Unsubstantiated medical cure claim",
            Regex("""\b(?:guaranteed\s+(?:income|wealth|earnings)|get\s+rich\s+quick)\b""", RegexOption.IGNORE_CASE) to "Deceptive income guarantee",
            Regex("""\b(?:100%\s+cure|miracle\s+cure)\b""", RegexOption.IGNORE_CASE) to "Prohibited medical miracle claim",
            Regex("""\b(?:guaranteed\s+weight\s+loss|lose\s+\d+\s*(?:lbs|kg))\b""", RegexOption.IGNORE_CASE) to "Unsubstantiated weight loss guarantee"
        )

        val warnRegexes = listOf(
            Regex("""\b(?:risk-?free|100%\s+guaranteed)\b""", RegexOption.IGNORE_CASE) to "Absolute satisfaction guarantee",
            Regex("""\b(?:#1|best)\s+in\s+(?:india|the\s+world)\b""", RegexOption.IGNORE_CASE) to "Unverified superlative market ranking"
        )

        for (text in texts) {
            for ((regex, reason) in blockRegexes) {
                if (regex.containsMatchIn(text)) {
                    warnings.add(PolicyWarning("PROHIBITED_CLAIM", text.take(30), reason, "BLOCK"))
                }
            }
            for ((regex, reason) in warnRegexes) {
                if (regex.containsMatchIn(text)) {
                    warnings.add(PolicyWarning("SUPERLATIVE_CLAIM", text.take(30), reason, "WARN"))
                }
            }
        }

        val blockedCount = warnings.count { it.severity == "BLOCK" }
        val warnCount = warnings.count { it.severity == "WARN" }

        val verdict = when {
            blockedCount > 0 -> PolicyVerdict.BLOCK
            warnCount > 0 -> PolicyVerdict.WARN
            else -> PolicyVerdict.PASS
        }

        return ProductPolicyResult(
            verdict = verdict,
            blockedCount = blockedCount,
            warnCount = warnCount,
            warnings = warnings,
            policyFingerprint = "pol_${verdict}_$blockedCount"
        )
    }

    companion object {
        val instance = ProductPolicyValidator()
    }
}
