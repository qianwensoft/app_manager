package com.appmanager.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.appmanager.agent.config.AgentRegistration
import com.appmanager.agent.service.AgentService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val config = AgentRegistration.ensureMachineCodeConfig(context)
            if (config.serverUrl.isNotEmpty() && config.deviceToken.isNotEmpty()) {
                val serviceIntent = Intent(context, AgentService::class.java)
                context.startForegroundService(serviceIntent)
            }
        }
    }
}
