package com.appmanager.agent.x5

import android.content.Context
import android.content.SharedPreferences

/**
 * X5 内核偏好设置
 */
object X5Preferences {
    private const val PREF_NAME = "x5_preferences"
    private const val KEY_ENABLED = "x5_enabled"
    private const val KEY_AUTO_UPDATE = "x5_auto_update"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    /**
     * 用户是否启用 X5 内核（默认 true）
     */
    fun isX5Enabled(context: Context): Boolean {
        return getPrefs(context).getBoolean(KEY_ENABLED, true)
    }

    fun setX5Enabled(context: Context, enabled: Boolean) {
        getPrefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    /**
     * 是否自动检查更新（默认 true）
     */
    fun isAutoUpdateEnabled(context: Context): Boolean {
        return getPrefs(context).getBoolean(KEY_AUTO_UPDATE, true)
    }

    fun setAutoUpdateEnabled(context: Context, enabled: Boolean) {
        getPrefs(context).edit().putBoolean(KEY_AUTO_UPDATE, enabled).apply()
    }
}
