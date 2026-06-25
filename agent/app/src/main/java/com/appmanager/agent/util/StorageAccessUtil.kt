package com.appmanager.agent.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.widget.Toast

object StorageAccessUtil {

    fun isAllFilesAccessGranted(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            true
        }
    }

    /** 打开「管理所有文件」授权页；工业机/定制 ROM 会依次尝试多种 Intent。 */
    fun openManageAllFilesSettings(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Toast.makeText(context, "当前系统版本无需此权限", Toast.LENGTH_SHORT).show()
            return
        }
        val pkg = context.packageName
        val candidates = listOf(
            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.parse("package:$pkg")
            },
            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.fromParts("package", pkg, null)
            },
            Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$pkg")
            }
        )
        for (intent in candidates) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                Toast.makeText(
                    context,
                    "请在列表中找到本应用并开启「允许管理所有文件」",
                    Toast.LENGTH_LONG
                ).show()
                return
            } catch (_: Exception) {
            }
        }
        Toast.makeText(
            context,
            "无法打开授权页。可尝试：设置 → 应用 → AppManager Agent → 权限 → 文件 → 允许管理所有文件；或由管理员执行：adb shell appops set $pkg MANAGE_EXTERNAL_STORAGE allow",
            Toast.LENGTH_LONG
        ).show()
    }
}
