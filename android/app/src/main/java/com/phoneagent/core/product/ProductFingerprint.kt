package com.phoneagent.core.product

import java.security.MessageDigest

/**
 * Phone Agent - Step 2K Product Cryptographic Fingerprinting (Android)
 */
object ProductFingerprint {

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }
    }

    fun computeProductFingerprint(product: ProductData): String {
        val sortedFeatures = product.keyFeatures.map { it.trim() }.filter { it.isNotEmpty() }.sorted().joinToString(";")
        val sortedBenefits = product.benefits.map { it.trim() }.filter { it.isNotEmpty() }.sorted().joinToString(";")
        val sortedSpecs = product.specifications.toSortedMap().entries.joinToString(";") { "${it.key}:${it.value.trim()}" }

        val canonical = listOf(
            product.productId?.trim().orEmpty(),
            product.source.trim().uppercase(),
            product.sourceUrl?.trim().orEmpty(),
            product.title.trim(),
            product.brand?.trim().orEmpty(),
            product.category?.trim().orEmpty(),
            product.price?.let { "%.2f".format(it) }.orEmpty(),
            product.currency.trim().uppercase(),
            product.priceQualifier?.trim().orEmpty(),
            product.availability?.trim().orEmpty(),
            product.rating?.let { "%.2f".format(it) }.orEmpty(),
            product.reviewCount?.toString().orEmpty(),
            product.description?.trim().orEmpty(),
            sortedFeatures,
            sortedBenefits,
            sortedSpecs,
            product.affiliateLink?.trim().orEmpty()
        ).joinToString("|")

        return "pfp_${sha256(canonical)}"
    }

    fun computeProductUrlFingerprint(url: String): String {
        if (url.isBlank()) return ""
        return "urlfp_${sha256(url.trim())}"
    }

    data class UrlValidationResult(val valid: Boolean, val reason: String? = null, val asin: String? = null)

    fun validateAmazonProductUrl(url: String): UrlValidationResult {
        val trimmed = url.trim()
        if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
            return UrlValidationResult(false, "Unsupported URL scheme. Must use HTTPS.")
        }

        val allowedHosts = listOf(
            "amazon.com", "www.amazon.com", "amazon.in", "www.amazon.in",
            "amazon.co.uk", "www.amazon.co.uk", "amazon.de", "www.amazon.de",
            "amzn.to", "www.amzn.to", "amzn.in", "www.amzn.in"
        )

        val host = try {
            java.net.URI(trimmed).host?.lowercase() ?: return UrlValidationResult(false, "Invalid host syntax")
        } catch (e: Exception) {
            return UrlValidationResult(false, "Malformed URL")
        }

        val isAllowed = allowedHosts.any { host == it || host.endsWith(".$it") }
        if (!isAllowed) {
            return UrlValidationResult(false, "Host '$host' is not an allowed Amazon domain.")
        }

        val dpRegex = Regex("""/(?:dp|gp/product)/([A-Z0-9]{10})""", RegexOption.IGNORE_CASE)
        val match = dpRegex.find(trimmed)
        val asin = match?.groupValues?.get(1)?.uppercase()

        return UrlValidationResult(true, asin = asin)
    }
}
