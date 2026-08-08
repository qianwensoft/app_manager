package com.appmanager.agent.ui

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.ScadaBridge
import com.appmanager.agent.util.ScanBroadcastHelper
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class ScadaWebViewActivity : AppCompatActivity() {

    private val tag = "ScadaWebViewActivity"
    private lateinit var statusView: TextView
    private var webView: WebView? = null
    private lateinit var bridge: ScadaBridge

    /** 摄像头扫码 launcher */
    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            bridge.onScanResult(result.contents, "barcode")
        }
    }

    /** 硬件扫码枪广播接收器 */
    private val hardwareScanReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val data = ScanBroadcastHelper.SCAN_EXTRA_KEYS
                .firstNotNullOfOrNull { key -> intent.getStringExtra(key)?.takeIf { it.isNotBlank() } }
                ?: return
            Log.d(tag, "hardware scan: action=${intent.action} data=$data")
            bridge.onScanResult(data, "barcode")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 设置全屏模式
        setupFullscreen()

        // 启用 WebView 远程调试（chrome://inspect）
        WebView.setWebContentsDebuggingEnabled(true)

        val root = FrameLayout(this)
        val wv = WebView(this)
        webView = wv
        root.addView(
            wv,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        // 初始化 JSBridge
        bridge = ScadaBridge(this, this)

        // 诊断浮层：加载中显示 URL，出错时显示错误码与原因，避免“纯白屏”无信息可查
        statusView = TextView(this).apply {
            setBackgroundColor(0xCC000000.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 12f
            setPadding(24, 24, 24, 24)
        }
        root.addView(
            statusView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP,
            ),
        )
        setContentView(root)

        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true

        // 注入 JSBridge
        wv.addJavascriptInterface(bridge, "ScadaBridge")

        val url = intent.getStringExtra(EXTRA_URL) ?: ""
        statusView.text = "加载中…\n$url"

        // 注册硬件扫码枪广播监听
        registerHardwareScanReceiver()

        wv.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, u: String?, favicon: Bitmap?) {
                statusView.visibility = View.VISIBLE
                statusView.text = "加载中…\n$u"
            }

            override fun onPageFinished(view: WebView?, u: String?) {
                // 页面加载完成后隐藏诊断浮层（成功路径）
                statusView.postDelayed({ statusView.visibility = View.GONE }, 800)
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                // 仅关注主文档错误，忽略子资源（如 favicon）
                if (request?.isForMainFrame == true) {
                    statusView.visibility = View.VISIBLE
                    statusView.text = "加载失败\nURL: ${request.url}\n错误: ${error?.errorCode} ${error?.description}"
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?,
            ) {
                if (request?.isForMainFrame == true) {
                    statusView.visibility = View.VISIBLE
                    statusView.text = "HTTP 错误 ${errorResponse?.statusCode}\nURL: ${request.url}\n${errorResponse?.reasonPhrase}"
                }
            }
        }
        wv.webChromeClient = WebChromeClient()

        if (url.isNotBlank()) {
            wv.loadUrl(url)
        } else {
            statusView.text = "未收到组态地址（preview_path 为空，请确认组态已发布并重新下发菜单）"
        }
        title = getString(R.string.scada_webview_title)
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(hardwareScanReceiver)
        } catch (e: Exception) {
            Log.w(tag, "unregisterReceiver failed", e)
        }
    }

    /** 注册硬件扫码枪广播监听 */
    private fun registerHardwareScanReceiver() {
        val filter = IntentFilter()
        ScanBroadcastHelper.SCAN_ACTION_WHITELIST.forEach { action ->
            filter.addAction(action)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(hardwareScanReceiver, filter, RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                registerReceiver(hardwareScanReceiver, filter)
            }
        } catch (e: Exception) {
            Log.e(tag, "registerReceiver failed", e)
            Toast.makeText(this, "扫码枪监听注册失败", Toast.LENGTH_SHORT).show()
        }
    }

    /** 启动摄像头扫码 */
    fun launchBarcodeScan() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(
                ScanOptions.QR_CODE,
                ScanOptions.CODE_128,
                ScanOptions.CODE_39,
                ScanOptions.EAN_13,
                ScanOptions.EAN_8
            )
            setPrompt("扫描条码或二维码")
            setBeepEnabled(true)
            setOrientationLocked(false)
        }
        scanLauncher.launch(options)
    }

    /** 获取 WebView 实例（供 Bridge 调用） */
    fun getWebView(): WebView? = webView

    /**
     * 设置全屏模式：隐藏状态栏和导航栏，沉浸式体验
     */
    private fun setupFullscreen() {
        // 隐藏 ActionBar（如果有）
        supportActionBar?.hide()

        // 设置全屏标志
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        // Android 11+ (API 30+) 使用新的 WindowInsetsController
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                // 隐藏状态栏和导航栏
                controller.hide(
                    android.view.WindowInsets.Type.statusBars() or
                    android.view.WindowInsets.Type.navigationBars()
                )
                // 设置沉浸式模式（滑动显示系统栏后自动隐藏）
                controller.systemBarsBehavior =
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            // Android 10 及以下使用旧的系统 UI 可见性标志
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN or               // 隐藏状态栏
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or          // 隐藏导航栏
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or         // 沉浸式粘性模式
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or            // 保持布局稳定
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or        // 内容延伸到状态栏
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION      // 内容延伸到导航栏
            )
        }
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}
