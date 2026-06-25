package com.appmanager.agent.tts

import android.content.Context
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * TTS 管理器，实现多引擎 fallback 机制。
 *
 * 策略链顺序：
 * 1. 系统 TTS（优先，音质好、无体积）
 * 2. 讯飞离线 TTS（fallback，中文质量好）— 未来集成
 * 3. 在线 TTS API（备选）— 未来集成
 *
 * 初始化时按顺序尝试各个引擎，第一个成功的引擎会被选中使用。
 */
class TtsManager(private val context: Context) {
    // 策略链：按优先级排列
    private val strategies = listOf<TtsStrategy>(
        SystemTtsStrategy(),
        InstallGuideTtsStrategy()  // 引导用户安装 TTS 引擎
        // 未来添加：XunfeiTtsStrategy(), OnlineTtsStrategy() 等
    )

    @Volatile private var currentStrategy: TtsStrategy? = null
    private val initializing = AtomicBoolean(false)
    private val pendingSpeak = ArrayList<PendingSpeakTask>()

    /**
     * 初始化 TTS 管理器（异步）。
     * 按策略链顺序尝试初始化，第一个成功的引擎会被选中。
     *
     * @param callback 初始化结果回调：true 表示至少有一个引擎可用，false 表示全部失败
     */
    fun initialize(callback: (Boolean) -> Unit) {
        if (currentStrategy != null) {
            callback(true)
            return
        }

        if (!initializing.compareAndSet(false, true)) {
            // 已经在初始化中，等待完成
            Log.d(TAG, "TTS 管理器正在初始化中，请稍候")
            callback(false)
            return
        }

        Log.i(TAG, "开始初始化 TTS 管理器，策略数量: ${strategies.size}")
        tryNextStrategy(0, callback)
    }

    private fun tryNextStrategy(index: Int, callback: (Boolean) -> Unit) {
        if (index >= strategies.size) {
            // 所有策略都失败了
            Log.e(TAG, "所有 TTS 引擎初始化失败")
            initializing.set(false)
            callback(false)
            return
        }

        val strategy = strategies[index]
        Log.d(TAG, "尝试初始化 TTS 引擎: ${strategy.getName()} (${index + 1}/${strategies.size})")

        strategy.initialize(context) { success ->
            if (success) {
                Log.i(TAG, "TTS 引擎 ${strategy.getName()} 初始化成功")
                currentStrategy = strategy
                initializing.set(false)

                // 播报初始化期间累积的待播报文本
                synchronized(pendingSpeak) {
                    if (pendingSpeak.isNotEmpty()) {
                        Log.d(TAG, "播报 ${pendingSpeak.size} 条待播报文本")
                        pendingSpeak.forEachIndexed { idx, task ->
                            // 第一条 flush，其余追加
                            val mode = if (idx == 0) TtsStrategy.QUEUE_FLUSH else TtsStrategy.QUEUE_ADD
                            strategy.speak(task.text, mode)
                        }
                        pendingSpeak.clear()
                    }
                }

                callback(true)
            } else {
                Log.w(TAG, "TTS 引擎 ${strategy.getName()} 初始化失败，尝试下一个")
                tryNextStrategy(index + 1, callback)
            }
        }
    }

    /**
     * 播报文本。
     *
     * @param text 待播报的文本
     * @param queueMode 队列模式：QUEUE_FLUSH（清空队列）或 QUEUE_ADD（追加）
     * @return true 表示成功提交播报任务，false 表示失败
     */
    fun speak(text: String, queueMode: Int = TtsStrategy.QUEUE_FLUSH): Boolean {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            Log.w(TAG, "播报文本为空，跳过")
            return false
        }

        val strategy = currentStrategy
        return if (strategy != null && strategy.isAvailable()) {
            // 引擎已就绪，直接播报
            strategy.speak(trimmed, queueMode)
        } else {
            // 引擎未就绪，加入待播报队列
            Log.d(TAG, "TTS 引擎未就绪，文本加入待播报队列: $trimmed")
            synchronized(pendingSpeak) {
                pendingSpeak.add(PendingSpeakTask(trimmed, queueMode))
            }
            false
        }
    }

    /**
     * 停止当前播报。
     */
    fun stop() {
        currentStrategy?.stop()
    }

    /**
     * 关闭并释放资源。
     */
    fun shutdown() {
        synchronized(pendingSpeak) {
            pendingSpeak.clear()
        }
        currentStrategy?.shutdown()
        currentStrategy = null
        initializing.set(false)
    }

    /**
     * 检查是否有可用的 TTS 引擎。
     */
    fun isAvailable(): Boolean = currentStrategy?.isAvailable() ?: false

    /**
     * 获取当前使用的引擎名称。
     */
    fun getCurrentEngineName(): String? = currentStrategy?.getName()

    private data class PendingSpeakTask(val text: String, val queueMode: Int)

    companion object {
        private const val TAG = "TtsManager"
    }
}
