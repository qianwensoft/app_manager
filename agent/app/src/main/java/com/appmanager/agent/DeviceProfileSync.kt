package com.appmanager.agent

import android.content.Context
import android.content.Intent
import android.util.Log
import com.appmanager.agent.config.AgentConfig

object DeviceProfileSync {
    private const val TAG = "DeviceProfileSync"

    /** 与 MainActivity 注册的 BroadcastReceiver 一致 */
    const val ACTION_UI_REFRESH = "com.appmanager.agent.ACTION_PROFILE_SYNC_UI"

    fun applyFromServer(context: Context, data: Map<*, *>) {
        val alias = data["device_alias"] as? String ?: return
        val group = data["group_name"] as? String ?: return
        val ctx = context.applicationContext
        val cur = AgentConfig.get(ctx)
        val next = cur.copy(deviceAlias = alias, groupName = group)
        AgentConfig.save(ctx, next)
        Log.i(TAG, "synced from server alias=${alias.length}chars group=${group.length}chars")
        ctx.sendBroadcast(
            Intent(ACTION_UI_REFRESH).setPackage(ctx.packageName)
        )
    }
}
