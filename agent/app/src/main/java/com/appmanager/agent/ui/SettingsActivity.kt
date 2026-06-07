package com.appmanager.agent.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.config.AgentRegistration
import com.appmanager.agent.util.DeviceMachineId
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.WirelessAdbHelper
import com.google.android.material.appbar.MaterialToolbar
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject

class SettingsActivity : AppCompatActivity() {

    private lateinit var etServerUrl: EditText
    private lateinit var etToken: EditText
    private lateinit var cbAutoAccept: CheckBox
    private lateinit var cbAllowRemoteScreen: CheckBox

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        etServerUrl = findViewById(R.id.etServerUrl)
        etToken = findViewById(R.id.etToken)
        cbAutoAccept = findViewById(R.id.cbAutoAccept)
        cbAllowRemoteScreen = findViewById(R.id.cbAllowRemoteScreen)
        val btnScanQR = findViewById<Button>(R.id.btnScanQR)
        val btnSave = findViewById<Button>(R.id.btnSave)

        val config = AgentRegistration.ensureMachineCodeConfig(this)
        etServerUrl.setText(config.serverUrl)
        etToken.setText(config.deviceToken)
        etToken.isEnabled = false
        etToken.isFocusable = false
        etToken.isFocusableInTouchMode = false
        cbAutoAccept.isChecked = config.autoAcceptScreenCapture
        cbAllowRemoteScreen.isChecked = config.allowRemoteScreen

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
                autoAcceptScreenCapture = cbAutoAccept.isChecked,
                allowRemoteScreen = cbAllowRemoteScreen.isChecked
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
}
