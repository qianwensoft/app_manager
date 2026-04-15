package com.appmanager.agent.ui

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.AgentService
import com.google.android.material.appbar.MaterialToolbar
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject

class SettingsActivity : AppCompatActivity() {

    private lateinit var etServerUrl: EditText
    private lateinit var etToken: EditText
    private lateinit var etDeviceAlias: EditText
    private lateinit var etGroupName: EditText
    private lateinit var cbAutoAccept: CheckBox
    private lateinit var cbAllowRemoteScreen: CheckBox

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            try {
                val json = JSONObject(result.contents)

                if (json.optString("type") == "wireless_adb_guide") {
                    openWirelessDebugSettings()
                    Toast.makeText(
                        this,
                        "请在「无线调试」中点击「使用配对码配对设备」，然后将端口和配对码填入管理平台",
                        Toast.LENGTH_LONG
                    ).show()
                    return@registerForActivityResult
                }

                val serverUrl = json.getString("serverUrl")
                val deviceToken = json.getString("deviceToken")

                val cur = AgentConfig.get(this)
                AgentConfig.save(
                    this,
                    cur.copy(
                        serverUrl = serverUrl,
                        deviceToken = deviceToken,
                        allowRemoteScreen = cbAllowRemoteScreen.isChecked
                    )
                )
                etServerUrl.setText(serverUrl)
                etToken.setText(deviceToken)
                startForegroundService(Intent(this, AgentService::class.java))
                Toast.makeText(this, "扫码成功，服务已启动", Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_OK)
            } catch (_: Exception) {
                Toast.makeText(this, "二维码格式错误", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        etServerUrl = findViewById(R.id.etServerUrl)
        etToken = findViewById(R.id.etToken)
        etDeviceAlias = findViewById(R.id.etDeviceAlias)
        etGroupName = findViewById(R.id.etGroupName)
        cbAutoAccept = findViewById(R.id.cbAutoAccept)
        cbAllowRemoteScreen = findViewById(R.id.cbAllowRemoteScreen)
        val btnScanQR = findViewById<Button>(R.id.btnScanQR)
        val btnSave = findViewById<Button>(R.id.btnSave)

        val config = AgentConfig.get(this)
        etServerUrl.setText(config.serverUrl)
        etToken.setText(config.deviceToken)
        etDeviceAlias.setText(config.deviceAlias)
        etGroupName.setText(config.groupName)
        cbAutoAccept.isChecked = config.autoAcceptScreenCapture
        cbAllowRemoteScreen.isChecked = config.allowRemoteScreen

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

        btnSave.setOnClickListener {
            val cur = AgentConfig.get(this)
            val newConfig = cur.copy(
                serverUrl = etServerUrl.text.toString().trim(),
                deviceToken = etToken.text.toString().trim(),
                deviceAlias = etDeviceAlias.text.toString().trim(),
                groupName = etGroupName.text.toString().trim(),
                autoAcceptScreenCapture = cbAutoAccept.isChecked,
                allowRemoteScreen = cbAllowRemoteScreen.isChecked
            )
            AgentConfig.save(this, newConfig)
            startForegroundService(Intent(this, AgentService::class.java))
            Toast.makeText(this, "已保存", Toast.LENGTH_SHORT).show()
            setResult(Activity.RESULT_OK)
        }
    }

    private fun openWirelessDebugSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val wirelessAdbIntent = Intent("com.android.settings.WIRELESS_DEBUGGING_SETTINGS").apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            try {
                startActivity(wirelessAdbIntent)
                return
            } catch (_: Exception) { }
        }
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            })
        } catch (_: Exception) {
            Toast.makeText(this, "请手动进入「开发者选项 → 无线调试」", Toast.LENGTH_LONG).show()
        }
    }
}
