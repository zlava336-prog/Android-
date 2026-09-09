package com.phoneagent

import com.phoneagent.core.adapter.AdapterCapabilities
import com.phoneagent.core.adapter.AdapterResult
import com.phoneagent.core.adapter.AppAdapter
import com.phoneagent.core.model.JobModel
import com.phoneagent.core.planner.ApprovalLevel
import com.phoneagent.core.planner.ContentFingerprinter
import com.phoneagent.core.planner.MultiPlatformPlanner
import com.phoneagent.core.planner.NormalizedContentPayload
import com.phoneagent.core.planner.PlannerValidationException
import com.phoneagent.core.registry.AdapterRegistry
import com.phoneagent.core.registry.DuplicateAdapterException
import com.phoneagent.core.registry.UnknownAdapterException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

private class TestMockAdapter(
    override val platformId: String,
    override val packageName: String,
    override val displayName: String,
    override val capabilities: AdapterCapabilities
) : AppAdapter {
    override suspend fun isInstalled(): Boolean = true
    override suspend fun launch(): Boolean = true
    override suspend fun detectReadyState(): Boolean = true
    override suspend fun selectMedia(mediaUri: String): Boolean = true
    override suspend fun enterCaption(caption: String): Boolean = true
    override suspend fun enterHashtags(hashtags: List<String>): Boolean = true
    override suspend fun selectCover(coverUri: String): Boolean = true
    override suspend fun verifyPreview(): Boolean = true
    override suspend fun requestPublishApproval(job: JobModel): Boolean = true
    override suspend fun publish(): AdapterResult = AdapterResult(true, "Published")
    override suspend fun verifyPublished(): Boolean = true
    override suspend fun recover(lastError: String): Boolean = true
    override suspend fun stop() {}
}

class AdapterRegistryAndPlannerTest {

    private lateinit var registry: AdapterRegistry
    private lateinit var planner: MultiPlatformPlanner

    @Before
    fun setUp() {
        registry = AdapterRegistry()
        planner = MultiPlatformPlanner(registry)

        // Register standard mock adapters with realistic capabilities
        registry.register(
            TestMockAdapter(
                platformId = "instagram",
                packageName = "com.instagram.android",
                displayName = "Instagram",
                capabilities = AdapterCapabilities(
                    supportsVideo = true,
                    supportsImage = true,
                    supportsTitle = false,
                    supportsDescription = true,
                    supportsHashtags = true,
                    supportsCover = true,
                    requiresApproval = true
                )
            )
        )

        registry.register(
            TestMockAdapter(
                platformId = "youtube",
                packageName = "com.google.android.youtube",
                displayName = "YouTube",
                capabilities = AdapterCapabilities(
                    supportsVideo = true,
                    supportsImage = false,
                    supportsTitle = true,
                    supportsDescription = true,
                    supportsHashtags = true,
                    supportsCover = false,
                    requiresApproval = true
                )
            )
        )

        registry.register(
            TestMockAdapter(
                platformId = "facebook",
                packageName = "com.facebook.katana",
                displayName = "Facebook",
                capabilities = AdapterCapabilities(
                    supportsVideo = true,
                    supportsImage = true,
                    supportsTitle = false,
                    supportsDescription = true,
                    supportsHashtags = true,
                    supportsCover = false,
                    requiresApproval = true
                )
            )
        )

        registry.register(
            TestMockAdapter(
                platformId = "amazon",
                packageName = "com.amazon.mShop.android.shopping",
                displayName = "Amazon",
                capabilities = AdapterCapabilities(
                    supportsVideo = false,
                    supportsImage = false,
                    supportsTitle = false,
                    supportsDescription = false,
                    supportsHashtags = false,
                    supportsCover = false,
                    requiresApproval = true
                )
            )
        )
    }

    @Test
    fun testRegistryRegistrationAndRetrieval() {
        assertTrue(registry.has("instagram"))
        assertTrue(registry.has("youtube"))
        assertEquals("Instagram", registry.get("instagram").displayName)
        assertEquals(4, registry.size())
    }

    @Test
    fun testRegistryRejectsDuplicateRegistration() {
        try {
            registry.register(
                TestMockAdapter(
                    platformId = "instagram",
                    packageName = "com.instagram.android",
                    displayName = "Instagram Duplicate",
                    capabilities = AdapterCapabilities()
                )
            )
            fail("Expected DuplicateAdapterException")
        } catch (e: DuplicateAdapterException) {
            assertEquals("instagram", e.adapterId)
        }
    }

    @Test
    fun testRegistryThrowsOnUnknownAdapter() {
        try {
            registry.get("nonexistent_app")
            fail("Expected UnknownAdapterException")
        } catch (e: UnknownAdapterException) {
            assertEquals("nonexistent_app", e.adapterId)
        }
    }

    @Test
    fun testRegistryUnregister() {
        assertTrue(registry.has("facebook"))
        assertTrue(registry.unregister("facebook"))
        assertFalse(registry.has("facebook"))
        assertFalse(registry.unregister("facebook"))
    }

    @Test
    fun testRegistryCapabilityMatrix() {
        val matrix = registry.getCapabilityMatrix()
        assertEquals(4, matrix.size)
        val igEntry = matrix.find { it.adapterId == "instagram" }
        assertNotNull(igEntry)
        assertTrue(igEntry!!.capabilities.supportsVideo)
        assertFalse(igEntry.capabilities.supportsTitle)
    }

    @Test
    fun testPlannerRejectsEmptyPlatforms() {
        val errors = planner.validatePlan(
            payload = NormalizedContentPayload(text = "Hello"),
            platforms = emptyList()
        )
        assertEquals(1, errors.size)
        assertEquals("EMPTY_PLATFORMS", errors[0].code)
    }

    @Test
    fun testPlannerEnforcesAmazonSpecialRule() {
        val errors = planner.validatePlan(
            payload = NormalizedContentPayload(text = "Check out this product!"),
            platforms = listOf("amazon")
        )
        assertEquals(1, errors.size)
        assertEquals("AMAZON_NOT_PUBLISHING_DESTINATION", errors[0].code)
        assertTrue(errors[0].message.contains("NOT a publishing destination"))
    }

    @Test
    fun testPlannerRejectsUnsupportedTitle() {
        // Instagram does not support title
        val errors = planner.validatePlan(
            payload = NormalizedContentPayload(
                text = "Caption",
                title = "A Special Title That Instagram Does Not Support"
            ),
            platforms = listOf("instagram")
        )
        assertTrue(errors.any { it.code == "UNSUPPORTED_TITLE" && it.platform == "instagram" })
    }

    @Test
    fun testPlannerRejectsUnsupportedCover() {
        // YouTube Shorts in this mock does not support coverUri selection
        val errors = planner.validatePlan(
            payload = NormalizedContentPayload(
                videoUri = "content://media/1",
                title = "Shorts Title",
                coverUri = "content://media/cover.jpg"
            ),
            platforms = listOf("youtube")
        )
        assertTrue(errors.any { it.code == "UNSUPPORTED_COVER" && it.platform == "youtube" })
    }

    @Test
    fun testPlannerValidPlanDeterministicOrder() {
        val plan = planner.plan(
            jobId = "test_job_1",
            payload = NormalizedContentPayload(
                videoUri = "content://media/123",
                description = "Valid reel caption",
                hashtags = listOf("#tech", "#mobile")
            ),
            platforms = listOf("facebook", "instagram"),
            approvalLevel = ApprovalLevel.PLATFORM_APPROVAL
        )

        assertNotNull(plan)
        assertEquals("test_job_1", plan.jobId)
        assertEquals(2, plan.steps.size)
        // Deterministic order: instagram comes before facebook
        assertEquals("instagram", plan.steps[0].platform)
        assertEquals("facebook", plan.steps[1].platform)
        assertEquals(ApprovalLevel.PLATFORM_APPROVAL, plan.approvalLevel)
    }

    @Test
    fun testContentFingerprintIdempotency() {
        val payload1 = NormalizedContentPayload(
            text = "Clean automation",
            description = "Details",
            hashtags = listOf("#beta", "#alpha"),
            videoUri = "file:///video.mp4"
        )
        val payload2 = NormalizedContentPayload(
            text = "Clean automation",
            description = "Details",
            hashtags = listOf("#alpha", "#beta"), // Permuted order of tags
            videoUri = "file:///video.mp4"
        )

        val fp1 = ContentFingerprinter.computeFingerprint(payload1)
        val fp2 = ContentFingerprinter.computeFingerprint(payload2)

        assertEquals("Fingerprints must be deterministic regardless of tag ordering", fp1, fp2)
        assertTrue(fp1.startsWith("fp_"))
    }
}
