package com.appmanager.agent.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.appmanager.agent.R

/**
 * 应用内全屏 WebView（无地址栏），用于出站「打开网页」等场景。
 *
 * 外层使用 SwipeRefreshLayout 统一支持「下拉刷新」。
 */
class InAppWebActivity : AppCompatActivity() {

    private var webView: WebView? = null
    private var swipeRefresh: SwipeRefreshLayout? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        setContentView(R.layout.activity_in_app_web)

        val url = intent.getStringExtra(EXTRA_URL)?.trim().orEmpty()
        if (url.isEmpty()) {
            finish()
            return
        }

        val swipe = findViewById<SwipeRefreshLayout>(R.id.in_app_swipe_refresh)
        swipeRefresh = swipe
        // 配色与 Agent 主题一致
        swipe.setColorSchemeColors(
            ContextCompat.getColor(this, R.color.agent_secondary),
            ContextCompat.getColor(this, R.color.agent_primary),
        )
        swipe.setOnRefreshListener {
            // 下拉刷新：调用 reload；无 URL 时直接结束
            val wv = webView
            if (wv != null) {
                val current = wv.url
                if (!current.isNullOrBlank()) {
                    wv.reload()
                } else {
                    swipe.isRefreshing = false
                }
            } else {
                swipe.isRefreshing = false
            }
        }

        val wv = findViewById<WebView>(R.id.in_app_webview)
        webView = wv
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        wv.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, u: String?, favicon: Bitmap?) {
                // 首次进入会自动回调，这里不强制显示任何浮层
            }

            override fun onPageFinished(view: WebView?, u: String?) {
                super.onPageFinished(view, u)
                // 下拉刷新：结束刷新动画
                swipe.isRefreshing = false
            }
        }
        wv.webChromeClient = WebChromeClient()
        wv.loadUrl(url)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (wv.canGoBack()) wv.goBack()
                else finish()
            }
        })
    }

    override fun onDestroy() {
        swipeRefresh?.isRefreshing = false
        swipeRefresh = null
        webView?.let { wv ->
            wv.stopLoading()
            (wv.parent as? ViewGroup)?.removeView(wv)
            wv.destroy()
        }
        webView = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "extra_url"
    }
}
