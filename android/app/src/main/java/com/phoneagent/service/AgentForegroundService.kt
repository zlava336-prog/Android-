package com.phoneagent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.phoneagent.core.logging.LocalActionLogger
import com.phoneagent.core.logging.LogLevel
import com.phoneagent.core.safety.EmergencyStopManager
import com.phoneagent.ui.MainActivity

/**
 * AgentForegroundService
 *
 * Keeps Phone Agent alive during active publishing tasks and displays
 * a persistent notification with the global Emergency STOP button.
 */
class AgentForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "phone_agent_active_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_EMERGENCY_STOP = "com.phoneagent.action.EMERGENCY_STOP"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_EMERGENCY_STOP) {
            EmergencyStopManager.trigger("Emergency Stop pressed from Notification")
            LocalActionLogger.log("NOTIFICATION_STOP", "Emergency Stop invoked from system notification", level = LogLevel.WARN)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = buildForegroundNotification("Phone Agent Active", "Monitoring authorized social apps")
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Phone Agent Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows Phone Agent automation status and Emergency Stop"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(title: String, content: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java)
        val pendingOpen = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val stopIntent = Intent(this, AgentForegroundService::class.java).apply {
            action = ACTION_EMERGENCY_STOP
        }
        val pendingStop = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(pendingOpen)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_delete, "EMERGENCY STOP", pendingStop)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
