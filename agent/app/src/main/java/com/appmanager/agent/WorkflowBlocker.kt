package com.appmanager.agent

import android.util.Log

/**
 * 工作流阻塞器：form-app 独占扫码模式下，阻止 agent 上报 device_event。
 *
 * 每个 form-app 独立引用计数（formCode → count），只有当"当前有 exclusive form-app
 * 真正处于前台（current / 获得输入焦点）"时才阻塞——即：
 *   - form-app 的 config 指定独占模式（exclusive_scan_mode = true）
 *   - 该 form-app 处于 onResume（前台）生命周期
 *   - 一旦其它 Activity 覆盖、按 Home 键、CameraActivity 弹出等任何导致 onPause 的场景
 *     立即 unblock，避免失焦状态下事件被错误吞掉
 *   - onStop / onDestroy 再次 forceUnblock 作为兜底
 *
 * EventReporter.report() 在发事件前查此处状态，阻塞时直接丢弃。
 *
 * 纯本地状态，无 WS 通信，服务端无需维护 block 状态。
 */
object WorkflowBlocker {
    private const val TAG = "WorkflowBlocker"

    /** formCode → 阻塞计数（0 = 该 form-app 不阻塞）。非 exclusive 的 form-app 不会调用 block()。 */
    private val blockedCounts = mutableMapOf<String, Int>()

    /**
     * 当前是否有任意 exclusive form-app 处于前台（onResume）。
     * EventReporter.report() 查询此值决定是否丢弃事件。
     */
    @Volatile
    private var anyBlocked: Boolean = false

    /**
     * 请求阻塞：exclusive form-app 进入前台（onResume / 获得输入焦点）时调用。
     * 可重入（同一 formCode 多次调用），由对应 unblock() 调用次数平衡。
     *
     * @param formCode 发起阻塞的 form-app 代码
     */
    fun block(formCode: String) {
        val prev = anyBlocked
        synchronized(blockedCounts) {
            val cnt = (blockedCounts[formCode] ?: 0) + 1
            blockedCounts[formCode] = cnt
            anyBlocked = blockedCounts.values.any { it > 0 }
        }
        Log.i(TAG, "block(code=$formCode, anyBlocked=$anyBlocked, was=$prev)")
    }

    /**
     * 取消阻塞：exclusive form-app 失去前台焦点（onPause）时调用。
     * 平衡对应 block() 的次数；也可由 onStop / onDestroy 通过 [forceUnblock] 兜底。
     *
     * @param formCode 对应 block() 时的 formCode
     */
    fun unblock(formCode: String) {
        val prev = anyBlocked
        synchronized(blockedCounts) {
            val cnt = (blockedCounts[formCode] ?: 0) - 1
            if (cnt <= 0) {
                blockedCounts.remove(formCode)
            } else {
                blockedCounts[formCode] = cnt
            }
            anyBlocked = blockedCounts.values.any { it > 0 }
        }
        Log.i(TAG, "unblock(code=$formCode, anyBlocked=$anyBlocked, was=$prev)")
    }

    /**
     * 安全强制解除阻塞（onDestroy 兜底）。
     * 与 onStop 的 unblock 互斥：仅当该 formCode 仍有计数时才会真正解除。
     */
    fun forceUnblock(formCode: String) {
        synchronized(blockedCounts) {
            if (!blockedCounts.containsKey(formCode)) {
                Log.i(TAG, "forceUnblock(code=$formCode): already not blocked, skip")
                return
            }
            blockedCounts.remove(formCode)
            anyBlocked = blockedCounts.values.any { it > 0 }
        }
        Log.i(TAG, "forceUnblock(code=$formCode, anyBlocked=$anyBlocked)")
    }

    /**
     * 当前是否有任意 exclusive form-app 可见。
     * EventReporter.report() 查询此值决定是否丢弃事件。
     */
    fun isBlocked(): Boolean = anyBlocked

    /**
     * 重置（AgentService 销毁时调用）。
     */
    fun reset() {
        synchronized(blockedCounts) {
            blockedCounts.clear()
            anyBlocked = false
        }
        Log.i(TAG, "reset")
    }
}
