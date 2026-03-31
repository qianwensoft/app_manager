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
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(this).createInitializationOptions()
        )

        // 有配置则自动启动 Service
        if (AgentConfig.get(this).serverUrl.isNotEmpty()) {
            val intent = Intent(this, AgentService::class.java)
            startForegroundService(intent)
        }
    }

    companion object {
        lateinit var instance: App
            private set
    }
}
