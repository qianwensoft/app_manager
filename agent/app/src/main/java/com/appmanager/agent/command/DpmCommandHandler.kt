package com.appmanager.agent.command

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import android.util.Log
import com.appmanager.agent.admin.DeviceAdminReceiver
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ws.Message
import org.json.JSONObject

/**
 * Device Owner 策略命令处理器。
 * 所有操作均需要 App 已激活为 Device Owner，否则抛出 SecurityException 并返回友好错误。
 */
object DpmCommandHandler {

    private const val TAG = "DpmCommandHandler"

    // ── 公共辅助 ────────────────────────────────────────────────────────────

    private fun dpm(context: Context): DevicePolicyManager =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private fun admin(context: Context): ComponentName =
        ComponentName(context, DeviceAdminReceiver::class.java)

    /** 检查 Device Owner 状态，非 DO 时直接回复错误并返回 false */
    private fun requireDeviceOwner(msg: Message, service: AgentService): Boolean {
        if (!dpm(service).isDeviceOwnerApp(service.packageName)) {
            CommandDispatcher.sendResult(
                service, msg.commandId, false,
                "本 App 尚未激活为 Device Owner。请执行：\n" +
                "adb shell dpm set-device-owner ${service.packageName}/.admin.DeviceAdminReceiver"
            )
            return false
        }
        return true
    }

    /**
     * 策略变更后广播通知 MainActivity 刷新 MDM 卡片（updateMdmCard）。
     * 同时推送一次 device_info 让服务端快照保持最新。
     */
    private fun notifyPolicyChanged(service: AgentService) {
        service.sendBroadcast(
            android.content.Intent("com.appmanager.agent.MDM_STATE_CHANGED")
                .setPackage(service.packageName)
        )
        service.pushDeviceInfoNow("dpm_policy_changed")
    }

    // ── 锁屏 ─────────────────────────────────────────────────────────────────

    /** action: mdm_lock_now — 立即锁屏 */
    fun lockNow(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        try {
            dpm(service).lockNow()
            CommandDispatcher.sendResult(service, msg.commandId, true, "已锁屏")
        } catch (e: Exception) {
            Log.e(TAG, "lockNow", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 擦除设备 ─────────────────────────────────────────────────────────────

    /**
     * action: mdm_wipe_device
     * data: { "confirm": "<设备名称>" }  — 必须与设备 Build.MODEL 一致，防误触
     * flags: 0 = 仅用户数据; 可加 WIPE_EXTERNAL_STORAGE | WIPE_SILENTLY
     */
    fun wipeDevice(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data = msg.data as? Map<*, *>
        val confirm = (data?.get("confirm") as? String)?.trim()
        if (confirm.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "缺少 confirm 字段")
            return
        }
        if (confirm != Build.MODEL) {
            CommandDispatcher.sendResult(
                service, msg.commandId, false,
                "确认名称不匹配（期望: ${Build.MODEL}，收到: $confirm）"
            )
            return
        }
        try {
            dpm(service).wipeData(0)
            // wipeData 会立即触发重置，不会执行到这里
            CommandDispatcher.sendResult(service, msg.commandId, true, "擦除已触发")
        } catch (e: Exception) {
            Log.e(TAG, "wipeDevice", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 重启 ─────────────────────────────────────────────────────────────────

    /** action: mdm_reboot — 通过 DPM 重启（比 root su 更标准，API 24+）*/
    fun reboot(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        if (Build.VERSION.SDK_INT < 24) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "需要 Android 7.0+")
            return
        }
        try {
            dpm(service).reboot(admin(service))
            CommandDispatcher.sendResult(service, msg.commandId, true, "重启已触发")
        } catch (e: Exception) {
            Log.e(TAG, "reboot", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 相机 & 截屏 ──────────────────────────────────────────────────────────

    /** action: mdm_set_camera — data: { "disabled": bool } */
    fun setCameraDisabled(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data = msg.data as? Map<*, *>
        val disabled = data?.get("disabled") as? Boolean ?: true
        try {
            dpm(service).setCameraDisabled(admin(service), disabled)
            notifyPolicyChanged(service)
            CommandDispatcher.sendResult(service, msg.commandId, true, if (disabled) "相机已禁用" else "相机已启用")
        } catch (e: Exception) {
            Log.e(TAG, "setCameraDisabled", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    /** action: mdm_set_screen_capture — data: { "disabled": bool } */
    fun setScreenCaptureDisabled(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data = msg.data as? Map<*, *>
        val disabled = data?.get("disabled") as? Boolean ?: true
        try {
            dpm(service).setScreenCaptureDisabled(admin(service), disabled)
            notifyPolicyChanged(service)
            CommandDispatcher.sendResult(service, msg.commandId, true, if (disabled) "截屏已禁用" else "截屏已启用")
        } catch (e: Exception) {
            Log.e(TAG, "setScreenCaptureDisabled", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 密码策略 ─────────────────────────────────────────────────────────────

    /**
     * action: mdm_set_password_policy
     * data: { "quality": "numeric|alphabetic|alphanumeric|complex|none", "min_length": 6 }
     */
    fun setPasswordPolicy(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data = msg.data as? Map<*, *>
        val qualityStr = (data?.get("quality") as? String) ?: "none"
        val minLength  = (data?.get("min_length") as? Number)?.toInt() ?: 0

        val quality = when (qualityStr.lowercase()) {
            "numeric"      -> DevicePolicyManager.PASSWORD_QUALITY_NUMERIC
            "alphabetic"   -> DevicePolicyManager.PASSWORD_QUALITY_ALPHABETIC
            "alphanumeric" -> DevicePolicyManager.PASSWORD_QUALITY_ALPHANUMERIC
            "complex"      -> DevicePolicyManager.PASSWORD_QUALITY_COMPLEX
            else           -> DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED
        }
        try {
            dpm(service).setPasswordQuality(admin(service), quality)
            if (minLength > 0) dpm(service).setPasswordMinimumLength(admin(service), minLength)
            notifyPolicyChanged(service)
            CommandDispatcher.sendResult(service, msg.commandId, true, "密码策略已设置")
        } catch (e: Exception) {
            Log.e(TAG, "setPasswordPolicy", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 时间 / 时区 ──────────────────────────────────────────────────────────

    /** action: mdm_set_time — data: { "time_ms": 1690000000000 }  API 28+ */
    fun setTime(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        if (Build.VERSION.SDK_INT < 28) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "需要 Android 9+")
            return
        }
        val data   = msg.data as? Map<*, *>
        val timeMs = (data?.get("time_ms") as? Number)?.toLong()
        if (timeMs == null || timeMs <= 0) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "time_ms 无效")
            return
        }
        try {
            val ok = dpm(service).setTime(admin(service), timeMs)
            if (ok) CommandDispatcher.sendResult(service, msg.commandId, true, "系统时间已设置")
            else    CommandDispatcher.sendResult(service, msg.commandId, false, "setTime 返回 false（可能设备已启用自动时间）")
        } catch (e: Exception) {
            Log.e(TAG, "setTime", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    /** action: mdm_set_timezone — data: { "timezone": "Asia/Shanghai" }  API 28+ */
    fun setTimeZone(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        if (Build.VERSION.SDK_INT < 28) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "需要 Android 9+")
            return
        }
        val data = msg.data as? Map<*, *>
        val tz   = (data?.get("timezone") as? String)?.trim()
        if (tz.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "timezone 不能为空")
            return
        }
        try {
            val ok = dpm(service).setTimeZone(admin(service), tz)
            if (ok) CommandDispatcher.sendResult(service, msg.commandId, true, "时区已设置: $tz")
            else    CommandDispatcher.sendResult(service, msg.commandId, false, "setTimeZone 返回 false")
        } catch (e: Exception) {
            Log.e(TAG, "setTimeZone", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 系统设置写入（Device Owner 专用，比 WRITE_SECURE_SETTINGS 更干净）────

    /**
     * action: mdm_set_secure_setting
     * data: { "key": "ntp_server", "value": "pool.ntp.org" }
     *
     * 优先使用 Device Owner 的 DPM.setSecureSetting()（API 29+）；
     * 非 Device Owner 或 API < 29 时降级到 SettingsCommandHandler（需 WRITE_SECURE_SETTINGS）。
     */
    fun setSecureSetting(msg: Message, service: AgentService) {
        // 非 Device Owner 或 API < 29 → 降级到 WRITE_SECURE_SETTINGS 路径
        if (!dpm(service).isDeviceOwnerApp(service.packageName) || Build.VERSION.SDK_INT < 29) {
            SettingsCommandHandler.setSecureSetting(msg, service)
            return
        }
        val data  = msg.data as? Map<*, *>
        val key   = (data?.get("key")   as? String)?.trim()
        val value = (data?.get("value") as? String)?.trim()
        if (key.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "key 不能为空")
            return
        }
        try {
            dpm(service).setSecureSetting(admin(service), key, value)
            CommandDispatcher.sendResult(service, msg.commandId, true, "已设置 $key=$value")
        } catch (e: Exception) {
            Log.e(TAG, "setSecureSetting", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 用户限制 ─────────────────────────────────────────────────────────────

    /**
     * action: mdm_set_user_restriction
     * data: { "restriction": "no_factory_reset", "enabled": true }
     * 常用限制键（UserManager.DISALLOW_*）：
     *   no_factory_reset / no_install_apps / no_uninstall_apps / no_usb_file_transfer /
     *   no_debugging_features / no_add_user / no_config_wifi / no_config_bluetooth
     */
    fun setUserRestriction(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data        = msg.data as? Map<*, *>
        val restriction = (data?.get("restriction") as? String)?.trim()
        val enabled     = data?.get("enabled") as? Boolean ?: true
        if (restriction.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "restriction 不能为空")
            return
        }
        // UserManager 常量是 "no_xxx" 格式，与 DISALLOW_ 前缀对应
        val key = if (restriction.startsWith("no_")) restriction else "no_$restriction"
        try {
            if (enabled) dpm(service).addUserRestriction(admin(service), key)
            else         dpm(service).clearUserRestriction(admin(service), key)
            CommandDispatcher.sendResult(service, msg.commandId, true,
                "${if (enabled) "已添加" else "已移除"}限制: $key")
        } catch (e: Exception) {
            Log.e(TAG, "setUserRestriction $key", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 应用管控 ─────────────────────────────────────────────────────────────

    /**
     * action: mdm_set_app_hidden
     * data: { "package_name": "com.example.app", "hidden": true }
     */
    fun setAppHidden(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data = msg.data as? Map<*, *>
        val pkg  = (data?.get("package_name") as? String)?.trim()
        val hidden = data?.get("hidden") as? Boolean ?: true
        if (pkg.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "package_name 不能为空")
            return
        }
        try {
            dpm(service).setApplicationHidden(admin(service), pkg, hidden)
            CommandDispatcher.sendResult(service, msg.commandId, true,
                "$pkg 已${if (hidden) "隐藏" else "显示"}")
        } catch (e: Exception) {
            Log.e(TAG, "setAppHidden", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    /**
     * action: mdm_set_uninstall_blocked
     * data: { "package_name": "com.example.app", "blocked": true }
     */
    fun setUninstallBlocked(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data = msg.data as? Map<*, *>
        val pkg  = (data?.get("package_name") as? String)?.trim()
        val blocked = data?.get("blocked") as? Boolean ?: true
        if (pkg.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "package_name 不能为空")
            return
        }
        try {
            dpm(service).setUninstallBlocked(admin(service), pkg, blocked)
            CommandDispatcher.sendResult(service, msg.commandId, true,
                "$pkg 卸载已${if (blocked) "禁止" else "解除禁止"}")
        } catch (e: Exception) {
            Log.e(TAG, "setUninstallBlocked", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    /**
     * action: mdm_set_permission_grant  API 23+
     * data: { "package_name": "com.example", "permission": "android.permission.CAMERA",
     *          "state": "grant|deny|default" }
     */
    fun setPermissionGrant(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        if (Build.VERSION.SDK_INT < 23) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "需要 Android 6+")
            return
        }
        val data = msg.data as? Map<*, *>
        val pkg  = (data?.get("package_name") as? String)?.trim()
        val perm = (data?.get("permission")    as? String)?.trim()
        val stateStr = (data?.get("state") as? String) ?: "grant"
        if (pkg.isNullOrEmpty() || perm.isNullOrEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "package_name 和 permission 不能为空")
            return
        }
        val state = when (stateStr.lowercase()) {
            "grant"   -> DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
            "deny"    -> DevicePolicyManager.PERMISSION_GRANT_STATE_DENIED
            else      -> DevicePolicyManager.PERMISSION_GRANT_STATE_DEFAULT
        }
        try {
            dpm(service).setPermissionGrantState(admin(service), pkg, perm, state)
            CommandDispatcher.sendResult(service, msg.commandId, true, "$pkg.$perm → $stateStr")
        } catch (e: Exception) {
            Log.e(TAG, "setPermissionGrant", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── Kiosk 模式 ────────────────────────────────────────────────────────────

    /**
     * action: mdm_set_kiosk
     * data: { "enabled": true, "packages": ["com.example.kiosk"] }
     * enabled=false 时清空锁定列表退出 Kiosk
     */
    fun setKioskMode(msg: Message, service: AgentService) {
        if (!requireDeviceOwner(msg, service)) return
        val data = msg.data as? Map<*, *>
        val enabled  = data?.get("enabled") as? Boolean ?: true
        @Suppress("UNCHECKED_CAST")
        val packages = (data?.get("packages") as? List<*>)
            ?.mapNotNull { it as? String } ?: emptyList()

        try {
            if (enabled) {
                if (packages.isEmpty()) {
                    CommandDispatcher.sendResult(service, msg.commandId, false, "packages 不能为空")
                    return
                }
                dpm(service).setLockTaskPackages(admin(service), packages.toTypedArray())
                notifyPolicyChanged(service)
                CommandDispatcher.sendResult(service, msg.commandId, true,
                    "Kiosk 锁定列表已设置: ${packages.joinToString()}")
            } else {
                dpm(service).setLockTaskPackages(admin(service), emptyArray())
                notifyPolicyChanged(service)
                CommandDispatcher.sendResult(service, msg.commandId, true, "Kiosk 已退出")
            }
        } catch (e: Exception) {
            Log.e(TAG, "setKioskMode", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "error")
        }
    }

    // ── 获取当前策略快照 ─────────────────────────────────────────────────────

    /** action: mdm_get_policy_snapshot — 读取当前所有策略状态并返回 JSON */
    fun getPolicySnapshot(msg: Message, service: AgentService) {
        val d = dpm(service)
        val a = admin(service)
        val isOwner = d.isDeviceOwnerApp(service.packageName)

        val snapshot = JSONObject().apply {
            put("is_device_owner", isOwner)
            if (isOwner) {
                put("camera_disabled",         d.getCameraDisabled(a))
                put("screen_capture_disabled", d.getScreenCaptureDisabled(a))
                put("password_quality",        d.getPasswordQuality(a))
                put("password_min_length",     d.getPasswordMinimumLength(a))
                put("lock_task_packages",      d.getLockTaskPackages(a).joinToString(","))
                if (Build.VERSION.SDK_INT >= 28) {
                    put("auto_time_required",   d.getAutoTimeRequired())
                }
            }
        }
        CommandDispatcher.sendResult(service, msg.commandId, true, snapshot.toString())
    }

    // ── 清除所有策略 ──────────────────────────────────────────────────────────

    /**
     * 关闭 MDM 模式时自动调用：重置所有 Device Owner 策略，确保设备回到正常状态。
     * 仅当本 App 是 Device Owner 时执行，非 DO 时静默跳过。
     */
    fun clearAllPolicies(service: AgentService) {
        val d = dpm(service)
        val a = admin(service)
        if (!d.isDeviceOwnerApp(service.packageName)) return
        Log.i(TAG, "Clearing all DPM policies (MDM mode disabled)")

        // 硬件策略
        try { d.setCameraDisabled(a, false) } catch (_: Exception) {}
        try { d.setScreenCaptureDisabled(a, false) } catch (_: Exception) {}

        // 密码策略
        try { d.setPasswordQuality(a, DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED) } catch (_: Exception) {}
        try { d.setPasswordMinimumLength(a, 0) } catch (_: Exception) {}

        // Kiosk
        try { d.setLockTaskPackages(a, emptyArray()) } catch (_: Exception) {}

        // 用户限制
        val restrictions = listOf(
            UserManager.DISALLOW_FACTORY_RESET,
            UserManager.DISALLOW_INSTALL_APPS,
            UserManager.DISALLOW_UNINSTALL_APPS,
            UserManager.DISALLOW_USB_FILE_TRANSFER,
            UserManager.DISALLOW_DEBUGGING_FEATURES,
            UserManager.DISALLOW_CONFIG_WIFI,
            UserManager.DISALLOW_CONFIG_BLUETOOTH,
            UserManager.DISALLOW_ADD_USER,
        )
        for (r in restrictions) {
            try { d.clearUserRestriction(a, r) } catch (_: Exception) {}
        }

        // 解除所有应用的卸载封锁 + 显示隐藏应用
        val allApps = service.packageManager
            .getInstalledApplications(android.content.pm.PackageManager.GET_META_DATA)
        for (app in allApps) {
            try { d.setUninstallBlocked(a, app.packageName, false) } catch (_: Exception) {}
            try { d.setApplicationHidden(a, app.packageName, false) } catch (_: Exception) {}
        }

        notifyPolicyChanged(service)
        Log.i(TAG, "All DPM policies cleared")
    }

    // ── 撤销 Device Owner ─────────────────────────────────────────────────────

    /**
     * action: mdm_revoke_device_owner
     * 完整撤销流程：清策略 → 撤 DO → 撤 DA（App 可对自身 DA 免 testOnly 调用）。
     * 三步完成后 App 可被正常卸载，无需再去系统设置手动停用。
     */
    fun revokeDeviceOwner(msg: Message, service: AgentService) {
        val d = dpm(service)
        val a = admin(service)

        if (!d.isDeviceOwnerApp(service.packageName) && !d.isAdminActive(a)) {
            CommandDispatcher.sendResult(service, msg.commandId, false,
                "本 App 既不是 Device Owner 也不是 Device Admin，无需撤销")
            return
        }

        val steps = mutableListOf<String>()
        try {
            // Step 1：清除所有策略
            if (d.isDeviceOwnerApp(service.packageName)) {
                clearAllPolicies(service)
                steps += "策略已清除"
            }

            // Step 2：撤销 Device Owner（clearDeviceOwnerApp 在 App 内调用不受 testOnly 限制）
            if (d.isDeviceOwnerApp(service.packageName)) {
                d.clearDeviceOwnerApp(service.packageName)
                steps += "Device Owner 已撤销"
            }

            // Step 3：撤销 Device Admin（App 调用自身 DA 不需要 testOnly，大多数 Android 版本支持）
            if (d.isAdminActive(a)) {
                d.removeActiveAdmin(a)
                steps += "Device Admin 已撤销"
            }

            CommandDispatcher.sendResult(service, msg.commandId, true,
                "✅ ${steps.joinToString(" → ")}\nApp 现在可以被正常卸载！")
            notifyPolicyChanged(service)
        } catch (e: Exception) {
            Log.e(TAG, "revokeDeviceOwner failed at ${steps.size + 1}", e)
            val done = if (steps.isEmpty()) "（无）" else steps.joinToString(" → ")
            CommandDispatcher.sendResult(service, msg.commandId, false,
                "部分步骤失败（已完成：$done）\n错误：${e.message}\n\n若仍无法卸载，请：\n" +
                "1. 设置 → 安全 → 设备管理员 → 取消激活\n" +
                "2. 或 ADB（debug包）：adb shell dpm remove-active-admin " +
                "${service.packageName}/.admin.DeviceAdminReceiver")
        }
    }
}
