package com.appmanager.agent.ui

import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
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
import com.appmanager.agent.util.WorkOrderStompClient
import com.appmanager.agent.util.WorkOrderTypeStore
import com.appmanager.agent.util.QRCodeHelper
import com.google.android.material.appbar.MaterialToolbar
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

/**
 * 工单详情：显示工单信息、进展记录
 * 支持用户JWT登录时的完整功能，设备token时的受限功能
 */
class WorkOrderDetailActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "WorkOrderDetail"
    }

    private lateinit var tvCode: TextView
    private lateinit var tvTitle: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvPriority: TextView
    private lateinit var tvDescription: TextView
    private lateinit var tvCreatedAt: TextView
    private lateinit var tvElapsed: TextView
    private lateinit var llTags: android.widget.LinearLayout
    private lateinit var tvSubmitter: TextView
    private lateinit var tvBusinessNo: TextView
    private lateinit var tvOtherCodes: TextView
    private lateinit var btnEditTitle: android.widget.ImageButton
    private lateinit var btnEditDescription: android.widget.ImageButton
    private lateinit var btnEditPriority: android.widget.ImageButton
    private lateinit var btnEditBusinessNo: android.widget.ImageButton
    private lateinit var btnQrBusinessNo: android.widget.ImageButton
    private lateinit var btnEditOtherCodes: android.widget.ImageButton
    private lateinit var btnQrOtherCodes: android.widget.ImageButton
    private lateinit var btnEditTags: android.widget.ImageButton
    private lateinit var recyclerProgress: RecyclerView
    private lateinit var loadingView: View
    private lateinit var btnAddProgress: Button

    // Status action buttons
    private lateinit var cardStatusActions: View
    private lateinit var btnStartProcessing: Button
    private lateinit var btnMarkResolved: Button
    private lateinit var btnClose: Button
    private lateinit var btnReopen: Button

    // Attachments
    private lateinit var cardAttachments: View
    private lateinit var recyclerAttachments: RecyclerView
    private val attachmentsList = mutableListOf<com.appmanager.agent.adapter.Attachment>()
    private lateinit var attachmentAdapter: com.appmanager.agent.adapter.AttachmentAdapter

    private var workOrderId: Int = 0
    private val progressList = mutableListOf<Progress>()
    private lateinit var progressAdapter: ProgressAdapter

    // Auth context
    private var hasUserLogin: Boolean = false
    private var currentWorkOrder: WorkOrderData? = null

    // Camera scan for editing
    private var editingBusinessNo = false
    private var editingOtherCodes = false
    private var currentEditText: com.google.android.material.textfield.TextInputEditText? = null

    private val scanLauncher = registerForActivityResult(
        com.journeyapps.barcodescanner.ScanContract()
    ) { result ->
        if (result.contents != null) {
            handleScanResult(result.contents)
        }
    }

    private val requestCameraPermission = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startBarcodeScan()
        } else {
            Toast.makeText(this, "需要相机权限才能扫码", Toast.LENGTH_SHORT).show()
        }
    }

    // 硬件扫描头广播接收器
    private val hardwareScanReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
            val action = intent?.action ?: return
            Log.d(TAG, "Hardware scan broadcast received: $action")

            // 常见硬件扫描头广播 Action
            val code = when {
                action == "com.android.server.scannerservice.broadcast" -> {
                    intent.getStringExtra("scannerdata")
                }
                action == "scan.rcv.message" -> {
                    intent.getStringExtra("barocode") ?: intent.getStringExtra("barcodeStr")
                }
                action == "android.intent.ACTION_DECODE_DATA" -> {
                    intent.getStringExtra("barcode")
                }
                action.contains("SCAN") || action.contains("BARCODE") -> {
                    // 通用扫描广播，尝试多个可能的键
                    intent.getStringExtra("data")
                        ?: intent.getStringExtra("code")
                        ?: intent.getStringExtra("scannerdata")
                        ?: intent.getStringExtra("barcode")
                }
                else -> null
            }

            if (!code.isNullOrEmpty()) {
                runOnUiThread {
                    handleScanResult(code)
                }
            } else {
                Log.w(TAG, "Hardware scan broadcast but no code found in intent extras")
            }
        }
    }

    // STOMP listener for real-time updates
    private val stompListener = object : WorkOrderStompClient.WorkOrderUpdateListener {
        override fun onWorkOrderUpdated(workOrderId: Int, action: String) {
            if (workOrderId == this@WorkOrderDetailActivity.workOrderId) {
                runOnUiThread {
                    Log.d(TAG, "Work order updated: id=$workOrderId, action=$action")
                    loadWorkOrderDetail()
                    loadProgress()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_work_order_detail)

        workOrderId = intent.getIntExtra("work_order_id", 0)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "工单详情"

        // Initialize auth context
        val cfg = AgentConfig.get(this)
        hasUserLogin = cfg.userToken.isNotEmpty()
        Log.d(TAG, "Auth context: hasUserLogin=$hasUserLogin")

        tvCode = findViewById(R.id.tvCode)
        tvTitle = findViewById(R.id.tvTitle)
        tvStatus = findViewById(R.id.tvStatus)
        tvPriority = findViewById(R.id.tvPriority)
        tvDescription = findViewById(R.id.tvDescription)
        tvCreatedAt = findViewById(R.id.tvCreatedAt)
        tvElapsed = findViewById(R.id.tvElapsed)
        llTags = findViewById(R.id.llTags)
        tvSubmitter = findViewById(R.id.tvSubmitter)
        tvBusinessNo = findViewById(R.id.tvBusinessNo)
        tvOtherCodes = findViewById(R.id.tvOtherCodes)
        btnEditTitle = findViewById(R.id.btnEditTitle)
        btnEditDescription = findViewById(R.id.btnEditDescription)
        btnEditPriority = findViewById(R.id.btnEditPriority)
        btnEditBusinessNo = findViewById(R.id.btnEditBusinessNo)
        btnQrBusinessNo = findViewById(R.id.btnQrBusinessNo)
        btnEditOtherCodes = findViewById(R.id.btnEditOtherCodes)
        btnQrOtherCodes = findViewById(R.id.btnQrOtherCodes)
        btnEditTags = findViewById(R.id.btnEditTags)
        recyclerProgress = findViewById(R.id.recyclerProgress)
        loadingView = findViewById(R.id.loadingView)
        btnAddProgress = findViewById(R.id.btnAddProgress)

        // Status action buttons
        cardStatusActions = findViewById(R.id.cardStatusActions)
        btnStartProcessing = findViewById(R.id.btnStartProcessing)
        btnMarkResolved = findViewById(R.id.btnMarkResolved)
        btnClose = findViewById(R.id.btnClose)
        btnReopen = findViewById(R.id.btnReopen)

        // Attachments
        cardAttachments = findViewById(R.id.cardAttachments)
        recyclerAttachments = findViewById(R.id.recyclerAttachments)

        // Setup RecyclerView
        progressAdapter = ProgressAdapter(progressList)
        recyclerProgress.layoutManager = LinearLayoutManager(this)
        recyclerProgress.adapter = progressAdapter

        // Setup attachments RecyclerView
        attachmentAdapter = com.appmanager.agent.adapter.AttachmentAdapter(
            attachmentsList,
            this
        ) { attachment ->
            previewAttachment(attachment)
        }
        recyclerAttachments.layoutManager = LinearLayoutManager(this)
        recyclerAttachments.adapter = attachmentAdapter
        btnMarkResolved = findViewById(R.id.btnMarkResolved)
        btnClose = findViewById(R.id.btnClose)
        btnReopen = findViewById(R.id.btnReopen)

        progressAdapter = ProgressAdapter(progressList)
        recyclerProgress.layoutManager = LinearLayoutManager(this)
        recyclerProgress.adapter = progressAdapter

        // Setup button listeners
        btnStartProcessing.setOnClickListener { promptStatusChange("in_progress", "开始处理") }
        btnMarkResolved.setOnClickListener { promptStatusChange("resolved", "标记解决") }
        btnClose.setOnClickListener { promptStatusChange("closed", "关闭工单") }
        btnReopen.setOnClickListener { promptStatusChange("reopened", "重新打开") }

        btnEditTitle.setOnClickListener { promptEditTitle() }
        btnEditDescription.setOnClickListener { promptEditDescription() }
        btnEditPriority.setOnClickListener { promptEditPriority() }
        btnEditBusinessNo.setOnClickListener { promptEditBusinessNo() }
        btnQrBusinessNo.setOnClickListener { showQRCodeDialog(currentWorkOrder?.businessNo ?: "") }
        btnEditOtherCodes.setOnClickListener { promptEditOtherCodes() }
        btnQrOtherCodes.setOnClickListener {
            val codes = currentWorkOrder?.otherCodes ?: ""
            if (codes.isNotEmpty()) {
                showOtherCodesQRDialog(codes)
            }
        }
        btnEditTags.setOnClickListener { promptEditTags() }

        btnAddProgress.setOnClickListener {
            promptAddProgress()
        }

        loadWorkOrderDetail()
        loadProgress()
    }

    override fun onResume() {
        super.onResume()
        // Connect STOMP and add listener
        WorkOrderStompClient.connect(this)
        WorkOrderStompClient.addListener(stompListener)

        // 注册硬件扫描头广播接收器
        registerHardwareScanReceiver()
    }

    override fun onPause() {
        super.onPause()
        // Remove STOMP listener
        WorkOrderStompClient.removeListener(stompListener)

        // 注销硬件扫描头广播接收器
        try {
            unregisterReceiver(hardwareScanReceiver)
        } catch (e: Exception) {
            // Ignore if not registered
        }
    }

    /**
     * 注册硬件扫描头广播接收器
     */
    private fun registerHardwareScanReceiver() {
        val filter = android.content.IntentFilter().apply {
            // 常见硬件扫描头广播
            addAction("com.android.server.scannerservice.broadcast")
            addAction("scan.rcv.message")
            addAction("android.intent.ACTION_DECODE_DATA")
            addAction("com.scanner.broadcast")
            addAction("ACTION_BARCODE_SCANNED")
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(hardwareScanReceiver, filter, android.content.Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(hardwareScanReceiver, filter)
        }
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

                // Use JWT token if user is logged in for full access, otherwise device token
                val json = if (cfg.userToken.isNotEmpty()) {
                    Log.d(TAG, "Loading with JWT token for full access")
                    AgentCatalogApi.getJsonWithJWT(base, "/api/work-orders/$workOrderId", cfg.userToken.trim())
                } else {
                    Log.d(TAG, "Loading with device token (limited access)")
                    AgentCatalogApi.getJson(base, "/api/agent/work-orders/$workOrderId", cfg.deviceToken.trim())
                }

                val obj = JSONObject(json)
                val data = obj.optJSONObject("data") ?: throw Exception("返回数据格式错误")

                val workOrder = WorkOrderData(
                    id = data.optInt("id"),
                    code = data.optString("code"),
                    title = data.optString("title"),
                    status = data.optString("status"),
                    priority = data.optString("priority"),
                    description = data.optString("description"),
                    typeCode = data.optString("type_code"),
                    businessNo = data.optString("business_no", ""),
                    otherCodes = data.optString("other_codes", ""),
                    visibility = data.optString("visibility", ""),
                    deviceName = data.optString("device_name_snap", ""),
                    submitter = data.optString("submitter", ""),
                    createdAt = data.optString("created_at"),
                    closedAt = data.optString("closed_at", "")
                )

                val tagsArray = data.optJSONArray("tags")
                val tags = mutableListOf<String>()
                if (tagsArray != null) {
                    for (i in 0 until tagsArray.length()) {
                        tags.add(tagsArray.getString(i))
                    }
                }
                workOrder.tags = tags

                // Parse attachments
                val attachmentsArray = data.optJSONArray("items")
                attachmentsList.clear()
                if (attachmentsArray != null) {
                    for (i in 0 until attachmentsArray.length()) {
                        val item = attachmentsArray.getJSONObject(i)
                        val attachment = com.appmanager.agent.adapter.Attachment(
                            id = item.optInt("id"),
                            kind = item.optString("kind"),
                            fileName = item.optString("file_name"),
                            fileSize = item.optLong("file_size"),
                            workOrderId = workOrderId
                        )
                        attachmentsList.add(attachment)
                    }
                }

                currentWorkOrder = workOrder

                runOnUiThread {
                    loadingView.visibility = View.GONE
                    displayWorkOrderData(workOrder)
                    displayAttachments()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Log.e(TAG, "Failed to load work order detail", e)
                runOnUiThread {
                    loadingView.visibility = View.GONE
                    Toast.makeText(this, "加载失败: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun displayWorkOrderData(wo: WorkOrderData) {
        tvCode.text = "工单号: ${wo.code}"
        tvTitle.text = wo.title
        tvStatus.text = "状态: ${getStatusLabel(wo.status)}"
        tvPriority.text = "优先级: ${getPriorityLabel(wo.priority)}"
        tvDescription.text = wo.description.ifBlank { "无描述" }
        tvCreatedAt.text = "提交时间: ${wo.createdAt}"
        tvElapsed.text = "耗时: ${calculateElapsed(wo.createdAt, wo.closedAt, wo.status)}"

        // Display submitter (fallback to device name)
        val submitterText = if (wo.submitter.isNotEmpty()) {
            wo.submitter
        } else if (wo.deviceName.isNotEmpty()) {
            wo.deviceName
        } else {
            "未知"
        }
        tvSubmitter.text = "提交人: $submitterText"

        // Display business number
        if (wo.businessNo.isNotEmpty()) {
            tvBusinessNo.text = "业务单号: ${wo.businessNo}"
            btnQrBusinessNo.visibility = View.VISIBLE
        } else {
            tvBusinessNo.text = "业务单号: 无"
            btnQrBusinessNo.visibility = View.GONE
        }

        // Display other codes
        if (wo.otherCodes.isNotEmpty()) {
            tvOtherCodes.text = "其他编码: ${wo.otherCodes}"
            btnQrOtherCodes.visibility = View.VISIBLE
        } else {
            tvOtherCodes.text = "其他编码: 无"
            btnQrOtherCodes.visibility = View.GONE
        }

        // Display tags with names and colors
        llTags.removeAllViews()
        if (wo.tags.isEmpty()) {
            val noTagsView = TextView(this).apply {
                text = "无"
                textSize = 11f
                setTextColor(resources.getColor(android.R.color.darker_gray, null))
            }
            llTags.addView(noTagsView)
        } else {
            val allTags = WorkOrderTypeStore.getTags(this)
            val tagMap = allTags.associateBy { it.code }

            wo.tags.forEach { code ->
                val tag = tagMap[code]
                val chipView = TextView(this).apply {
                    text = tag?.name ?: code
                    textSize = 11f
                    setPadding(16, 4, 16, 4)

                    // 设置背景颜色
                    try {
                        val color = android.graphics.Color.parseColor(tag?.color ?: "#999999")
                        // 创建圆角背景
                        val drawable = android.graphics.drawable.GradientDrawable().apply {
                            setColor(color)
                            setAlpha(40) // 20% 透明度
                            cornerRadius = 12f
                            setStroke(1, color)
                        }
                        background = drawable
                        setTextColor(color)
                    } catch (e: Exception) {
                        setBackgroundColor(android.graphics.Color.parseColor("#EEEEEE"))
                        setTextColor(android.graphics.Color.parseColor("#666666"))
                    }

                    val params = android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                        android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                    params.setMargins(0, 0, 8, 0)
                    layoutParams = params
                }
                llTags.addView(chipView)
            }
        }

        // Show edit tags button only for logged in users
        btnEditTags.visibility = if (hasUserLogin) View.VISIBLE else View.GONE

        // Show edit buttons for title, description, priority (only for logged in users)
        btnEditTitle.visibility = if (hasUserLogin) View.VISIBLE else View.GONE
        btnEditDescription.visibility = if (hasUserLogin) View.VISIBLE else View.GONE
        btnEditPriority.visibility = if (hasUserLogin) View.VISIBLE else View.GONE

        // Update status action buttons
        updateStatusButtons(wo.status)
    }

    /**
     * 更新状态操作按钮的可见性和启用状态
     */
    private fun updateStatusButtons(status: String) {
        // Only show status actions if user is logged in
        if (!hasUserLogin) {
            cardStatusActions.visibility = View.GONE
            return
        }

        cardStatusActions.visibility = View.VISIBLE

        // Status transition rules
        when (status) {
            "open" -> {
                btnStartProcessing.visibility = View.VISIBLE
                btnStartProcessing.isEnabled = true
                btnMarkResolved.visibility = View.VISIBLE
                btnMarkResolved.isEnabled = true
                btnClose.visibility = View.VISIBLE
                btnClose.isEnabled = true
                btnReopen.visibility = View.GONE
            }
            "in_progress" -> {
                btnStartProcessing.visibility = View.VISIBLE
                btnStartProcessing.isEnabled = false
                btnMarkResolved.visibility = View.VISIBLE
                btnMarkResolved.isEnabled = true
                btnClose.visibility = View.VISIBLE
                btnClose.isEnabled = true
                btnReopen.visibility = View.GONE
            }
            "resolved" -> {
                btnStartProcessing.visibility = View.VISIBLE
                btnStartProcessing.isEnabled = false
                btnMarkResolved.visibility = View.VISIBLE
                btnMarkResolved.isEnabled = false
                btnClose.visibility = View.VISIBLE
                btnClose.isEnabled = true
                btnReopen.visibility = View.GONE
            }
            "closed" -> {
                btnStartProcessing.visibility = View.GONE
                btnMarkResolved.visibility = View.GONE
                btnClose.visibility = View.GONE
                btnReopen.visibility = View.VISIBLE
                btnReopen.isEnabled = true
            }
            "reopened" -> {
                btnStartProcessing.visibility = View.VISIBLE
                btnStartProcessing.isEnabled = true
                btnMarkResolved.visibility = View.VISIBLE
                btnMarkResolved.isEnabled = true
                btnClose.visibility = View.VISIBLE
                btnClose.isEnabled = true
                btnReopen.visibility = View.GONE
            }
        }
    }

    /**
     * 提示状态变更对话框
     */
    private fun promptStatusChange(newStatus: String, statusLabel: String) {
        if (!hasUserLogin) {
            Toast.makeText(this, "需要用户登录才能变更状态", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_status_comment, null)
        val tvDialogTitle = dialogView.findViewById<TextView>(R.id.tvDialogTitle)
        val etComment = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.etComment)

        tvDialogTitle.text = statusLabel

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        dialogView.findViewById<Button>(R.id.btnCancel).setOnClickListener {
            dialog.dismiss()
        }

        dialogView.findViewById<Button>(R.id.btnConfirm).setOnClickListener {
            val comment = etComment.text.toString().trim()
            dialog.dismiss()
            changeStatus(newStatus, comment)
        }

        dialog.show()
    }

    /**
     * 变更工单状态
     */
    private fun changeStatus(newStatus: String, comment: String) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                if (cfg.userToken.isEmpty()) {
                    throw Exception("需要用户登录")
                }

                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())
                val body = org.json.JSONObject()
                    .put("status", newStatus)
                    .put("comment", comment)

                Log.d(TAG, "Changing status to: $newStatus, comment: $comment")

                AgentCatalogApi.postJsonWithJWT(
                    base,
                    "/api/work-orders/$workOrderId/status",
                    cfg.userToken.trim(),
                    body.toString()
                )

                runOnUiThread {
                    Toast.makeText(this, "状态已更新", Toast.LENGTH_SHORT).show()
                    // Reload detail and progress to reflect changes
                    loadWorkOrderDetail()
                    loadProgress()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Log.e(TAG, "Failed to change status", e)
                runOnUiThread {
                    Toast.makeText(this, "状态变更失败: ${e.message}", Toast.LENGTH_LONG).show()
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

                // Use JWT token if user is logged in, otherwise device token
                val json = if (cfg.userToken.isNotEmpty()) {
                    AgentCatalogApi.getJsonWithJWT(base, "/api/work-orders/$workOrderId/progress", cfg.userToken.trim())
                } else {
                    AgentCatalogApi.getJson(base, "/api/work-orders/$workOrderId/progress", cfg.deviceToken.trim())
                }
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

    data class WorkOrderData(
        val id: Int,
        val code: String,
        val title: String,
        val status: String,
        val priority: String,
        val description: String,
        val typeCode: String,
        val businessNo: String,
        val otherCodes: String,
        val visibility: String,
        val deviceName: String,
        val submitter: String,
        val createdAt: String,
        val closedAt: String,
        var tags: List<String> = emptyList()
    )

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

    /**
     * 提示编辑业务单号
     */
    private fun promptEditBusinessNo() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_edit_business_no, null)
        val etValue = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.etValue)
        val textInputLayout = etValue.parent.parent as com.google.android.material.textfield.TextInputLayout

        // 预填充当前值
        etValue.setText(currentWorkOrder?.businessNo ?: "")
        currentEditText = etValue
        editingBusinessNo = true
        editingOtherCodes = false

        // 设置相机图标点击事件
        textInputLayout.setEndIconOnClickListener {
            launchBarcodeScan()
        }

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        dialogView.findViewById<Button>(R.id.btnCancel).setOnClickListener {
            currentEditText = null
            dialog.dismiss()
        }

        dialogView.findViewById<Button>(R.id.btnConfirm).setOnClickListener {
            val newValue = etValue.text.toString().trim()
            currentEditText = null
            dialog.dismiss()
            updateBusinessNo(newValue)
        }

        dialog.setOnDismissListener {
            currentEditText = null
            editingBusinessNo = false
        }

        dialog.show()
    }

    /**
     * 提示编辑其他编码
     */
    private fun promptEditOtherCodes() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_edit_codes, null)
        val etValue = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.etValue)
        val textInputLayout = etValue.parent.parent as com.google.android.material.textfield.TextInputLayout

        // 预填充当前值
        etValue.setText(currentWorkOrder?.otherCodes ?: "")
        currentEditText = etValue
        editingBusinessNo = false
        editingOtherCodes = true

        // 设置相机图标点击事件
        textInputLayout.setEndIconOnClickListener {
            launchBarcodeScan()
        }

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        dialogView.findViewById<Button>(R.id.btnCancel).setOnClickListener {
            currentEditText = null
            dialog.dismiss()
        }

        dialogView.findViewById<Button>(R.id.btnConfirm).setOnClickListener {
            val newValue = etValue.text.toString().trim()
            currentEditText = null
            dialog.dismiss()
            updateOtherCodes(newValue)
        }

        dialog.setOnDismissListener {
            currentEditText = null
            editingOtherCodes = false
        }

        dialog.show()
    }

    /**
     * 显示附件列表
     */
    private fun displayAttachments() {
        if (attachmentsList.isEmpty()) {
            cardAttachments.visibility = View.GONE
        } else {
            cardAttachments.visibility = View.VISIBLE
            attachmentAdapter.notifyDataSetChanged()
        }
    }

    /**
     * 预览附件
     */
    private fun previewAttachment(attachment: com.appmanager.agent.adapter.Attachment) {
        when (attachment.kind) {
            "photo" -> {
                val intent = android.content.Intent(this, ImagePreviewActivity::class.java).apply {
                    putExtra(ImagePreviewActivity.EXTRA_WORK_ORDER_ID, attachment.workOrderId)
                    putExtra(ImagePreviewActivity.EXTRA_ATTACHMENT_ID, attachment.id)
                    putExtra(ImagePreviewActivity.EXTRA_FILE_NAME, attachment.fileName)
                }
                startActivity(intent)
            }
            "video" -> {
                // Open video with external player
                try {
                    val cfg = AgentConfig.get(this)
                    val baseUrl = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                    // Use JWT token if logged in, otherwise device token
                    val tokenParam = if (cfg.userToken.isNotEmpty()) {
                        "token=${cfg.userToken}"
                    } else {
                        "device_token=${cfg.deviceToken}"
                    }
                    val url = "$baseUrl/api/work-orders/${attachment.workOrderId}/items/${attachment.id}/download?$tokenParam"

                    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                        setDataAndType(android.net.Uri.parse(url), "video/*")
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this, "无法打开视频播放器", Toast.LENGTH_SHORT).show()
                }
            }
            "audio" -> {
                // Open audio with external player
                try {
                    val cfg = AgentConfig.get(this)
                    val baseUrl = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                    // Use JWT token if logged in, otherwise device token
                    val tokenParam = if (cfg.userToken.isNotEmpty()) {
                        "token=${cfg.userToken}"
                    } else {
                        "device_token=${cfg.deviceToken}"
                    }
                    val url = "$baseUrl/api/work-orders/${attachment.workOrderId}/items/${attachment.id}/download?$tokenParam"

                    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                        setDataAndType(android.net.Uri.parse(url), "audio/*")
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this, "无法打开音频播放器", Toast.LENGTH_SHORT).show()
                }
            }
            else -> {
                Toast.makeText(this, "文件下载功能开发中", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * 更新业务单号
     */
    private fun updateBusinessNo(businessNo: String) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())
                val body = org.json.JSONObject().put("business_no", businessNo)

                Log.d(TAG, "Updating business_no to: $businessNo")

                // Use JWT token if logged in, otherwise device token with /mine path
                if (cfg.userToken.isNotEmpty()) {
                    AgentCatalogApi.putJsonWithJWT(
                        base,
                        "/api/work-orders/$workOrderId",
                        cfg.userToken.trim(),
                        body.toString()
                    )
                } else {
                    AgentCatalogApi.putJson(
                        base,
                        "/api/work-orders/mine/$workOrderId",
                        cfg.deviceToken.trim(),
                        body.toString()
                    )
                }

                runOnUiThread {
                    Toast.makeText(this, "业务单号已更新", Toast.LENGTH_SHORT).show()
                    loadWorkOrderDetail()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Log.e(TAG, "Failed to update business_no", e)
                runOnUiThread {
                    Toast.makeText(this, "更新失败: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 更新其他编码
     */
    private fun updateOtherCodes(otherCodes: String) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())
                val body = org.json.JSONObject().put("other_codes", otherCodes)

                Log.d(TAG, "Updating other_codes to: $otherCodes")

                // Use JWT token if logged in, otherwise device token with /mine path
                if (cfg.userToken.isNotEmpty()) {
                    AgentCatalogApi.putJsonWithJWT(
                        base,
                        "/api/work-orders/$workOrderId",
                        cfg.userToken.trim(),
                        body.toString()
                    )
                } else {
                    AgentCatalogApi.putJson(
                        base,
                        "/api/work-orders/mine/$workOrderId",
                        cfg.deviceToken.trim(),
                        body.toString()
                    )
                }

                runOnUiThread {
                    Toast.makeText(this, "其他编码已更新", Toast.LENGTH_SHORT).show()
                    loadWorkOrderDetail()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Log.e(TAG, "Failed to update other_codes", e)
                runOnUiThread {
                    Toast.makeText(this, "更新失败: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 显示二维码对话框
     */
    private fun showQRCodeDialog(code: String) {
        if (code.isEmpty()) {
            Toast.makeText(this, "内容为空，无法生成二维码", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_qr_code, null)
        val imageQr = dialogView.findViewById<android.widget.ImageView>(R.id.imageQr)
        val tvQrText = dialogView.findViewById<TextView>(R.id.tvQrText)

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        dialogView.findViewById<Button>(R.id.btnClose).setOnClickListener {
            dialog.dismiss()
        }

        // 在后台线程生成二维码
        thread {
            try {
                val bitmap = QRCodeHelper.generateQRCode(code, 400)
                runOnUiThread {
                    imageQr.setImageBitmap(bitmap)
                    tvQrText.text = code
                }
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread {
                    Toast.makeText(this, "二维码生成失败: ${e.message}", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                }
            }
        }

        dialog.show()
    }

    /**
     * 显示其他编码的二维码（支持多个）
     */
    private fun showOtherCodesQRDialog(codes: String) {
        val codeList = codes.split(",").map { it.trim() }.filter { it.isNotEmpty() }

        if (codeList.isEmpty()) {
            Toast.makeText(this, "没有可显示的编码", Toast.LENGTH_SHORT).show()
            return
        }

        // 如果只有一个编码，直接显示
        if (codeList.size == 1) {
            showQRCodeDialog(codeList[0])
            return
        }

        // 多个编码，让用户选择
        val items = codeList.toTypedArray()
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("选择要显示的编码")
            .setItems(items) { _, which ->
                showQRCodeDialog(items[which])
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /**
     * 启动条码扫描
     */
    private fun launchBarcodeScan() {
        val cfg = AgentConfig.get(this)
        val scanMode = cfg.scanMode

        // 硬件扫描模式：提示用户使用扫描枪
        if (scanMode == "hardware") {
            Toast.makeText(this, "请使用扫描枪扫描", Toast.LENGTH_SHORT).show()
            return
        }

        // 摄像头扫描模式：检查权限后启动
        if (androidx.core.content.ContextCompat.checkSelfPermission(
                this,
                android.Manifest.permission.CAMERA
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            startBarcodeScan()
        } else {
            requestCameraPermission.launch(android.Manifest.permission.CAMERA)
        }
    }

    /**
     * 启动相机扫码
     */
    private fun startBarcodeScan() {
        val options = com.journeyapps.barcodescanner.ScanOptions().apply {
            setDesiredBarcodeFormats(
                com.journeyapps.barcodescanner.ScanOptions.QR_CODE,
                com.journeyapps.barcodescanner.ScanOptions.CODE_128,
                com.journeyapps.barcodescanner.ScanOptions.CODE_39,
                com.journeyapps.barcodescanner.ScanOptions.EAN_13,
                com.journeyapps.barcodescanner.ScanOptions.EAN_8
            )
            setPrompt("扫描条码或二维码")
            setCameraId(0)
            setBeepEnabled(true)
            setOrientationLocked(false)
        }
        scanLauncher.launch(options)
    }

    /**
     * 处理扫码结果
     */
    private fun handleScanResult(code: String) {
        Log.d(TAG, "Scanned code: $code")

        val editText = currentEditText
        if (editText != null) {
            // 填充到当前编辑框
            if (editingBusinessNo) {
                // 业务单号：直接替换
                editText.setText(code)
                Toast.makeText(this, "已识别: $code", Toast.LENGTH_SHORT).show()
            } else if (editingOtherCodes) {
                // 其他编码：追加（如果已有内容，用逗号分隔）
                val currentText = editText.text.toString().trim()
                val newText = if (currentText.isEmpty()) {
                    code
                } else {
                    "$currentText,$code"
                }
                editText.setText(newText)
                editText.setSelection(newText.length) // 光标移到末尾
                Toast.makeText(this, "已添加: $code", Toast.LENGTH_SHORT).show()
            }
        } else {
            Toast.makeText(this, "扫描结果: $code", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 标签编辑对话框
     */
    private fun promptEditTags() {
        if (!hasUserLogin) {
            Toast.makeText(this, "需要用户登录才能编辑标签", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_edit_tags, null)
        val recyclerTags = dialogView.findViewById<RecyclerView>(R.id.recyclerTags)

        // 获取所有可用标签
        val allTags = WorkOrderTypeStore.getTags(this)
        val currentTags = currentWorkOrder?.tags ?: emptyList()

        // 创建标签选择列表
        val tagItems = allTags.map { tag ->
            TagCheckItem(
                code = tag.code,
                name = tag.name,
                color = tag.color,
                isChecked = currentTags.contains(tag.code)
            )
        }.toMutableList()

        val adapter = TagCheckAdapter(tagItems)
        recyclerTags.layoutManager = LinearLayoutManager(this)
        recyclerTags.adapter = adapter

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        dialogView.findViewById<Button>(R.id.btnCancel).setOnClickListener {
            dialog.dismiss()
        }

        dialogView.findViewById<Button>(R.id.btnConfirm).setOnClickListener {
            val selectedTags = tagItems.filter { it.isChecked }.map { it.code }
            dialog.dismiss()
            updateTags(selectedTags)
        }

        dialog.show()
    }

    /**
     * 更新工单标签
     */
    private fun updateTags(tagCodes: List<String>) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())

                val jsonArray = org.json.JSONArray(tagCodes)
                val body = org.json.JSONObject().put("tags", jsonArray)

                Log.d(TAG, "Updating tags to: $tagCodes")

                // 使用 JWT token API - 路径是 /api/work-orders/:id/tags
                AgentCatalogApi.putJsonWithJWT(
                    base,
                    "/api/work-orders/$workOrderId/tags",
                    cfg.userToken.trim(),
                    body.toString()
                )

                runOnUiThread {
                    Toast.makeText(this, "标签已更新", Toast.LENGTH_SHORT).show()
                    loadWorkOrderDetail()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Log.e(TAG, "Failed to update tags", e)
                runOnUiThread {
                    Toast.makeText(this, "更新失败: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 新增进展对话框
     */
    private fun promptAddProgress() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_progress, null)
        val etProgressContent = dialogView.findViewById<com.google.android.material.textfield.TextInputEditText>(R.id.etProgressContent)

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        dialogView.findViewById<Button>(R.id.btnCancel).setOnClickListener {
            dialog.dismiss()
        }

        dialogView.findViewById<Button>(R.id.btnConfirm).setOnClickListener {
            val content = etProgressContent.text.toString().trim()
            if (content.isEmpty()) {
                Toast.makeText(this, "请输入进展内容", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            dialog.dismiss()
            createProgress(content)
        }

        dialog.show()
    }

    /**
     * 创建工单进展
     */
    private fun createProgress(content: String) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())

                val body = org.json.JSONObject().put("content", content)

                Log.d(TAG, "Creating progress with content: $content")

                // Use JWT token if user is logged in, otherwise device token
                if (cfg.userToken.isNotEmpty()) {
                    AgentCatalogApi.postJsonWithJWT(
                        base,
                        "/api/work-orders/$workOrderId/progress",
                        cfg.userToken.trim(),
                        body.toString()
                    )
                } else {
                    AgentCatalogApi.postJson(
                        base,
                        "/api/work-orders/$workOrderId/progress",
                        cfg.deviceToken.trim(),
                        body.toString()
                    )
                }

                runOnUiThread {
                    Toast.makeText(this, "进展已添加", Toast.LENGTH_SHORT).show()
                    loadProgress()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Log.e(TAG, "Failed to create progress", e)
                runOnUiThread {
                    Toast.makeText(this, "添加失败: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 编辑标题
     */
    private fun promptEditTitle() {
        if (!hasUserLogin) {
            Toast.makeText(this, "需要用户登录才能编辑标题", Toast.LENGTH_SHORT).show()
            return
        }

        val input = android.widget.EditText(this).apply {
            setText(currentWorkOrder?.title ?: "")
            hint = "请输入工单标题"
            setSingleLine()
        }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("编辑标题")
            .setView(input)
            .setPositiveButton("确定") { _, _ ->
                val title = input.text.toString().trim()
                if (title.isEmpty()) {
                    Toast.makeText(this, "标题不能为空", Toast.LENGTH_SHORT).show()
                } else {
                    updateWorkOrderField("title", title)
                }
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /**
     * 编辑描述
     */
    private fun promptEditDescription() {
        if (!hasUserLogin) {
            Toast.makeText(this, "需要用户登录才能编辑描述", Toast.LENGTH_SHORT).show()
            return
        }

        val input = android.widget.EditText(this).apply {
            setText(currentWorkOrder?.description ?: "")
            hint = "请输入工单描述"
            minLines = 3
            maxLines = 8
            gravity = android.view.Gravity.TOP or android.view.Gravity.START
        }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("编辑描述")
            .setView(input)
            .setPositiveButton("确定") { _, _ ->
                val description = input.text.toString().trim()
                updateWorkOrderField("description", description)
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /**
     * 编辑优先级
     */
    private fun promptEditPriority() {
        if (!hasUserLogin) {
            Toast.makeText(this, "需要用户登录才能编辑优先级", Toast.LENGTH_SHORT).show()
            return
        }

        val priorities = arrayOf("低", "普通", "高", "紧急")
        val priorityValues = arrayOf("low", "medium", "high", "urgent")
        val currentPriority = currentWorkOrder?.priority ?: "medium"
        val currentIndex = priorityValues.indexOf(currentPriority).coerceAtLeast(0)

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("选择优先级")
            .setSingleChoiceItems(priorities, currentIndex) { dialog, which ->
                updateWorkOrderField("priority", priorityValues[which])
                dialog.dismiss()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /**
     * 更新工单字段（使用JWT token）
     */
    private fun updateWorkOrderField(field: String, value: String) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl.trim())
                val body = org.json.JSONObject().put(field, value)

                Log.d(TAG, "Updating $field to: $value")

                // 使用 JWT token API - 路径是 /api/work-orders/:id
                AgentCatalogApi.putJsonWithJWT(
                    base,
                    "/api/work-orders/$workOrderId",
                    cfg.userToken.trim(),
                    body.toString()
                )

                runOnUiThread {
                    Toast.makeText(this, "已更新", Toast.LENGTH_SHORT).show()
                    loadWorkOrderDetail()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Log.e(TAG, "Failed to update $field", e)
                runOnUiThread {
                    Toast.makeText(this, "更新失败: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 标签选择项数据类
     */
    data class TagCheckItem(
        val code: String,
        val name: String,
        val color: String,
        var isChecked: Boolean
    )

    /**
     * 标签多选适配器
     */
    class TagCheckAdapter(
        private val items: MutableList<TagCheckItem>
    ) : RecyclerView.Adapter<TagCheckAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val checkbox: android.widget.CheckBox = view.findViewById(R.id.checkbox)
            val colorIndicator: View = view.findViewById(R.id.colorIndicator)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = android.view.LayoutInflater.from(parent.context)
                .inflate(R.layout.item_tag_checkbox, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val item = items[position]
            holder.checkbox.text = item.name
            holder.checkbox.isChecked = item.isChecked

            // 设置颜色指示器
            try {
                val color = android.graphics.Color.parseColor(item.color)
                holder.colorIndicator.setBackgroundColor(color)
            } catch (e: Exception) {
                holder.colorIndicator.setBackgroundColor(android.graphics.Color.GRAY)
            }

            holder.checkbox.setOnCheckedChangeListener { _, isChecked ->
                items[position].isChecked = isChecked
            }

            holder.itemView.setOnClickListener {
                holder.checkbox.isChecked = !holder.checkbox.isChecked
            }
        }

        override fun getItemCount() = items.size
    }
}
