package com.appmanager.agent.config

import android.content.Context

data class AgentConfig(
    val serverUrl: String = "",
    val deviceToken: String = "",
    val screenFps: Int = 10,
    val screenQuality: Int = 60,
    val deviceAlias: String = "",
    val groupName: String = "",
    val autoScreenCapture: Boolean = false,
    val autoAcceptScreenCapture: Boolean = false,
    /** Web 打开「屏幕查看」前须在端上勾选，否则拒绝 start_screen */
    val allowRemoteScreen: Boolean = false,
    /** Web 经 Agent 拉取设备文件（无 ADB） */
    val allowRemoteFilePull: Boolean = false
) {
    companion object {
        private const val PREFS_NAME = "agent_config"

        fun get(context: Context): AgentConfig {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return AgentConfig(
                serverUrl = prefs.getString("server_url", "") ?: "",
                deviceToken = prefs.getString("device_token", "") ?: "",
                screenFps = prefs.getInt("screen_fps", 10),
                screenQuality = prefs.getInt("screen_quality", 60),
                deviceAlias = prefs.getString("device_alias", "") ?: "",
                groupName = prefs.getString("group_name", "") ?: "",
                autoScreenCapture = prefs.getBoolean("auto_screen_capture", false),
                autoAcceptScreenCapture = prefs.getBoolean("auto_accept_screen_capture", false),
                allowRemoteScreen = prefs.getBoolean("allow_remote_screen", false),
                allowRemoteFilePull = prefs.getBoolean("allow_remote_file_pull", false)
            )
        }

        fun save(context: Context, config: AgentConfig) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().apply {
                putString("server_url", config.serverUrl)
                putString("device_token", config.deviceToken)
                putInt("screen_fps", config.screenFps)
                putInt("screen_quality", config.screenQuality)
                putString("device_alias", config.deviceAlias)
                putString("group_name", config.groupName)
                putBoolean("auto_screen_capture", config.autoScreenCapture)
                putBoolean("auto_accept_screen_capture", config.autoAcceptScreenCapture)
                putBoolean("allow_remote_screen", config.allowRemoteScreen)
                putBoolean("allow_remote_file_pull", config.allowRemoteFilePull)
                apply()
            }
        }
    }
}
