package com.appmanager.agent.service

import android.util.Log
import com.appmanager.agent.ws.AgentWebSocket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.BufferedReader
import java.io.InputStreamReader

class LogcatManager(
    private val webSocket: AgentWebSocket,
    private val deviceId: String
) {
    private val TAG = "LogcatManager"
    private var logcatProcess: Process? = null
    private var readJob: Job? = null

    fun start(filter: String = "") {
        try {
            val cmd = if (filter.isEmpty()) {
                arrayOf("logcat", "-v", "time")
            } else {
                arrayOf("logcat", "-v", "time", filter)
            }

            logcatProcess = Runtime.getRuntime().exec(cmd)

            readJob = CoroutineScope(Dispatchers.IO).launch {
                try {
                    val reader = BufferedReader(InputStreamReader(logcatProcess!!.inputStream))
                    reader.forEachLine { line ->
                        sendOutput(line)
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Logcat read stopped: ${e.message}")
                }
            }

            Log.i(TAG, "Logcat started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start logcat", e)
        }
    }

    private fun sendOutput(output: String) {
        webSocket.send(mapOf(
            "type" to "logcat_output",
            "deviceId" to deviceId,
            "data" to output
        ))
    }

    fun stop() {
        readJob?.cancel()
        logcatProcess?.destroy()
        logcatProcess = null
        Log.i(TAG, "Logcat stopped")
    }
}
