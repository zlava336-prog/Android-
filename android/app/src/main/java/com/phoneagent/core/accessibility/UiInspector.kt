package com.phoneagent.core.accessibility

import android.graphics.Rect

data class UiNodeInfo(
    val id: String,
    val text: String? = null,
    val contentDescription: String? = null,
    val className: String,
    val isClickable: Boolean,
    val isEditable: Boolean,
    val isVisible: Boolean,
    val packageName: String,
    val bounds: Rect
)

data class SecurityTripwireResult(
    val isTripped: Boolean,
    val reason: String? = null,
    val detectedElement: String? = null
)

interface UiInspector {
    suspend fun getRootNode(): UiNodeInfo?
    suspend fun findNodesByText(text: String, exact: Boolean = false): List<UiNodeInfo>
    suspend fun findNodeByViewId(viewId: String): UiNodeInfo?
    suspend fun findNodeByContentDescription(desc: String): UiNodeInfo?
    suspend fun getCurrentPackage(): String
    suspend fun checkSecurityTripwires(): SecurityTripwireResult
    suspend fun dumpNodeTree(): List<UiNodeInfo>
}
