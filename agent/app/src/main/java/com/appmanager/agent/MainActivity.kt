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
            // dev：二维码可携带表单调试地址，扫码即把表单运行时指向开发机
            val formBase = json.optString("formAppBaseUrl", "")
            AgentRegistration.applyServerConfig(
                this,
                serverUrl = serverUrl,
                fallbackToken = json.optString("deviceToken", ""),
                formAppBaseUrl = formBase,
            )
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

    /** 连接状态变更广播：用于实时刷新「设备注册」入口的显隐。 */
    private val connStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != AgentService.ACTION_CONN_STATE) return
            runOnUiThread { updateReverseRegisterVisibility() }
        }
    }

    /** MDM 状态变更广播：服务端下发 set_mdm_mode 后触发，实时刷新 MDM 卡片。 */
    private val mdmStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            runOnUiThread { updateMdmCard() }
        }
    }

    /** Token 失效广播：弹出重新登录对话框。 */
    private val tokenExpiredReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            runOnUiThread { showTokenExpiredDialog() }
        }
    }

    /** Device Admin 激活结果回调。 */
    private val daActivationLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { updateMdmCard() }

    /** MDM DO 激活扫码（扫 Web 端生成的 mdm_do_activate 二维码） */
    private val mdmQrLauncher = registerForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        handleMdmDoQr(text)
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
        findViewById<View>(R.id.btnReverseRegister)?.setOnClickListener {
            startActivity(Intent(this, com.appmanager.agent.ui.ReverseRegisterActivity::class.java))
        }
        updateReverseRegisterVisibility()

        window.decorView.post { handleIntent(intent) }
    }

    override fun onResume() {
        super.onResume()
        updateDeviceInfo(AgentConfig.get(this))
        updateReverseRegisterVisibility()
        buildFrontPageTiles()
        updateMdmCard()
    }

    override fun onStart() {
        super.onStart()
        val f = IntentFilter(DeviceProfileSync.ACTION_UI_REFRESH)
        ContextCompat.registerReceiver(this, profileUiReceiver, f, ContextCompat.RECEIVER_NOT_EXPORTED)
        val cf = IntentFilter(AgentService.ACTION_CONN_STATE)
        ContextCompat.registerReceiver(this, connStateReceiver, cf, ContextCompat.RECEIVER_NOT_EXPORTED)
        val mf = IntentFilter("com.appmanager.agent.MDM_STATE_CHANGED")
        ContextCompat.registerReceiver(this, mdmStateReceiver, mf, ContextCompat.RECEIVER_NOT_EXPORTED)
        val tf = IntentFilter(com.appmanager.agent.auth.AgentAuth.ACTION_TOKEN_EXPIRED)
        ContextCompat.registerReceiver(this, tokenExpiredReceiver, tf, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStop() {
        super.onStop()
        try { unregisterReceiver(profileUiReceiver) } catch (_: Exception) {}
        try { unregisterReceiver(connStateReceiver) } catch (_: Exception) {}
        try { unregisterReceiver(mdmStateReceiver) } catch (_: Exception) {}
        try { unregisterReceiver(tokenExpiredReceiver) } catch (_: Exception) {}
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
            "agent_native" -> {
                // agent_native 类型：根据 intent_action 启动对应的 Activity
                val intentAction = (menu["intent_action"] as? String)?.trim()
                if (intentAction.isNullOrEmpty()) {
                    Toast.makeText(this, "菜单配置错误：缺少 intent_action", Toast.LENGTH_SHORT).show()
                    return
                }

                // 使用显式 Intent
                val intent = when (intentAction) {
                    "com.appmanager.agent.WORK_ORDER_LIST" ->
                        Intent(this, com.appmanager.agent.ui.WorkOrderListActivity::class.java)
                    "com.appmanager.agent.MY_WORK_ORDER_LIST" ->
                        Intent(this, com.appmanager.agent.ui.MyWorkOrderListActivity::class.java)
                    else -> {
                        // 其他 intent_action 尝试隐式启动
                        Intent(intentAction)
                    }
                }

                try {
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this, "打开失败: ${e.message}", Toast.LENGTH_SHORT).show()
                    android.util.Log.e("MainActivity", "Failed to open menu with intent: $intentAction", e)
                }
            }
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

    /** Token 失效时弹出重新登录对话框（仅在 Activity 可见时触发）。 */
    private fun showTokenExpiredDialog() {
        if (isFinishing || isDestroyed) return
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("⚠️ 登录已失效")
            .setMessage("用户登录 Token 已过期，请重新登录以继续使用工单、表单等需要用户身份的功能。")
            .setCancelable(false)
            .setPositiveButton("去登录") { _, _ ->
                startActivity(Intent(this, com.appmanager.agent.ui.LoginActivity::class.java))
            }
            .setNegativeButton("稍后再说", null)
            .show()
    }

    /**
     * 硬件扫码头模式：注册一次性广播接收器，等待扫码枪扫描 QR 码。
     * 复用 ScanBroadcastHelper 支持的所有厂商广播格式（内置 + 自定义）。
     */
    private fun launchMdmHardwareScan() {
        val filter = com.appmanager.agent.util.ScanBroadcastHelper.createScanIntentFilter(this)
        var dismissed = false

        val receiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
                if (dismissed) return
                val raw = com.appmanager.agent.util.ScanBroadcastHelper.SCAN_EXTRA_KEYS
                    .mapNotNull { intent?.getStringExtra(it) }
                    .firstOrNull { it.isNotBlank() }
                if (!raw.isNullOrBlank()) {
                    dismissed = true
                    try { unregisterReceiver(this) } catch (_: Exception) {}
                    runOnUiThread { handleMdmDoQr(raw.trim()) }
                }
            }
        }

        try {
            androidx.core.content.ContextCompat.registerReceiver(
                this, receiver, filter,
                androidx.core.content.ContextCompat.RECEIVER_EXPORTED
            )
        } catch (e: Exception) {
            android.widget.Toast.makeText(this, "注册扫码监听失败: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            return
        }

        android.app.AlertDialog.Builder(this)
            .setTitle("📷 等待扫码枪扫码")
            .setMessage("请将扫码头对准 Web 端 MDM 页面「扫码激活」标签中的二维码进行扫描。")
            .setCancelable(true)
            .setNegativeButton("取消") { _, _ ->
                dismissed = true
                try { unregisterReceiver(receiver) } catch (_: Exception) {}
            }
            .setOnCancelListener {
                dismissed = true
                try { unregisterReceiver(receiver) } catch (_: Exception) {}
            }
            .show()
    }

    private fun handleMdmDoQr(qrText: String) {
        try {
            val json = org.json.JSONObject(qrText)
            if (json.optString("type") != "mdm_do_activate") {
                android.widget.Toast.makeText(this, "二维码类型不匹配，请扫描 Web 端 MDM 页面生成的激活码", android.widget.Toast.LENGTH_LONG).show()
                return
            }
            val component = json.optString("component",
                "${packageName}/.admin.DeviceAdminReceiver")

            // 尝试通过 root 激活 Device Owner
            activateDoViaRoot(component)
        } catch (e: Exception) {
            android.widget.Toast.makeText(this, "二维码解析失败: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun activateDoViaRoot(component: String) {
        val dialog = android.app.AlertDialog.Builder(this)
            .setTitle("正在激活 Device Owner...")
            .setMessage("正在通过 root 权限执行 dpm set-device-owner，请稍候...")
            .setCancelable(false)
            .show()

        Thread {
            try {
                val cmd = "dpm set-device-owner $component"
                val process = Runtime.getRuntime().exec(arrayOf("su", "-c", cmd))
                val exitCode = process.waitFor()
                val output = process.inputStream.bufferedReader().readText().trim()
                val errOutput = process.errorStream.bufferedReader().readText().trim()
                val result = if (output.isNotEmpty()) output else if (errOutput.isNotEmpty()) errOutput else "退出码: $exitCode"

                runOnUiThread {
                    dialog.dismiss()
                    if (exitCode == 0) {
                        android.app.AlertDialog.Builder(this)
                            .setTitle("✅ Device Owner 激活成功")
                            .setMessage("$result\n\n高级策略管理功能已解锁！")
                            .setPositiveButton("刷新状态") { _, _ -> updateMdmCard() }
                            .show()
                    } else {
                        android.app.AlertDialog.Builder(this)
                            .setTitle("❌ 激活失败")
                            .setMessage("$result\n\n可能原因：\n• 设备未 root\n• 设备已有其他 Device Owner\n• 存在已登录账号（可添加 android:testOnly=true 绕过）")
                            .setPositiveButton("确定", null)
                            .setNeutralButton("刷新状态") { _, _ -> updateMdmCard() }
                            .show()
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    dialog.dismiss()
                    android.app.AlertDialog.Builder(this)
                        .setTitle("执行失败")
                        .setMessage("${e.message}\n\n设备可能没有 root 权限，请改用 ADB 命令激活。")
                        .setPositiveButton("确定", null)
                        .show()
                }
            }
        }.start()
    }

    /** 刷新 MDM 状态卡片：读取 SharedPreferences + DPM，按策略状态填充 UI。 */
    private fun updateMdmCard() {
        val card          = findViewById<View>(R.id.card_mdm_status)       ?: return
        val tvEnterprise  = findViewById<TextView>(R.id.tvMdmEnterprise)   ?: return
        val tvOwner       = findViewById<TextView>(R.id.tvMdmOwnerBadge)   ?: return
        val tvSecure      = findViewById<TextView>(R.id.tvMdmWriteSecure)  ?: return
        val tvPolicies    = findViewById<TextView>(R.id.tvMdmPolicies)     ?: return
        val divider       = findViewById<View>(R.id.dividerMdmAction)
        val layoutDa      = findViewById<View>(R.id.layout_activate_da)
        val layoutDo      = findViewById<View>(R.id.layout_activate_do)
        val tvDoCmd       = findViewById<TextView>(R.id.tvDoAdbCommand)
        val btnCopyCmd    = findViewById<View>(R.id.btn_copy_do_command)
        val btnDoRefresh  = findViewById<View>(R.id.btn_do_refresh)

        val prefs          = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        val mdmEnabled     = prefs.getBoolean("mdm_enabled", false)
        val enterpriseCode = prefs.getString("enterprise_code", "") ?: ""

        if (!mdmEnabled) {
            card.visibility = View.GONE
            return
        }
        card.visibility = View.VISIBLE
        tvEnterprise.text = if (enterpriseCode.isNotEmpty()) "企业: $enterpriseCode" else "企业: 未关联"

        val dpm    = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val admin  = android.content.ComponentName(this, com.appmanager.agent.admin.DeviceAdminReceiver::class.java)
        val isDA   = dpm.isAdminActive(admin)      // 设备管理员
        val isDO   = dpm.isDeviceOwnerApp(packageName) // Device Owner

        // Device Owner 徽章
        tvOwner.text = when {
            isDO  -> "Device Owner ✓"
            isDA  -> "设备管理员 ✓（DO未激活）"
            else  -> "设备管理员 ✗"
        }
        tvOwner.setBackgroundColor(if (isDO) 0x1A4CAF50 else if (isDA) 0x1AFF9800 else 0x1AF44336)
        tvOwner.setTextColor(if (isDO) 0xFF4CAF50.toInt() else if (isDA) 0xFFE65100.toInt() else 0xFFF44336.toInt())

        val hasWriteSecure = checkSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) ==
                PackageManager.PERMISSION_GRANTED
        tvSecure.text = if (hasWriteSecure) "WRITE_SECURE ✓" else "WRITE_SECURE ✗"
        tvSecure.setBackgroundColor(if (hasWriteSecure) 0x1A4CAF50 else 0x1AF44336)
        tvSecure.setTextColor(if (hasWriteSecure) 0xFF4CAF50.toInt() else 0xFFF44336.toInt())

        // 活跃策略摘要
        if (isDO) {
            val policies = mutableListOf<String>()
            if (dpm.getCameraDisabled(admin))        policies += "• 相机已禁用"
            if (dpm.getScreenCaptureDisabled(admin)) policies += "• 禁止截屏"
            val pwdQuality = dpm.getPasswordQuality(admin)
            if (pwdQuality > android.app.admin.DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED) {
                val label = when (pwdQuality) {
                    android.app.admin.DevicePolicyManager.PASSWORD_QUALITY_NUMERIC      -> "纯数字"
                    android.app.admin.DevicePolicyManager.PASSWORD_QUALITY_ALPHABETIC   -> "字母"
                    android.app.admin.DevicePolicyManager.PASSWORD_QUALITY_ALPHANUMERIC -> "字母+数字"
                    android.app.admin.DevicePolicyManager.PASSWORD_QUALITY_COMPLEX      -> "复杂"
                    else -> "已设置"
                }
                val minLen = dpm.getPasswordMinimumLength(admin)
                policies += "• 密码策略: $label${if (minLen > 0) "，最短${minLen}位" else ""}"
            }
            val lockPkgs = try { dpm.getLockTaskPackages(admin) } catch (_: Exception) { emptyArray() }
            if (lockPkgs.isNotEmpty()) policies += "• Kiosk: ${lockPkgs.joinToString()}"
            tvPolicies.text = policies.joinToString("\n")
            tvPolicies.visibility = if (policies.isEmpty()) View.GONE else View.VISIBLE
        } else {
            tvPolicies.visibility = View.GONE
        }

        // ── 激活引导区块 ──────────────────────────────────────────────
        val needGuide = !isDO
        divider?.visibility  = if (needGuide) View.VISIBLE else View.GONE

        // 步骤一：设备管理员未激活
        layoutDa?.visibility = if (!isDA) View.VISIBLE else View.GONE
        if (!isDA) {
            val btnDa = layoutDa?.findViewById<View>(R.id.btn_activate_da)
            btnDa?.setOnClickListener {
                val intent = android.content.Intent(
                    android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN
                ).apply {
                    putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin)
                    putExtra(
                        android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "激活后管理端可下发设备策略（锁屏策略、应用管控等）"
                    )
                }
                daActivationLauncher.launch(intent)
            }
        }

        // 步骤二：DA 已激活，提示 DO ADB 命令
        layoutDo?.visibility = if (isDA && !isDO) View.VISIBLE else View.GONE
        if (isDA && !isDO) {
            val doCmd = "adb shell dpm set-device-owner ${packageName}/.admin.DeviceAdminReceiver"
            tvDoCmd?.text = doCmd
            btnCopyCmd?.setOnClickListener {
                val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("dpm command", doCmd))
                android.widget.Toast.makeText(this, "已复制", android.widget.Toast.LENGTH_SHORT).show()
            }
            val btnScanQr = layoutDo?.findViewById<View>(R.id.btn_scan_do_qr)
            btnScanQr?.setOnClickListener {
                val scanMode = com.appmanager.agent.config.AgentConfig.get(this).scanMode
                if (scanMode == com.appmanager.agent.config.AgentConfig.SCAN_MODE_HARDWARE) {
                    launchMdmHardwareScan()
                } else {
                    val options = com.journeyapps.barcodescanner.ScanOptions().apply {
                        setDesiredBarcodeFormats(com.journeyapps.barcodescanner.ScanOptions.QR_CODE)
                        setPrompt("扫描 Web MDM 页面的「激活 Device Owner」二维码")
                        setBeepEnabled(false)
                        setCameraId(0)
                    }
                    mdmQrLauncher.launch(options)
                }
            }
            btnDoRefresh?.setOnClickListener { updateMdmCard() }
        }
    }

    /**
     * 「设备注册」入口仅在未正常连接服务器时显示：
     * 未配置服务器地址，或当前连接状态不是「已连接」（断开/出错/连接中）。
     * 正常连接后隐藏，避免日常使用时误触改写配置。
     */
    private fun updateReverseRegisterVisibility() {
        val cfg = AgentConfig.get(this)
        val notConnected = cfg.serverUrl.isEmpty() ||
            AgentService.connState != AgentService.STATE_CONNECTED
        findViewById<View>(R.id.btnReverseRegister)?.visibility =
            if (notConnected) View.VISIBLE else View.GONE
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
