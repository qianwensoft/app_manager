package com.appmanager.agent.x5

import android.content.Context
import android.util.Log
import android.webkit.WebView as SystemWebView
import com.tencent.smtt.sdk.WebView as X5WebView

/**
 * WebView 工厂
 * 根据 X5 内核状态和用户偏好选择使用 X5WebView 或系统 WebView
 */
object X5WebViewFactory {
    private const val TAG = "X5WebViewFactory"

    /**
     * 创建 WebView 包装器
     * 如果 X5 已安装且用户启用，返回 X5WebViewWrapper；否则返回 SystemWebViewWrapper
     */
    fun createWebView(context: Context): WebViewWrapper {
        // 检查用户偏好
        val x5Enabled = X5Preferences.isX5Enabled(context)

        if (!x5Enabled) {
            Log.i(TAG, "X5 disabled by user preference, using system WebView")
            return SystemWebViewWrapper(context)
        }

        // 实时检查 X5 版本（同步调用，不依赖异步回调）
        val currentVersion = com.tencent.smtt.sdk.QbSdk.getTbsVersion(context)
        val state = X5KernelManager.getState()

        // 如果实际已安装 X5（版本号 > 0），优先使用 X5
        if (currentVersion > 0) {
            Log.i(TAG, "Using X5 WebView (version=$currentVersion)")
            return X5WebViewWrapper(context)
        }

        // 根据状态判断
        return when (state) {
            X5KernelManager.KernelState.DOWNLOADING,
            X5KernelManager.KernelState.INSTALLING -> {
                Log.w(TAG, "X5 kernel is being prepared, using system WebView temporarily")
                SystemWebViewWrapper(context)
            }
            else -> {
                Log.d(TAG, "Using system WebView (X5 version=$currentVersion, state=$state)")
                SystemWebViewWrapper(context)
            }
        }
    }

    /**
     * 检查是否正在使用 X5
     */
    fun isUsingX5(context: Context): Boolean {
        val currentVersion = com.tencent.smtt.sdk.QbSdk.getTbsVersion(context)
        return currentVersion > 0
    }

    /**
     * 获取当前 WebView 类型描述
     */
    fun getCurrentWebViewType(context: Context): String {
        val currentVersion = com.tencent.smtt.sdk.QbSdk.getTbsVersion(context)
        return if (currentVersion > 0) {
            "X5 WebView (v$currentVersion)"
        } else {
            "System WebView"
        }
    }
}

/**
 * WebView 包装器接口
 * 统一 X5WebView 和系统 WebView 的 API
 */
interface WebViewWrapper {
    fun getView(): android.view.View
    fun loadUrl(url: String)
    fun reload()
    fun goBack()
    fun canGoBack(): Boolean
    fun destroy()
    fun setWebViewClient(client: Any)
    fun setWebChromeClient(client: Any)
    fun evaluateJavascript(script: String, callback: ((String) -> Unit)?)
    fun addJavascriptInterface(obj: Any, name: String)
    fun getSettings(): WebSettingsWrapper
    fun clearCache(includeDiskFiles: Boolean)
}

/**
 * WebSettings 包装器接口
 */
interface WebSettingsWrapper {
    fun setJavaScriptEnabled(enabled: Boolean)
    fun setDomStorageEnabled(enabled: Boolean)
    fun setDatabaseEnabled(enabled: Boolean)
    fun setAllowFileAccess(enabled: Boolean)
    fun setAllowContentAccess(enabled: Boolean)
    fun setAllowFileAccessFromFileURLs(enabled: Boolean)
    fun setAllowUniversalAccessFromFileURLs(enabled: Boolean)
    fun setMediaPlaybackRequiresUserGesture(enabled: Boolean)
    fun setUseWideViewPort(enabled: Boolean)
    fun setLoadWithOverviewMode(enabled: Boolean)
    fun setSupportZoom(enabled: Boolean)
    fun setBuiltInZoomControls(enabled: Boolean)
    fun setDisplayZoomControls(enabled: Boolean)
    fun setMixedContentMode(mode: Int)
    fun setUserAgentString(ua: String)
}

/**
 * X5WebView 包装器
 */
class X5WebViewWrapper(context: Context) : WebViewWrapper {
    private val webView = X5WebView(context)

    override fun getView(): android.view.View = webView

    override fun loadUrl(url: String) {
        webView.loadUrl(url)
    }

    override fun reload() {
        webView.reload()
    }

    override fun goBack() {
        webView.goBack()
    }

    override fun canGoBack(): Boolean = webView.canGoBack()

    override fun destroy() {
        webView.destroy()
    }

    override fun setWebViewClient(client: Any) {
        webView.webViewClient = client as com.tencent.smtt.sdk.WebViewClient
    }

    override fun setWebChromeClient(client: Any) {
        webView.webChromeClient = client as com.tencent.smtt.sdk.WebChromeClient
    }

    override fun evaluateJavascript(script: String, callback: ((String) -> Unit)?) {
        webView.evaluateJavascript(script) { result ->
            callback?.invoke(result)
        }
    }

    override fun addJavascriptInterface(obj: Any, name: String) {
        webView.addJavascriptInterface(obj, name)
    }

    override fun getSettings(): WebSettingsWrapper = X5WebSettingsWrapper(webView.settings)

    override fun clearCache(includeDiskFiles: Boolean) {
        webView.clearCache(includeDiskFiles)
    }
}

/**
 * 系统 WebView 包装器
 */
class SystemWebViewWrapper(context: Context) : WebViewWrapper {
    private val webView = SystemWebView(context)

    override fun getView(): android.view.View = webView

    override fun loadUrl(url: String) {
        webView.loadUrl(url)
    }

    override fun reload() {
        webView.reload()
    }

    override fun goBack() {
        webView.goBack()
    }

    override fun canGoBack(): Boolean = webView.canGoBack()

    override fun destroy() {
        webView.destroy()
    }

    override fun setWebViewClient(client: Any) {
        webView.webViewClient = client as android.webkit.WebViewClient
    }

    override fun setWebChromeClient(client: Any) {
        webView.webChromeClient = client as android.webkit.WebChromeClient
    }

    override fun evaluateJavascript(script: String, callback: ((String) -> Unit)?) {
        webView.evaluateJavascript(script, callback?.let { cb ->
            android.webkit.ValueCallback<String> { result -> cb(result) }
        })
    }

    override fun addJavascriptInterface(obj: Any, name: String) {
        webView.addJavascriptInterface(obj, name)
    }

    override fun getSettings(): WebSettingsWrapper = SystemWebSettingsWrapper(webView.settings)

    override fun clearCache(includeDiskFiles: Boolean) {
        webView.clearCache(includeDiskFiles)
    }
}

/**
 * X5 WebSettings 包装器
 */
class X5WebSettingsWrapper(private val settings: com.tencent.smtt.sdk.WebSettings) : WebSettingsWrapper {
    override fun setJavaScriptEnabled(enabled: Boolean) {
        settings.javaScriptEnabled = enabled
    }

    override fun setDomStorageEnabled(enabled: Boolean) {
        settings.domStorageEnabled = enabled
    }

    override fun setDatabaseEnabled(enabled: Boolean) {
        settings.databaseEnabled = enabled
    }

    override fun setAllowFileAccess(enabled: Boolean) {
        settings.allowFileAccess = enabled
    }

    override fun setAllowContentAccess(enabled: Boolean) {
        settings.allowContentAccess = enabled
    }

    override fun setAllowFileAccessFromFileURLs(enabled: Boolean) {
        // X5 WebSettings 没有这个方法，忽略
    }

    override fun setAllowUniversalAccessFromFileURLs(enabled: Boolean) {
        // X5 WebSettings 没有这个方法，忽略
    }

    override fun setMediaPlaybackRequiresUserGesture(enabled: Boolean) {
        settings.mediaPlaybackRequiresUserGesture = enabled
    }

    override fun setUseWideViewPort(enabled: Boolean) {
        settings.useWideViewPort = enabled
    }

    override fun setLoadWithOverviewMode(enabled: Boolean) {
        settings.loadWithOverviewMode = enabled
    }

    override fun setSupportZoom(enabled: Boolean) {
        settings.setSupportZoom(enabled)
    }

    override fun setBuiltInZoomControls(enabled: Boolean) {
        settings.builtInZoomControls = enabled
    }

    override fun setDisplayZoomControls(enabled: Boolean) {
        settings.displayZoomControls = enabled
    }

    override fun setMixedContentMode(mode: Int) {
        settings.mixedContentMode = mode
    }

    override fun setUserAgentString(ua: String) {
        settings.userAgentString = ua
    }
}

/**
 * 系统 WebSettings 包装器
 */
class SystemWebSettingsWrapper(private val settings: android.webkit.WebSettings) : WebSettingsWrapper {
    override fun setJavaScriptEnabled(enabled: Boolean) {
        settings.javaScriptEnabled = enabled
    }

    override fun setDomStorageEnabled(enabled: Boolean) {
        settings.domStorageEnabled = enabled
    }

    override fun setDatabaseEnabled(enabled: Boolean) {
        settings.databaseEnabled = enabled
    }

    override fun setAllowFileAccess(enabled: Boolean) {
        settings.allowFileAccess = enabled
    }

    override fun setAllowContentAccess(enabled: Boolean) {
        settings.allowContentAccess = enabled
    }

    override fun setAllowFileAccessFromFileURLs(enabled: Boolean) {
        settings.allowFileAccessFromFileURLs = enabled
    }

    override fun setAllowUniversalAccessFromFileURLs(enabled: Boolean) {
        settings.allowUniversalAccessFromFileURLs = enabled
    }

    override fun setMediaPlaybackRequiresUserGesture(enabled: Boolean) {
        settings.mediaPlaybackRequiresUserGesture = enabled
    }

    override fun setUseWideViewPort(enabled: Boolean) {
        settings.useWideViewPort = enabled
    }

    override fun setLoadWithOverviewMode(enabled: Boolean) {
        settings.loadWithOverviewMode = enabled
    }

    override fun setSupportZoom(enabled: Boolean) {
        settings.setSupportZoom(enabled)
    }

    override fun setBuiltInZoomControls(enabled: Boolean) {
        settings.builtInZoomControls = enabled
    }

    override fun setDisplayZoomControls(enabled: Boolean) {
        settings.displayZoomControls = enabled
    }

    override fun setMixedContentMode(mode: Int) {
        settings.mixedContentMode = mode
    }

    override fun setUserAgentString(ua: String) {
        settings.userAgentString = ua
    }
}
