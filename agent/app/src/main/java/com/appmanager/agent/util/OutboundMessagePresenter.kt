package com.appmanager.agent.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import com.appmanager.agent.R
import com.google.android.material.card.MaterialCardView
import java.util.concurrent.atomic.AtomicInteger

/**
 * 出站连接器「消息」步骤：高优先级通知 +（若已授权）屏幕顶部悬浮条。
 */
object OutboundMessagePresenter {

    private const val CHANNEL_ID = "outbound_messages"
    private val notifyIds = AtomicInteger(900000)

    @Volatile
    private var overlayView: View? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    fun show(context: Context, title: String, body: String, durationMs: Int) {
        val app = context.applicationContext
        val dur = durationMs.coerceIn(1500, 60_000)
        mainHandler.post {
            postNotification(app, title, body)
            tryToastTop(app, title, body)
            maybeShowOverlay(app, title, body, dur)
        }
    }

    private fun ensureChannel(app: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID,
            "连接器消息",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "出站连接器下发的顶部提醒"
            enableVibration(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(ch)
    }

    private fun postNotification(app: Context, title: String, body: String) {
        ensureChannel(app)
        val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val id = notifyIds.incrementAndGet()
        val b = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
        nm.notify(id, b.build())
    }

    private fun tryToastTop(app: Context, title: String, body: String) {
        try {
            val t = Toast.makeText(app, if (title.isNotBlank()) "$title\n$body" else body, Toast.LENGTH_LONG)
            t.setGravity(Gravity.TOP or Gravity.CENTER_HORIZONTAL, 0, 120)
            t.show()
        } catch (_: Exception) {
            // 部分系统/后台限制下 Toast 不可用，忽略
        }
    }

    private fun maybeShowOverlay(app: Context, title: String, body: String, durationMs: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!Settings.canDrawOverlays(app)) return
        val wm = app.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return

        synchronized(this) {
            overlayView?.let { old ->
                try {
                    wm.removeView(old)
                } catch (_: Exception) {
                }
                overlayView = null
            }

            val inflater = LayoutInflater.from(app)
            val card = inflater.inflate(R.layout.overlay_outbound_message, null) as MaterialCardView
            card.findViewById<TextView>(R.id.om_title).text = title
            card.findViewById<TextView>(R.id.om_body).text = body
            card.setOnClickListener {
                removeOverlaySafe(wm, card)
            }

            val type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            val flags = (WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                flags,
                PixelFormat.TRANSLUCENT
            )
            params.gravity = Gravity.TOP
            params.verticalMargin = 0f
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                params.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            try {
                wm.addView(card, params)
                overlayView = card
                mainHandler.postDelayed({ removeOverlaySafe(wm, card) }, durationMs.toLong())
            } catch (e: Exception) {
                android.util.Log.w("OutboundMsg", "overlay failed", e)
            }
        }
    }

    private fun removeOverlaySafe(wm: WindowManager, v: View) {
        synchronized(this) {
            if (overlayView !== v) return
            overlayView = null
            try {
                wm.removeView(v)
            } catch (_: Exception) {
            }
        }
    }
}
