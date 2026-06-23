package com.appmanager.agent.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
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
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

/**
 * 我的工单列表：当前设备/用户相关的工单
 * 支持扫码快速查询（使用 search_key）
 */
class MyWorkOrderListActivity : AppCompatActivity() {

    private lateinit var recyclerView: RecyclerView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var loadingView: ProgressBar
    private lateinit var emptyView: View
    private lateinit var adapter: MyWorkOrderAdapter

    private val workOrders = mutableListOf<WorkOrder>()
    private var searchKey: String? = null

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            searchKey = result.contents
            supportActionBar?.subtitle = "搜索: $searchKey"
            Toast.makeText(this, "搜索: $searchKey", Toast.LENGTH_SHORT).show()
            loadWorkOrders()
        }
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
        setContentView(R.layout.activity_my_work_order_list)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "我的工单"

        recyclerView = findViewById(R.id.recyclerView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        loadingView = findViewById(R.id.loadingView)
        emptyView = findViewById(R.id.emptyView)
        val btnScan = findViewById<FloatingActionButton>(R.id.btnScan)

        adapter = MyWorkOrderAdapter(workOrders) { wo: WorkOrder ->
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
        loadWorkOrders()
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
                    append("/api/work-orders/mine?limit=50")
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
                        tags = tags
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
        val tags: List<String>
    )

    class MyWorkOrderAdapter(
        private val items: List<WorkOrder>,
        private val onClick: (WorkOrder) -> Unit
    ) : RecyclerView.Adapter<MyWorkOrderAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val tvCode: TextView = view.findViewById(R.id.tvCode)
            val tvTitle: TextView = view.findViewById(R.id.tvTitle)
            val tvStatus: TextView = view.findViewById(R.id.tvStatus)
            val tvPriority: TextView = view.findViewById(R.id.tvPriority)
            val tvElapsed: TextView = view.findViewById(R.id.tvElapsed)
            val tvTags: TextView = view.findViewById(R.id.tvTags)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_my_work_order, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val wo = items[position]
            holder.tvCode.text = wo.code
            holder.tvTitle.text = wo.title
            holder.tvStatus.text = getStatusLabel(wo.status)
            holder.tvPriority.text = getPriorityLabel(wo.priority)
            holder.tvElapsed.text = "耗时: ${calculateElapsed(wo.createdAt, wo.closedAt, wo.status)}"
            holder.tvTags.text = if (wo.tags.isEmpty()) "" else wo.tags.joinToString(" ")

            holder.itemView.setOnClickListener { onClick(wo) }
        }

        override fun getItemCount() = items.size

        private fun getStatusLabel(status: String): String = when (status) {
            "open" -> "待处理"
            "in_progress" -> "进行中"
            "resolved" -> "已解决"
            "closed" -> "已关闭"
            "reopened" -> "重新打开"
            else -> status
        }

        private fun getPriorityLabel(priority: String): String = when (priority) {
            "normal" -> "普通"
            "high" -> "较高"
            "urgent" -> "紧急"
            else -> priority
        }

        private fun calculateElapsed(createdAt: String, closedAt: String, status: String): String {
            try {
                val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                val startTime = fmt.parse(createdAt)?.time ?: return "-"

                val endTime = if (closedAt.isNotBlank() && (status == "closed" || status == "resolved")) {
                    fmt.parse(closedAt)?.time ?: System.currentTimeMillis()
                } else {
                    System.currentTimeMillis()
                }

                val elapsed = endTime - startTime
                return formatDuration(elapsed)
            } catch (e: Exception) {
                return "-"
            }
        }

        private fun formatDuration(millis: Long): String {
            val seconds = millis / 1000
            val minutes = seconds / 60
            val hours = minutes / 60
            val days = hours / 24

            return when {
                days > 0 -> "${days}天${hours % 24}小时"
                hours > 0 -> "${hours}小时${minutes % 60}分钟"
                minutes > 0 -> "${minutes}分钟"
                else -> "${seconds}秒"
            }
        }
    }
}
