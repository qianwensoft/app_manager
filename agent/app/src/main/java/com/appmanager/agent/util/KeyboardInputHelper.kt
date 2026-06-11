package com.appmanager.agent.util

import android.accessibilityservice.AccessibilityService
import android.app.usage.UsageStatsManager
import android.content.ClipData
import android.content.ClipboardManager
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

            // 长文本使用剪贴板粘贴（快速但会修改剪贴板）
            if (delayMs == 0L || text.length > 50) {
                pasteText(service, accessibilityService, text)
            } else {
                // 短文本逐字符模拟输入（适用于需要精确控制的场景）
                inputTextCharByChar(accessibilityService, text, delayMs)
            }
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
     * 使用剪贴板粘贴文本（快速方式）
     */
    private fun pasteText(context: Context, service: AccessibilityService, text: String): Boolean {
        return try {
            // 保存原始剪贴板内容
            val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            if (clipboardManager == null) {
                Log.w(TAG, "ClipboardManager not available")
                return false
            }

            val originalClip = clipboardManager.primaryClip

            // 设置新内容到剪贴板
            val clip = ClipData.newPlainText("keyboard_input", text)
            clipboardManager.setPrimaryClip(clip)

            // 查找焦点输入框并设置文本
            val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

            val result = if (focusedNode != null) {
                // 方式1：直接设置文本（推荐）
                val args = Bundle()
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            } else {
                // 方式2：全局粘贴动作（作为备用）
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_ACCESSIBILITY_ALL_APPS)
                    false
                } else {
                    false
                }
            }

            // 尝试恢复原始剪贴板内容（可选，避免影响用户）
            try {
                if (originalClip != null) {
                    clipboardManager.setPrimaryClip(originalClip)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to restore clipboard", e)
            }

            result
        } catch (e: Exception) {
            Log.e(TAG, "pasteText failed", e)
            false
        }
    }

    /**
     * 逐字符输入文本
     */
    private fun inputTextCharByChar(service: AccessibilityService, text: String, delayMs: Long): Boolean {
        return try {
            val focusedNode = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focusedNode == null) {
                Log.w(TAG, "No focused input node found")
                return false
            }

            runBlocking {
                text.forEach { char ->
                    val currentText = focusedNode.text?.toString() ?: ""
                    val args = Bundle()
                    args.putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        currentText + char
                    )
                    if (!focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                        Log.w(TAG, "Failed to input character: $char")
                        return@runBlocking false
                    }
                    if (delayMs > 0) {
                        delay(delayMs)
                    }
                }
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "inputTextCharByChar failed", e)
            false
        }
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
