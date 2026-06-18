package com.appmanager.agent.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * 问题反馈：把 logcat 抓取到文件。可按目标 App 的 PID 过滤（针对其他 App 的日志）。
 * 注意：未取得 READ_LOGS（签名权限/adb 授权）时，普通应用只能读到自身日志，
 * 这是 Android 平台限制——文档需提示用户授予后才能采集其他 App 日志。
 */
class FeedbackLogcatCapture(private val context: Context) {

    private val TAG = "FeedbackLogcat"
    private var process: Process? = null
    private var job: Job? = null
    private var outputFile: File? = null

    /** targetPackage 非空时按其当前进程 PID 过滤；为空抓全量。 */
    fun start(targetPackage: String? = null): String? {
        try {
            val dir = File(context.getExternalFilesDir(null), "feedback").apply { mkdirs() }
            outputFile = File(dir, "logcat_${System.currentTimeMillis()}.txt")

            // 先清旧缓冲，尽量只保留复现期间的日志
            try { Runtime.getRuntime().exec(arrayOf("logcat", "-c")).waitFor() } catch (_: Exception) {}

            val cmd = ArrayList<String>().apply {
                add("logcat")
                add("-v"); add("time")
                val pid = targetPackage?.takeIf { it.isNotBlank() }?.let { resolvePid(it) }
                if (pid != null) { add("--pid=$pid") }
            }
            process = Runtime.getRuntime().exec(cmd.toTypedArray())
            job = CoroutineScope(Dispatchers.IO).launch {
                try {
                    val reader = BufferedReader(InputStreamReader(process!!.inputStream))
                    outputFile!!.bufferedWriter().use { w ->
                        reader.forEachLine { line ->
                            w.write(line); w.newLine()
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "logcat read stopped: ${e.message}")
                }
            }
            return outputFile?.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "start failed", e)
            return null
        }
    }

    fun stop(): String? {
        job?.cancel()
        process?.destroy()
        process = null
        return outputFile?.absolutePath
    }

    private fun resolvePid(pkg: String): String? {
        return try {
            val p = Runtime.getRuntime().exec(arrayOf("pidof", pkg))
            val out = BufferedReader(InputStreamReader(p.inputStream)).readLine()?.trim()
            p.waitFor()
            out?.split(Regex("\\s+"))?.firstOrNull()?.takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }
}
