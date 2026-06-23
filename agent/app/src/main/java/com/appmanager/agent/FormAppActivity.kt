package com.appmanager.agent

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.ScanBroadcastHelper
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class FormAppActivity : AppCompatActivity() {

    private val tag = "FormAppActivity"
    private lateinit var webView: WebView
    private lateinit var bridge: FormAppBridge
    private var formAppCode: String = ""

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            handleScanResult(result.contents)
        }
    }

    private val requestCameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startBarcodeScan()
        } else {
            Toast.makeText(this, "需要相机权限才能扫码", Toast.LENGTH_SHORT).show()
        }
    }

    /** 接收硬件扫码枪广播，将结果注入 WebView eventManager。 */
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

        webView = WebView(this)
        setContentView(webView)

        formAppCode = intent.getStringExtra("form_app_code") ?: "test_app"
        val pageKey = intent.getStringExtra("page_key") ?: "form"
        val serverUrl = intent.getStringExtra("server_url") ?: ""

        // 菜单下发的 form_app_base_url 优先于本地 formAppBaseUrl 配置
        val menuFormBase = intent.getStringExtra("form_app_base_url")?.trim()?.trimEnd('/').orEmpty()
        val localFormBase = AgentConfig.get(this).formAppBaseUrl.trim().trimEnd('/')
        val base = menuFormBase.ifEmpty { localFormBase }.ifEmpty { serverUrl }

        bridge = FormAppBridge(this, this, webView, formAppCode)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = true
            allowContentAccess = true
            // 启用调试模式（仅在开发时，生产环境可关闭）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                WebView.setWebContentsDebuggingEnabled(true)
            }
        }

        webView.addJavascriptInterface(bridge, "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Log.e(tag, "WebView error: ${error?.description} (${error?.errorCode}) for ${request?.url}")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage?): Boolean {
                message?.let {
                    Log.d(tag, "JS Console [${it.messageLevel()}]: ${it.message()} -- ${it.sourceId()}:${it.lineNumber()}")
                }
                return true
            }
        }

        // 注册到跨 app 事件中继注册表（第 7a 步）
        FormAppRegistry.register(formAppCode, webView)

        val url = "$base/form-app/runtime/$formAppCode?page=$pageKey"
        webView.loadUrl(url)
    }

    override fun onResume() {
        super.onResume()
        val filter = ScanBroadcastHelper.createScanIntentFilter(this)
        // Android 14（targetSdk 34）起，注册接收外部应用（扫码服务）广播的 receiver 必须显式声明导出标志，
        // 否则 registerReceiver 抛 SecurityException 导致 PDA 头扫广播完全收不到（摄像头扫码走直连不受影响）。
        ContextCompat.registerReceiver(
            this, hardwareScanReceiver, filter, ContextCompat.RECEIVER_EXPORTED
        )
    }

    override fun onPause() {
        super.onPause()
        try { unregisterReceiver(hardwareScanReceiver) } catch (_: Exception) {}
    }

    fun launchBarcodeScan() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startBarcodeScan()
        } else {
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startBarcodeScan() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(
                ScanOptions.QR_CODE,
                ScanOptions.CODE_128,
                ScanOptions.CODE_39,
                ScanOptions.EAN_13,
                ScanOptions.EAN_8
            )
            setPrompt("扫描条码或二维码")
            setCameraId(0)
            setBeepEnabled(true)
            setOrientationLocked(false)
        }
        scanLauncher.launch(options)
    }

    fun handleScanResult(data: String) {
        bridge.onScanResult(data)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::bridge.isInitialized) bridge.release()
        // 从跨 app 事件中继注册表移除（第 7a 步）
        if (::webView.isInitialized && formAppCode.isNotEmpty()) {
            FormAppRegistry.unregister(formAppCode, webView)
        }
        super.onDestroy()
    }
}
