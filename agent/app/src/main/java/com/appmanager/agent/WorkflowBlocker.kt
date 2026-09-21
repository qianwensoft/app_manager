package com.appmanager.agent

import android.util.Log

/**
 * 工作流阻塞器：form-app 独占扫码模式下，阻止 agent 上报 device_event。
 *
 * 当 form-app 配置为独占模式（scan_config_json.mode = "exclusive"）时，
 * 在 form-app 进入前台时调用 block()，退出时调用 unblock()。
 * EventReporter.report() 在发事件前查此处状态，阻塞时直接丢弃。
 *
 * 纯本地状态，无 WS 通信，服务端无需维护 block 状态——
 * agent 不发 event 本身即等价于阻塞，无需跨进程同步。
 */
object WorkflowBlocker {
    private const val TAG = "WorkflowBlocker"

    /** true = 阻塞（form-app 独占扫码中），false = 正常 */
    @Volatile
    private var blocked: Boolean = false

    /**
     * 阻塞：独占扫码开始，停止上报 device_event。
     */
    fun block() {
        blocked = true
        Log.i(TAG, "blocked=true (exclusive scan started)")
    }

    /**
     * 取消阻塞：独占扫码结束，恢复上报 device_event。
     */
    fun unblock() {
        blocked = false
        Log.i(TAG, "blocked=false (exclusive scan ended)")
    }

    /**
     * 当前本地阻塞状态。
     */
    fun isBlocked(): Boolean = blocked

    /**
     * 重置（AgentService 销毁时调用）。
     */
    fun reset() {
        blocked = false
    }
}
