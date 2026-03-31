package com.appmanager.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import com.appmanager.agent.service.AgentService

/**
 * [PackageInstaller.Session.commit] 的回调：将安装结果经 WebSocket 上报为 install_task_result。
 */
class InstallStatusReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val commandId = intent.getStringExtra(EXTRA_COMMAND_ID) ?: return
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
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
                    AgentService.sendInstallTaskResult(
                        commandId,
                        false,
                        "",
                        e.message ?: "无法打开安装确认界面"
                    )
                }
            } else {
                AgentService.sendInstallTaskResult(commandId, false, "", "需要用户确认安装")
            }
            return
        }
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""
        val success = status == PackageInstaller.STATUS_SUCCESS
        val err = if (success) "" else (message.ifEmpty { statusToBrief(status) })
        Log.i(TAG, "install result commandId=$commandId success=$success status=$status msg=$message")
        AgentService.sendInstallTaskResult(commandId, success, message, err)
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

    companion object {
        private const val TAG = "InstallStatusReceiver"
        const val EXTRA_COMMAND_ID = "install_command_id"
    }
}
