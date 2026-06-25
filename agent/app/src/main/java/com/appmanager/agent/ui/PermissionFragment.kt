package com.appmanager.agent.ui

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.appmanager.agent.R
import com.appmanager.agent.service.TouchAccessibilityService
import com.appmanager.agent.util.ForegroundAppDetector
import com.appmanager.agent.util.StorageAccessUtil

class PermissionFragment : Fragment() {

    // ── 运行时权限列表（按版本选择）────────────────────────────────────────────
    private val runtimePerms: List<Pair<String, String>> by lazy {
        buildList {
            add("录音" to Manifest.permission.RECORD_AUDIO)
            add("相机" to Manifest.permission.CAMERA)
            add("精确位置" to Manifest.permission.ACCESS_FINE_LOCATION)
            add("通讯录" to Manifest.permission.READ_CONTACTS)
            add("电话状态" to Manifest.permission.READ_PHONE_STATE)
            add("短信" to Manifest.permission.READ_SMS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add("图片/视频（媒体）" to Manifest.permission.READ_MEDIA_IMAGES)
                add("音频（媒体）" to Manifest.permission.READ_MEDIA_AUDIO)
                add("视频（媒体）" to Manifest.permission.READ_MEDIA_VIDEO)
            } else {
                add("存储读取" to Manifest.permission.READ_EXTERNAL_STORAGE)
                if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                    add("存储写入" to Manifest.permission.WRITE_EXTERNAL_STORAGE)
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add("通知" to Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    /** 一次性申请所有未授权的运行时权限 */
    fun requestAllRuntimePermissions() {
        val ctx = context ?: return
        val denied = runtimePerms
            .filter { (_, perm) -> ContextCompat.checkSelfPermission(ctx, perm) != PackageManager.PERMISSION_GRANTED }
            .map { it.second }
        if (denied.isNotEmpty()) {
            ActivityCompat.requestPermissions(requireActivity(), denied.toTypedArray(), REQ_ALL)
        } else {
            Toast.makeText(ctx, "所有运行时权限已授权", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? = inflater.inflate(R.layout.fragment_permission, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 使用情况访问权限警告横幅
        val warningBanner = view.findViewById<View>(R.id.usageStatsWarning)
        val btnGrantUsageStats = view.findViewById<Button>(R.id.btnGrantUsageStats)

        btnGrantUsageStats.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "无法打开设置页面", Toast.LENGTH_SHORT).show()
            }
        }

        // 一键申请
        view.findViewById<Button>(R.id.btnRequestAll).setOnClickListener {
            requestAllRuntimePermissions()
        }

        // 动态生成运行时权限行
        buildRuntimePermRows(view)

        // ── 特殊权限卡片 ──────────────────────────────────────────────────────
        setupSpecialPermission(
            view.findViewById(R.id.cardAccessibility),
            label = "无障碍服务（触控转发）",
            hint = "开启后可使用 Web 端远程操控触屏",
            checkFn = { isAccessibilityEnabled(requireContext()) },
            grantFn = { openAccessibilityGrant() }
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardOverlay),
            label = "显示在其他应用上层（悬浮窗）",
            hint = "部分功能需要在屏幕上层显示",
            checkFn = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                    Settings.canDrawOverlays(requireContext())
                else true
            },
            grantFn = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:${requireContext().packageName}")
                        )
                    )
                }
            }
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardInstallUnknown),
            label = "安装未知来源应用",
            hint = "允许通过管理平台远程安装 APK",
            checkFn = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    requireContext().packageManager.canRequestPackageInstalls()
                else true
            },
            grantFn = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${requireContext().packageName}")
                        )
                    )
                }
            }
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardManageStorage),
            label = "管理所有文件（完整存储访问）",
            hint = "Android 11+ 需要此权限访问全部文件",
            checkFn = { StorageAccessUtil.isAllFilesAccessGranted(requireContext()) },
            grantFn = { StorageAccessUtil.openManageAllFilesSettings(requireContext()) }
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardAutostart),
            label = "开机自启动",
            hint = "确保设备重启后 Agent 自动连接服务器",
            checkFn = { false },
            grantFn = { openAutostartSettings() },
            unknownState = true
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardWirelessAdb),
            label = "无线调试（ADB over Wi-Fi）",
            hint = "开启后服务器可通过 Wi-Fi 授予 READ_LOGS 等权限，无需 USB",
            checkFn = { isWirelessAdbEnabled(requireContext()) },
            grantFn = { openWirelessAdbSettings() }
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardUsageStats),
            label = "使用情况访问权限",
            hint = "允许 Agent 检测当前前台应用包名并推送到服务器，用于触发器过滤等功能",
            checkFn = { ForegroundAppDetector.hasUsageStatsPermission(requireContext()) },
            grantFn = {
                try {
                    startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                } catch (e: Exception) {
                    Toast.makeText(requireContext(), "无法打开设置页面", Toast.LENGTH_SHORT).show()
                }
            }
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardReadLogs),
            label = "读取日志（READ_LOGS）",
            hint = "需通过「无线 ADB → 授权 READ_LOGS」由服务器授予，授权后重启 Agent 生效",
            checkFn = {
                ContextCompat.checkSelfPermission(
                    requireContext(), "android.permission.READ_LOGS"
                ) == PackageManager.PERMISSION_GRANTED
            },
            grantFn = {
                Toast.makeText(
                    requireContext(),
                    "请在管理平台 Logcat 页「无线 ADB ▾→第三步」点击「授权 READ_LOGS」",
                    Toast.LENGTH_LONG
                ).show()
            },
            grantBtnText = "查看说明"
        )
    }

    override fun onResume() {
        super.onResume()
        val v = view ?: return

        // 更新使用情况访问权限警告横幅显示状态
        val warningBanner = v.findViewById<View>(R.id.usageStatsWarning)
        val hasUsageStatsPermission = ForegroundAppDetector.hasUsageStatsPermission(requireContext())
        warningBanner?.visibility = if (hasUsageStatsPermission) View.GONE else View.VISIBLE

        // 刷新运行时权限行
        refreshRuntimePermRows(v)
        // 刷新特殊权限卡片
        refreshSpecialCards(v)
    }

    // ── 运行时权限行动态构建 ─────────────────────────────────────────────────

    private fun buildRuntimePermRows(root: View) {
        val container = root.findViewById<LinearLayout>(R.id.layoutRuntimePerms)
        container.removeAllViews()
        val inflater = LayoutInflater.from(requireContext())
        runtimePerms.forEach { (name, perm) ->
            val row = inflater.inflate(R.layout.item_permission_v2, container, false)
            row.tag = perm
            container.addView(row)
        }
        refreshRuntimePermRows(root)
    }

    private fun refreshRuntimePermRows(root: View) {
        val container = root.findViewById<LinearLayout>(R.id.layoutRuntimePerms) ?: return
        val ctx = requireContext()
        for (i in 0 until container.childCount) {
            val row = container.getChildAt(i)
            val perm = row.tag as? String ?: continue
            val name = runtimePerms.firstOrNull { it.second == perm }?.first ?: perm
            val granted = ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED

            row.findViewById<TextView>(R.id.tvPermissionName)?.text = name
            val tvStatus = row.findViewById<TextView>(R.id.tvPermissionStatus)
            val btn = row.findViewById<Button>(R.id.btnPermissionGrant)
            if (granted) {
                tvStatus?.text = "已授权"
                tvStatus?.setTextColor(0xFF4CAF50.toInt())
                btn?.text = "已授权"
                btn?.isEnabled = false
                btn?.alpha = 0.5f
            } else {
                tvStatus?.text = "未授权"
                tvStatus?.setTextColor(0xFFF44336.toInt())
                btn?.text = "授权"
                btn?.isEnabled = true
                btn?.alpha = 1f
                btn?.setOnClickListener {
                    ActivityCompat.requestPermissions(requireActivity(), arrayOf(perm), REQ_SINGLE)
                }
            }
        }
    }

    // ── 特殊权限卡片 ─────────────────────────────────────────────────────────

    private fun setupSpecialPermission(
        card: View,
        label: String,
        hint: String,
        checkFn: () -> Boolean,
        grantFn: () -> Unit,
        unknownState: Boolean = false,
        grantBtnText: String? = null
    ) {
        val tvStatus = card.findViewById<TextView>(R.id.tvAccessibilityStatus) ?: return
        val btn = card.findViewById<Button>(R.id.btnAccessibility) ?: return
        card.findViewWithTag<TextView>("label")?.text = label
        card.findViewWithTag<TextView>("hint")?.text = hint
        if (grantBtnText != null) btn.text = grantBtnText

        fun refresh() {
            if (unknownState) {
                tvStatus.text = "状态未知，点击前往设置"
                tvStatus.setTextColor(0xFFFF9800.toInt())
                btn.text = grantBtnText ?: "前往设置"
            } else {
                val granted = checkFn()
                if (granted) {
                    tvStatus.text = "已授权 ✓"
                    tvStatus.setTextColor(0xFF4CAF50.toInt())
                    btn.text = grantBtnText ?: "重新设置"
                } else {
                    tvStatus.text = "未授权"
                    tvStatus.setTextColor(0xFFF44336.toInt())
                    btn.text = grantBtnText ?: "前往授权"
                }
            }
        }
        refresh()
        btn.setOnClickListener { grantFn(); refresh() }
        card.tag = Runnable { refresh() }
    }

    private fun refreshSpecialCards(root: View) {
        listOf(
            R.id.cardAccessibility, R.id.cardOverlay, R.id.cardInstallUnknown,
            R.id.cardManageStorage, R.id.cardAutostart, R.id.cardWirelessAdb, R.id.cardReadLogs
        ).forEach { id ->
            (root.findViewById<View>(id)?.tag as? Runnable)?.run()
        }
    }

    // ── 辅助方法 ─────────────────────────────────────────────────────────────

    /**
     * 打开无障碍授权。Android 13+ 对侧载/会话安装的应用默认把无障碍开关锁为
     * 「受限制的设置」，直接跳无障碍页用户也点不动。此时先引导到「应用详情」让用户
     * 通过右上角菜单「允许受限制的设置」解锁，再回无障碍页开启。
     */
    private fun openAccessibilityGrant() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            AlertDialog.Builder(requireContext())
                .setTitle("开启无障碍服务")
                .setMessage(
                    "Android 13 及以上对本应用的无障碍开关默认锁定为「受限制的设置」。\n\n" +
                    "若在无障碍页面无法开启（开关变灰），请按以下步骤解锁：\n" +
                    "1. 点「去应用详情」\n" +
                    "2. 点右上角 ⋮ 菜单 →「允许受限制的设置」\n" +
                    "3. 返回后再进无障碍页面开启本应用"
                )
                .setPositiveButton("去无障碍页面") { _, _ ->
                    runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
                }
                .setNeutralButton("去应用详情") { _, _ ->
                    runCatching {
                        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                            data = Uri.fromParts("package", requireContext().packageName, null)
                        })
                    }
                }
                .setNegativeButton("取消", null)
                .show()
        } else {
            runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }
    }

    private fun isAccessibilityEnabled(ctx: Context): Boolean {
        val service = "${ctx.packageName}/${TouchAccessibilityService::class.java.canonicalName}"
        val enabled = Settings.Secure.getString(
            ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(":").any { it.equals(service, ignoreCase = true) }
    }

    private fun isWirelessAdbEnabled(ctx: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Settings.Global.getInt(ctx.contentResolver, "adb_wifi_enabled", 0) == 1
            } else {
                val adbEnabled = Settings.Global.getInt(ctx.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
                val port = Settings.Global.getInt(ctx.contentResolver, "service.adb.tcp.port", -1)
                adbEnabled && port > 0
            }
        } catch (e: Exception) { false }
    }

    private fun openWirelessAdbSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                startActivity(Intent("com.android.settings.WIRELESS_DEBUGGING_SETTINGS").apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                })
                return
            } catch (_: Exception) { }
        }
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
            Toast.makeText(requireContext(), "请在「开发者选项」中开启「无线调试」", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_SETTINGS))
        }
    }

    private fun openAutostartSettings() {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intent = when {
            manufacturer.contains("xiaomi") -> safeIntent(Intent().apply {
                component = ComponentName(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"
                )
            })
            manufacturer.contains("huawei") || manufacturer.contains("honor") -> safeIntent(Intent().apply {
                component = ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                )
            })
            manufacturer.contains("oppo") -> safeIntent(Intent().apply {
                component = ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.FakeActivity"
                )
            })
            manufacturer.contains("vivo") -> safeIntent(Intent().apply {
                component = ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                )
            })
            manufacturer.contains("samsung") -> safeIntent(Intent().apply {
                component = ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.battery.ui.BatteryActivity"
                )
            })
            else -> null
        }
        if (intent != null) {
            startActivity(intent)
        } else {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${requireContext().packageName}")
                }
            )
            Toast.makeText(requireContext(), "请在「自启动」或「电池」设置中允许本应用自启", Toast.LENGTH_LONG).show()
        }
    }

    private fun safeIntent(intent: Intent): Intent? {
        return try {
            if (requireContext().packageManager.resolveActivity(intent, 0) != null) intent else null
        } catch (e: Exception) { null }
    }

    companion object {
        const val REQ_ALL = 200
        const val REQ_SINGLE = 201
    }
}
