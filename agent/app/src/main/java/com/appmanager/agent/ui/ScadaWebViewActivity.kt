package com.appmanager.agent.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R

class ScadaWebViewActivity : AppCompatActivity() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val wv = WebView(this)
        setContentView(wv)
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true
        wv.webViewClient = WebViewClient()
        wv.webChromeClient = WebChromeClient()
        val url = intent.getStringExtra(EXTRA_URL) ?: ""
        if (url.isNotBlank()) {
            wv.loadUrl(url)
        }
        title = getString(R.string.scada_webview_title)
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}
