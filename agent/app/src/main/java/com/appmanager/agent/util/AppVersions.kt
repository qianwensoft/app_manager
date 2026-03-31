package com.appmanager.agent.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/** 与 manifest versionName / versionCode 一致，供界面与上报使用 */
object AppVersions {

    @Suppress("DEPRECATION")
    private fun packageInfo(ctx: Context) =
        ctx.packageManager.getPackageInfo(ctx.packageName, 0)

    fun versionName(context: Context): String =
        packageInfo(context).versionName ?: "?"

    fun versionCodeLong(context: Context): Long {
        val pi = packageInfo(context)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            pi.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            pi.versionCode.toLong()
        }
    }

    /** 展示用，例如 1.0.1 (2) */
    fun displayLabel(context: Context): String =
        "${versionName(context)} (${versionCodeLong(context)})"
}
