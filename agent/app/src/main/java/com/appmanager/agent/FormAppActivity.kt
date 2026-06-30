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
import android.webkit.WebSettings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.ScanBroadcastHelper
import com.appmanager.agent.x5.WebViewWrapper
import com.appmanager.agent.x5.X5WebViewFactory
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class FormAppActivity : AppCompatActivity() {

    private val tag = "FormAppActivity"
    private lateinit var webViewWrapper: WebViewWrapper
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

        // 使用 X5WebViewFactory 创建 WebView
        webViewWrapper = X5WebViewFactory.createWebView(this)
        setContentView(webViewWrapper.getView())

        // 显示使用的 WebView 类型
        val webViewType = X5WebViewFactory.getCurrentWebViewType(this)
        Toast.makeText(this, "使用: $webViewType", Toast.LENGTH_SHORT).show()
        Log.i(tag, "Using WebView type: $webViewType")

        formAppCode = intent.getStringExtra("form_app_code") ?: "test_app"
        val pageKey = intent.getStringExtra("page_key") ?: "form"
        val serverUrl = intent.getStringExtra("server_url") ?: ""

        // 菜单下发的 form_app_base_url 优先于本地 formAppBaseUrl 配置
        val menuFormBase = intent.getStringExtra("form_app_base_url")?.trim()?.trimEnd('/').orEmpty()
        val localFormBase = AgentConfig.get(this).formAppBaseUrl.trim().trimEnd('/')
        val base = menuFormBase.ifEmpty { localFormBase }.ifEmpty { serverUrl }

        bridge = FormAppBridge(this, this, webViewWrapper, formAppCode)

        webViewWrapper.getSettings().apply {
            setJavaScriptEnabled(true)
            setDomStorageEnabled(true)
            setDatabaseEnabled(true)
            setAllowFileAccess(true)
            setAllowContentAccess(true)
            setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE)
            setLoadWithOverviewMode(true)
            setUseWideViewPort(true)
        }

        // 启用调试模式
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            // 系统 WebView 调试
            android.webkit.WebView.setWebContentsDebuggingEnabled(true)
            // X5 WebView 调试（X5 SDK 没有 setWebContentsDebuggingEnabled 方法，调试通过 QbSdk.setNeedInitX5FirstTime 等初始化配置）
        }

        webViewWrapper.addJavascriptInterface(bridge, "AndroidBridge")

        // 设置 WebViewClient 和 WebChromeClient
        setupWebViewClients()

        // 注册到跨 app 事件中继注册表（第 7a 步）
        FormAppRegistry.register(formAppCode, webViewWrapper)

        val url = "$base/form-app/runtime/$formAppCode?page=$pageKey"
        Log.i(tag, "Loading URL: $url (base=$base, menuFormBase=$menuFormBase, localFormBase=$localFormBase)")
        webViewWrapper.loadUrl(url)
    }

    private fun setupWebViewClients() {
        // 根据 WebView 类型设置不同的 Client
        if (X5WebViewFactory.isUsingX5(this)) {
            // X5 WebView
            webViewWrapper.setWebViewClient(object : com.tencent.smtt.sdk.WebViewClient() {
                override fun onReceivedError(
                    view: com.tencent.smtt.sdk.WebView?,
                    errorCode: Int,
                    description: String?,
                    failingUrl: String?
                ) {
                    super.onReceivedError(view, errorCode, description, failingUrl)
                    Log.e(tag, "X5 WebView error: $description ($errorCode) for $failingUrl")
                }
            })

            webViewWrapper.setWebChromeClient(object : com.tencent.smtt.sdk.WebChromeClient() {
                override fun onConsoleMessage(message: com.tencent.smtt.export.external.interfaces.ConsoleMessage?): Boolean {
                    message?.let {
                        Log.d(tag, "JS Console [${it.messageLevel()}]: ${it.message()} -- ${it.sourceId()}:${it.lineNumber()}")
                    }
                    return true
                }
            })
        } else {
            // 系统 WebView
            webViewWrapper.setWebViewClient(object : android.webkit.WebViewClient() {
                override fun onReceivedError(
                    view: android.webkit.WebView?,
                    request: android.webkit.WebResourceRequest?,
                    error: android.webkit.WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        Log.e(tag, "System WebView error: ${error?.description} (${error?.errorCode}) for ${request?.url}")
                    }
                }
            })

            webViewWrapper.setWebChromeClient(object : android.webkit.WebChromeClient() {
                override fun onConsoleMessage(message: android.webkit.ConsoleMessage?): Boolean {
                    message?.let {
                        Log.d(tag, "JS Console [${it.messageLevel()}]: ${it.message()} -- ${it.sourceId()}:${it.lineNumber()}")
                    }
                    return true
                }
            })
        }
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
        if (webViewWrapper.canGoBack()) {
            webViewWrapper.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::bridge.isInitialized) bridge.release()
        // 从跨 app 事件中继注册表移除（第 7a 步）
        if (::webViewWrapper.isInitialized && formAppCode.isNotEmpty()) {
            FormAppRegistry.unregister(formAppCode, webViewWrapper)
        }
        if (::webViewWrapper.isInitialized) {
            webViewWrapper.destroy()
        }
        super.onDestroy()
    }
}
