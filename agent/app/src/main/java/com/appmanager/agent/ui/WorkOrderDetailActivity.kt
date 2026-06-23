package com.appmanager.agent.ui

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

/**
 * 工单详情：显示工单信息、进展记录
 */
class WorkOrderDetailActivity : AppCompatActivity() {

    private lateinit var tvCode: TextView
    private lateinit var tvTitle: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvPriority: TextView
    private lateinit var tvDescription: TextView
    private lateinit var tvCreatedAt: TextView
    private lateinit var tvElapsed: TextView
    private lateinit var tvTags: TextView
    private lateinit var recyclerProgress: RecyclerView
    private lateinit var loadingView: View
    private lateinit var btnAddProgress: Button

    private var workOrderId: Int = 0
    private val progressList = mutableListOf<Progress>()
    private lateinit var progressAdapter: ProgressAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_work_order_detail)

        workOrderId = intent.getIntExtra("work_order_id", 0)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "工单详情"

        tvCode = findViewById(R.id.tvCode)
        tvTitle = findViewById(R.id.tvTitle)
        tvStatus = findViewById(R.id.tvStatus)
        tvPriority = findViewById(R.id.tvPriority)
        tvDescription = findViewById(R.id.tvDescription)
        tvCreatedAt = findViewById(R.id.tvCreatedAt)
        tvElapsed = findViewById(R.id.tvElapsed)
        tvTags = findViewById(R.id.tvTags)
        recyclerProgress = findViewById(R.id.recyclerProgress)
        loadingView = findViewById(R.id.loadingView)
        btnAddProgress = findViewById(R.id.btnAddProgress)

        progressAdapter = ProgressAdapter(progressList)
        recyclerProgress.layoutManager = LinearLayoutManager(this)
        recyclerProgress.adapter = progressAdapter

        btnAddProgress.setOnClickListener {
            // TODO: 打开添加进展对话框
            Toast.makeText(this, "添加进展功能待实现", Toast.LENGTH_SHORT).show()
        }

        loadWorkOrderDetail()
        loadProgress()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    private fun loadWorkOrderDetail() {
        loadingView.visibility = View.VISIBLE
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())
                if (base.isBlank()) throw Exception("服务器地址未配置")

                val json = AgentCatalogApi.getJson(base, "/api/work-orders/$workOrderId", cfg.deviceToken.trim())
                val obj = JSONObject(json)
                val data = obj.optJSONObject("data") ?: throw Exception("返回数据格式错误")

                val code = data.optString("code")
                val title = data.optString("title")
                val status = data.optString("status")
                val priority = data.optString("priority")
                val description = data.optString("description")
                val createdAt = data.optString("created_at")
                val closedAt = data.optString("closed_at", "")

                val tagsArray = data.optJSONArray("tags")
                val tags = mutableListOf<String>()
                if (tagsArray != null) {
                    for (i in 0 until tagsArray.length()) {
                        tags.add(tagsArray.getString(i))
                    }
                }

                runOnUiThread {
                    loadingView.visibility = View.GONE
                    tvCode.text = "工单号: $code"
                    tvTitle.text = title
                    tvStatus.text = "状态: ${getStatusLabel(status)}"
                    tvPriority.text = "优先级: ${getPriorityLabel(priority)}"
                    tvDescription.text = description.ifBlank { "无描述" }
                    tvCreatedAt.text = "提交时间: $createdAt"
                    tvElapsed.text = "耗时: ${calculateElapsed(createdAt, closedAt, status)}"
                    tvTags.text = if (tags.isEmpty()) "无标签" else "标签: ${tags.joinToString(", ")}"
                }
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread {
                    loadingView.visibility = View.GONE
                    Toast.makeText(this, "加载失败: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun loadProgress() {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())
                if (base.isBlank()) return@thread

                val json = AgentCatalogApi.getJson(base, "/api/work-orders/$workOrderId/progress", cfg.deviceToken.trim())
                val obj = JSONObject(json)
                val data = obj.optJSONArray("data") ?: return@thread

                val list = mutableListOf<Progress>()
                for (i in 0 until data.length()) {
                    val item = data.getJSONObject(i)
                    list.add(Progress(
                        id = item.optInt("id"),
                        content = item.optString("content"),
                        creatorName = item.optString("creator_name"),
                        createdAt = item.optString("created_at")
                    ))
                }

                runOnUiThread {
                    progressList.clear()
                    progressList.addAll(list)
                    progressAdapter.notifyDataSetChanged()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

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

    data class Progress(
        val id: Int,
        val content: String,
        val creatorName: String,
        val createdAt: String
    )

    class ProgressAdapter(
        private val items: List<Progress>
    ) : RecyclerView.Adapter<ProgressAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val tvCreator: TextView = view.findViewById(R.id.tvCreator)
            val tvTime: TextView = view.findViewById(R.id.tvTime)
            val tvContent: TextView = view.findViewById(R.id.tvContent)
        }

        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
            val view = android.view.LayoutInflater.from(parent.context)
                .inflate(R.layout.item_progress, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val progress = items[position]
            holder.tvCreator.text = progress.creatorName
            holder.tvTime.text = progress.createdAt
            holder.tvContent.text = progress.content
        }

        override fun getItemCount() = items.size
    }
}
