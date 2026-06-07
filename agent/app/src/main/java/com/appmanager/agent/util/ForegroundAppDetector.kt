package com.appmanager.agent.util

import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.util.Log

/**
 * 前台应用包名检测工具
 */
object ForegroundAppDetector {

    private const val TAG = "ForegroundAppDetector"

    /**
     * 获取当前前台应用的包名
     * @return 前台应用包名，如果获取失败则返回空字符串
     */
    fun getForegroundPackageName(context: Context): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getForegroundPackageNameByUsageStats(context)
        } else {
            getForegroundPackageNameByActivityManager(context)
        }
    }

    /**
     * 使用 UsageStatsManager 获取前台应用包名（Android 5.0+）
     * 需要 PACKAGE_USAGE_STATS 权限
     */
    private fun getForegroundPackageNameByUsageStats(context: Context): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return ""
        }

        try {
            // 检查是否有 PACKAGE_USAGE_STATS 权限
            if (!hasUsageStatsPermission(context)) {
                Log.w(TAG, "PACKAGE_USAGE_STATS permission not granted")
                return ""
            }

            val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            if (usageStatsManager == null) {
                Log.w(TAG, "UsageStatsManager not available")
                return ""
            }

            val currentTime = System.currentTimeMillis()
            // 查询最近 10 秒内的使用统计（扩大时间窗口）
            val stats = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_BEST,
                currentTime - 10000,
                currentTime
            )

            if (stats.isNullOrEmpty()) {
                Log.d(TAG, "No usage stats available")
                return ""
            }

            // 找到最近使用的应用
            var recentStats: UsageStats? = null
            for (usageStats in stats) {
                if (recentStats == null || usageStats.lastTimeUsed > recentStats.lastTimeUsed) {
                    recentStats = usageStats
                }
            }

            val packageName = recentStats?.packageName ?: ""
            if (packageName.isNotEmpty()) {
                Log.d(TAG, "Foreground app: $packageName (lastTimeUsed: ${recentStats?.lastTimeUsed})")
            }
            return packageName
        } catch (e: Exception) {
            Log.e(TAG, "Error getting foreground app", e)
            return ""
        }
    }

    /**
     * 使用 ActivityManager 获取前台应用包名（Android 5.0 以下或降级方案）
     */
    @Suppress("DEPRECATION")
    private fun getForegroundPackageNameByActivityManager(context: Context): String {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
                ?: return ""

            val runningTasks = activityManager.getRunningTasks(1)
            if (runningTasks.isNotEmpty()) {
                runningTasks[0].topActivity?.packageName ?: ""
            } else {
                ""
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting foreground app via ActivityManager", e)
            ""
        }
    }

    /**
     * 检查是否有 PACKAGE_USAGE_STATS 权限
     */
    fun hasUsageStatsPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return false
        }

        return try {
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
                ?: return false

            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName
                )
            }

            mode == AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) {
            Log.e(TAG, "Error checking PACKAGE_USAGE_STATS permission", e)
            false
        }
    }
}
