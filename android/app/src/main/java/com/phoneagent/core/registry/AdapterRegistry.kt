package com.phoneagent.core.registry

import com.phoneagent.core.adapter.AdapterCapabilities
import com.phoneagent.core.adapter.AppAdapter

class DuplicateAdapterException(val adapterId: String) :
    IllegalStateException("Duplicate adapter registration rejected: Adapter with ID '$adapterId' is already registered.")

class UnknownAdapterException(val adapterId: String) :
    IllegalArgumentException("Unknown adapter requested: No adapter registered with ID '$adapterId'.")

data class CapabilityMatrixEntry(
    val adapterId: String,
    val displayName: String,
    val packageName: String,
    val capabilities: AdapterCapabilities
)

class AdapterRegistry {
    private val adapters = mutableMapOf<String, AppAdapter>()

    companion object {
        @Volatile
        private var instance: AdapterRegistry? = null

        fun getInstance(): AdapterRegistry {
            return instance ?: synchronized(this) {
                instance ?: AdapterRegistry().also { instance = it }
            }
        }

        fun resetInstance() {
            synchronized(this) {
                instance = null
            }
        }
    }

    fun register(adapter: AppAdapter) {
        val id = adapter.platformId.lowercase().trim()
        if (adapters.containsKey(id)) {
            throw DuplicateAdapterException(id)
        }
        adapters[id] = adapter
    }

    fun unregister(adapterId: String): Boolean {
        return adapters.remove(adapterId.lowercase().trim()) != null
    }

    fun get(adapterId: String): AppAdapter {
        val id = adapterId.lowercase().trim()
        return adapters[id] ?: throw UnknownAdapterException(id)
    }

    fun find(adapterId: String): AppAdapter? {
        return adapters[adapterId.lowercase().trim()]
    }

    fun has(adapterId: String): Boolean {
        return adapters.containsKey(adapterId.lowercase().trim())
    }

    fun getAll(): List<AppAdapter> {
        return adapters.values.toList()
    }

    fun getCapabilities(adapterId: String): AdapterCapabilities {
        return get(adapterId).capabilities
    }

    fun getCapabilityMatrix(): List<CapabilityMatrixEntry> {
        return getAll().map { adapter ->
            CapabilityMatrixEntry(
                adapterId = adapter.platformId,
                displayName = adapter.displayName,
                packageName = adapter.packageName,
                capabilities = adapter.capabilities
            )
        }
    }

    fun clear() {
        adapters.clear()
    }

    fun size(): Int = adapters.size
}
