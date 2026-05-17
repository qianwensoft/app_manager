package com.appmanager.agent

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebChromeClient
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class FormAppActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var bridge: FormAppBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        val formAppCode = intent.getStringExtra("form_app_code") ?: "test_app"
        val pageKey = intent.getStringExtra("page_key") ?: "form"
        val serverUrl = intent.getStringExtra("server_url") ?: ""

        bridge = FormAppBridge(this, webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
        }

        webView.addJavascriptInterface(bridge, "AndroidBridge")
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        val url = "$serverUrl/form-app/runtime/$formAppCode?page=$pageKey"
        webView.loadUrl(url)
    }

    fun handleScanResult(data: String) {
        bridge.onScanResult(data)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
