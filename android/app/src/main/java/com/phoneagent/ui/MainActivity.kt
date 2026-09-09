package com.phoneagent.ui

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.phoneagent.service.AgentForegroundService

/**
 * MainActivity - Single Activity Architecture
 * Hosts the Jetpack Compose Material 3 UI for Phone Agent.
 */
class MainActivity : ComponentActivity() {

    private val viewModel: DashboardViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Start ongoing foreground status service
        startForegroundService(Intent(this, AgentForegroundService::class.java))

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    // Jetpack Compose Single Activity Screen
                    val state by viewModel.uiState.collectAsState()
                    DashboardScreen(
                        state = state,
                        onEmergencyStop = { viewModel.triggerEmergencyStop("MainActivity UI Button") },
                        onReset = { viewModel.resetStateMachine() },
                        onOpenAccessibilitySettings = {
                            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        }
                    )
                }
            }
        }
    }
}
