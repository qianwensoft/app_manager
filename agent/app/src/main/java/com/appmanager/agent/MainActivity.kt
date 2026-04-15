package com.appmanager.agent

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ui.CatalogListActivity
import com.appmanager.agent.ui.DeviceListenStateActivity
import com.appmanager.agent.ui.DeviceInfoActivity
import com.appmanager.agent.ui.SettingsActivity
import com.appmanager.agent.util.AppVersions

class MainActivity : AppCompatActivity() {

    companion object {
        /** 与 AndroidManifest 中 intent-filter 的 action 一致 */
        const val ACTION_REQUEST_SCREEN = "com.appmanager.agent.ACTION_REQUEST_SCREEN"
        private const val REQUEST_CODE_SCREEN = 1001
    }

    private lateinit var tvDeviceInfo: TextView

    private val settingsLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            updateDeviceInfo(AgentConfig.get(this))
        }
    }

    private val profileUiReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            runOnUiThread {
                updateDeviceInfo(AgentConfig.get(this@MainActivity))
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

        updateDeviceInfo(config)

        requestBatteryOptimizationExemption()
        requestAllRuntimePermissions()

        if (config.serverUrl.isNotEmpty() && config.deviceToken.isNotEmpty()) {
            startForegroundService(Intent(this, AgentService::class.java))
        }

        findViewById<View>(R.id.card_tile_personal).setOnClickListener {
            settingsLauncher.launch(Intent(this, SettingsActivity::class.java))
        }
        findViewById<View>(R.id.card_tile_runtime_perm).setOnClickListener {
            requestAllRuntimePermissions()
        }
        findViewById<View>(R.id.card_tile_settings).setOnClickListener {
            settingsLauncher.launch(Intent(this, SettingsActivity::class.java))
        }
        findViewById<View>(R.id.card_tile_app_list).setOnClickListener {
            Toast.makeText(this, R.string.toast_coming_soon, Toast.LENGTH_SHORT).show()
        }
        findViewById<View>(R.id.card_tile_device_info).setOnClickListener {
            startActivity(Intent(this, DeviceInfoActivity::class.java))
        }
        findViewById<View>(R.id.card_tile_perm_mgmt).setOnClickListener {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", packageName, null)
                }
            )
        }
        findViewById<View>(R.id.card_tile_outbound).setOnClickListener {
            startActivity(
                Intent(this, CatalogListActivity::class.java).apply {
                    putExtra(CatalogListActivity.EXTRA_MODE, CatalogListActivity.MODE_OUTBOUND)
                }
            )
        }
        findViewById<View>(R.id.card_tile_custom_events).setOnClickListener {
            startActivity(
                Intent(this, CatalogListActivity::class.java).apply {
                    putExtra(CatalogListActivity.EXTRA_MODE, CatalogListActivity.MODE_CUSTOM_EVENTS)
                }
            )
        }
        findViewById<View>(R.id.card_tile_listen_state).setOnClickListener {
            startActivity(Intent(this, DeviceListenStateActivity::class.java))
        }

        window.decorView.post { handleIntent(intent) }
    }

    override fun onResume() {
        super.onResume()
        updateDeviceInfo(AgentConfig.get(this))
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

    private fun requestAllRuntimePermissions() {
        val perms = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            add(Manifest.permission.CAMERA)
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.READ_CONTACTS)
            add(Manifest.permission.READ_PHONE_STATE)
            add(Manifest.permission.READ_SMS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.READ_MEDIA_IMAGES)
                add(Manifest.permission.READ_MEDIA_AUDIO)
                add(Manifest.permission.READ_MEDIA_VIDEO)
                add(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                add(Manifest.permission.READ_EXTERNAL_STORAGE)
                if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                    add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                }
            }
        }
        val denied = perms.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (denied.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, denied.toTypedArray(), 300)
        }
    }
}
