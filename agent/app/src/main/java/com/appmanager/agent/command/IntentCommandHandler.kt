package com.appmanager.agent.command

import android.content.Intent
import android.net.Uri
import android.util.Log
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ui.InAppWebActivity
import com.appmanager.agent.ws.Message

/**
 * 出站连接器反推设备：打开网页、发送广播 Intent（extras 均为字符串值）。
 */
object IntentCommandHandler {

    private const val TAG = "IntentCommandHandler"

    fun broadcastIntent(msg: Message, service: AgentService) {
        val data = msg.data as? Map<*, *> ?: run {
            CommandDispatcher.sendResult(service, msg.commandId, false, "missing data")
            return
        }
        val action = (data["action"] as? String)?.trim().orEmpty()
        if (action.isEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "missing action")
            return
        }
        val intent = Intent(action)
        val pkg = (data["package"] as? String)?.trim().orEmpty()
        if (pkg.isNotEmpty()) {
            intent.setPackage(pkg)
        }
        @Suppress("UNCHECKED_CAST")
        val extras = data["extras"] as? Map<String, *>
        extras?.forEach { (k, v) ->
            val key = k?.toString()?.trim().orEmpty()
            if (key.isEmpty()) return@forEach
            when (v) {
                is String -> intent.putExtra(key, v)
                is Number -> intent.putExtra(key, v.toLong())
                is Boolean -> intent.putExtra(key, v)
                else -> intent.putExtra(key, v?.toString().orEmpty())
            }
        }
        try {
            val ctx = service.applicationContext
            ctx.sendBroadcast(intent)
            Log.i(TAG, "broadcast action=$action")
            CommandDispatcher.sendResult(service, msg.commandId, true, "broadcast sent")
        } catch (e: Exception) {
            Log.e(TAG, "broadcast failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "broadcast failed")
        }
    }

    fun openUrl(msg: Message, service: AgentService) {
        val data = msg.data as? Map<*, *>
        val url = (data?.get("url") as? String)?.trim().orEmpty()
        if (url.isEmpty()) {
            CommandDispatcher.sendResult(service, msg.commandId, false, "missing url")
            return
        }
        try {
            val embedded = when (val v = data?.get("embedded")) {
                is Boolean -> v
                is String -> v.equals("true", ignoreCase = true) || v == "1"
                is Number -> v.toInt() != 0
                else -> false
            }
            if (embedded) {
                val i = Intent(service, InAppWebActivity::class.java)
                    .putExtra(InAppWebActivity.EXTRA_URL, url)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                service.startActivity(i)
                Log.i(TAG, "open_url embedded WebView $url")
            } else {
                val i = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                service.startActivity(i)
                Log.i(TAG, "open_url external $url")
            }
            CommandDispatcher.sendResult(service, msg.commandId, true, "opened")
        } catch (e: Exception) {
            Log.e(TAG, "open_url failed", e)
            CommandDispatcher.sendResult(service, msg.commandId, false, e.message ?: "open_url failed")
        }
    }
}
