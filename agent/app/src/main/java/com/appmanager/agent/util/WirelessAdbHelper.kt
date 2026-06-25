package com.appmanager.agent.util

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import org.json.JSONObject

/**
 * 无线 ADB 引导：打开系统「无线调试」、解析管理平台二维码、上报扫码回执。
 */
object WirelessAdbHelper {
    const val QR_TYPE = "wireless_adb_guide"
    const val ACTION_OPEN = "com.appmanager.agent.ACTION_OPEN_WIRELESS_ADB"
    const val NATIVE_TARGET = "wireless_adb"

    fun isNativeMenuTarget(targetType: String?, targetRef: String?): Boolean =
        targetType == "agent_native" && targetRef == NATIVE_TARGET

    fun openWirelessDebugSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val wirelessAdbIntent = Intent("com.android.settings.WIRELESS_DEBUGGING_SETTINGS").apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            try {
                context.startActivity(wirelessAdbIntent)
                return
            } catch (_: Exception) { /* fallback */ }
        }
        try {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
            )
        } catch (_: Exception) {
            Toast.makeText(context, "请手动进入「开发者选项 → 无线调试」", Toast.LENGTH_LONG).show()
        }
    }

    /**
     * 处理管理平台「无线 ADB 引导」二维码。
     * @return true 表示已识别并处理
     */
    fun handleGuideQr(
        context: Context,
        rawJson: String,
        localDeviceToken: String,
        onAck: ((deviceId: Long, tokenMatched: Boolean) -> Unit)? = null
    ): Boolean {
        val json = try {
            JSONObject(rawJson)
        } catch (_: Exception) {
            return false
        }
        if (json.optString("type") != QR_TYPE) return false

        val deviceId = json.optLong("deviceId", 0L)
        val qrToken = json.optString("deviceToken", "").trim()
        val local = localDeviceToken.trim()
        val tokenMatched = qrToken.isEmpty() || local.isEmpty() || qrToken == local

        openWirelessDebugSettings(context)
        onAck?.invoke(deviceId, tokenMatched)

        val msg = if (tokenMatched) {
            "已打开「无线调试」，请在管理平台填写配对码/端口完成连接"
        } else {
            "二维码设备与当前 Agent 不一致，仍已打开「无线调试」供手动配置"
        }
        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
        return true
    }
}
