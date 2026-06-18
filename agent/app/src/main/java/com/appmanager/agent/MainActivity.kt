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
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.config.AgentRegistration
import com.appmanager.agent.auth.AgentAuth
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ui.BackendMenuActivity
import com.appmanager.agent.ui.PersonalCenterActivity
import com.appmanager.agent.ui.ScadaWebViewActivity
import com.appmanager.agent.ui.SettingsActivity
import com.appmanager.agent.util.AppVersions
import com.appmanager.agent.util.DeviceMachineId
import com.appmanager.agent.util.WirelessAdbHelper
import com.google.android.material.card.MaterialCardView
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class MainActivity : AppCompatActivity() {

    companion object {
        const val ACTION_REQUEST_SCREEN = "com.appmanager.agent.ACTION_REQUEST_SCREEN"
        const val ACTION_OPEN_SCADA_MENU = "com.appmanager.agent.ACTION_OPEN_SCADA_MENU"
        const val ACTION_OPEN_WIRELESS_ADB = WirelessAdbHelper.ACTION_OPEN
        private const val REQUEST_CODE_SCREEN = 1001
    }

    private lateinit var tvDeviceInfo: TextView

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        val cfg = AgentRegistration.ensureMachineCodeConfig(this)
        if (WirelessAdbHelper.handleGuideQr(this, text, cfg.deviceToken) { deviceId, tokenMatched ->
                if (cfg.serverUrl.isNotEmpty() && cfg.deviceToken.isNotEmpty()) {
                    startForegroundService(Intent(this, AgentService::class.java))
                }
                AgentService.reportWirelessAdbGuideAck(this, deviceId, tokenMatched)
            }
        ) return@registerForActivityResult

        try {
            val json = org.json.JSONObject(text)
            val serverUrl = json.getString("serverUrl")
            val deviceToken = resolveRegistrationToken(json.optString("deviceToken", ""))
            // dev：二维码可携带表单调试地址，扫码即把表单运行时指向开发机
            val formBase = json.optString("formAppBaseUrl", "")
            val cur = AgentConfig.get(this)
            AgentConfig.save(this, cur.copy(serverUrl = serverUrl, deviceToken = deviceToken, formAppBaseUrl = formBase, allowRemoteScreen = cur.allowRemoteScreen))
            startForegroundService(Intent(this, AgentService::class.java))
            Toast.makeText(this, "扫码成功，服务已启动", Toast.LENGTH_SHORT).show()
            updateDeviceInfo(AgentRegistration.ensureMachineCodeConfig(this))
        } catch (_: Exception) {
            Toast.makeText(this, "二维码格式错误", Toast.LENGTH_SHORT).show()
        }
    }

    private val refreshProfileLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            updateDeviceInfo(AgentRegistration.ensureMachineCodeConfig(this))
        }
    }

    /** 未登录点击菜单时拉起登录页；登录成功后继续打开原目标菜单。 */
    private var pendingMenu: Map<String, Any?>? = null
    private val loginLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val menu = pendingMenu
        pendingMenu = null
        if (result.resultCode == Activity.RESULT_OK && menu != null) {
            openMenuInternal(menu)
        }
        // 取消登录则留在首页，不打开目标菜单
    }

    private val profileUiReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            runOnUiThread {
                updateDeviceInfo(AgentConfig.get(this@MainActivity))
                buildFrontPageTiles()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val config = AgentRegistration.ensureMachineCodeConfig(this)
        findViewById<TextView>(R.id.tvAppVersion).text =
            getString(R.string.agent_version_label, AppVersions.displayLabel(this))
        tvDeviceInfo = findViewById(R.id.tvDeviceInfo)

        updateDeviceInfo(config)
        requestBatteryOptimizationExemption()
        requestAllRuntimePermissions()

        if (config.serverUrl.isNotEmpty() && config.deviceToken.isNotEmpty()) {
            startForegroundService(Intent(this, AgentService::class.java))
        }

        // 个人中心（固定）在 buildFrontPageTiles 里渲染
        buildFrontPageTiles()

        // 后台管理入口
        findViewById<View>(R.id.card_backend_entry).setOnClickListener {
            startActivity(Intent(this, BackendMenuActivity::class.java))
        }

        findViewById<View>(R.id.btnMainScanQr)?.setOnClickListener { launchQrScan() }

        window.decorView.post { handleIntent(intent) }
    }

    override fun onResume() {
        super.onResume()
        updateDeviceInfo(AgentConfig.get(this))
        buildFrontPageTiles()
    }

    override fun onStart() {
        super.onStart()
        val f = IntentFilter(DeviceProfileSync.ACTION_UI_REFRESH)
        ContextCompat.registerReceiver(this, profileUiReceiver, f, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStop() {
        super.onStop()
        try { unregisterReceiver(profileUiReceiver) } catch (_: Exception) {}
    }

    // ── 动态前台磁贴 ─────────────────────────────────────────────────

    /**
     * 重建前台磁贴区：
     * - 第一格固定为「个人中心」
     * - 后续依次追加 show_on_agent_home=true 的已下发菜单
     */
    private fun buildFrontPageTiles() {
        val container = findViewById<LinearLayout>(R.id.container_front_tiles) ?: return
        container.removeAllViews()

        data class TileItem(val label: String, val icon: Int, val onClick: () -> Unit)

        val items = mutableListOf<TileItem>()

        // 个人中心（始终第一）
        items += TileItem(getString(R.string.main_tile_personal), android.R.drawable.ic_menu_myplaces) {
            refreshProfileLauncher.launch(Intent(this, PersonalCenterActivity::class.java))
        }

        // 问题反馈（固定第二，原生采集入口）
        items += TileItem(getString(R.string.main_tile_feedback), android.R.drawable.ic_menu_send) {
            startActivity(Intent(this, com.appmanager.agent.ui.FeedbackActivity::class.java))
        }

        // 前台推送菜单（show_on_agent_home=true）
        AgentMenuStore.getAllMenuItems(this)
            .filter { m -> m["show_on_agent_home"] as? Boolean == true }
            .forEach { menu ->
                val title = (menu["title"] as? String).orEmpty().ifEmpty { return@forEach }
                items += TileItem(title, android.R.drawable.ic_menu_sort_by_size) {
                    openMenu(menu)
                }
            }

        // 按行每 3 个排列
        var row: LinearLayout? = null
        items.forEachIndexed { i, item ->
            if (i % 3 == 0) {
                row = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                }
                container.addView(row)
            }
            row?.addView(buildTileView(item.label, item.icon, item.onClick))
        }
        // 末行用空 View 补齐至 3 列
        val rem = items.size % 3
        if (rem > 0) repeat(3 - rem) { row?.addView(buildEmptyTile()) }
    }

    private fun buildTileView(label: String, iconRes: Int, onClick: () -> Unit): View {
        val card = layoutInflater.inflate(R.layout.item_menu_tile, null) as MaterialCardView
        card.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            setMargins(dp(6), dp(6), dp(6), dp(6))
        }
        card.findViewById<ImageView>(R.id.tile_icon).setImageResource(iconRes)
        card.findViewById<TextView>(R.id.tile_label).text = label
        card.setOnClickListener { onClick() }
        return card
    }

    private fun buildEmptyTile(): View = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(0, 1, 1f).apply {
            setMargins(dp(6), dp(6), dp(6), dp(6))
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    // ── 菜单打开 ──────────────────────────────────────────────────────

    private fun openMenu(menu: Map<String, Any?>) {
        // 登录守卫：未登录先拉起登录页，登录成功后再打开目标菜单
        if (!AgentAuth.isLoggedIn(this)) {
            pendingMenu = menu
            loginLauncher.launch(
                Intent(this, com.appmanager.agent.ui.LoginActivity::class.java)
                    .putExtra(com.appmanager.agent.ui.LoginActivity.EXTRA_REQUIRED_HINT, true)
            )
            return
        }
        openMenuInternal(menu)
    }

    private fun openMenuInternal(menu: Map<String, Any?>) {
        when (menu["target_type"] as? String) {
            "form_app_entry" -> AgentMenuStore.launchFormAppEntry(this, menu, newTask = true)
            else -> openScadaUrl(AgentMenuStore.resolveMenuUrl(this, menu))
        }
    }

    private fun openScadaUrl(url: String?) {
        if (url.isNullOrBlank()) {
            Toast.makeText(this, "暂无下发菜单", Toast.LENGTH_SHORT).show()
            return
        }
        startActivity(Intent(this, ScadaWebViewActivity::class.java).putExtra(ScadaWebViewActivity.EXTRA_URL, url))
    }

    // ── Intent 处理 ───────────────────────────────────────────────────

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        screenCaptureRequested = false
        window.decorView.post { handleIntent(intent) }
    }

    private fun handleIntent(intent: Intent?) {
        val action = intent?.action ?: return
        if (action == ACTION_OPEN_SCADA_MENU) {
            val extra = intent.getStringExtra("extra_params")
            val url = AgentMenuStore.getFirstHomePreviewUrl(this)
            val finalUrl = if (!extra.isNullOrBlank() && url != null)
                if (url.contains("?")) "$url&$extra" else "$url?$extra"
            else url
            AgentMenuStore.getFirstHomeFormAppMenu(this)?.let {
                AgentMenuStore.launchFormAppEntry(this, it); return
            }
            openScadaUrl(finalUrl)
            return
        }
        if (action == ACTION_OPEN_WIRELESS_ADB) {
            WirelessAdbHelper.openWirelessDebugSettings(this); return
        }
        val menuItem = AgentMenuStore.getMenuByIntent(this, action)
        if (menuItem != null && WirelessAdbHelper.isNativeMenuTarget(menuItem.targetType, menuItem.targetRef)) {
            WirelessAdbHelper.openWirelessDebugSettings(this); return
        }
        if (menuItem?.targetType == "form_app_entry") {
            AgentMenuStore.launchFormAppEntry(this, mapOf(
                "target_type" to menuItem.targetType,
                "target_ref" to menuItem.targetRef,
                "form_app_code" to menuItem.formAppCode,
                "form_app_page_key" to menuItem.formAppPageKey,
            ))
            AgentMenuExecutionReporter.report(this, intentAction = action, eventType = "intent_open",
                scanValue = intent.getStringExtra("scan_data") ?: "",
                targetUrl = "/form-app/runtime/${menuItem.formAppCode ?: menuItem.targetRef}", status = "success")
            return
        }
        val menuUrl = AgentMenuStore.getPreviewUrlByIntent(this, action)
        if (menuUrl != null) {
            val extra = intent.getStringExtra("extra_params")
            val url = if (!extra.isNullOrBlank()) if (menuUrl.contains("?")) "$menuUrl&$extra" else "$menuUrl?$extra" else menuUrl
            startActivity(Intent(this, ScadaWebViewActivity::class.java).putExtra(ScadaWebViewActivity.EXTRA_URL, url))
            AgentMenuExecutionReporter.report(this, intentAction = action, eventType = "intent_open",
                scanValue = intent.getStringExtra("scan_data") ?: "", targetUrl = url, status = "success")
            return
        }
        if (action != ACTION_REQUEST_SCREEN) return
        val cfg = AgentConfig.get(this)
        if (!cfg.allowRemoteScreen) {
            Toast.makeText(this, "未开启「允许远程查看屏幕」，请先在设置中勾选", Toast.LENGTH_LONG).show()
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

    private var screenCaptureRequested = false

    private fun launchSystemScreenCaptureIntent() {
        val pm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        @Suppress("DEPRECATION")
        startActivityForResult(pm.createScreenCaptureIntent(), REQUEST_CODE_SCREEN)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_CODE_SCREEN) return
        screenCaptureRequested = false
        if (resultCode == Activity.RESULT_OK && data != null) {
            // Android 14: mediaProjection FGS must be started from Activity context (onActivityResult).
            startForegroundService(Intent(this, com.appmanager.agent.service.ScreenProjectionForegroundService::class.java))
            val intent = Intent(this, AgentService::class.java).apply {
                action = AgentService.ACTION_START_SCREEN
                putExtra(AgentService.EXTRA_RESULT_CODE, resultCode)
                putExtra(AgentService.EXTRA_DATA, data)
            }
            startService(intent)
            moveTaskToBack(true)
        }
    }

    // ── 其他 ───────────────────────────────────────────────────────────

    private fun launchQrScan() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            setPrompt("扫描管理平台二维码")
            setCameraId(0)
            setBeepEnabled(false)
            setOrientationLocked(false)
        }
        scanLauncher.launch(options)
    }

    private fun updateDeviceInfo(config: AgentConfig) {
        val machineCode = DeviceMachineId.get(this)
        val group = if (config.groupName.isNotEmpty()) config.groupName else "未分组"
        val alias = if (config.deviceAlias.isNotEmpty()) config.deviceAlias else "未命名"
        val codeLine = if (machineCode.isNotEmpty()) machineCode else "未获取"
        tvDeviceInfo.text = "分组: $group\n别名: $alias\n机器码: $codeLine"
    }

    private fun resolveRegistrationToken(fallbackFromQr: String): String {
        val code = DeviceMachineId.get(this)
        return if (code.isNotEmpty()) code else fallbackFromQr.trim()
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                })
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
                if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
        val denied = perms.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (denied.isNotEmpty()) ActivityCompat.requestPermissions(this, denied.toTypedArray(), 300)
    }
}
