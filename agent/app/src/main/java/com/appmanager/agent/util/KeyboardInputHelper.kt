package com.appmanager.agent.util

import android.accessibilityservice.AccessibilityService
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.service.TouchAccessibilityService
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

/**
 * 键盘输入辅助工具类
 *
 * 基于 AccessibilityService 实现键盘输入模拟功能，支持：
 * - 文本输入（逐字符或粘贴）
 * - 特殊按键序列（ENTER、TAB、BACK等）
 * - 混合模式（文本 + 按键组合）
 *
 * 注意：需要用户在系统设置中启用 TouchAccessibilityService 的无障碍服务权限
 */
object KeyboardInputHelper {

    private const val TAG = "KeyboardInputHelper"

    /**
     * 输入文本内容
     * @param service AgentService 实例
     * @param text 要输入的文本
     * @param delayMs 字符间延迟（毫秒），0表示无延迟
     * @return 是否成功
     */
    fun inputText(service: AgentService, text: String, delayMs: Long): Boolean {
        if (text.isEmpty()) return true

        return try {
            val accessibilityService = getAccessibilityService() ?: run {
                Log.w(TAG, "AccessibilityService not available")
                return false
            }
            // 统一走一次性 ACTION_SET_TEXT 整串写入：
            // 不产生输入法 composing（组词）区间，因而不会触发联想/候选条与自动纠错替换。
            // delayMs 在整串写入模式下不再用于字符间节奏，仅保留入参兼容。
            setTextAtomically(accessibilityService, text)
        } catch (e: Exception) {
            Log.e(TAG, "inputText failed", e)
            false
        }
    }

    /**
     * 输入特殊按键序列
     * @param service AgentService 实例
     * @param keys 按键名称列表（如 ["ENTER", "TAB", "BACK"]）
     * @param delayMs 按键间延迟（毫秒）
     * @return 是否成功
     */
    fun inputKeys(service: AgentService, keys: List<String>, delayMs: Long): Boolean {
        if (keys.isEmpty()) return true

        return try {
            val accessibilityService = getAccessibilityService() ?: run {
                Log.w(TAG, "AccessibilityService not available")
                return false
            }

            runBlocking {
                keys.forEach { keyName ->
                    if (!performKeyAction(accessibilityService, keyName)) {
                        Log.w(TAG, "Failed to perform key: $keyName")
                        return@runBlocking false
                    }
                    if (delayMs > 0) {
                        delay(delayMs)
                    }
                }
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "inputKeys failed", e)
            false
        }
    }

    /**
     * 获取当前前台应用包名
     */
    fun getCurrentForegroundApp(service: AgentService): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                val usageStatsManager = service.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
                if (usageStatsManager != null) {
                    val currentTime = System.currentTimeMillis()
                    val stats = usageStatsManager.queryUsageStats(
                        UsageStatsManager.INTERVAL_DAILY,
                        currentTime - 60000, // 最近1分钟
                        currentTime
                    )
                    stats?.maxByOrNull { it.lastTimeUsed }?.packageName
                } else {
                    null
                }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "getCurrentForegroundApp failed", e)
            null
        }
    }

    // ─── 私有辅助方法 ───────────────────────────────────────────────────────────

    /**
     * 获取 AccessibilityService 实例
     */
    private fun getAccessibilityService(): AccessibilityService? {
        return TouchAccessibilityService.getInstance()
    }

    /**
     * 一次性把整串文本写入聚焦输入框，并把光标移到末尾。
     *
     * 关闭输入法联想的核心思路：
     *  - 用 ACTION_SET_TEXT 整串替换，而非逐字符 setText。逐字符会让输入法以为用户在敲字，
     *    从而对当前词建立 composing（组词）区间，弹出候选/联想条并可能自动纠错替换文本。
     *  - 写入后用 ACTION_SET_SELECTION 把选区折叠到文本末尾，进一步确保不留下 composing 区间。
     * 在已有内容基础上追加（保留原文），符合“键盘输入”的累加语义。
     */
    private fun setTextAtomically(service: AccessibilityService, text: String): Boolean {
        val node = findEditableFocus(service)
        if (node == null) {
            Log.w(TAG, "setTextAtomically: no editable focused node")
            return false
        }
        val base = node.text?.toString() ?: ""
        val full = base + text
        val setArgs = Bundle()
        setArgs.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, full)
        if (!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, setArgs)) {
            Log.w(TAG, "ACTION_SET_TEXT failed")
            return false
        }
        // 光标移到末尾：折叠选区，清掉可能残留的 composing 区间
        try {
            node.refresh()
            val end = (node.text?.length ?: full.length)
            val selArgs = Bundle()
            selArgs.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, end)
            selArgs.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, end)
            node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, selArgs)
        } catch (e: Exception) {
            Log.w(TAG, "set selection to end failed", e)
        }
        return true
    }

    /**
     * 查找“当前真正聚焦”的可编辑节点。
     *
     * 关键：绝不能退化为“树中第一个可编辑节点”——多输入框场景下第一个往往是上一个框，
     * 会把内容写进错误的输入框（正是本次问题现象）。优先级：
     *  1) 无障碍输入焦点 findFocus(FOCUS_INPUT)，且节点可编辑；
     *  2) 跨窗口在“聚焦窗口”里找 isFocused && isEditable 的节点；
     *  3) 活动窗口树里找 isFocused && isEditable 的节点；
     * 都找不到则返回 null（由上层报“请先点选输入框”），不做任意兜底。
     */
    private fun findEditableFocus(service: AccessibilityService): AccessibilityNodeInfo? {
        // 1) 无障碍输入焦点（最可靠）
        service.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { node ->
            if (node.isEditable) return node
        }
        service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { node ->
            if (node.isEditable) return node
        }

        // 2) 跨窗口：在持有焦点的窗口里找“聚焦且可编辑”的节点
        try {
            for (w in service.windows) {
                if (!w.isFocused) continue
                val root = w.root ?: continue
                findFocusedEditable(root)?.let { return it }
            }
        } catch (e: Exception) {
            Log.w(TAG, "scan windows failed", e)
        }

        // 3) 活动窗口树里找“聚焦且可编辑”的节点
        service.rootInActiveWindow?.let { root ->
            findFocusedEditable(root)?.let { return it }
        }
        return null
    }

    /** 广度优先查找“当前聚焦且可编辑”的节点（isFocused 表示持有视图焦点，即光标所在框）。 */
    private fun findFocusedEditable(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            if (node.isEditable && node.isFocused) return node
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    /**
     * 执行特殊按键操作
     */
    private fun performKeyAction(service: AccessibilityService, keyName: String): Boolean {
        return when (keyName.uppercase()) {
            "ENTER", "RETURN" -> {
                // 查找当前输入框并触发IME动作（通常是回车）
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                focusedNode?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
            }
            "TAB" -> {
                // 移动到下一个焦点
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focusedNode != null) {
                    focusedNode.performAction(AccessibilityNodeInfo.ACTION_NEXT_AT_MOVEMENT_GRANULARITY)
                } else {
                    false
                }
            }
            "BACK", "BACKSPACE" -> {
                // 模拟删除键（删除最后一个字符）
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focusedNode != null) {
                    val currentText = focusedNode.text?.toString() ?: ""
                    if (currentText.isNotEmpty()) {
                        val args = Bundle()
                        args.putCharSequence(
                            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                            currentText.dropLast(1)
                        )
                        focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    } else {
                        // 如果输入框已空，执行系统返回键
                        service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                    }
                } else {
                    service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                }
            }
            "DELETE", "DEL" -> {
                // 删除键（与 BACKSPACE 相同行为）
                performKeyAction(service, "BACKSPACE")
            }
            "HOME" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
            }
            "RECENT", "RECENTS" -> {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
            }
            "CLEAR" -> {
                // 清空当前输入框
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focusedNode != null) {
                    val args = Bundle()
                    args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
                    focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                } else {
                    false
                }
            }
            "SPACE" -> {
                // 输入空格
                val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focusedNode != null) {
                    val currentText = focusedNode.text?.toString() ?: ""
                    val args = Bundle()
                    args.putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        "$currentText "
                    )
                    focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                } else {
                    false
                }
            }
            else -> {
                Log.w(TAG, "Unknown key: $keyName")
                false
            }
        }
    }
}
