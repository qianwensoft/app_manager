package com.appmanager.agent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.app.NotificationCompat
import com.appmanager.agent.R

/**
 * Android 14+ 要求 mediaProjection 型前台服务必须从 Activity onActivityResult 上下文启动。
 * AgentService 使用 dataSync 类型常驻；此服务仅在投屏期间存活，持有 mediaProjection FGS 类型。
 */
class ScreenProjectionForegroundService : Service() {

    companion object {
        private const val TAG = "ScreenProjFGS"
        private const val CHANNEL_ID = "screen_projection_fgs"
        private const val NOTIF_ID = 1002
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0
        try {
            ServiceCompat.startForeground(this, NOTIF_ID, buildNotification(), type)
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed: ${e.message}", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "destroyed")
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "屏幕投影", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("投屏中")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .build()
}
