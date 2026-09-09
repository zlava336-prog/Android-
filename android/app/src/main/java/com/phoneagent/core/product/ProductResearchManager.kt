package com.phoneagent.core.product

import com.phoneagent.core.accessibility.ActionExecutor
import com.phoneagent.core.accessibility.UiInspector
import com.phoneagent.core.safety.EmergencyStopManager

/**
 * Phone Agent - Step 2K Product Research Coordinator (Android)
 */
class ProductResearchManager(
    private val inspector: UiInspector,
    private val executor: ActionExecutor
) {
    private val activeSessions = mutableMapOf<String, ProductResearchSession>()

    fun createSession(request: ProductResearchRequest): ProductResearchSession {
        if (EmergencyStopManager.isStopped.value) {
            throw IllegalStateException("Cannot create research session: Emergency Stop active")
        }
        val sessionId = "rs_${System.currentTimeMillis()}"
        val session = ProductResearchSession(sessionId, request)
        activeSessions[sessionId] = session
        return session
    }

    suspend fun executeResearch(session: ProductResearchSession): Boolean {
        val adapter = AmazonResearchAdapter(inspector, executor)
        try {
            session.transitionTo(ResearchState.VALIDATING, "Validating request")
            session.transitionTo(ResearchState.OPENING_AMAZON, "Opening Amazon")
            adapter.openAmazon()

            session.transitionTo(ResearchState.VERIFYING_AMAZON, "Verifying package")
            adapter.verifySafetyBoundary("VERIFY_AMAZON")

            session.transitionTo(ResearchState.SEARCHING, "Searching")
            adapter.enterSearchQuery(session.request.query)

            val candidates = adapter.detectCandidates()
            session.candidates = candidates
            session.transitionTo(ResearchState.PRODUCT_CANDIDATE_FOUND, "Candidates found")

            val top = candidates.firstOrNull() ?: return false
            session.selectedCandidate = top

            session.transitionTo(ResearchState.EXTRACTING_VISIBLE_DATA, "Extracting visible data")
            val (link, urlFp) = adapter.copyProductLink()

            val product = ProductData(
                title = top.title,
                price = top.visiblePrice,
                currency = top.currency ?: "USD",
                rating = top.rating,
                reviewCount = top.reviewCount,
                sourceUrl = link,
                sourceUrlFingerprint = urlFp,
                researchSessionId = session.sessionId
            )
            session.productData = product

            session.transitionTo(ResearchState.VALIDATING_DATA, "Validating data")
            session.transitionTo(ResearchState.NEEDS_REVIEW, "Awaiting operator review")
            return true
        } catch (e: Exception) {
            session.transitionTo(ResearchState.FAILED, e.message ?: "Research failed")
            return false
        }
    }
}
