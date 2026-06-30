package com.appmanager.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.appmanager.agent.config.AgentConfig

/**
 * 接收通过 adb 发送的配置广播
 *
 * 使用方法：
 * adb shell am broadcast -a com.appmanager.agent.CONFIG \
 *   --es server_url "http://192.168.1.136:8080" \
 *   --es form_app_base_url "http://192.168.1.136:4175" \
 *   --es device_token "YOUR_TOKEN"
 */
class ConfigReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ConfigReceiver"
        const val ACTION_CONFIG = "com.appmanager.agent.CONFIG"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_CONFIG) return

        Log.i(TAG, "Received configuration broadcast")

        var config = AgentConfig.get(context)
        var updated = false

        // 服务器地址
        intent.getStringExtra("server_url")?.let { url ->
            if (url.isNotBlank()) {
                config = config.copy(serverUrl = url.trim())
                updated = true
                Log.i(TAG, "Updated server_url: $url")
            }
        }

        // Form App 基础 URL
        intent.getStringExtra("form_app_base_url")?.let { url ->
            if (url.isNotBlank()) {
                config = config.copy(formAppBaseUrl = url.trim())
                updated = true
                Log.i(TAG, "Updated form_app_base_url: $url")
            }
        }

        // 设备 Token
        intent.getStringExtra("device_token")?.let { token ->
            if (token.isNotBlank()) {
                config = config.copy(deviceToken = token.trim())
                updated = true
                Log.i(TAG, "Updated device_token: $token")
            }
        }

        // 设备别名
        intent.getStringExtra("device_alias")?.let { alias ->
            config = config.copy(deviceAlias = alias.trim())
            updated = true
            Log.i(TAG, "Updated device_alias: $alias")
        }

        // 用户 Token
        intent.getStringExtra("user_token")?.let { token ->
            config = config.copy(userToken = token.trim())
            updated = true
            Log.i(TAG, "Updated user_token: $token")
        }

        if (updated) {
            AgentConfig.save(context, config)
            Log.i(TAG, "Configuration saved successfully")

            // 重启 AgentService 以应用新配置
            try {
                val serviceIntent = Intent(context, com.appmanager.agent.service.AgentService::class.java)
                context.stopService(serviceIntent)
                context.startService(serviceIntent)
                Log.i(TAG, "AgentService restarted")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restart AgentService", e)
            }
        } else {
            Log.w(TAG, "No valid configuration parameters found in broadcast")
        }
    }
}
