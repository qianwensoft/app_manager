package com.appmanager.agent.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent

class TouchAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "TouchAccessibility"
        private var instance: TouchAccessibilityService? = null

        fun getInstance(): TouchAccessibilityService? = instance

        fun performTap(x: Float, y: Float): Boolean {
            val service = instance ?: return false
            val path = Path().apply { moveTo(x, y) }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
                .build()
            return service.dispatchGesture(gesture, null, null)
        }

        fun performSwipe(x1: Float, y1: Float, x2: Float, y2: Float, duration: Long): Boolean {
            val service = instance ?: return false
            val path = Path().apply {
                moveTo(x1, y1)
                lineTo(x2, y2)
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
                .build()
            return service.dispatchGesture(gesture, null, null)
        }

        /**
         * 虚拟导航键：经无障碍 performGlobalAction 执行，无需 ADB / root。
         * 仅在无障碍服务已启用（instance 非空）时生效，否则返回 false 供上层回退 ADB。
         */
        fun performNavKey(key: String): Boolean {
            val service = instance ?: return false
            val action = when (key.lowercase()) {
                "back" -> GLOBAL_ACTION_BACK
                "home" -> GLOBAL_ACTION_HOME
                "recents", "app_switch" -> GLOBAL_ACTION_RECENTS
                "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
                "quick_settings" -> GLOBAL_ACTION_QUICK_SETTINGS
                "power_dialog" -> GLOBAL_ACTION_POWER_DIALOG
                "lock_screen" ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_LOCK_SCREEN else return false
                else -> return false
            }
            return try {
                service.performGlobalAction(action)
            } catch (e: Exception) {
                Log.e(TAG, "performNavKey($key) failed", e)
                false
            }
        }

        /** 无障碍服务当前是否已连接（用于上层判断走无障碍还是回退 ADB）。 */
        fun isReady(): Boolean = instance != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "TouchAccessibilityService connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }
}
