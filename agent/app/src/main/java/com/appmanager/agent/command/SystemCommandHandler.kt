package com.appmanager.agent.command

import android.os.Build
import android.util.Log
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.DeviceInfoUtil
import com.appmanager.agent.util.KeyboardInputHelper
import com.appmanager.agent.ws.Message

object SystemCommandHandler {

    private const val TAG = "SystemCommandHandler"

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
            Storage: ${storageInfo.usedMB}MB / ${storageInfo.totalMB}MB
        """.trimIndent()
        CommandDispatcher.sendResult(service, msg.commandId, true, info)
    }

    fun keyboardInput(msg: Message, service: AgentService) {
        val data = msg.data as? Map<*, *>
        if (data == null) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "missing data")
            return
        }

        val inputMethod = (data["input_method"] as? String)?.trim() ?: "text"
        val text = (data["text"] as? String) ?: ""
        val keysRaw = data["keys"] as? List<*>
        val keys = keysRaw?.mapNotNull { it?.toString()?.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
        val delayMs = (data["delay_ms"] as? Number)?.toLong() ?: 50L
        val targetApp = (data["target_app"] as? String)?.trim()

        try {
            // 验证前台应用（如果指定）
            if (!targetApp.isNullOrEmpty()) {
                val currentApp = KeyboardInputHelper.getCurrentForegroundApp(service)
                if (currentApp != targetApp) {
                    CommandDispatcher.sendResult(
                        service, msg.commandId, false,
                        "Target app mismatch: current=$currentApp, expected=$targetApp"
                    )
                    return
                }
            }

            // 调用 KeyboardInputHelper 模拟输入
            val success = when (inputMethod) {
                "text" -> {
                    KeyboardInputHelper.inputText(service, text, delayMs)
                }
                "keys" -> {
                    KeyboardInputHelper.inputKeys(service, keys, delayMs)
                }
                "mixed" -> {
                    KeyboardInputHelper.inputText(service, text, delayMs) &&
                    KeyboardInputHelper.inputKeys(service, keys, delayMs)
                }
                else -> false
            }

            if (success) {
                CommandDispatcher.sendResult(service, msg.commandId, true, "Input completed")
            } else {
                CommandDispatcher.sendResult(service, msg.commandId, false, "Input failed or accessibility service not enabled")
            }
        } catch (e: Exception) {
            Log.e(TAG, "keyboardInput failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "Unknown error")
        }
    }
}
