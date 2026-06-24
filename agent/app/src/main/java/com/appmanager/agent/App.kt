package com.appmanager.agent

import android.app.Application
import android.content.Intent
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.AgentService
import org.webrtc.PeerConnectionFactory

class App : Application() {

    override fun onCreate() {
        super.onCreate()
        instance = this

        // WebRTC 要求进程内只初始化一次，重复调用易 native 闪退
        try {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(this).createInitializationOptions()
            )
        } catch (e: Exception) {
            android.util.Log.e("App", "WebRTC initialization failed", e)
            // WebRTC 初始化失败不影响其他功能继续运行
        }

        // 有配置则自动启动 Service
        try {
            if (AgentConfig.get(this).serverUrl.isNotEmpty()) {
                val intent = Intent(this, AgentService::class.java)
                startForegroundService(intent)
            }
        } catch (e: Exception) {
            android.util.Log.e("App", "Failed to start AgentService", e)
        }
    }

    companion object {
        lateinit var instance: App
            private set
    }
}
