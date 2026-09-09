package com.phoneagent.core.accessibility

interface ActionExecutor {
    suspend fun click(node: UiNodeInfo): Boolean
    suspend fun clickAt(x: Int, y: Int): Boolean
    suspend fun typeText(node: UiNodeInfo, text: String): Boolean
    suspend fun clearText(node: UiNodeInfo): Boolean
    suspend fun scroll(direction: ScrollDirection): Boolean
    suspend fun copyToClipboard(text: String): Boolean
    suspend fun readClipboard(): String
    suspend fun pressBack(): Boolean
}

enum class ScrollDirection {
    UP, DOWN, LEFT, RIGHT
}
