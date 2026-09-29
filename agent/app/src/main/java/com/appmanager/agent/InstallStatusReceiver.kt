package com.appmanager.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import com.appmanager.agent.command.AppCommandHandler
import com.appmanager.agent.service.AgentService
import java.io.File

/**
 * [PackageInstaller.Session.commit] 的回调：将安装结果经 WebSocket 上报为 install_task_result。
 *
 * 静默安装路径（Device Owner 走 [PackageInstaller] Session，无系统安装弹窗）也会复用本 Receiver。
 * 若静默安装被系统拒绝（策略拦截/用户中止等），在 APK 文件仍可访问时回退到系统安装界面，
 * 保证安装任务对前端始终有最终结果。
 */
class InstallStatusReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val commandId = intent.getStringExtra(EXTRA_COMMAND_ID) ?: return
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val silent = intent.getBooleanExtra(EXTRA_SILENT, false)
        val apkPath = intent.getStringExtra(EXTRA_APK_PATH)

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirm: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_INTENT)
            }
            if (confirm != null) {
                try {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.applicationContext.startActivity(confirm)
                } catch (e: Exception) {
                    Log.e(TAG, "confirm install UI", e)
                    deleteApk(apkPath)
                    AgentService.sendInstallTaskResult(
                        commandId,
                        false,
                        "",
                        e.message ?: "无法打开安装确认界面"
                    )
                }
            } else {
                deleteApk(apkPath)
                AgentService.sendInstallTaskResult(commandId, false, "", "需要用户确认安装")
            }
            return
        }

        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""
        val success = status == PackageInstaller.STATUS_SUCCESS

        if (success) {
            deleteApk(apkPath)
            val label = if (silent) "MDM 静默安装成功" else "安装成功"
            Log.i(TAG, "install result commandId=$commandId success status=$status silent=$silent msg=$message")
            AgentService.sendInstallTaskResult(commandId, true, label, "")
            return
        }

        // 静默安装被系统拒绝时，APK 本身大概率没问题（策略/来源/用户中止等），回退到系统安装界面
        val apkFile = apkPath?.let { File(it) }?.takeIf { it.isFile && it.length() > 0 }
        if (silent && apkFile != null && shouldFallbackToUi(status)) {
            Log.w(TAG, "silent install rejected (status=$status msg=$message), fallback to system installer")
            AgentService.sendInstallTaskProgress(
                commandId, "opening", 0,
                "静默安装被拒绝（${statusToBrief(status)}），回退系统安装界面"
            )
            val err = AppCommandHandler.openSystemInstallUi(context.applicationContext, apkFile)
            if (err == null) {
                AgentService.sendInstallTaskResult(
                    commandId, true,
                    "已回退到系统安装界面，请手动确认",
                    ""
                )
            } else {
                deleteApk(apkPath)
                AgentService.sendInstallTaskResult(commandId, false, "", err)
            }
            return
        }

        deleteApk(apkPath)
        val err = message.ifEmpty { statusToBrief(status) }
        Log.i(TAG, "install result commandId=$commandId failed status=$status silent=$silent msg=$message")
        AgentService.sendInstallTaskResult(commandId, false, message, err)
    }

    /** 静默安装被拒后是否值得回退到系统安装界面（APK 本身没问题，只是安装器拒绝了）。 */
    private fun shouldFallbackToUi(status: Int): Boolean = when (status) {
        PackageInstaller.STATUS_FAILURE_BLOCKED,  // 安装被策略/来源拦截
        PackageInstaller.STATUS_FAILURE_ABORTED,  // 系统中止
        PackageInstaller.STATUS_FAILURE -> true   // 通用失败（-1），原因不明
        else -> false
    }

    private fun statusToBrief(status: Int): String = when (status) {
        PackageInstaller.STATUS_FAILURE_ABORTED -> "用户取消安装"
        PackageInstaller.STATUS_FAILURE_BLOCKED -> "安装被阻止"
        PackageInstaller.STATUS_FAILURE_CONFLICT -> "与已安装应用冲突"
        PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "与设备不兼容"
        PackageInstaller.STATUS_FAILURE_INVALID -> "安装包无效"
        PackageInstaller.STATUS_FAILURE_STORAGE -> "存储空间不足"
        else -> "安装失败 ($status)"
    }

    private fun deleteApk(path: String?) {
        if (path.isNullOrEmpty()) return
        try {
            val f = File(path)
            if (f.exists()) f.delete()
        } catch (e: Exception) {
            Log.w(TAG, "deleteApk failed path=$path", e)
        }
    }

    companion object {
        private const val TAG = "InstallStatusReceiver"
        const val EXTRA_COMMAND_ID = "install_command_id"
        /** 临时 APK 路径：用于静默安装失败时回退到系统安装界面；安装成功后清理。 */
        const val EXTRA_APK_PATH = "install_apk_path"
        /** true 表示本任务为 MDM 静默安装（[PackageInstaller] Session）。 */
        const val EXTRA_SILENT = "install_silent"
        /** 显式 Action：避免 Android 14+ 隐式广播限制；与 manifest 显式 component 配合。 */
        const val ACTION_INSTALL_RESULT = "com.appmanager.agent.INSTALL_RESULT"
    }
}
