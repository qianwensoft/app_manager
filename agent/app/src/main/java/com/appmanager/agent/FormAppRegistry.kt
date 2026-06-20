package com.appmanager.agent

import android.webkit.WebView
import java.util.concurrent.ConcurrentHashMap

/**
 * 跨 form-app 事件中继：WebView 注册表。
 *
 * 同一台设备运行多个 form-app（多个 FormAppActivity 实例）时，
 * 按 formCode 注册 WebView，供 FormAppBridge.emitCrossAppEvent 查找目标 WebView。
 *
 * 第 7a 步（同设备跨 app）：本地中继，不过服务端。
 */
object FormAppRegistry {
    private val webViews = ConcurrentHashMap<String, WebView>()

    /**
     * 注册 WebView（FormAppActivity.onCreate 调用）。
     * 若 formCode 已存在，覆盖（后打开的实例生效）。
     */
    fun register(formCode: String, webView: WebView) {
        webViews[formCode] = webView
    }

    /**
     * 移除 WebView（FormAppActivity.onDestroy 调用）。
     * 仅当当前注册的 WebView 与传入的相同时才移除（防止后打开的被先关闭的误删）。
     */
    fun unregister(formCode: String, webView: WebView) {
        webViews.compute(formCode) { _, current ->
            if (current === webView) null else current
        }
    }

    /**
     * 查找目标 WebView（FormAppBridge.emitCrossAppEvent 调用）。
     * 返回 null 表示目标 form-app 未运行。
     */
    fun find(formCode: String): WebView? = webViews[formCode]
}
