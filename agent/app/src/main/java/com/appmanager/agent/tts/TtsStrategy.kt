package com.appmanager.agent.tts

import android.content.Context

/**
 * TTS 引擎策略接口。
 *
 * 支持多种 TTS 实现（系统 TTS、讯飞、在线 API 等），通过统一接口调用。
 */
interface TtsStrategy {
    /**
     * 初始化 TTS 引擎（异步）。
     * @param context 应用上下文
     * @param callback 初始化结果回调：true 表示成功，false 表示失败
     */
    fun initialize(context: Context, callback: (Boolean) -> Unit)

    /**
     * 播报文本。
     * @param text 待播报的文本
     * @param queueMode 队列模式：QUEUE_FLUSH（清空队列）或 QUEUE_ADD（追加）
     * @return true 表示成功提交播报任务，false 表示失败
     */
    fun speak(text: String, queueMode: Int): Boolean

    /**
     * 停止当前播报。
     */
    fun stop()

    /**
     * 关闭并释放资源。
     */
    fun shutdown()

    /**
     * 检查引擎是否可用。
     * @return true 表示已初始化且可用，false 表示不可用
     */
    fun isAvailable(): Boolean

    /**
     * 获取引擎名称（用于日志和调试）。
     */
    fun getName(): String

    companion object {
        /** 清空播报队列并播报 */
        const val QUEUE_FLUSH = 0
        /** 追加到播报队列末尾 */
        const val QUEUE_ADD = 1
    }
}
