package com.appmanager.agent

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.AppVersions
import com.appmanager.agent.ui.DeviceInfoActivity
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        /** 与 AndroidManifest 中 intent-filter 的 action 一致 */
        const val ACTION_REQUEST_SCREEN = "com.appmanager.agent.ACTION_REQUEST_SCREEN"
        private const val REQUEST_CODE_SCREEN = 1001
    }

    private lateinit var etServerUrl: EditText
    private lateinit var etToken: EditText
    private lateinit var etDeviceAlias: EditText
    private lateinit var etGroupName: EditText
    private lateinit var cbAutoAccept: CheckBox
    private lateinit var cbAllowRemoteScreen: CheckBox
    private lateinit var cbAllowRemoteFilePull: CheckBox
    private lateinit var tvDeviceInfo: TextView

    private val profileUiReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            runOnUiThread {
                val c = AgentConfig.get(this@MainActivity)
                etDeviceAlias.setText(c.deviceAlias)
                etGroupName.setText(c.groupName)
                updateDeviceInfo(c)
            }
        }
    }

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            try {
                val json = JSONObject(result.contents)
                val serverUrl = json.getString("serverUrl")
                val deviceToken = json.getString("deviceToken")

                etServerUrl.setText(serverUrl)
                etToken.setText(deviceToken)

                // 仅更新 URL/Token，保留「自动接受投屏」等本地选项（勿用默认 AgentConfig 覆盖）
                val cur = AgentConfig.get(this)
                AgentConfig.save(
                    this,
                    cur.copy(
                        serverUrl = serverUrl,
                        deviceToken = deviceToken,
                        allowRemoteScreen = cbAllowRemoteScreen.isChecked,
                        allowRemoteFilePull = cbAllowRemoteFilePull.isChecked
                    )
                )
                startForegroundService(Intent(this, AgentService::class.java))
                Toast.makeText(this, "扫码成功，服务已启动", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "二维码格式错误", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val config = AgentConfig.get(this)
        findViewById<TextView>(R.id.tvAppVersion).text =
            getString(R.string.agent_version_label, AppVersions.displayLabel(this))
        tvDeviceInfo = findViewById(R.id.tvDeviceInfo)
        etServerUrl = findViewById(R.id.etServerUrl)
        etToken = findViewById(R.id.etToken)
        etDeviceAlias = findViewById(R.id.etDeviceAlias)
        etGroupName = findViewById(R.id.etGroupName)
        cbAutoAccept = findViewById(R.id.cbAutoAccept)
        cbAllowRemoteScreen = findViewById(R.id.cbAllowRemoteScreen)
        cbAllowRemoteFilePull = findViewById(R.id.cbAllowRemoteFilePull)
        val btnSave = findViewById<Button>(R.id.btnSave)
        val btnScanQR = findViewById<Button>(R.id.btnScanQR)
        val btnDeviceInfo = findViewById<Button>(R.id.btnDeviceInfo)

        etServerUrl.setText(config.serverUrl)
        etToken.setText(config.deviceToken)
        etDeviceAlias.setText(config.deviceAlias)
        etGroupName.setText(config.groupName)
        cbAutoAccept.isChecked = config.autoAcceptScreenCapture
        cbAllowRemoteScreen.isChecked = config.allowRemoteScreen
        cbAllowRemoteFilePull.isChecked = config.allowRemoteFilePull

        updateDeviceInfo(config)

        // Request battery optimization exemption
        requestBatteryOptimizationExemption()

        // Auto-start service if configured
        if (config.serverUrl.isNotEmpty() && config.deviceToken.isNotEmpty()) {
            startForegroundService(Intent(this, AgentService::class.java))
        }

        btnSave.setOnClickListener {
            val cur = AgentConfig.get(this)
            val newConfig = cur.copy(
                serverUrl = etServerUrl.text.toString().trim(),
                deviceToken = etToken.text.toString().trim(),
                deviceAlias = etDeviceAlias.text.toString().trim(),
                groupName = etGroupName.text.toString().trim(),
                autoAcceptScreenCapture = cbAutoAccept.isChecked,
                allowRemoteScreen = cbAllowRemoteScreen.isChecked,
                allowRemoteFilePull = cbAllowRemoteFilePull.isChecked
            )
            AgentConfig.save(this, newConfig)
            updateDeviceInfo(newConfig)
            startForegroundService(Intent(this, AgentService::class.java))
        }

        btnScanQR.setOnClickListener {
            val options = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("扫描Web端二维码接入")
                setCameraId(0)
                setBeepEnabled(false)
                setOrientationLocked(false)
            }
            scanLauncher.launch(options)
        }

        btnDeviceInfo.setOnClickListener {
            startActivity(Intent(this, DeviceInfoActivity::class.java))
        }

        // 等窗口就绪后再弹出系统投屏授权（否则部分机型从 Service 拉起时无反应）
        window.decorView.post { handleIntent(intent) }
    }

    override fun onStart() {
        super.onStart()
        val f = IntentFilter(DeviceProfileSync.ACTION_UI_REFRESH)
        ContextCompat.registerReceiver(
            this,
            profileUiReceiver,
            f,
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    override fun onStop() {
        super.onStop()
        try {
            unregisterReceiver(profileUiReceiver)
        } catch (_: Exception) {
        }
    }

    private fun updateDeviceInfo(config: AgentConfig) {
        val serial = Build.SERIAL
        val group = if (config.groupName.isNotEmpty()) config.groupName else "未分组"
        val alias = if (config.deviceAlias.isNotEmpty()) config.deviceAlias else "未命名"
        tvDeviceInfo.text = "分组: $group\n别名: $alias\n设备号: $serial"
    }

    private var screenCaptureRequested = false

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        screenCaptureRequested = false
        window.decorView.post { handleIntent(intent) }
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action != ACTION_REQUEST_SCREEN) return
        val cfg = AgentConfig.get(this)
        if (!cfg.allowRemoteScreen) {
            Toast.makeText(
                this,
                "未开启「允许远程查看屏幕」，请先在设置中勾选",
                Toast.LENGTH_LONG
            ).show()
            return
        }
        if (screenCaptureRequested) return
        screenCaptureRequested = true

        // 「自动接受」：直接弹出系统屏幕录制授权；关闭时先经本应用确认，避免误触
        if (cfg.autoAcceptScreenCapture) {
            launchSystemScreenCaptureIntent()
        } else {
            AlertDialog.Builder(this)
                .setTitle("远程屏幕请求")
                .setMessage("管理端请求查看本机屏幕，是否打开系统录制授权？")
                .setPositiveButton("允许") { _, _ -> launchSystemScreenCaptureIntent() }
                .setNegativeButton("拒绝") { _, _ -> screenCaptureRequested = false }
                .setOnCancelListener { screenCaptureRequested = false }
                .show()
        }
    }

    private fun launchSystemScreenCaptureIntent() {
        val pm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        @Suppress("DEPRECATION")
        startActivityForResult(pm.createScreenCaptureIntent(), REQUEST_CODE_SCREEN)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_CODE_SCREEN) return
        screenCaptureRequested = false
        if (resultCode == Activity.RESULT_OK && data != null) {
            val intent = Intent(this, AgentService::class.java).apply {
                action = AgentService.ACTION_START_SCREEN
                putExtra(AgentService.EXTRA_RESULT_CODE, resultCode)
                putExtra(AgentService.EXTRA_DATA, data)
            }
            startService(intent)
            moveTaskToBack(true)
        }
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            }
        }
    }
}
