package com.appmanager.agent.util

object ServerUrlUtil {
    /** 将 WebSocket 地址转为同主机的 HTTP(S) 基址（无尾斜杠）。 */
    fun httpBaseFromWs(wsUrl: String): String {
        val t = wsUrl.trim().trimEnd('/')
        return when {
            t.startsWith("ws://", ignoreCase = true) -> "http://" + t.substring(5)
            t.startsWith("wss://", ignoreCase = true) -> "https://" + t.substring(6)
            else -> t
        }
    }
}
