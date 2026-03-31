package com.appmanager.agent.service

import android.content.Context
import android.os.Build
import android.os.Environment
import android.util.Log
import com.appmanager.agent.BuildConfig
import com.appmanager.agent.ws.AgentWebSocket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import java.io.File
import java.io.IOException

/**
 * Web Shell：按行 `/system/bin/sh -c`，无 TTY；子进程输出中的 `\r` 由浏览器侧规整为换行以免 xterm 错位。
 */
class ShellManager(
    private val webSocket: AgentWebSocket,
    @Suppress("unused") private val deviceId: String,
    private val context: Context
) {
    private val TAG = "ShellManager"
    private val supervisor = SupervisorJob()
    private val scope = CoroutineScope(supervisor + Dispatchers.IO)

    private var lineQueue: Channel<String>? = null
    private var consumer: Job? = null
    private val pending = StringBuilder()

    private val processLock = Any()
    @Volatile
    private var runningProcess: Process? = null

    @Volatile
    private var cwd: String = pickInitialCwd()

    fun start() {
        stopInternals()
        cwd = pickInitialCwd()
        val q = Channel<String>(Channel.UNLIMITED)
        lineQueue = q
        consumer = scope.launch {
            for (line in q) {
                try {
                    processLine(line)
                } catch (e: Exception) {
                    Log.e(TAG, "shell line", e)
                    sendOutput("\n[agent] ${e.message ?: "执行失败"}\n")
                }
            }
        }
        sendOutput(
            "\n\u001B[90m[Agent v${BuildConfig.VERSION_NAME}] 按行执行（回车提交）。cd 保留目录；export 不跨行。\u001B[0m\n" +
                "\u001B[90m目录: $cwd\u001B[0m\n"
        )
    }

    private fun pickInitialCwd(): String {
        val candidates = listOfNotNull(
            "/data/local/tmp",
            Environment.getExternalStorageDirectory()?.absolutePath,
            context.cacheDir?.absolutePath,
            context.filesDir.absolutePath,
            "/sdcard",
            "/storage/emulated/0"
        )
        for (p in candidates) {
            if (p.isBlank()) continue
            runCatching {
                val f = File(p)
                if (f.isDirectory && f.canRead()) return f.canonicalPath
            }
        }
        return "/"
    }

    fun writeInput(data: String) {
        val q = lineQueue ?: return
        synchronized(pending) {
            for (ch in data) {
                when (ch) {
                    '\r' -> { /* 等 \n */ }
                    '\n' -> {
                        val line = pending.toString()
                        pending.clear()
                        scope.launch {
                            q.trySend(line)
                        }
                    }
                    '\u0003' -> {
                        interruptRunningShellChild()
                        pending.clear()
                    }
                    else -> pending.append(ch)
                }
            }
        }
    }

    private fun interruptRunningShellChild() {
        synchronized(processLock) {
            val p = runningProcess ?: return@synchronized
            runningProcess = null
            p.destroy()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    if (p.isAlive) p.destroyForcibly()
                } catch (_: Exception) {
                }
            }
        }
    }

    private fun processLine(raw: String) {
        val line = raw.trim()
        if (line.isEmpty()) return

        if (line == "cd" || line.startsWith("cd ") || line.startsWith("cd\t")) {
            handleCd(line)
            return
        }

        val cwdFile = File(cwd)
        if (!cwdFile.isDirectory) {
            cwd = pickInitialCwd()
        }
        val pb = ProcessBuilder("/system/bin/sh", "-c", line)
        pb.directory(File(cwd))
        pb.redirectErrorStream(true)
        val env = pb.environment()
        env["PATH"] =
            "/product/bin:/apex/com.android.runtime/bin:/system/bin:/vendor/bin:/sbin:/system/sbin"
        env["HOME"] = env["HOME"] ?: context.filesDir.absolutePath
        env["TERM"] = "dumb"
        env["COLUMNS"] = "120"
        env["LINES"] = "40"

        val proc = try {
            pb.start()
        } catch (e: IOException) {
            sendOutput("\n[agent] 无法启动 sh: ${e.message}\n")
            return
        }

        synchronized(processLock) {
            runningProcess = proc
        }
        try {
            proc.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                val buf = CharArray(4096)
                while (true) {
                    val n = reader.read(buf)
                    if (n <= 0) break
                    sendOutput(String(buf, 0, n))
                }
            }
        } finally {
            proc.waitFor()
            synchronized(processLock) {
                if (runningProcess === proc) {
                    runningProcess = null
                }
            }
        }
    }

    private fun handleCd(line: String) {
        val arg = when {
            line == "cd" -> System.getenv("HOME") ?: pickInitialCwd()
            else -> line.removePrefix("cd").trim().trim('"').trim('\'')
        }
        val newPath = try {
            when {
                arg.isEmpty() -> pickInitialCwd()
                arg.startsWith("/") -> File(arg).canonicalPath
                else -> File(cwd, arg).canonicalPath
            }
        } catch (_: Exception) {
            sendOutput("cd: 路径无效\n")
            return
        }
        val f = File(newPath)
        if (f.isDirectory && f.canRead()) {
            cwd = newPath
            sendOutput("$cwd\n")
        } else {
            sendOutput("cd: 不可进入: $arg\n")
        }
    }

    private fun sendOutput(output: String) {
        webSocket.send(
            mapOf(
                "type" to "shell_output",
                "deviceId" to deviceId,
                "data" to output
            )
        )
    }

    private fun stopInternals() {
        interruptRunningShellChild()
        lineQueue?.close()
        consumer?.cancel()
        lineQueue = null
        consumer = null
        pending.clear()
    }

    fun stop() {
        stopInternals()
        supervisor.cancel()
        Log.i(TAG, "Shell stopped")
    }
}
