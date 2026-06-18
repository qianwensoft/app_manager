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
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.QrPhotoDecoder
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.tabs.TabLayout
import com.google.android.material.textfield.TextInputEditText
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
    private lateinit var etOtherCodes: TextInputEditText
    private lateinit var attachmentList: LinearLayout
    private lateinit var tvTarget: TextView
    private lateinit var recyclerMine: RecyclerView
    private lateinit var panelSubmit: View

    private var targetPackage: String = ""
    private var targetLabel: String = ""

    private var pendingPhoto: File? = null
    private var pendingVideo: File? = null
    private var voiceRecorder: MediaRecorder? = null
    private var voiceFile: File? = null
    private var logcat: FeedbackLogcatCapture? = null
    private var logcatFile: String? = null

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
        etOtherCodes = findViewById(R.id.etOtherCodes)
        attachmentList = findViewById(R.id.attachmentList)
        tvTarget = findViewById(R.id.tvTarget)
        recyclerMine = findViewById(R.id.recyclerMine)
        panelSubmit = findViewById(R.id.panelSubmit)
        recyclerMine.layoutManager = LinearLayoutManager(this)

        findViewById<TabLayout>(R.id.tabs).addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                val mine = tab.position == 1
                panelSubmit.visibility = if (mine) View.GONE else View.VISIBLE
                recyclerMine.visibility = if (mine) View.VISIBLE else View.GONE
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

        loadTypes()
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(this, recvRec,
            IntentFilter(FeedbackScreenRecordService.ACTION_RESULT), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStop() {
        super.onStop()
        try { unregisterReceiver(recvRec) } catch (_: Exception) {}
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
                    // 记忆上次所选类型：存在则自动选中，否则默认第一个
                    val lastCode = getLastTypeCode()
                    val idx = types.indexOfFirst { it.code == lastCode }
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
        val f = File(feedbackDir(), "photo_${System.currentTimeMillis()}.jpg")
        pendingPhoto = f
        val i = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, fileUri(f))
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (i.resolveActivity(packageManager) != null) takePhoto.launch(i)
        else Toast.makeText(this, "无相机应用", Toast.LENGTH_SHORT).show()
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
        val otherCodes = etOtherCodes.text?.toString()?.trim().orEmpty()
        val cfg = AgentConfig.get(this)
        val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
        val token = cfg.deviceToken.trim()
        if (base.isEmpty() || token.isEmpty()) { Toast.makeText(this, "未配置服务器/设备令牌", Toast.LENGTH_SHORT).show(); return }

        val dialog = AlertDialog.Builder(this).setMessage("提交中…").setCancelable(false).create()
        dialog.show()
        thread {
            try {
                val body = JSONObject()
                    .put("type_code", typeCode)
                    .put("title", title)
                    .put("description", desc)
                    .put("other_codes", otherCodes)
                val resp = AgentCatalogApi.postJson(base, "/api/work-orders", token, body.toString())
                val wo = JSONObject(resp).optJSONObject("data") ?: JSONObject()
                val id = wo.optInt("id")
                for (a in attachments) {
                    AgentCatalogApi.uploadFile(base, "/api/work-orders/$id/items", token, a.file, a.contentType,
                        mapOf("kind" to a.kind, "target_pkg" to a.targetPkg))
                }
                runOnUiThread {
                    dialog.dismiss()
                    Toast.makeText(this, "已提交：${wo.optString("code")}", Toast.LENGTH_LONG).show()
                    attachments.clear(); renderAttachments()
                    etTitle.setText(""); etDesc.setText(""); etOtherCodes.setText("")
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
    private fun loadMine() {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val json = AgentCatalogApi.getJson(base, "/api/work-orders/mine", cfg.deviceToken.trim())
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
}
