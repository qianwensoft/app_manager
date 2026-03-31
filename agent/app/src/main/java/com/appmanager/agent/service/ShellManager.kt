package com.appmanager.agent.service

import android.util.Log
import com.appmanager.agent.ws.AgentWebSocket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream

class ShellManager(
    private val webSocket: AgentWebSocket,
    @Suppress("unused") private val deviceId: String
) {
    private val TAG = "ShellManager"
    private var shellProcess: Process? = null
    private var shellOutput: OutputStream? = null
    private var readJob: Job? = null

    fun start() {
        try {
            val pb = ProcessBuilder("/system/bin/sh")
            pb.redirectErrorStream(true)
            val env = pb.environment()
            env["PATH"] = "/product/bin:/apex/com.android.runtime/bin:/system/bin:/vendor/bin:/sbin:/system/sbin"
            env["TERM"] = "xterm-256color"
            env["HOME"] = env["HOME"] ?: "/data/local/tmp"
            shellProcess = pb.start()
            shellOutput = shellProcess!!.outputStream

            readJob = CoroutineScope(Dispatchers.IO).launch {
                readStreamUtf8(shellProcess!!.inputStream)
            }

            Log.i(TAG, "Shell started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start shell", e)
            sendOutput("\r\n[agent] 无法启动 /system/bin/sh: ${e.message}\r\n")
        }
    }

    /** 按 UTF-8 字符边界读取，避免多字节字符被截断导致 JSON/终端乱码 */
    private fun readStreamUtf8(stream: InputStream) {
        try {
            BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader ->
                val cb = CharArray(4096)
                while (true) {
                    val n = reader.read(cb)
                    if (n <= 0) break
                    sendOutput(String(cb, 0, n))
                }
            }
        } catch (_: Exception) {
        }
    }

    fun writeInput(data: String) {
        try {
            shellOutput?.write(data.encodeToByteArray())
            shellOutput?.flush()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write input", e)
        }
    }

    private fun sendOutput(output: String) {
        webSocket.send(mapOf(
            "type" to "shell_output",
            "deviceId" to deviceId,
            "data" to output
        ))
    }

    fun stop() {
        readJob?.cancel()
        shellOutput?.close()
        shellProcess?.destroy()
        shellProcess = null
        Log.i(TAG, "Shell stopped")
    }
}
