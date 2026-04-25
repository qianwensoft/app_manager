package com.appmanager.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import androidx.core.content.ContextCompat
import com.appmanager.agent.ui.ScadaWebViewActivity

/**
 * 动态广播接收器，响应菜单项的自定义 intent_action。
 *
 * 每次菜单同步后通过 [reregister] 刷新已注册的 action 列表。
 * 收到广播时按 action 从 AgentMenuStore 找到对应 preview_url 并打开 ScadaWebViewActivity。
 */
object MenuIntentReceiver {

    private const val TAG = "MenuIntentReceiver"

    private var receiver: BroadcastReceiver? = null

    /**
     * 重新注册所有菜单 intent_action 的广播监听。
     * 先注销旧实例再重建，确保 action 列表始终与当前菜单一致。
     */
    fun reregister(context: Context) {
        val appCtx = context.applicationContext
        unregister(appCtx)

        val actions = AgentMenuStore.getAllIntentActions(appCtx)
        if (actions.isEmpty()) {
            Log.d(TAG, "no menu intent_actions to register")
            return
        }

        val filter = IntentFilter()
        actions.forEach { filter.addAction(it) }

        val r = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val action = intent.action ?: return
                val url = AgentMenuStore.getPreviewUrlByIntent(ctx, action) ?: return
                val extra = intent.getStringExtra("extra_params")
                val finalUrl = if (!extra.isNullOrBlank()) {
                    if (url.contains("?")) "$url&$extra" else "$url?$extra"
                } else url
                Log.i(TAG, "menu intent received action=$action -> $finalUrl")
                ctx.startActivity(
                    Intent(ctx, ScadaWebViewActivity::class.java)
                        .putExtra(ScadaWebViewActivity.EXTRA_URL, finalUrl)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
        }

        ContextCompat.registerReceiver(appCtx, r, filter, ContextCompat.RECEIVER_EXPORTED)
        receiver = r
        Log.i(TAG, "registered menu intent_actions: $actions")
    }

    fun unregister(context: Context) {
        receiver?.let {
            try { context.applicationContext.unregisterReceiver(it) } catch (_: Exception) {}
            receiver = null
        }
    }
}
