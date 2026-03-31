package com.appmanager.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.AgentService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            if (AgentConfig.get(context).serverUrl.isNotEmpty()) {
                val serviceIntent = Intent(context, AgentService::class.java)
                context.startForegroundService(serviceIntent)
            }
        }
    }
}
