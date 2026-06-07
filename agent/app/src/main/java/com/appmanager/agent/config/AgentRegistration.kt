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
}
