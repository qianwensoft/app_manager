package com.appmanager.agent.command

import android.os.Build
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.DeviceInfoUtil
import com.appmanager.agent.ws.Message

object SystemCommandHandler {

    fun reboot(msg: Message, service: AgentService) {
        try {
            Runtime.getRuntime().exec("su -c reboot")
            CommandDispatcher.sendResult(service, msg.commandId, true)
        } catch (e: Exception) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "Requires root")
        }
    }

    fun getInfo(msg: Message, service: AgentService) {
        val memInfo = DeviceInfoUtil.getMemoryInfo(service)
        val storageInfo = DeviceInfoUtil.getStorageInfo()
        val info = """
            Model: ${Build.MODEL}
            Brand: ${Build.BRAND}
            Android: ${Build.VERSION.RELEASE}
            Memory: ${memInfo.used}MB / ${memInfo.total}MB
            Storage: ${storageInfo.used}GB / ${storageInfo.total}GB
        """.trimIndent()
        CommandDispatcher.sendResult(service, msg.commandId, true, info)
    }
}
