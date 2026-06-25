package com.appmanager.agent.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat

/**
 * 读取手机机器码，用于 Agent 注册与 WebSocket 连接键。
 * 优先硬件序列号，不可用时回退 ANDROID_ID。
 */
object DeviceMachineId {

    fun get(context: Context): String {
        val serial = readHardwareSerial(context)
        if (serial.isNotEmpty()) return serial
        return readAndroidId(context)
    }

    private fun readHardwareSerial(context: Context): String {
        return try {
            val raw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.READ_PHONE_STATE
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    Build.getSerial()
                } else {
                    Build.SERIAL
                }
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL
            }
            normalize(raw)
        } catch (_: SecurityException) {
            normalize(Build.SERIAL)
        } catch (_: Exception) {
            ""
        }
    }

    private fun readAndroidId(context: Context): String {
        return try {
            val id = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            normalize(id)
        } catch (_: Exception) {
            ""
        }
    }

    private fun normalize(raw: String?): String {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) return ""
        if (s.equals("unknown", ignoreCase = true)) return ""
        if (s.equals("null", ignoreCase = true)) return ""
        return s
    }
}
