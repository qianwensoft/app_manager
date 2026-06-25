package com.appmanager.agent.ui

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.ServerUrlUtil
import com.appmanager.agent.util.ScanBroadcastHelper
import com.appmanager.agent.util.WorkOrderTypeStore
import com.appmanager.agent.util.WorkOrderStompClient
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

/**
 * 工单处理列表：Admin角色查看所有工单
 * 支持扫码快速查询（使用 search_key）
 * 根据设备配置（AgentConfig.scanMode）自动选择扫描头或摄像头
 */
class WorkOrderListActivity : AppCompatActivity() {

    private lateinit var recyclerView: RecyclerView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var loadingView: ProgressBar
    private lateinit var emptyView: View
    private lateinit var adapter: WorkOrderAdapter

    private val workOrders = mutableListOf<WorkOrder>()
    private var searchKey: String? = null

    private val stompListener = object : WorkOrderStompClient.WorkOrderUpdateListener {
        override fun onWorkOrderUpdated(workOrderId: Int, action: String) {
            runOnUiThread {
                Log.d("WorkOrderList", "Work order updated: id=$workOrderId, action=$action")
                // 刷新列表
                loadWorkOrders()
            }
        }
    }

    private val hardwareScanReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val data = ScanBroadcastHelper.SCAN_EXTRA_KEYS
                .firstNotNullOfOrNull { key -> intent.getStringExtra(key)?.takeIf { it.isNotBlank() } }
                ?: return
            Log.d("WorkOrderListActivity", "hardware scan: action=${intent.action} data=$data")
            handleScanResult(data)
        }
    }

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            handleScanResult(result.contents)
        }
    }

    private fun handleScanResult(code: String) {
        searchKey = code
        supportActionBar?.subtitle = "搜索: $searchKey"
        Toast.makeText(this, "搜索: $searchKey", Toast.LENGTH_SHORT).show()
        invalidateOptionsMenu()
        loadWorkOrders()
    }

    private val requestCameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startBarcodeScan()
        } else {
            Toast.makeText(this, "需要相机权限才能扫码", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_work_order_list)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "工单处理"

        recyclerView = findViewById(R.id.recyclerView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        loadingView = findViewById(R.id.loadingView)
        emptyView = findViewById(R.id.emptyView)
        val btnScan = findViewById<FloatingActionButton>(R.id.btnScan)

        adapter = WorkOrderAdapter(this, workOrders) { wo: WorkOrder ->
            openWorkOrderDetail(wo.id)
        }
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = adapter

        swipeRefresh.setOnRefreshListener {
            loadWorkOrders()
        }

        btnScan.setOnClickListener {
            launchBarcodeScan()
        }

        // 硬件扫描模式下隐藏扫码按钮
        updateScanButtonVisibility()

        // 加载工单类型配置
        WorkOrderTypeStore.loadFromServer(this)

        loadWorkOrders()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        if (searchKey != null) {
            menuInflater.inflate(R.menu.menu_work_order_search, menu)
        }
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_clear_search -> {
                clearSearch()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    override fun onResume() {
        super.onResume()
        updateScanButtonVisibility()
        // 如果是硬件扫描模式，注册广播接收器
        val scanMode = AgentConfig.get(this).scanMode
        if (scanMode == "hardware") {
            val filter = ScanBroadcastHelper.createScanIntentFilter(this)
            ContextCompat.registerReceiver(
                this, hardwareScanReceiver, filter, ContextCompat.RECEIVER_EXPORTED
            )
        }
        // 连接 STOMP 并添加监听器
        WorkOrderStompClient.connect(this)
        WorkOrderStompClient.addListener(stompListener)
        loadWorkOrders()
    }

    override fun onPause() {
        super.onPause()
        try { unregisterReceiver(hardwareScanReceiver) } catch (_: Exception) {}
        // 移除 STOMP 监听器
        WorkOrderStompClient.removeListener(stompListener)
    }

    private fun loadWorkOrders() {
        loadingView.visibility = View.VISIBLE
        swipeRefresh.isRefreshing = false
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())
                if (base.isBlank()) throw Exception("服务器地址未配置")

                val path = buildString {
                    append("/api/agent/work-orders?limit=50")
                    searchKey?.let { append("&search_key=$it") }
                }
                val json = AgentCatalogApi.getJson(base, path, cfg.deviceToken.trim())
                val obj = JSONObject(json)
                val data = obj.optJSONArray("data") ?: throw Exception("返回数据格式错误")

                val list = mutableListOf<WorkOrder>()
                for (i in 0 until data.length()) {
                    val item = data.getJSONObject(i)
                    val tagsArray = item.optJSONArray("tags")
                    val tags = mutableListOf<String>()
                    if (tagsArray != null) {
                        for (j in 0 until tagsArray.length()) {
                            tags.add(tagsArray.getString(j))
                        }
                    }
                    list.add(WorkOrder(
                        id = item.optInt("id"),
                        code = item.optString("code"),
                        title = item.optString("title"),
                        status = item.optString("status"),
                        priority = item.optString("priority"),
                        typeCode = item.optString("type_code"),
                        createdAt = item.optString("created_at"),
                        closedAt = item.optString("closed_at", ""),
                        tags = tags,
                        businessNo = item.optString("business_no", ""),
                        otherCodes = item.optString("other_codes", ""),
                        deviceName = item.optString("device_name_snap", "")
                    ))
                }

                runOnUiThread {
                    loadingView.visibility = View.GONE
                    swipeRefresh.isRefreshing = false
                    workOrders.clear()
                    workOrders.addAll(list)
                    adapter.notifyDataSetChanged()
                    updateEmptyView()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread {
                    loadingView.visibility = View.GONE
                    swipeRefresh.isRefreshing = false
                    Toast.makeText(this, "加载失败: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun launchBarcodeScan() {
        val scanMode = AgentConfig.get(this).scanMode

        // 硬件扫描模式：提示用户使用扫描枪
        if (scanMode == "hardware") {
            Toast.makeText(this, "请使用扫描枪扫描工单码", Toast.LENGTH_SHORT).show()
            return
        }

        // 摄像头扫描模式：检查权限后启动
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startBarcodeScan()
        } else {
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startBarcodeScan() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(
                ScanOptions.QR_CODE,
                ScanOptions.CODE_128,
                ScanOptions.CODE_39,
                ScanOptions.EAN_13,
                ScanOptions.EAN_8
            )
            setPrompt("扫描工单二维码或条形码")
            setCameraId(0)
            setBeepEnabled(true)
            setOrientationLocked(false)
        }
        scanLauncher.launch(options)
    }

    private fun clearSearch() {
        searchKey = null
        supportActionBar?.subtitle = null
        invalidateOptionsMenu()
        loadWorkOrders()
    }

    private fun updateEmptyView() {
        if (workOrders.isEmpty()) {
            emptyView.visibility = View.VISIBLE
            recyclerView.visibility = View.GONE
        } else {
            emptyView.visibility = View.GONE
            recyclerView.visibility = View.VISIBLE
        }
    }

    private fun updateScanButtonVisibility() {
        val scanMode = AgentConfig.get(this).scanMode
        val btnScan = findViewById<FloatingActionButton>(R.id.btnScan)
        btnScan.visibility = if (scanMode == "hardware") View.GONE else View.VISIBLE
    }

    private fun openWorkOrderDetail(woId: Int) {
        val intent = Intent(this, WorkOrderDetailActivity::class.java)
        intent.putExtra("work_order_id", woId)
        startActivity(intent)
    }

    data class WorkOrder(
        val id: Int,
        val code: String,
        val title: String,
        val status: String,
        val priority: String,
        val typeCode: String,
        val createdAt: String,
        val closedAt: String,
        val tags: List<String>,
        val businessNo: String = "",
        val otherCodes: String = "",
        val deviceName: String = ""
    ) {
        fun toMap(): Map<String, Any?> = mapOf(
            "id" to id,
            "code" to code,
            "title" to title,
            "status" to status,
            "priority" to priority,
            "type_code" to typeCode,
            "created_at" to createdAt,
            "closed_at" to closedAt,
            "tags" to tags,
            "business_no" to businessNo,
            "other_codes" to otherCodes,
            "device_name" to deviceName
        )
    }

    class WorkOrderAdapter(
        private val context: Context,
        private val items: List<WorkOrder>,
        private val onClick: (WorkOrder) -> Unit
    ) : RecyclerView.Adapter<WorkOrderAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val cardContent: LinearLayout = view.findViewById(R.id.cardContent)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_work_order_dynamic, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val wo = items[position]
            holder.cardContent.removeAllViews()

            // 获取该类型的卡片模板
            val template = WorkOrderTypeStore.getCardTemplate(context, wo.typeCode)
            val lines = if (template.isNotBlank()) {
                // 使用自定义模板
                WorkOrderTypeStore.renderCardTemplate(context, template, wo.toMap())
            } else {
                // 使用默认布局
                WorkOrderTypeStore.getDefaultCardLines(context, wo.toMap())
            }

            // 动态添加 TextView，如果包含标签则特殊渲染
            lines.forEachIndexed { index, line ->
                // 检测是否是标签行（包含 tags 字段或者原始标签数组）
                if (wo.tags.isNotEmpty() && (line.contains("标签：") || line.contains("、"))) {
                    // 渲染带颜色的标签
                    holder.cardContent.addView(createTagsView(context, wo.tags))
                } else {
                    val tv = TextView(context).apply {
                        text = line
                        textSize = if (index == 0) 15f else 13f
                        setTextColor(
                            if (index == 0) context.getColor(android.R.color.primary_text_light)
                            else context.getColor(android.R.color.secondary_text_light)
                        )
                        setPadding(0, if (index > 0) dpToPx(4) else 0, 0, 0)
                    }
                    holder.cardContent.addView(tv)
                }
            }

            holder.itemView.setOnClickListener { onClick(wo) }
        }

        override fun getItemCount() = items.size

        private fun createTagsView(context: Context, tagCodes: List<String>): View {
            val container = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dpToPx(4), 0, 0)
            }

            // 添加 "标签：" 前缀
            val label = TextView(context).apply {
                text = "标签："
                textSize = 13f
                setTextColor(context.getColor(android.R.color.secondary_text_light))
            }
            container.addView(label)

            // 添加带颜色的标签
            tagCodes.forEach { code ->
                val tagName = WorkOrderTypeStore.getTagName(context, code)
                val tagColor = WorkOrderTypeStore.getTagColor(context, code)

                val tagView = TextView(context).apply {
                    text = tagName
                    textSize = 12f
                    setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2))

                    if (tagColor.isNotBlank()) {
                        // 解析颜色
                        try {
                            val color = android.graphics.Color.parseColor(tagColor)
                            setBackgroundColor(color)
                            setTextColor(android.graphics.Color.WHITE)
                        } catch (e: Exception) {
                            // 颜色解析失败，使用默认样式
                            setTextColor(context.getColor(android.R.color.secondary_text_light))
                        }
                    } else {
                        setTextColor(context.getColor(android.R.color.secondary_text_light))
                    }

                    val params = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        marginEnd = dpToPx(4)
                    }
                    layoutParams = params
                }
                container.addView(tagView)
            }

            return container
        }

        private fun dpToPx(dp: Int): Int {
            return (dp * context.resources.displayMetrics.density).toInt()
        }
    }
}
