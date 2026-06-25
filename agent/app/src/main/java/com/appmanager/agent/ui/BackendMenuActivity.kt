package com.appmanager.agent.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.AgentMenuStore
import com.appmanager.agent.MainActivity
import com.appmanager.agent.R
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.card.MaterialCardView

/**
 * 后台管理菜单：包含系统级功能磁贴（设置、权限、设备信息、出站连接器、自定义事件、监听状态）
 * 以及 show_on_agent_home=false 的已下发后台菜单项。
 */
class BackendMenuActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_backend_menu)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        // 系统管理磁贴
        findViewById<View>(R.id.card_tile_settings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        findViewById<View>(R.id.card_tile_runtime_perm).setOnClickListener {
            // 触发权限申请（跳到系统权限页）
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", packageName, null)
                }
            )
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
        findViewById<View>(R.id.card_tile_about).setOnClickListener {
            startActivity(Intent(this, AboutActivity::class.java))
        }
        findViewById<View>(R.id.card_tile_system_update).setOnClickListener {
            startActivity(Intent(this, SystemUpdateActivity::class.java))
        }
        findViewById<View>(R.id.card_tile_printer).setOnClickListener {
            startActivity(Intent(this, PrinterSettingsActivity::class.java))
        }

        // 动态后台推送菜单（show_on_agent_home=false）
        buildBackendPushedMenus()
    }

    private fun buildBackendPushedMenus() {
        val menus = AgentMenuStore.getAllMenuItems(this)
        // 显示所有下发的菜单，不限制 show_on_agent_home
        if (menus.isEmpty()) return

        // 显示标题
        findViewById<View>(R.id.tv_backend_menus_title).visibility = View.VISIBLE

        val container = findViewById<LinearLayout>(R.id.container_backend_tiles)
        addMenuTileRows(container, menus)
    }

    private fun addMenuTileRows(container: LinearLayout, menus: List<Map<String, Any?>>) {
        var row: LinearLayout? = null
        menus.forEachIndexed { i, menu ->
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
            row?.addView(buildMenuTileView(menu))
        }
        // 末行补空格
        val rem = menus.size % 3
        if (rem > 0) {
            repeat(3 - rem) { row?.addView(buildEmptyTile()) }
        }
    }

    private fun buildMenuTileView(menu: Map<String, Any?>): View {
        val title = (menu["title"] as? String).orEmpty()
        val card = layoutInflater.inflate(R.layout.item_menu_tile, null) as MaterialCardView
        card.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            setMargins(dp(6), dp(6), dp(6), dp(6))
        }
        card.findViewById<ImageView>(R.id.tile_icon).setImageResource(android.R.drawable.ic_menu_sort_by_size)
        card.findViewById<TextView>(R.id.tile_label).text = title
        card.setOnClickListener { openMenu(menu) }
        return card
    }

    private fun buildEmptyTile(): View = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(0, 1, 1f).apply {
            setMargins(dp(6), dp(6), dp(6), dp(6))
        }
    }

    private val openMenuLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val menu = pendingMenu
        pendingMenu = null
        if (result.resultCode == android.app.Activity.RESULT_OK && menu != null) {
            openMenuInternal(menu)
        }
    }
    private var pendingMenu: Map<String, Any?>? = null

    private fun openMenu(menu: Map<String, Any?>) {
        if (!com.appmanager.agent.auth.AgentAuth.isLoggedIn(this)) {
            pendingMenu = menu
            openMenuLauncher.launch(
                Intent(this, LoginActivity::class.java)
                    .putExtra(LoginActivity.EXTRA_REQUIRED_HINT, true)
            )
            return
        }
        openMenuInternal(menu)
    }

    private fun openMenuInternal(menu: Map<String, Any?>) {
        val targetType = menu["target_type"] as? String
        android.util.Log.d("BackendMenuActivity", "openMenuInternal: targetType=$targetType, menu=$menu")

        when (targetType) {
            "form_app_entry" -> AgentMenuStore.launchFormAppEntry(this, menu, newTask = true)
            "agent_native" -> {
                // agent_native 类型：根据 intent_action 启动对应的 Activity
                val intentAction = (menu["intent_action"] as? String)?.trim()
                android.util.Log.d("BackendMenuActivity", "agent_native intent_action=$intentAction")

                if (intentAction.isNullOrEmpty()) {
                    android.widget.Toast.makeText(this, "菜单配置错误：缺少 intent_action", android.widget.Toast.LENGTH_SHORT).show()
                    return
                }

                // 使用显式 Intent 避免 exported=false 问题
                val intent = when (intentAction) {
                    "com.appmanager.agent.WORK_ORDER_LIST" -> {
                        android.util.Log.d("BackendMenuActivity", "Creating intent for WorkOrderListActivity")
                        Intent(this, WorkOrderListActivity::class.java)
                    }
                    "com.appmanager.agent.MY_WORK_ORDER_LIST" -> {
                        android.util.Log.d("BackendMenuActivity", "Creating intent for MyWorkOrderListActivity")
                        Intent(this, MyWorkOrderListActivity::class.java)
                    }
                    "com.appmanager.agent.ACTION_OPEN_WIRELESS_ADB" ->
                        Intent(this, MainActivity::class.java) // 无线ADB在MainActivity处理
                    else -> {
                        // 其他 intent_action 尝试隐式启动
                        Intent(intentAction)
                    }
                }

                try {
                    android.util.Log.d("BackendMenuActivity", "Starting activity with intent: $intent")
                    startActivity(intent)
                    android.util.Log.d("BackendMenuActivity", "Activity started successfully")
                } catch (e: Exception) {
                    android.widget.Toast.makeText(this, "打开失败: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                    android.util.Log.e("BackendMenuActivity", "Failed to open menu with intent: $intentAction", e)
                }
            }
            else -> {
                val url = AgentMenuStore.resolveMenuUrl(this, menu) ?: return
                startActivity(
                    Intent(this, ScadaWebViewActivity::class.java)
                        .putExtra(ScadaWebViewActivity.EXTRA_URL, url)
                )
            }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
