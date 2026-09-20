package com.appmanager.agent

import android.util.Log
import com.appmanager.agent.service.AgentService
import com.google.gson.JsonObject

/**
 * 工作流阻塞器：form-app 独占扫码模式下，通知服务器阻塞/恢复工作流触发。
 *
 * 当 form-app 配置为独占模式（scan_config_json.mode = "exclusive"）时，
 * 在 form-app 进入前台时调用 block()，退出时调用 unblock()。
 *
 * 服务器端通过 device_event 和 outbound connector 的工作流触发会检查此状态，
 * 被阻塞的设备不会触发任何工作流或出站连接器。
 *
 * 设计要点：
 * - 服务器侧 [workflow.SetWorkflowBlocked] 自身幂等（设 true 多次与设一次等价；设 false 多次与 delete 等价），
 *   因此本地无需"上次已发送态"防抖，每次 block()/unblock() 都直接发送最新期望值。
 * - 若 WebSocket 暂时不可用（连接中/已关闭/队列满），记入 [pendingDesired]，
 *   由 [AgentService] 在 WS 重连后的 [flushIfNeeded] 中补发，确保服务器侧最终一致。
 * - 关键修复：早期版本假定 [AgentWebSocket.send] 总是成功，WS 短暂断开时会把
 *   pendingDesired 错误清空，导致退出菜单后服务器仍处于阻塞态。
 */
object WorkflowBlocker {
    private const val TAG = "WorkflowBlocker"

    /** 调用方期望的最终状态：true=阻塞，false=不阻塞 */
    @Volatile
    private var desiredBlocked: Boolean = false

    /** 上一次发送是否失败（WS 不可用等），失败时需要在重连后补发 */
    @Volatile
    private var pendingDesired: Boolean = false

    /**
     * 阻塞工作流：通知服务器该设备的工作流触发被阻塞。
     */
    fun block() {
        desiredBlocked = true
        sendBlockState(true)
        Log.i(TAG, "block requested, desired=true")
    }

    /**
     * 取消阻塞：通知服务器恢复该设备的工作流触发。
     * 无论本地是否已经标记为不阻塞，都会再次尝试发送，确保服务器侧最终一致。
     */
    fun unblock() {
        desiredBlocked = false
        sendBlockState(false)
        Log.i(TAG, "unblock requested, desired=false")
    }

    /**
     * 当前本地期望状态（与服务器端可能短暂不一致）
     */
    fun isBlocked(): Boolean = desiredBlocked

    /**
     * 强制重置状态（AgentService 销毁时调用）。
     * 会尝试向服务器发送 unblock，确保释放阻塞。
     */
    fun reset() {
        desiredBlocked = false
        sendBlockState(false)
    }

    /**
     * 通过 AgentService 的 WebSocket 发送阻塞状态到服务器。
     * 发送失败时（WS 未连接/已关闭/异常）会置 pendingDesired=true，
     * 下次 [flushIfNeeded] 成功调用时会一并补发。
     */
    private fun sendBlockState(blocked: Boolean) {
        val ws = AgentService.sharedWebSocket
        if (ws == null) {
            Log.w(TAG, "WebSocket not available, will retry on reconnect (target=$blocked)")
            pendingDesired = true
            return
        }
        try {
            val msg = JsonObject().apply {
                addProperty("type", "set_workflow_blocked")
                addProperty("blocked", blocked)
            }
            val ok = ws.send(msg)
            if (ok) {
                pendingDesired = false
                Log.d(TAG, "Sent set_workflow_blocked blocked=$blocked")
            } else {
                // WS 已关闭 / 队列满：等下一次 onConnected 时由 flushIfNeeded 补发
                pendingDesired = true
                Log.w(TAG, "Send returned false (ws disconnected/closing?), will retry on reconnect (target=$blocked)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send block state", e)
            pendingDesired = true
        }
    }

    /**
     * 补发：WS 重新可用后调用，把期望态同步到服务器。
     * 由调用方（如 AgentService 在 onConnected 时）触发。
     */
    fun flushIfNeeded() {
        if (!pendingDesired) return
        Log.i(TAG, "flushIfNeeded desired=$desiredBlocked")
        sendBlockState(desiredBlocked)
    }
}
