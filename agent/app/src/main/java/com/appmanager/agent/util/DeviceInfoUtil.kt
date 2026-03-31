package com.appmanager.agent.util

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import java.io.BufferedReader
import java.io.FileReader

object DeviceInfoUtil {

    data class MemoryInfo(val used: Long, val total: Long)
    /** 内部存储（/data 分区），单位 MB，与服务端 total_storage 一致 */
    data class StorageInfo(val usedMB: Long, val totalMB: Long)

    fun getMemoryInfo(context: Context): MemoryInfo {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)

        val totalMB = memInfo.totalMem / 1024 / 1024
        val usedMB = (memInfo.totalMem - memInfo.availMem) / 1024 / 1024
        return MemoryInfo(usedMB, totalMB)
    }

    fun getStorageInfo(): StorageInfo {
        val stat = StatFs(Environment.getDataDirectory().path)
        val totalMB = stat.totalBytes / (1024L * 1024L)
        val availMB = stat.availableBytes / (1024L * 1024L)
        val usedMB = (totalMB - availMB).coerceAtLeast(0L)
        return StorageInfo(usedMB, totalMB)
    }

    fun getCpuInfo(): String {
        return try {
            BufferedReader(FileReader("/proc/cpuinfo")).use { reader ->
                reader.lineSequence()
                    .firstOrNull { it.startsWith("Hardware") }
                    ?.substringAfter(":")
                    ?.trim() ?: "Unknown"
            }
        } catch (e: Exception) {
            "Unknown"
        }
    }

    fun getBatteryLevel(context: Context): Int {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (scale > 0) (level * 100 / scale) else -1
    }
}
