package com.appmanager.agent.service

import android.content.Context
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.ImageView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class TouchIndicator(private val context: Context) {
    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val indicators = mutableListOf<ImageView>()

    fun show(x: Int, y: Int) {
        CoroutineScope(Dispatchers.Main).launch {
            val indicator = ImageView(context).apply {
                setImageResource(android.R.drawable.ic_menu_mylocation)
                alpha = 0.7f
            }

            val params = WindowManager.LayoutParams(
                80, 80,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.LEFT
                // 与 AccessibilityService.dispatchGesture 使用相同的屏幕像素坐标系（含状态栏）
                this.x = x - 40
                this.y = y - 40
            }

            try {
                windowManager.addView(indicator, params)
                indicators.add(indicator)

                delay(600)
                windowManager.removeView(indicator)
                indicators.remove(indicator)
            } catch (e: Exception) {
                // Ignore
            }
        }
    }

    fun clear() {
        val run = {
            indicators.forEach {
                try {
                    windowManager.removeView(it)
                } catch (_: Exception) { /* 已移除或非法状态 */ }
            }
            indicators.clear()
        }
        if (Looper.myLooper() == Looper.getMainLooper()) run()
        else mainHandler.post(run)
    }
}
