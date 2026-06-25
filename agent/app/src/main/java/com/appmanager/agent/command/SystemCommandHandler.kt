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
            // 前置校验：无障碍服务未启用时键盘输入无法工作，直接给出可操作的报错
            if (!com.appmanager.agent.service.TouchAccessibilityService.isReady()) {
                CommandDispatcher.sendResult(
                    service, msg.commandId, false,
                    "无障碍服务未启用：请在「设置→无障碍」中开启本应用的无障碍服务后重试"
                )
                return
            }

            // 校验输入内容非空，避免空指令静默“成功”却无任何输出
            val nothingToType = when (inputMethod) {
                "text" -> text.isEmpty()
                "keys" -> keys.isEmpty()
                "mixed" -> text.isEmpty() && keys.isEmpty()
                else -> true
            }
            if (nothingToType) {
                CommandDispatcher.sendResult(
                    service, msg.commandId, false,
                    if (inputMethod !in setOf("text", "keys", "mixed")) "不支持的输入方式: $inputMethod"
                    else "没有可输入的内容（text/keys 均为空）"
                )
                return
            }

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
                CommandDispatcher.sendResult(service, msg.commandId, false, "输入失败：未找到可编辑的焦点输入框（请先点选目标输入框）")
            }
        } catch (e: Exception) {
            Log.e(TAG, "keyboardInput failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "Unknown error")
        }
    }
}
