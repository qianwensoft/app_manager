package com.appmanager.agent.command

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ws.Message
import org.json.JSONObject

object MdmCommandHandler {
    private const val TAG = "MdmCommandHandler"
    private const val MDM_PREFS = "mdm_prefs"
    private const val KEY_MDM_ENABLED = "mdm_enabled"

    fun getMdmStatus(msg: Message, service: AgentService) {
        try {
            val dpm = service.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val isDeviceOwner = dpm.isDeviceOwnerApp(service.packageName)
            val hasWriteSecureSettings = service.checkSelfPermission(
                android.Manifest.permission.WRITE_SECURE_SETTINGS
            ) == PackageManager.PERMISSION_GRANTED
            val apiLevel = Build.VERSION.SDK_INT
            // Determine individual capabilities
            val canSetNtp = hasWriteSecureSettings
            val canSetSystemTime = service.checkSelfPermission(
                android.Manifest.permission.SET_TIME
            ) == PackageManager.PERMISSION_GRANTED
            val canSetPasswordPolicy = isDeviceOwner
            val canControlApps = isDeviceOwner
            val canDisableCamera = isDeviceOwner && apiLevel >= 26
            val canWipeDevice = isDeviceOwner
            val canSetKeyguard = isDeviceOwner

            val caps = JSONObject().apply {
                put("is_device_owner", isDeviceOwner)
                put("has_write_secure_settings", hasWriteSecureSettings)
                put("api_level", apiLevel)
                put("can_set_ntp", canSetNtp)
                put("can_set_system_time", canSetSystemTime)
                put("can_set_password_policy", canSetPasswordPolicy)
                put("can_control_apps", canControlApps)
                put("can_disable_camera", canDisableCamera)
                put("can_wipe_device", canWipeDevice)
                put("can_set_keyguard", canSetKeyguard)
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, caps.toString())
        } catch (e: Exception) {
            Log.e(TAG, "getMdmStatus failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    fun getNtpConfig(msg: Message, service: AgentService) {
        try {
            val server = Settings.Global.getString(service.contentResolver, "ntp_server") ?: ""
            val timeout = Settings.Global.getLong(service.contentResolver, "ntp_timeout", 5000L)
            val result = JSONObject().apply {
                put("ntp_server", server)
                put("ntp_timeout", timeout)
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, result.toString())
        } catch (e: Exception) {
            Log.e(TAG, "getNtpConfig failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    fun setNtpConfig(msg: Message, service: AgentService) {
        val data = msg.data as? Map<*, *>
        if (data == null) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "missing data")
            return
        }
        val server = data["ntp_server"] as? String
        if (server.isNullOrBlank()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "ntp_server required")
            return
        }
        val timeoutMs = (data["ntp_timeout"] as? Number)?.toLong() ?: 5000L
        try {
            Settings.Global.putString(service.contentResolver, "ntp_server", server)
            Settings.Global.putLong(service.contentResolver, "ntp_timeout", timeoutMs)
            CommandDispatcher.sendResult(service, msg.commandId, true, "ok")
        } catch (e: SecurityException) {
            Log.e(TAG, "setNtpConfig SecurityException - missing WRITE_SECURE_SETTINGS?", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, "缺少 WRITE_SECURE_SETTINGS 权限，请通过 ADB 授权：adb shell pm grant ${service.packageName} android.permission.WRITE_SECURE_SETTINGS")
        } catch (e: Exception) {
            Log.e(TAG, "setNtpConfig failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    fun setMdmMode(msg: Message, service: AgentService) {
        val data = msg.data as? Map<*, *>
        val enabled = data?.get("enabled") as? Boolean ?: false
        val enterpriseCode = data?.get("enterprise_code") as? String ?: ""
        try {
            val prefs = service.getSharedPreferences(MDM_PREFS, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean(KEY_MDM_ENABLED, enabled)
                putString("enterprise_code", enterpriseCode)
                apply()
            }
            Log.i(TAG, "MDM mode set to $enabled, enterprise: $enterpriseCode")
            // 关闭 MDM 时自动清除所有已应用的 Device Owner 策略
            if (!enabled) {
                DpmCommandHandler.clearAllPolicies(service)
            }
            // 刷新前台通知 + 立即推送 device_info
            service.onMdmModeChanged(enabled, enterpriseCode)
            // 通知 MainActivity 实时刷新 MDM 卡片
            service.sendBroadcast(
                android.content.Intent("com.appmanager.agent.MDM_STATE_CHANGED")
                    .setPackage(service.packageName)
            )
            CommandDispatcher.sendResult(service, msg.commandId, true, "ok")
        } catch (e: Exception) {
            Log.e(TAG, "setMdmMode failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    fun isMdmEnabled(service: AgentService): Boolean {
        return service.getSharedPreferences(MDM_PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_MDM_ENABLED, false)
    }
}
