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
import android.text.TextUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.appmanager.agent.R
import com.appmanager.agent.service.TouchAccessibilityService

class PermissionFragment : Fragment() {

    // 运行时权限（普通弹框申请）
    private val runtimeItems: List<RuntimePermItem> by lazy {
        buildList {
            // 存储：API 33+ 用分类媒体权限
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(RuntimePermItem("图片/视频存储", Manifest.permission.READ_MEDIA_IMAGES))
                add(RuntimePermItem("音频存储", Manifest.permission.READ_MEDIA_AUDIO))
            } else {
                add(RuntimePermItem("存储读写", Manifest.permission.READ_EXTERNAL_STORAGE))
            }
            add(RuntimePermItem("录音", Manifest.permission.RECORD_AUDIO))
            add(RuntimePermItem("相机", Manifest.permission.CAMERA))
            add(RuntimePermItem("位置", Manifest.permission.ACCESS_FINE_LOCATION))
            add(RuntimePermItem("通讯录", Manifest.permission.READ_CONTACTS))
            add(RuntimePermItem("电话", Manifest.permission.READ_PHONE_STATE))
            add(RuntimePermItem("短信", Manifest.permission.READ_SMS))
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? = inflater.inflate(R.layout.fragment_permission, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 运行时权限列表
        val rvRuntime = view.findViewById<RecyclerView>(R.id.recyclerView)
        rvRuntime.layoutManager = LinearLayoutManager(requireContext())
        rvRuntime.adapter = RuntimePermAdapter(runtimeItems) { perm ->
            ActivityCompat.requestPermissions(requireActivity(), arrayOf(perm), 100)
        }

        // 特殊权限区域
        setupSpecialPermission(
            view.findViewById(R.id.cardAccessibility),
            label = "无障碍服务（触控转发）",
            checkFn = { isAccessibilityEnabled(requireContext()) },
            grantFn = { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
            hint = "开启后可使用 Web 端远程操控触屏"
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardOverlay),
            label = "显示在其他应用上层（悬浮窗）",
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
            },
            hint = "部分功能需要在屏幕上层显示"
        )

        setupSpecialPermission(
            view.findViewById(R.id.cardAutostart),
            label = "开机自启动",
            checkFn = { false }, // 无法可靠检测，始终显示引导按钮
            grantFn = { openAutostartSettings() },
            hint = "确保设备重启后 Agent 自动连接服务器",
            unknownState = true
        )
    }

    override fun onResume() {
        super.onResume()
        view?.let { refreshSpecialPermissionStatus(it) }
    }

    private fun setupSpecialPermission(
        card: View,
        label: String, checkFn: () -> Boolean, grantFn: () -> Unit,
        hint: String, unknownState: Boolean = false
    ) {
        val tvStatus = card.findViewById<TextView>(R.id.tvAccessibilityStatus) ?: return
        val btn = card.findViewById<Button>(R.id.btnAccessibility) ?: return
        val tvLabel = card.findViewWithTag<TextView>("label")
        val tvHint = card.findViewWithTag<TextView>("hint")
        tvLabel?.text = label
        tvHint?.text = hint

        fun refresh() {
            val granted = if (!unknownState) checkFn() else false
            if (unknownState) {
                tvStatus.text = "状态未知，点击前往设置"
                tvStatus.setTextColor(0xFFFF9800.toInt())
            } else if (granted) {
                tvStatus.text = "已授权"
                tvStatus.setTextColor(0xFF4CAF50.toInt())
            } else {
                tvStatus.text = "未授权"
                tvStatus.setTextColor(0xFFF44336.toInt())
            }
            btn.text = if (!unknownState && granted) "重新设置" else "前往授权"
        }
        refresh()
        btn.setOnClickListener { grantFn(); refresh() }
        card.tag = Runnable { refresh() }
    }

    private fun refreshSpecialPermissionStatus(root: View) {
        (root.findViewById<View>(R.id.cardAccessibility)?.tag as? Runnable)?.run()
        (root.findViewById<View>(R.id.cardOverlay)?.tag as? Runnable)?.run()
        (root.findViewById<View>(R.id.cardAutostart)?.tag as? Runnable)?.run()
    }

    private fun isAccessibilityEnabled(ctx: Context): Boolean {
        val service = "${ctx.packageName}/${TouchAccessibilityService::class.java.canonicalName}"
        val enabled = Settings.Secure.getString(
            ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(":").any {
            it.equals(service, ignoreCase = true)
        }
    }

    private fun openAutostartSettings() {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intent = when {
            manufacturer.contains("xiaomi") -> safeIntent(
                Intent().apply {
                    component = ComponentName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.autostart.AutoStartManagementActivity"
                    )
                }
            )
            manufacturer.contains("huawei") || manufacturer.contains("honor") -> safeIntent(
                Intent().apply {
                    component = ComponentName(
                        "com.huawei.systemmanager",
                        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                    )
                }
            )
            manufacturer.contains("oppo") -> safeIntent(
                Intent().apply {
                    component = ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.permission.startup.FakeActivity"
                    )
                }
            )
            manufacturer.contains("vivo") -> safeIntent(
                Intent().apply {
                    component = ComponentName(
                        "com.vivo.permissionmanager",
                        "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                    )
                }
            )
            manufacturer.contains("samsung") -> safeIntent(
                Intent().apply { component = ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity") }
            )
            else -> null
        }
        if (intent != null) {
            startActivity(intent)
        } else {
            // 降级：打开应用详情
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
            val resolved = requireContext().packageManager.resolveActivity(intent, 0)
            if (resolved != null) intent else null
        } catch (e: Exception) {
            null
        }
    }
}

data class RuntimePermItem(val name: String, val permission: String)

class RuntimePermAdapter(
    private val items: List<RuntimePermItem>,
    private val onRequest: (String) -> Unit
) : RecyclerView.Adapter<RuntimePermAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvName: TextView = view.findViewById(R.id.tvPermissionName)
        val tvStatus: TextView = view.findViewById(R.id.tvPermissionStatus)
        val btnGrant: Button = view.findViewById(R.id.btnPermissionGrant)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_permission_v2, parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        val ctx = holder.itemView.context
        val granted = ContextCompat.checkSelfPermission(ctx, item.permission) ==
                PackageManager.PERMISSION_GRANTED
        holder.tvName.text = item.name
        if (granted) {
            holder.tvStatus.text = "已授权"
            holder.tvStatus.setTextColor(0xFF4CAF50.toInt())
            holder.btnGrant.text = "已授权"
            holder.btnGrant.isEnabled = false
        } else {
            holder.tvStatus.text = "未授权"
            holder.tvStatus.setTextColor(0xFFF44336.toInt())
            holder.btnGrant.text = "授权"
            holder.btnGrant.isEnabled = true
            holder.btnGrant.setOnClickListener { onRequest(item.permission) }
        }
    }
}
