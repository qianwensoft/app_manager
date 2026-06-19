package com.appmanager.agent.config

import android.content.Context
import com.appmanager.agent.util.DeviceMachineId

/**
 * 启动时将本机机器码写入 [AgentConfig.deviceToken]，供服务端自动注册与 WebSocket 连接。
 */
object AgentRegistration {

    fun ensureMachineCodeConfig(context: Context): AgentConfig {
        val cur = AgentConfig.get(context)
        val code = DeviceMachineId.get(context)
        if (code.isEmpty()) return cur
        if (cur.deviceToken == code) return cur
        val next = cur.copy(deviceToken = code)
        AgentConfig.save(context, next)
        return next
    }

    /**
     * 写入服务器地址完成注册配置（扫码与电视反向注册共用）。
     * deviceToken 优先用本机机器码，机器码不可用时回退入参 fallbackToken。
     * 返回保存后的配置，调用方据此启动 [com.appmanager.agent.service.AgentService]。
     */
    fun applyServerConfig(
        context: Context,
        serverUrl: String,
        fallbackToken: String = "",
        formAppBaseUrl: String = "",
    ): AgentConfig {
        val cur = AgentConfig.get(context)
        val code = DeviceMachineId.get(context)
        val token = if (code.isNotEmpty()) code else fallbackToken.trim()
        val next = cur.copy(
            serverUrl = serverUrl.trim(),
            deviceToken = token,
            formAppBaseUrl = formAppBaseUrl.trim(),
        )
        AgentConfig.save(context, next)
        return next
    }
}
