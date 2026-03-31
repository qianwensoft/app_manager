package com.appmanager.agent.util

import android.content.Context
import android.graphics.Point
import android.os.Build
import android.view.WindowManager

/**
 * 整块物理屏像素尺寸（含导航栏等区域），与 [android.accessibilityservice.AccessibilityService.dispatchGesture]
 * 及投屏画面坐标系一致；区别于 [android.util.DisplayMetrics] 在部分机型上表示的「应用可用」高度。
 */
object DisplayUtil {
    fun getPhysicalDisplaySize(context: Context): Pair<Int, Int> {
        val wm = context.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val pair = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val b = wm.maximumWindowMetrics.bounds
            b.width() to b.height()
        } else {
            @Suppress("DEPRECATION")
            val display = wm.defaultDisplay
            val p = Point()
            @Suppress("DEPRECATION")
            display.getRealSize(p)
            p.x to p.y
        }
        if (pair.first > 0 && pair.second > 0) return pair
        val m = context.resources.displayMetrics
        return m.widthPixels.coerceAtLeast(1) to m.heightPixels.coerceAtLeast(1)
    }
}
