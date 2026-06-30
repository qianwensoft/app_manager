package com.appmanager.agent.ui

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.config.AgentRegistration
import com.appmanager.agent.util.DeviceMachineId
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.WirelessAdbHelper
import com.appmanager.agent.x5.X5KernelManager
import com.appmanager.agent.x5.X5Preferences
import com.google.android.material.appbar.MaterialToolbar
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch
import org.json.JSONObject

class SettingsActivity : AppCompatActivity() {

    private lateinit var etServerUrl: EditText
    private lateinit var etToken: EditText
    private lateinit var etFormAppBaseUrl: EditText
    private lateinit var cbAutoAccept: CheckBox
    private lateinit var cbAllowRemoteScreen: CheckBox
    private lateinit var rgScanMode: RadioGroup
    private lateinit var tvConnState: TextView
    private lateinit var tvConnDetail: TextView

    // X5 内核相关
    private lateinit var tvX5State: TextView
    private lateinit var tvX5Version: TextView
    private lateinit var switchX5Enabled: SwitchCompat
    private lateinit var switchX5AutoUpdate: SwitchCompat
    private lateinit var btnX5CheckUpdate: Button

    /** 连接状态变更广播：实时刷新设置页的状态显示。 */
    private val connStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != AgentService.ACTION_CONN_STATE) return
            renderConnState(
                intent.getStringExtra(AgentService.EXTRA_CONN_STATE) ?: AgentService.STATE_DISCONNECTED,
                intent.getStringExtra(AgentService.EXTRA_CONN_DETAIL) ?: ""
            )
        }
    }

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents == null) return@registerForActivityResult
        val cfg = AgentRegistration.ensureMachineCodeConfig(this)
        if (WirelessAdbHelper.handleGuideQr(this, result.contents!!, cfg.deviceToken) { deviceId, tokenMatched ->
                if (cfg.serverUrl.isNotEmpty() && cfg.deviceToken.isNotEmpty()) {
                    startForegroundService(Intent(this, AgentService::class.java))
                }
                AgentService.reportWirelessAdbGuideAck(this, deviceId, tokenMatched)
            }
        ) {
            return@registerForActivityResult
        }
        try {
            val json = JSONObject(result.contents!!)
            val serverUrl = json.getString("serverUrl")
            val deviceToken = resolveRegistrationToken(json.optString("deviceToken", ""))
            // dev：二维码可携带表单调试地址，扫码即把表单运行时指向开发机
            val formBase = json.optString("formAppBaseUrl", "")
            val cur = AgentConfig.get(this)
            AgentConfig.save(
                this,
                cur.copy(
                    serverUrl = serverUrl,
                    deviceToken = deviceToken,
                    formAppBaseUrl = formBase,
                    allowRemoteScreen = cbAllowRemoteScreen.isChecked
                )
            )
            etServerUrl.setText(serverUrl)
            etToken.setText(deviceToken)
            etFormAppBaseUrl.setText(formBase)
            startForegroundService(Intent(this, AgentService::class.java))
            Toast.makeText(this, "扫码成功，服务已启动", Toast.LENGTH_SHORT).show()
            setResult(Activity.RESULT_OK)
        } catch (_: Exception) {
            Toast.makeText(this, "二维码格式错误", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        etServerUrl = findViewById(R.id.etServerUrl)
        etToken = findViewById(R.id.etToken)
        etFormAppBaseUrl = findViewById(R.id.etFormAppBaseUrl)
        cbAutoAccept = findViewById(R.id.cbAutoAccept)
        cbAllowRemoteScreen = findViewById(R.id.cbAllowRemoteScreen)
        rgScanMode = findViewById(R.id.rgScanMode)
        tvConnState = findViewById(R.id.tvConnState)
        tvConnDetail = findViewById(R.id.tvConnDetail)
        val btnScanQR = findViewById<Button>(R.id.btnScanQR)
        val btnSave = findViewById<Button>(R.id.btnSave)
        val btnReconnect = findViewById<Button>(R.id.btnReconnect)
        val btnReverseRegister = findViewById<Button>(R.id.btnReverseRegister)

        // X5 内核控件
        tvX5State = findViewById(R.id.tvX5State)
        tvX5Version = findViewById(R.id.tvX5Version)
        switchX5Enabled = findViewById(R.id.switchX5Enabled)
        switchX5AutoUpdate = findViewById(R.id.switchX5AutoUpdate)
        btnX5CheckUpdate = findViewById(R.id.btnX5CheckUpdate)

        // 初始化 X5 状态
        updateX5State()
        switchX5Enabled.isChecked = X5Preferences.isX5Enabled(this)
        switchX5AutoUpdate.isChecked = X5Preferences.isAutoUpdateEnabled(this)

        // X5 开关监听
        switchX5Enabled.setOnCheckedChangeListener { _, isChecked ->
            X5Preferences.setX5Enabled(this, isChecked)
            Toast.makeText(
                this,
                if (isChecked) "已启用 X5 内核，重启 App 生效" else "已禁用 X5 内核，重启 App 生效",
                Toast.LENGTH_SHORT
            ).show()
        }

        switchX5AutoUpdate.setOnCheckedChangeListener { _, isChecked ->
            X5Preferences.setAutoUpdateEnabled(this, isChecked)
        }

        // 手动检查更新
        btnX5CheckUpdate.setOnClickListener {
            checkX5Update()
        }

        btnReverseRegister.setOnClickListener {
            startActivity(Intent(this, ReverseRegisterActivity::class.java))
        }

        btnReconnect.setOnClickListener {
            val cfg = AgentConfig.get(this)
            if (cfg.serverUrl.isBlank()) {
                Toast.makeText(this, "请先配置服务器地址", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            renderConnState(AgentService.STATE_CONNECTING, "")
            AgentService.forceReconnect(this)
        }

        // 初值用进程内全局态，随后由广播实时刷新
        renderConnState(AgentService.connState, AgentService.connDetail)

        val config = AgentRegistration.ensureMachineCodeConfig(this)
        etServerUrl.setText(config.serverUrl)
        etToken.setText(config.deviceToken)
        etFormAppBaseUrl.setText(config.formAppBaseUrl)
        etToken.isEnabled = false
        etToken.isFocusable = false
        etToken.isFocusableInTouchMode = false
        cbAutoAccept.isChecked = config.autoAcceptScreenCapture
        cbAllowRemoteScreen.isChecked = config.allowRemoteScreen
        rgScanMode.check(
            if (config.scanMode == AgentConfig.SCAN_MODE_CAMERA) R.id.rbScanCamera
            else R.id.rbScanHardware
        )

        btnScanQR.setOnClickListener {
            val options = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("扫描管理平台二维码")
                setCameraId(0)
                setBeepEnabled(false)
                setOrientationLocked(false)
            }
            scanLauncher.launch(options)
        }

        btnSave.setOnClickListener {
            val cur = AgentRegistration.ensureMachineCodeConfig(this)
            val newConfig = cur.copy(
                serverUrl = etServerUrl.text.toString().trim(),
                deviceToken = resolveRegistrationToken(""),
                formAppBaseUrl = etFormAppBaseUrl.text.toString().trim(),
                autoAcceptScreenCapture = cbAutoAccept.isChecked,
                allowRemoteScreen = cbAllowRemoteScreen.isChecked,
                scanMode = if (rgScanMode.checkedRadioButtonId == R.id.rbScanCamera)
                    AgentConfig.SCAN_MODE_CAMERA else AgentConfig.SCAN_MODE_HARDWARE
            )
            AgentConfig.save(this, newConfig)
            startForegroundService(Intent(this, AgentService::class.java))
            Toast.makeText(this, "已保存", Toast.LENGTH_SHORT).show()
            setResult(Activity.RESULT_OK)
        }
    }

    private fun resolveRegistrationToken(fallbackFromQr: String): String {
        val code = DeviceMachineId.get(this)
        if (code.isNotEmpty()) return code
        return fallbackFromQr.trim()
    }

    override fun onStart() {
        super.onStart()
        val filter = IntentFilter(AgentService.ACTION_CONN_STATE)
        ContextCompat.registerReceiver(this, connStateReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        // 重新进入页面时刷新一次最新态
        renderConnState(AgentService.connState, AgentService.connDetail)
    }

    override fun onStop() {
        super.onStop()
        try { unregisterReceiver(connStateReceiver) } catch (_: Exception) {}
    }

    private fun renderConnState(state: String, detail: String) {
        val (textRes, color) = when (state) {
            AgentService.STATE_CONNECTED -> R.string.settings_conn_connected to 0xFF2E7D32.toInt()
            AgentService.STATE_CONNECTING -> R.string.settings_conn_connecting to 0xFFF57C00.toInt()
            AgentService.STATE_ERROR -> R.string.settings_conn_error to 0xFFC62828.toInt()
            AgentService.STATE_DISCONNECTED -> R.string.settings_conn_disconnected to 0xFF9E9E9E.toInt()
            else -> R.string.settings_conn_unknown to 0xFF9E9E9E.toInt()
        }
        tvConnState.setText(textRes)
        tvConnState.setTextColor(color)
        if (state == AgentService.STATE_ERROR && detail.isNotBlank()) {
            tvConnDetail.text = detail
            tvConnDetail.visibility = android.view.View.VISIBLE
        } else {
            tvConnDetail.visibility = android.view.View.GONE
        }
    }

    private fun updateX5State() {
        val state = X5KernelManager.getState()
        val version = X5KernelManager.getLocalVersion()

        val (stateText, stateColor) = when (state) {
            X5KernelManager.KernelState.INSTALLED -> "已安装" to 0xFF2E7D32.toInt()
            X5KernelManager.KernelState.DOWNLOADING -> "下载中..." to 0xFFF57C00.toInt()
            X5KernelManager.KernelState.INSTALLING -> "安装中..." to 0xFFF57C00.toInt()
            X5KernelManager.KernelState.NOT_INSTALLED -> "未安装" to 0xFF9E9E9E.toInt()
            X5KernelManager.KernelState.FAILED -> "安装失败" to 0xFFC62828.toInt()
            X5KernelManager.KernelState.SYSTEM_WEBVIEW -> "使用系统 WebView" to 0xFF9E9E9E.toInt()
        }

        tvX5State.text = stateText
        tvX5State.setTextColor(stateColor)

        if (version > 0) {
            tvX5Version.text = "版本: $version (${version / 10000}.${(version / 100) % 100}.${version % 100})"
        } else {
            tvX5Version.text = "版本: 未安装"
        }
    }

    private fun checkX5Update() {
        val config = AgentConfig.get(this)
        if (config.serverUrl.isBlank()) {
            Toast.makeText(this, "请先配置服务器地址", Toast.LENGTH_SHORT).show()
            return
        }

        if (config.deviceToken.isBlank()) {
            Toast.makeText(this, "设备未注册", Toast.LENGTH_SHORT).show()
            return
        }

        btnX5CheckUpdate.isEnabled = false
        btnX5CheckUpdate.text = "检查中..."

        lifecycleScope.launch {
            try {
                X5KernelManager.checkAndUpdate(
                    context = this@SettingsActivity,
                    serverUrl = config.serverUrl,
                    token = config.deviceToken
                )

                // 等待一秒让状态更新
                kotlinx.coroutines.delay(1000)
                updateX5State()

                btnX5CheckUpdate.isEnabled = true
                btnX5CheckUpdate.text = "手动检查更新"

                val state = X5KernelManager.getState()
                when (state) {
                    X5KernelManager.KernelState.DOWNLOADING,
                    X5KernelManager.KernelState.INSTALLING -> {
                        Toast.makeText(this@SettingsActivity, "正在下载/安装内核，请稍候", Toast.LENGTH_LONG).show()
                    }
                    X5KernelManager.KernelState.INSTALLED -> {
                        Toast.makeText(this@SettingsActivity, "内核已是最新版本", Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        Toast.makeText(this@SettingsActivity, "已触发检查，请稍后查看状态", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                btnX5CheckUpdate.isEnabled = true
                btnX5CheckUpdate.text = "手动检查更新"
                Toast.makeText(this@SettingsActivity, "检查失败: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // 每次回到前台刷新 X5 状态
        updateX5State()
    }
}
