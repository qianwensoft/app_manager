package com.appmanager.agent.tts

import android.content.Context
import android.content.Intent
import android.speech.tts.TextToSpeech
import android.util.Log

/**
 * 引导安装 TTS 引擎策略。
 *
 * 当系统 TTS 不可用时，引导用户安装 Google TTS 或其他 TTS 引擎。
 * 这不是真正的 TTS 实现，而是一个用户提示和引导机制。
 *
 * 注意：此策略的 initialize 总是返回 false（因为它不能真正播报），
 * 但会触发引导流程，提示用户安装 TTS 引擎。
 */
class InstallGuideTtsStrategy : TtsStrategy {
    @Volatile private var guidanceShown = false

    override fun initialize(context: Context, callback: (Boolean) -> Unit) {
        // 此策略不能真正初始化 TTS，但可以引导用户安装
        if (!guidanceShown) {
            guidanceShown = true
            showInstallGuidance(context)
        }

        // 总是返回 false，让 TTS 管理器知道这个策略不可用
        callback(false)
    }

    private fun showInstallGuidance(context: Context) {
        try {
            // 尝试打开 TTS 引擎安装页面
            val intent = Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)

            Log.i(TAG, "已引导用户安装 TTS 引擎")
        } catch (e: Exception) {
            // 如果无法打开安装页面（例如没有 Google Play），记录日志
            Log.w(TAG, "无法打开 TTS 引擎安装页面", e)
        }
    }

    override fun speak(text: String, queueMode: Int): Boolean {
        // 此策略不能播报
        return false
    }

    override fun stop() {
        // 无操作
    }

    override fun shutdown() {
        // 无操作
    }

    override fun isAvailable(): Boolean = false

    override fun getName(): String = "InstallGuide"

    companion object {
        private const val TAG = "InstallGuideTtsStrategy"
    }
}
