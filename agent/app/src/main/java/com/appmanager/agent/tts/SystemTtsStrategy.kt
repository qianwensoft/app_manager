package com.appmanager.agent.tts

import android.content.Context
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale

/**
 * 系统 TTS 引擎策略实现。
 *
 * 使用 Android 系统的 TextToSpeech API。
 * 优点：音质好、用户熟悉、不增加 APK 体积。
 * 缺点：部分设备（特别是 Android 9 及以下）可能没有预装 TTS 引擎。
 */
class SystemTtsStrategy : TtsStrategy {
    @Volatile private var tts: TextToSpeech? = null
    @Volatile private var ready = false

    override fun initialize(context: Context, callback: (Boolean) -> Unit) {
        if (tts != null) {
            callback(ready)
            return
        }

        synchronized(this) {
            if (tts != null) {
                callback(ready)
                return
            }

            try {
                tts = TextToSpeech(context.applicationContext) { status ->
                    if (status == TextToSpeech.SUCCESS) {
                        // 优先简体中文，缺数据时回退默认语言
                        runCatching {
                            val r = tts?.setLanguage(Locale.SIMPLIFIED_CHINESE)
                            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                                Log.w(TAG, "简体中文不支持，回退到默认语言")
                                tts?.setLanguage(Locale.getDefault())
                            }
                        }
                        ready = true
                        Log.i(TAG, "系统 TTS 初始化成功")
                        callback(true)
                    } else {
                        // 初始化失败：设备无 TTS 引擎/被包可见性过滤/引擎被禁用
                        Log.w(TAG, "系统 TTS 初始化失败，status=$status")
                        runCatching { tts?.shutdown() }
                        tts = null
                        ready = false
                        callback(false)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "系统 TTS 初始化异常", e)
                tts = null
                ready = false
                callback(false)
            }
        }
    }

    override fun speak(text: String, queueMode: Int): Boolean {
        if (!ready || tts == null) {
            Log.w(TAG, "系统 TTS 未就绪，无法播报")
            return false
        }

        return try {
            val mode = when (queueMode) {
                TtsStrategy.QUEUE_FLUSH -> TextToSpeech.QUEUE_FLUSH
                TtsStrategy.QUEUE_ADD -> TextToSpeech.QUEUE_ADD
                else -> TextToSpeech.QUEUE_FLUSH
            }
            val result = tts?.speak(text, mode, null, "tts-${System.currentTimeMillis()}")
            result == TextToSpeech.SUCCESS
        } catch (e: Exception) {
            Log.e(TAG, "系统 TTS 播报失败", e)
            false
        }
    }

    override fun stop() {
        try {
            tts?.stop()
        } catch (e: Exception) {
            Log.e(TAG, "停止系统 TTS 失败", e)
        }
    }

    override fun shutdown() {
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (e: Exception) {
            Log.e(TAG, "关闭系统 TTS 失败", e)
        } finally {
            tts = null
            ready = false
        }
    }

    override fun isAvailable(): Boolean = ready && tts != null

    override fun getName(): String = "SystemTTS"

    companion object {
        private const val TAG = "SystemTtsStrategy"
    }
}
