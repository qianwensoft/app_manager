package com.appmanager.agent.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device Admin / Device Owner 入口。
 *
 * 激活为 Device Owner（出厂重置后执行，或设备上无任何账号时）：
 *   adb shell dpm set-device-owner com.appmanager.agent/.admin.DeviceAdminReceiver
 *
 * 撤销 Device Owner（会同时撤销 Device Admin）：
 *   adb shell dpm remove-active-admin com.appmanager.agent/.admin.DeviceAdminReceiver
 *   — 或 —
 *   在「设置 → 安全 → 设备管理员」中停用本 App。
 */
class DeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device Admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device Admin disabled — MDM policies are no longer enforced")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        Log.i(TAG, "Profile provisioning complete")
    }

    companion object {
        private const val TAG = "DeviceAdminReceiver"
    }
}
