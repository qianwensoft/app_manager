package com.appmanager.agent.ui

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.service.FeedbackLogcatCapture
import com.appmanager.agent.service.FeedbackScreenRecordService
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.QrPhotoDecoder
import com.appmanager.agent.util.ScanBroadcastHelper
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.tabs.TabLayout
import com.google.android.material.textfield.TextInputEditText
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

/**
 * 问题反馈：原生采集入口（文字/拍照/录像/录音/录屏/日志）+ 提交 + 我的工单进度查询。
 * 录屏与「针对其他 App 的 logcat」是 WebView 无法实现的能力，故走原生。
 */
class FeedbackActivity : AppCompatActivity() {

    data class Attachment(val kind: String, val file: File, val contentType: String, val targetPkg: String = "")
    data class WoType(val code: String, val name: String, val defaultTitle: String = "")

    private val attachments = mutableListOf<Attachment>()
    private val types = mutableListOf<WoType>()

    private lateinit var spinnerType: Spinner
    private lateinit var etTitle: TextInputEditText
    private lateinit var etDesc: TextInputEditText
    private lateinit var etBusinessNo: TextInputEditText
    private lateinit var etOtherCodes: TextInputEditText
    private lateinit var tilBusinessNo: com.google.android.material.textfield.TextInputLayout
    private lateinit var tilOtherCodes: com.google.android.material.textfield.TextInputLayout
    private lateinit var cbQuickSubmit: android.widget.CheckBox
    private lateinit var attachmentList: LinearLayout
    private lateinit var tvTarget: TextView
    private lateinit var recyclerMine: RecyclerView
    private lateinit var panelSubmit: View
    private lateinit var panelMine: androidx.drawerlayout.widget.DrawerLayout
    private lateinit var fabFilter: com.google.android.material.floatingactionbutton.FloatingActionButton
    private lateinit var fabScan: com.google.android.material.floatingactionbutton.FloatingActionButton

    // 抽屉中的复选框
    private lateinit var cbOpen: android.widget.CheckBox
    private lateinit var cbInProgress: android.widget.CheckBox
    private lateinit var cbResolved: android.widget.CheckBox
    private lateinit var cbClosed: android.widget.CheckBox
    private lateinit var cbReopened: android.widget.CheckBox

    // 我的工单查询条件
    private var filterStatuses = mutableSetOf("open", "in_progress")  // 默认：待处理、进行中
    private var filterSearchKey = ""  // 搜索关键字

    // 快速提交：记录上次确认的标题和描述，避免重复确认
    private var lastConfirmedTitle = ""
    private var lastConfirmedDesc = ""

    private var targetPackage: String = ""
    private var targetLabel: String = ""

    private var pendingPhoto: File? = null
    private var pendingVideo: File? = null
    private var voiceRecorder: MediaRecorder? = null
    private var voiceFile: File? = null
    private var logcat: FeedbackLogcatCapture? = null
    private var logcatFile: String? = null

    // 扫码目标：business_no 或 other_codes
    private var scanTarget: String = ""

    // ── 硬件扫描广播接收器 ──
    private val hardwareScanReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val data = ScanBroadcastHelper.SCAN_EXTRA_KEYS
                .firstNotNullOfOrNull { key -> intent.getStringExtra(key)?.takeIf { it.isNotBlank() } }
                ?: return
            runOnUiThread { handleScanResult(data) }
        }
    }

    // ── 摄像头扫码 ──
    private val cameraScanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            handleScanResult(result.contents)
        }
    }

    private fun handleScanResult(code: String) {
        // 在"我的工单"标签页时，扫码触发搜索
        val currentTab = findViewById<TabLayout>(R.id.tabs).selectedTabPosition
        if (currentTab == 1) {
            filterSearchKey = code
            Toast.makeText(this, "搜索：$code", Toast.LENGTH_SHORT).show()
            loadMine()
            return
        }

        // 提交反馈页面的扫码逻辑
        if (scanTarget.isEmpty()) {
            val focusedView = currentFocus
            scanTarget = when (focusedView?.id) {
                R.id.etBusinessNo -> "business_no"
                R.id.etOtherCodes -> "other_codes"
                else -> "business_no"
            }
        }

        when (scanTarget) {
            "business_no" -> {
                etBusinessNo.setText(code)
                Toast.makeText(this, "已填入业务单号", Toast.LENGTH_SHORT).show()

                // 如果勾选了"扫码后立即提交"，则自动提交
                if (cbQuickSubmit.isChecked) {
                    quickSubmitWithBusinessNo()
                }
            }
            "other_codes" -> {
                mergeOtherCodes(listOf(code))
                Toast.makeText(this, "已添加到其他编码", Toast.LENGTH_SHORT).show()
            }
        }
        scanTarget = ""
    }

    /**
     * 扫码后快速提交（保留标题和问题描述，仅填入业务单号后提交）
     * 智能确认：仅在标题或描述改变时弹确认对话框，内容不变则直接提交
     */
    private fun quickSubmitWithBusinessNo() {
        val title = etTitle.text?.toString()?.trim() ?: ""
        val desc = etDesc.text?.toString()?.trim() ?: ""

        if (title.isEmpty()) {
            Toast.makeText(this, "请先填写标题", Toast.LENGTH_SHORT).show()
            return
        }

        // 检查标题和描述是否与上次确认的相同
        if (title == lastConfirmedTitle && desc == lastConfirmedDesc) {
            // 内容未变，直接提交，不弹确认对话框
            submitQuick()
        } else {
            // 内容改变，显示确认对话框
            AlertDialog.Builder(this)
                .setTitle("确认提交")
                .setMessage("业务单号: ${etBusinessNo.text}\n标题: $title\n描述: ${if (desc.isEmpty()) "（无）" else desc}\n\n确定立即提交反馈？")
                .setPositiveButton("提交") { _, _ ->
                    // 记录本次确认的内容
                    lastConfirmedTitle = title
                    lastConfirmedDesc = desc
                    submitQuick()
                }
                .setNegativeButton("取消", null)
                .show()
        }
    }

    // ── 录屏结果广播 ──
    private val recvRec = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val path = intent?.getStringExtra(FeedbackScreenRecordService.EXTRA_FILE_PATH)
            runOnUiThread {
                if (path != null) {
                    addAttachment(Attachment("screen_record", File(path), "video/mp4", targetPackage))
                    Toast.makeText(this@FeedbackActivity, "录屏已添加", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@FeedbackActivity, "录屏失败", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private val takePhoto = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        // 拍照完成后立即恢复摄像头流
        resumeCameraStreams()
        if (r.resultCode == Activity.RESULT_OK) pendingPhoto?.let {
            if (it.exists() && it.length() > 0) {
                addAttachment(Attachment("photo", it, "image/jpeg"))
                recognizeQrFromPhoto(it)
            }
        }
    }
    private val takeVideo = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == Activity.RESULT_OK) pendingVideo?.let {
            if (it.exists() && it.length() > 0) addAttachment(Attachment("video", it, "video/mp4"))
        }
    }
    private val screenProjection = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == Activity.RESULT_OK && r.data != null) {
            val svc = Intent(this, FeedbackScreenRecordService::class.java).apply {
                action = FeedbackScreenRecordService.ACTION_START
                putExtra(FeedbackScreenRecordService.EXTRA_RESULT_CODE, r.resultCode)
                putExtra(FeedbackScreenRecordService.EXTRA_DATA, r.data)
            }
            ContextCompat.startForegroundService(this, svc)
            promptStopRecording()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_feedback)

        findViewById<MaterialToolbar>(R.id.toolbar).setNavigationOnClickListener { finish() }
        spinnerType = findViewById(R.id.spinnerType)
        etTitle = findViewById(R.id.etTitle)
        etDesc = findViewById(R.id.etDesc)
        etBusinessNo = findViewById(R.id.etBusinessNo)
        etOtherCodes = findViewById(R.id.etOtherCodes)
        tilBusinessNo = etBusinessNo.parent.parent as com.google.android.material.textfield.TextInputLayout
        tilOtherCodes = etOtherCodes.parent.parent as com.google.android.material.textfield.TextInputLayout
        cbQuickSubmit = findViewById(R.id.cbQuickSubmit)
        attachmentList = findViewById(R.id.attachmentList)
        tvTarget = findViewById(R.id.tvTarget)
        recyclerMine = findViewById(R.id.recyclerMine)
        panelSubmit = findViewById(R.id.panelSubmit)
        panelMine = findViewById(R.id.drawerLayout)
        fabFilter = findViewById(R.id.fabFilter)
        fabScan = findViewById(R.id.fabScan)
        recyclerMine.layoutManager = LinearLayoutManager(this)

        // 初始化抽屉中的复选框
        val drawerView = panelMine.getChildAt(1)  // 第二个子视图是抽屉
        cbOpen = drawerView.findViewById(R.id.cbOpen)
        cbInProgress = drawerView.findViewById(R.id.cbInProgress)
        cbResolved = drawerView.findViewById(R.id.cbResolved)
        cbClosed = drawerView.findViewById(R.id.cbClosed)
        cbReopened = drawerView.findViewById(R.id.cbReopened)

        // 抽屉按钮事件
        drawerView.findViewById<Button>(R.id.btnApply).setOnClickListener {
            applyFilter()
            panelMine.closeDrawers()
        }
        drawerView.findViewById<Button>(R.id.btnReset).setOnClickListener {
            resetFilter()
        }

        // 悬浮按钮点击事件
        fabFilter.setOnClickListener { panelMine.openDrawer(android.view.Gravity.END) }
        fabScan.setOnClickListener { launchScan("mine_search") }

        findViewById<TabLayout>(R.id.tabs).addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                val mine = tab.position == 1
                panelSubmit.visibility = if (mine) View.GONE else View.VISIBLE
                panelMine.visibility = if (mine) View.VISIBLE else View.GONE
                if (mine) loadMine()
            }
            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })

        findViewById<Button>(R.id.btnPhoto).setOnClickListener { capturePhoto() }
        findViewById<Button>(R.id.btnVideo).setOnClickListener { captureVideo() }
        findViewById<Button>(R.id.btnVoice).setOnClickListener { toggleVoice(it as Button) }
        findViewById<Button>(R.id.btnScreen).setOnClickListener { startScreenRecord() }
        findViewById<Button>(R.id.btnLogcat).setOnClickListener { toggleLogcat(it as Button) }
        findViewById<Button>(R.id.btnPickTarget).setOnClickListener { pickTargetApp() }
        findViewById<Button>(R.id.btnSubmit).setOnClickListener { submit() }

        // 设置 TextInputLayout 的 endIcon 点击事件
        tilBusinessNo.setEndIconOnClickListener { launchScan("business_no") }
        tilOtherCodes.setEndIconOnClickListener { launchScan("other_codes") }

        updateScanIconsVisibility()
        loadTypes()

        // 从 Intent 中获取预填充数据（支持从 form-app 一键反馈）
        handleIntentParams()
    }

    private fun handleIntentParams() {
        val data = intent?.data ?: return

        // 从 URL 参数中提取预填充数据
        data.getQueryParameter("type")?.let { typeCode ->
            // 等待类型加载完成后再设置（在 loadTypes 回调中处理）
            getSharedPreferences("feedback_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString("prefill_type", typeCode)
                .apply()
        }

        data.getQueryParameter("business_no")?.let { businessNo ->
            etBusinessNo.setText(businessNo)
        }

        data.getQueryParameter("other_codes")?.let { otherCodes ->
            etOtherCodes.setText(otherCodes)
        }

        data.getQueryParameter("title")?.let { title ->
            etTitle.setText(title)
        }

        data.getQueryParameter("description")?.let { description ->
            etDesc.setText(description)
        }
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(this, recvRec,
            IntentFilter(FeedbackScreenRecordService.ACTION_RESULT), ContextCompat.RECEIVER_NOT_EXPORTED)

        // 注册硬件扫描广播（如果是硬件扫描模式）
        val scanMode = AgentConfig.get(this).scanMode
        if (scanMode == "hardware") {
            val filter = ScanBroadcastHelper.createScanIntentFilter(this)
            ContextCompat.registerReceiver(this, hardwareScanReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
        }
    }

    override fun onStop() {
        super.onStop()
        try { unregisterReceiver(recvRec) } catch (_: Exception) {}
        try { unregisterReceiver(hardwareScanReceiver) } catch (_: Exception) {}
    }

    private fun feedbackDir(): File = File(getExternalFilesDir(null), "feedback").apply { mkdirs() }
    private fun fileUri(f: File): Uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", f)

    // ── 类型 ──
    private fun loadTypes() {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val json = AgentCatalogApi.getJson(base, "/api/work-orders/types", cfg.deviceToken.trim())
                val arr = JSONObject(json).optJSONArray("data") ?: JSONArray()
                val list = mutableListOf<WoType>()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    if (o.optBoolean("enabled", true)) list.add(WoType(o.optString("code"), o.optString("name"), o.optString("default_title")))
                }
                runOnUiThread {
                    types.clear(); types.addAll(list)
                    if (types.isEmpty()) types.add(WoType("", "通用反馈"))
                    spinnerType.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, types.map { it.name })

                    // 优先使用预填充的类型，其次是记忆的上次类型
                    val prefillType = getSharedPreferences("feedback_prefs", Context.MODE_PRIVATE)
                        .getString("prefill_type", null)
                    val targetCode = prefillType ?: getLastTypeCode()

                    // 清除预填充标记
                    if (prefillType != null) {
                        getSharedPreferences("feedback_prefs", Context.MODE_PRIVATE)
                            .edit()
                            .remove("prefill_type")
                            .apply()
                    }

                    val idx = types.indexOfFirst { it.code == targetCode }
                    val sel = if (idx >= 0) idx else 0
                    setupTypeAutoTitle()
                    spinnerType.setSelection(sel)
                    // 选中默认/记忆项时 Spinner 不一定回调 onItemSelected（位置未变即被抑制），
                    // 主动带出一次默认标题，否则首屏默认类型的标题永远空着。
                    autoFillTitle(sel)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    types.clear(); types.add(WoType("", "通用反馈"))
                    spinnerType.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, types.map { it.name })
                }
            }
        }
    }

    /** 选择工单类型时，若标题为空则自动带出该类型的默认标题；并记忆所选类型。 */
    private fun setupTypeAutoTitle() {
        spinnerType.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) {
                types.getOrNull(position)?.let { saveLastTypeCode(it.code) }
                autoFillTitle(position)
            }
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
        }
    }

    /** 标题为空时带出该位置工单类型的默认标题（已有标题不覆盖，避免冲掉用户输入）。 */
    private fun autoFillTitle(position: Int) {
        val def = types.getOrNull(position)?.defaultTitle.orEmpty()
        if (def.isNotBlank() && etTitle.text?.toString()?.trim().isNullOrEmpty()) {
            etTitle.setText(def)
        }
    }

    /** 上次所选工单类型 code（记忆下次默认选中）。 */
    private fun feedbackPrefs() = getSharedPreferences("feedback_prefs", Context.MODE_PRIVATE)
    private fun getLastTypeCode(): String = feedbackPrefs().getString("last_type_code", "") ?: ""
    private fun saveLastTypeCode(code: String) { feedbackPrefs().edit().putString("last_type_code", code).apply() }

    // ── 采集 ──
    private fun capturePhoto() {
        // 拍照前暂停摄像头流，避免占用冲突
        pauseCameraStreams()
        val f = File(feedbackDir(), "photo_${System.currentTimeMillis()}.jpg")
        pendingPhoto = f
        val i = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, fileUri(f))
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (i.resolveActivity(packageManager) != null) takePhoto.launch(i)
        else {
            resumeCameraStreams()  // 无相机应用时也要恢复
            Toast.makeText(this, "无相机应用", Toast.LENGTH_SHORT).show()
        }
    }

    /** 拍照后台识别照片中的二维码，并入「其他编码」输入框（去重）。无码不打扰。 */
    private fun recognizeQrFromPhoto(photo: File) {
        thread {
            val codes = try { QrPhotoDecoder.decodeAll(photo) } catch (_: Throwable) { emptyList() }
            if (codes.isEmpty()) return@thread
            runOnUiThread {
                mergeOtherCodes(codes)
                Toast.makeText(this, "识别到 ${codes.size} 个二维码", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** 把新识别的编码并入输入框：按逗号拆分已有值，去重后回填。 */
    private fun mergeOtherCodes(newCodes: List<String>) {
        val existing = etOtherCodes.text?.toString().orEmpty()
            .split(',', '，', '\n')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
        val merged = LinkedHashSet<String>().apply {
            addAll(existing)
            addAll(newCodes.map { it.trim() }.filter { it.isNotEmpty() })
        }
        etOtherCodes.setText(merged.joinToString(","))
    }

    private fun captureVideo() {
        val f = File(feedbackDir(), "video_${System.currentTimeMillis()}.mp4")
        pendingVideo = f
        val i = Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE)
            .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, fileUri(f))
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (i.resolveActivity(packageManager) != null) takeVideo.launch(i)
        else Toast.makeText(this, "无录像应用", Toast.LENGTH_SHORT).show()
    }

    private fun toggleVoice(btn: Button) {
        if (voiceRecorder == null) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "需要录音权限", Toast.LENGTH_SHORT).show(); return
            }
            val f = File(feedbackDir(), "voice_${System.currentTimeMillis()}.m4a")
            voiceFile = f
            voiceRecorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(f.absolutePath)
                prepare(); start()
            }
            btn.text = "停止录音"
        } else {
            try { voiceRecorder?.stop() } catch (_: Exception) {}
            voiceRecorder?.release(); voiceRecorder = null
            btn.text = "录音"
            voiceFile?.let { if (it.exists() && it.length() > 0) addAttachment(Attachment("voice", it, "audio/mp4")) }
        }
    }

    private fun startScreenRecord() {
        if (FeedbackScreenRecordService.isRecording) { promptStopRecording(); return }
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        screenProjection.launch(mpm.createScreenCaptureIntent())
    }

    private fun promptStopRecording() {
        AlertDialog.Builder(this)
            .setTitle("录屏中")
            .setMessage("切到目标 App 复现问题，完成后点「停止」。")
            .setPositiveButton("停止") { _, _ ->
                ContextCompat.startForegroundService(this,
                    Intent(this, FeedbackScreenRecordService::class.java).setAction(FeedbackScreenRecordService.ACTION_STOP))
            }
            .setCancelable(false)
            .show()
        moveTaskToBack(true)
    }

    private fun toggleLogcat(btn: Button) {
        if (logcat == null) {
            logcat = FeedbackLogcatCapture(this)
            logcatFile = logcat?.start(targetPackage.takeIf { it.isNotBlank() })
            if (logcatFile == null) { logcat = null; Toast.makeText(this, "日志采集启动失败", Toast.LENGTH_SHORT).show(); return }
            btn.text = "停止日志"
            Toast.makeText(this, if (targetPackage.isNotBlank()) "正在抓取 $targetLabel 日志" else "正在抓取全量日志", Toast.LENGTH_SHORT).show()
        } else {
            val path = logcat?.stop(); logcat = null
            btn.text = "抓日志"
            path?.let { addAttachment(Attachment("logcat", File(it), "text/plain", targetPackage)) }
        }
    }

    private fun pickTargetApp() {
        val pm = packageManager
        val all = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        // 三类：可启动（用户最常选）/ 用户应用 / 系统应用；均按名称排序。
        data class AppItem(val pkg: String, val label: String)
        fun items(predicate: (android.content.pm.ApplicationInfo) -> Boolean) =
            all.filter(predicate)
                .map { AppItem(it.packageName, pm.getApplicationLabel(it).toString()) }
                .sortedBy { it.label.lowercase() }

        val launchable = items { pm.getLaunchIntentForPackage(it.packageName) != null }
        val userApps = items { (it.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0 }
        val systemApps = items { (it.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0 }

        val categories = listOf(
            "可启动应用 (${launchable.size})" to launchable,
            "用户应用 (${userApps.size})" to userApps,
            "系统应用 (${systemApps.size})" to systemApps,
        )
        val catLabels = (listOf("全设备（不指定）") + categories.map { it.first }).toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("选择应用分类")
            .setItems(catLabels) { _, cat ->
                if (cat == 0) {
                    targetPackage = ""; targetLabel = ""
                    updateTargetLabel()
                    return@setItems
                }
                val apps = categories[cat - 1].second
                if (apps.isEmpty()) { Toast.makeText(this, "该分类下无应用", Toast.LENGTH_SHORT).show(); return@setItems }
                val labels = apps.map { "${it.label} (${it.pkg})" }.toTypedArray()
                AlertDialog.Builder(this)
                    .setTitle(categories[cat - 1].first)
                    .setItems(labels) { _, which ->
                        targetPackage = apps[which].pkg; targetLabel = apps[which].label
                        updateTargetLabel()
                    }
                    .show()
            }
            .show()
    }

    private fun updateTargetLabel() {
        tvTarget.text = "目标应用：" + (if (targetPackage.isBlank()) "全设备" else "$targetLabel ($targetPackage)")
    }

    // ── 扫码功能 ──
    private fun launchScan(target: String) {
        scanTarget = target
        val scanMode = AgentConfig.get(this).scanMode

        if (scanMode == "hardware") {
            Toast.makeText(this, "请使用扫描枪扫描", Toast.LENGTH_SHORT).show()
            return
        }

        // 摄像头扫描模式
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCameraScan()
        } else {
            // 请求相机权限后再扫码
            androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
            Toast.makeText(this, "需要相机权限才能扫码", Toast.LENGTH_SHORT).show()
        }
    }

    private fun startCameraScan() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(
                ScanOptions.QR_CODE,
                ScanOptions.CODE_128,
                ScanOptions.CODE_39,
                ScanOptions.EAN_13,
                ScanOptions.EAN_8
            )
            setPrompt("扫描条码或二维码")
            setCameraId(0)
            setBeepEnabled(true)
            setOrientationLocked(false)
        }
        cameraScanLauncher.launch(options)
    }

    private fun updateScanIconsVisibility() {
        val scanMode = AgentConfig.get(this).scanMode
        // 硬件模式隐藏摄像头图标
        if (scanMode == "hardware") {
            tilBusinessNo.endIconMode = com.google.android.material.textfield.TextInputLayout.END_ICON_NONE
            tilOtherCodes.endIconMode = com.google.android.material.textfield.TextInputLayout.END_ICON_NONE
            fabScan.visibility = View.GONE  // 隐藏"我的工单"页面的扫码按钮
        } else {
            tilBusinessNo.endIconMode = com.google.android.material.textfield.TextInputLayout.END_ICON_CUSTOM
            tilOtherCodes.endIconMode = com.google.android.material.textfield.TextInputLayout.END_ICON_CUSTOM
            fabScan.visibility = View.VISIBLE  // 显示"我的工单"页面的扫码按钮
        }
    }

    // ── 附件列表 ──
    private fun addAttachment(a: Attachment) {
        attachments.add(a)
        renderAttachments()
    }

    private fun renderAttachments() {
        attachmentList.removeAllViews()
        attachments.forEachIndexed { idx, a ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, 8, 0, 8) }
            val tv = TextView(this).apply {
                text = "${kindLabel(a.kind)} · ${a.file.name} (${a.file.length() / 1024}KB)"
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val del = Button(this).apply {
                text = "删除"
                setOnClickListener { attachments.removeAt(idx); renderAttachments() }
            }
            row.addView(tv); row.addView(del)
            attachmentList.addView(row)
        }
    }

    private fun kindLabel(k: String) = when (k) {
        "photo" -> "照片"; "video" -> "视频"; "voice" -> "语音"; "screen_record" -> "录屏"; "logcat" -> "日志"; else -> "资源"
    }

    // ── 提交 ──
    private fun submit() {
        val title = etTitle.text?.toString()?.trim().orEmpty()
        if (title.isEmpty()) { Toast.makeText(this, "请填写标题", Toast.LENGTH_SHORT).show(); return }
        val typeCode = types.getOrNull(spinnerType.selectedItemPosition)?.code ?: ""
        val desc = etDesc.text?.toString()?.trim().orEmpty()
        val businessNo = etBusinessNo.text?.toString()?.trim().orEmpty()
        val otherCodes = etOtherCodes.text?.toString()?.trim().orEmpty()
        val cfg = AgentConfig.get(this)
        val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
        val jwtToken = cfg.userToken.trim()
        val deviceToken = cfg.deviceToken.trim()
        if (base.isEmpty() || (jwtToken.isEmpty() && deviceToken.isEmpty())) {
            Toast.makeText(this, "未配置服务器/认证令牌", Toast.LENGTH_SHORT).show()
            return
        }

        val dialog = AlertDialog.Builder(this).setMessage("提交中…").setCancelable(false).create()
        dialog.show()
        thread {
            try {
                val body = JSONObject()
                    .put("type_code", typeCode)
                    .put("title", title)
                    .put("description", desc)
                    .put("business_no", businessNo)
                    .put("other_codes", otherCodes)
                // 优先使用用户 JWT token，否则使用设备 token
                val resp = AgentCatalogApi.postJsonWithAuth(base, "/api/work-orders", jwtToken, deviceToken, body.toString())
                val wo = JSONObject(resp).optJSONObject("data") ?: JSONObject()
                val id = wo.optInt("id")
                for (a in attachments) {
                    AgentCatalogApi.uploadFileWithAuth(base, "/api/work-orders/$id/items", jwtToken, deviceToken, a.file, a.contentType,
                        mapOf("kind" to a.kind, "target_pkg" to a.targetPkg))
                }
                runOnUiThread {
                    dialog.dismiss()
                    Toast.makeText(this, "已提交：${wo.optString("code")}", Toast.LENGTH_LONG).show()
                    attachments.clear(); renderAttachments()
                    etTitle.setText(""); etDesc.setText(""); etBusinessNo.setText(""); etOtherCodes.setText("")
                    // 提交成功后重新填充当前类型的默认标题
                    autoFillTitle(spinnerType.selectedItemPosition)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    dialog.dismiss()
                    Toast.makeText(this, "提交失败：${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * 快速提交（快速提交模式下保留标题和描述）
     */
    private fun submitQuick() {
        val title = etTitle.text?.toString()?.trim().orEmpty()
        if (title.isEmpty()) { Toast.makeText(this, "请填写标题", Toast.LENGTH_SHORT).show(); return }
        val typeCode = types.getOrNull(spinnerType.selectedItemPosition)?.code ?: ""
        val desc = etDesc.text?.toString()?.trim().orEmpty()
        val businessNo = etBusinessNo.text?.toString()?.trim().orEmpty()
        val otherCodes = etOtherCodes.text?.toString()?.trim().orEmpty()
        val cfg = AgentConfig.get(this)
        val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
        val jwtToken = cfg.userToken.trim()
        val deviceToken = cfg.deviceToken.trim()
        if (base.isEmpty() || (jwtToken.isEmpty() && deviceToken.isEmpty())) {
            Toast.makeText(this, "未配置服务器/认证令牌", Toast.LENGTH_SHORT).show()
            return
        }

        val dialog = AlertDialog.Builder(this).setMessage("提交中…").setCancelable(false).create()
        dialog.show()
        thread {
            try {
                val body = JSONObject()
                    .put("type_code", typeCode)
                    .put("title", title)
                    .put("description", desc)
                    .put("business_no", businessNo)
                    .put("other_codes", otherCodes)
                // 优先使用用户 JWT token，否则使用设备 token
                val resp = AgentCatalogApi.postJsonWithAuth(base, "/api/work-orders", jwtToken, deviceToken, body.toString())
                val wo = JSONObject(resp).optJSONObject("data") ?: JSONObject()
                val id = wo.optInt("id")
                for (a in attachments) {
                    AgentCatalogApi.uploadFileWithAuth(base, "/api/work-orders/$id/items", jwtToken, deviceToken, a.file, a.contentType,
                        mapOf("kind" to a.kind, "target_pkg" to a.targetPkg))
                }
                runOnUiThread {
                    dialog.dismiss()
                    Toast.makeText(this, "提交成功", Toast.LENGTH_SHORT).show()
                    attachments.clear(); renderAttachments()
                    // 快速提交模式：仅清空业务单号和其他编码，保留标题和描述
                    etBusinessNo.setText(""); etOtherCodes.setText("")
                }
            } catch (e: Exception) {
                runOnUiThread {
                    dialog.dismiss()
                    Toast.makeText(this, "提交失败：${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    // ── 我的工单 ──
    private fun applyFilter() {
        // 从复选框读取选中的状态
        filterStatuses.clear()
        if (cbOpen.isChecked) filterStatuses.add("open")
        if (cbInProgress.isChecked) filterStatuses.add("in_progress")
        if (cbResolved.isChecked) filterStatuses.add("resolved")
        if (cbClosed.isChecked) filterStatuses.add("closed")
        if (cbReopened.isChecked) filterStatuses.add("reopened")

        loadMine()
    }

    private fun resetFilter() {
        // 重置为默认状态
        cbOpen.isChecked = true
        cbInProgress.isChecked = true
        cbResolved.isChecked = false
        cbClosed.isChecked = false
        cbReopened.isChecked = false

        filterStatuses.clear()
        filterStatuses.addAll(listOf("open", "in_progress"))
        filterSearchKey = ""

        loadMine()
    }

    private fun loadMine() {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)

                // 构建查询参数
                val params = mutableListOf<String>()
                if (filterStatuses.isNotEmpty()) {
                    params.add("status=${filterStatuses.joinToString(",")}")
                }
                if (filterSearchKey.isNotBlank()) {
                    params.add("search=${java.net.URLEncoder.encode(filterSearchKey, "UTF-8")}")
                }
                val queryString = if (params.isNotEmpty()) "?${params.joinToString("&")}" else ""

                // 优先使用用户 JWT token，否则使用设备 token
                val json = AgentCatalogApi.getJsonWithAuth(base, "/api/work-orders/mine$queryString", cfg.userToken.trim(), cfg.deviceToken.trim())
                val arr = JSONObject(json).optJSONArray("data") ?: JSONArray()
                val rows = mutableListOf<WoRow>()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    rows.add(
                        WoRow(
                            id = o.optInt("id"),
                            code = o.optString("code"),
                            title = o.optString("title"),
                            status = o.optString("status"),
                            createdAt = o.optString("created_at"),
                            submitter = o.optString("submitter"),
                            deviceName = o.optString("device_name"),
                            otherCodes = o.optString("other_codes"),
                        )
                    )
                }
                runOnUiThread { recyclerMine.adapter = MineAdapter(rows) { openDetail(it) } }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, "加载失败：${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    private fun openDetail(row: WoRow) {
        startActivity(Intent(this, FeedbackDetailActivity::class.java).putExtra(FeedbackDetailActivity.EXTRA_ID, row.id))
    }

    data class WoRow(
        val id: Int, val code: String, val title: String, val status: String,
        val createdAt: String, val submitter: String, val deviceName: String,
        val otherCodes: String = "",
    )

    private class MineAdapter(val rows: List<WoRow>, val onClick: (WoRow) -> Unit) : RecyclerView.Adapter<MineAdapter.VH>() {
        class VH(val view: LinearLayout) : RecyclerView.ViewHolder(view)
        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): VH {
            val ll = LinearLayout(parent.context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(28, 24, 28, 24)
                isClickable = true
                background = androidx.core.content.ContextCompat.getDrawable(context, android.R.drawable.list_selector_background)
                layoutParams = RecyclerView.LayoutParams(RecyclerView.LayoutParams.MATCH_PARENT, RecyclerView.LayoutParams.WRAP_CONTENT)
            }
            return VH(ll)
        }
        override fun getItemCount() = rows.size
        override fun onBindViewHolder(holder: VH, position: Int) {
            val r = rows[position]
            val ctx = holder.view.context
            holder.view.removeAllViews()
            holder.view.addView(TextView(ctx).apply { text = r.title; textSize = 16f; setTextColor(0xFF222222.toInt()) })
            holder.view.addView(TextView(ctx).apply {
                text = "${r.code} · ${statusLabel(r.status)}"; textSize = 13f; setTextColor(statusColor(r.status))
            })
            val meta = buildList {
                if (r.createdAt.isNotBlank()) add("提交 ${fmtTime(r.createdAt)}")
                if (r.submitter.isNotBlank()) add("提交人 ${r.submitter}")
                if (r.deviceName.isNotBlank()) add("设备 ${r.deviceName}")
            }.joinToString("  ·  ")
            if (meta.isNotBlank()) holder.view.addView(TextView(ctx).apply {
                text = meta; textSize = 12f; setTextColor(0xFF999999.toInt())
            })
            if (r.otherCodes.isNotBlank()) holder.view.addView(TextView(ctx).apply {
                text = "其他编码：${r.otherCodes}"; textSize = 12f; setTextColor(0xFF1F6FEB.toInt())
            })
            holder.view.setOnClickListener { onClick(r) }
        }
        private fun statusLabel(s: String) = when (s) {
            "open" -> "待处理"; "in_progress" -> "处理中"; "resolved" -> "已解决"; "closed" -> "已关闭"; "reopened" -> "重新打开"; else -> s
        }
        private fun statusColor(s: String) = when (s) {
            "open" -> 0xFF909399.toInt(); "in_progress" -> 0xFFE6A23C.toInt(); "resolved" -> 0xFF67C23A.toInt()
            "closed" -> 0xFF909399.toInt(); "reopened" -> 0xFFE6A23C.toInt(); else -> 0xFF909399.toInt()
        }
        private fun fmtTime(s: String): String {
            // ISO8601 → 取到分钟，去掉 T/时区噪声。
            return s.replace("T", " ").take(16)
        }
    }

    // ── 摄像头流暂停/恢复辅助方法 ──
    private fun pauseCameraStreams() {
        ContextCompat.startForegroundService(
            this,
            Intent(this, AgentService::class.java).setAction(AgentService.ACTION_PAUSE_CAMERA)
        )
    }

    private fun resumeCameraStreams() {
        ContextCompat.startForegroundService(
            this,
            Intent(this, AgentService::class.java).setAction(AgentService.ACTION_RESUME_CAMERA)
        )
    }
}
