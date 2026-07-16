package com.appmanager.agent.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import kotlin.concurrent.thread

/**
 * 我的工单详情：展示完整信息 + 附件 + 处理时间线，并提供设备侧自助操作
 * （补充说明/催单、标记已解决、关闭、重新打开）。状态变更后服务端会实时推送回设备。
 */
class FeedbackDetailActivity : AppCompatActivity() {

    companion object { const val EXTRA_ID = "wo_id" }

    private var woId: Int = 0
    private lateinit var container: LinearLayout
    private var currentStatus: String = ""
    private var currentTags: List<String> = emptyList()
    private var currentPriority: String = "normal"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        woId = intent.getIntExtra(EXTRA_ID, 0)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; layoutParams =
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT) }
        val toolbar = MaterialToolbar(this).apply {
            title = "工单详情"
            setNavigationOnClickListener { finish() }
        }
        root.addView(toolbar)
        val scroll = ScrollView(this).apply { layoutParams =
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f) }
        container = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 24, 32, 48) }
        scroll.addView(container)
        root.addView(scroll)
        setContentView(root)

        if (woId <= 0) { Toast.makeText(this, "无效工单", Toast.LENGTH_SHORT).show(); finish(); return }
        load()
    }

    private fun load() {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val json = AgentCatalogApi.getJson(base, "/api/work-orders/mine/$woId", cfg.deviceToken.trim())
                val wo = JSONObject(json).optJSONObject("data") ?: JSONObject()
                runOnUiThread { render(wo, base, cfg.deviceToken.trim()) }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, "加载失败：${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    private fun render(wo: JSONObject, base: String, token: String) {
        container.removeAllViews()
        currentStatus = wo.optString("status")
        currentPriority = wo.optString("priority", "normal")

        addText(wo.optString("title"), 20f, 0xFF222222.toInt(), bold = true)
        addText("${wo.optString("code")} · ${statusLabel(currentStatus)}", 14f, statusColor(currentStatus))

        val meta = buildList {
            wo.optString("created_at").takeIf { it.isNotBlank() }?.let { add("提交时间：${it.replace("T", " ").take(16)}") }
            wo.optString("submitter").takeIf { it.isNotBlank() }?.let { add("提交人：$it") }
            wo.optString("device_name").takeIf { it.isNotBlank() }?.let { add("设备：$it") }
        }
        meta.forEach { addText(it, 13f, 0xFF888888.toInt()) }

        // 优先级（可点击修改）
        val priorityText = "优先级：${priorityLabel(currentPriority)}"
        addText(priorityText, 13f, 0xFF888888.toInt())?.apply {
            setOnClickListener { changePriority() }
            setPadding(0, 0, 0, dp(8))
        }

        // 标签
        val tagsArr = wo.optJSONArray("tags") ?: JSONArray()
        currentTags = (0 until tagsArr.length()).map { tagsArr.optString(it) }.filter { it.isNotBlank() }
        if (currentTags.isNotEmpty()) addText("标签：${currentTags.joinToString("、")}", 13f, 0xFF1F6FEB.toInt())

        val otherCodes = wo.optString("other_codes")
        if (otherCodes.isNotBlank()) {
            addSectionTitle("其他编码")
            addText(otherCodes.split(',').joinToString("\n") { it.trim() }, 15f, 0xFF444444.toInt())
        }

        val desc = wo.optString("description")
        if (desc.isNotBlank()) {
            addSectionTitle("问题描述")
            addText(desc, 15f, 0xFF444444.toInt())
        }

        // 附件
        val items = wo.optJSONArray("items") ?: JSONArray()
        if (items.length() > 0) {
            addSectionTitle("附件 / 采集产物（${items.length()}）")
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                val itemId = item.optInt("id")
                val kind = item.optString("kind")
                val name = item.optString("file_name")
                val contentType = item.optString("content_type")
                val url = "$base/api/work-orders/$woId/items/$itemId/download?device_token=" + URLEncoder.encode(token, "UTF-8")
                if (kind == "photo") {
                    // 图片：缩略图默认显示，fitCenter（不切图，完整等比展示），点击放大查看
                    addText("${kindLabel(kind)} · $name", 13f, 0xFF888888.toInt(), topMarginDp = 8)
                    val iv = android.widget.ImageView(this).apply {
                        scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
                        adjustViewBounds = true
                        setBackgroundColor(0xFFF5F6FA.toInt())
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT, dp(220)
                        ).apply { topMargin = dp(4) }
                        setOnClickListener { openExternally(url, contentType) }
                    }
                    container.addView(iv)
                    loadThumbnail(url, iv)
                } else {
                    val row = Button(this).apply {
                        text = "${kindLabel(kind)} · $name"
                        setOnClickListener { openExternally(url, contentType) }
                    }
                    container.addView(row)
                }
            }
        }

        // 时间线
        val acts = wo.optJSONArray("activities") ?: JSONArray()
        if (acts.length() > 0) {
            addSectionTitle("处理时间线")
            for (i in 0 until acts.length()) {
                val a = acts.getJSONObject(i)
                val line = StringBuilder(actionLabel(a.optString("action")))
                val from = a.optString("from_status"); val to = a.optString("to_status")
                if (from.isNotBlank() || to.isNotBlank()) line.append(" · ${statusLabel(from)} → ${statusLabel(to)}")
                addText(line.toString(), 14f, 0xFF333333.toInt(), topMarginDp = 12)
                a.optString("actor_label").takeIf { it.isNotBlank() }?.let { addText(it, 12f, 0xFF999999.toInt()) }
                a.optString("detail").takeIf { it.isNotBlank() }?.let { addText(it, 13f, 0xFF666666.toInt()) }
                a.optString("created_at").takeIf { it.isNotBlank() }?.let { addText(it.replace("T", " ").take(16), 12f, 0xFFAAAAAA.toInt()) }
            }
        }

        // 操作区
        addSectionTitle("相关操作")
        addOpButton("管理标签") { manageTags() }
        addOpButton("补充说明 / 催单") { promptComment() }
        if (currentStatus != "resolved") addOpButton("标记已解决") { changeStatus("resolved", "确认问题已解决？") }
        if (currentStatus != "closed") addOpButton("关闭工单") { changeStatus("closed", "确认关闭该工单？") }
        if (currentStatus == "closed" || currentStatus == "resolved") addOpButton("重新打开") { changeStatus("reopened", "重新打开该工单？") }
    }

    /** 修改优先级：单选对话框 → 提交更新。 */
    private fun changePriority() {
        val priorities = arrayOf("normal", "high", "urgent")
        val labels = arrayOf("普通", "较高", "紧急")
        val currentIndex = priorities.indexOf(currentPriority).coerceAtLeast(0)

        AlertDialog.Builder(this)
            .setTitle("修改优先级")
            .setSingleChoiceItems(labels, currentIndex) { dialog, which ->
                val newPriority = priorities[which]
                if (newPriority != currentPriority) {
                    thread {
                        try {
                            val cfg = AgentConfig.get(this)
                            val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                            val body = JSONObject().put("priority", newPriority).toString()
                            AgentCatalogApi.putJson(base, "/api/work-orders/mine/$woId", cfg.deviceToken.trim(), body)
                            runOnUiThread {
                                Toast.makeText(this, "优先级已更新", Toast.LENGTH_SHORT).show()
                                load()
                            }
                        } catch (e: Exception) {
                            runOnUiThread { Toast.makeText(this, "更新失败：${e.message}", Toast.LENGTH_SHORT).show() }
                        }
                    }
                }
                dialog.dismiss()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /** 管理标签：拉取标签字典 → 多选对话框（预勾当前）→ 全量保存。 */
    private fun manageTags() {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val json = AgentCatalogApi.getJson(base, "/api/work-orders/tags", cfg.deviceToken.trim())
                val arr = JSONObject(json).optJSONArray("data") ?: JSONArray()
                val codes = ArrayList<String>(); val names = ArrayList<String>()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    codes.add(o.optString("code")); names.add(o.optString("name"))
                }
                runOnUiThread {
                    if (codes.isEmpty()) { Toast.makeText(this, "暂无可用标签", Toast.LENGTH_SHORT).show(); return@runOnUiThread }
                    val checked = BooleanArray(codes.size) { currentTags.contains(codes[it]) }
                    AlertDialog.Builder(this)
                        .setTitle("管理标签")
                        .setMultiChoiceItems(names.toTypedArray(), checked) { _, which, isChecked -> checked[which] = isChecked }
                        .setPositiveButton("保存") { _, _ ->
                            val selected = codes.filterIndexed { idx, _ -> checked[idx] }
                            saveTags(selected)
                        }
                        .setNegativeButton("取消", null)
                        .show()
                }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, "标签加载失败：${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    private fun saveTags(tagCodes: List<String>) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val body = JSONObject().put("tags", JSONArray(tagCodes))
                AgentCatalogApi.putJson(base, "/api/work-orders/$woId/tags", cfg.deviceToken.trim(), body.toString())
                runOnUiThread { Toast.makeText(this, "标签已更新", Toast.LENGTH_SHORT).show(); load() }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, "保存失败：${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    private fun promptComment() {        val input = android.widget.EditText(this).apply { hint = "补充说明 / 催单内容"; minLines = 2 }
        AlertDialog.Builder(this)
            .setTitle("补充说明 / 催单")
            .setView(input)
            .setPositiveButton("提交") { _, _ ->
                val txt = input.text?.toString()?.trim().orEmpty()
                if (txt.isEmpty()) { Toast.makeText(this, "内容不能为空", Toast.LENGTH_SHORT).show(); return@setPositiveButton }
                postStatus(null, txt)
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun changeStatus(status: String, confirm: String) {
        AlertDialog.Builder(this)
            .setMessage(confirm)
            .setPositiveButton("确定") { _, _ -> postStatus(status, "") }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun postStatus(status: String?, comment: String) {
        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val body = JSONObject()
                if (status != null) body.put("status", status)
                if (comment.isNotBlank()) body.put("comment", comment)
                AgentCatalogApi.postJson(base, "/api/work-orders/mine/$woId/status", cfg.deviceToken.trim(), body.toString())
                runOnUiThread { Toast.makeText(this, "已提交", Toast.LENGTH_SHORT).show(); load() }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, "操作失败：${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    /** 异步加载图片缩略图到 ImageView（采样到屏宽，避免大图 OOM；fitCenter 不切图）。 */
    private fun loadThumbnail(url: String, iv: android.widget.ImageView) {
        thread {
            try {
                val conn = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
                    connectTimeout = 10000; readTimeout = 20000
                }
                val bytes = conn.inputStream.use { it.readBytes() }
                // 先量边界再按屏宽采样
                val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                val target = resources.displayMetrics.widthPixels.coerceAtLeast(720)
                var sample = 1
                while (bounds.outWidth / sample > target * 2) sample *= 2
                val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
                val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                if (bmp != null) runOnUiThread { iv.setImageBitmap(bmp) }
            } catch (_: Throwable) { /* 加载失败保留占位背景 */ }
        }
    }

    private fun openExternally(url: String, contentType: String) {        try {
            val i = Intent(Intent.ACTION_VIEW)
            val type = contentType.takeIf { it.isNotBlank() } ?: "*/*"
            i.setDataAndType(Uri.parse(url), type)
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(i, "查看附件"))
        } catch (e: Exception) {
            Toast.makeText(this, "无法打开：${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    // ── 视图工具 ──
    private fun addText(text: String, size: Float, color: Int, bold: Boolean = false, topMarginDp: Int = 4): TextView? {
        if (text.isBlank()) return null
        val textView = TextView(this).apply {
            this.text = text; textSize = size; setTextColor(color)
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(topMarginDp) }
        }
        container.addView(textView)
        return textView
    }

    private fun addSectionTitle(title: String) {
        container.addView(TextView(this).apply {
            text = title; textSize = 15f; setTextColor(0xFF1F6FEB.toInt())
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(20) }
        })
    }

    private fun addOpButton(label: String, onClick: () -> Unit) {
        container.addView(Button(this).apply {
            text = label
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(8) }
        })
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun statusLabel(s: String) = when (s) {
        "open" -> "待处理"; "in_progress" -> "处理中"; "resolved" -> "已解决"; "closed" -> "已关闭"; "reopened" -> "重新打开"; else -> s
    }
    private fun statusColor(s: String) = when (s) {
        "in_progress", "reopened" -> 0xFFE6A23C.toInt(); "resolved" -> 0xFF67C23A.toInt(); else -> 0xFF909399.toInt()
    }
    private fun kindLabel(k: String) = when (k) {
        "photo" -> "照片"; "video" -> "视频"; "voice" -> "语音"; "screen_record" -> "录屏"; "logcat" -> "日志"; else -> "资源"
    }
    private fun actionLabel(a: String) = when (a) {
        "create" -> "创建"; "comment" -> "备注"; "assign" -> "转交"; "status_change" -> "状态变更"
        "close" -> "关闭"; "reopen" -> "重新打开"; "external_update" -> "第三方更新"; "tag_change" -> "标签变更"
        "archive" -> "归档"; "unarchive" -> "取消归档"; "auto_archive" -> "系统自动归档"; else -> a
    }
    private fun priorityLabel(p: String) = when (p) {
        "normal" -> "普通"; "high" -> "较高"; "urgent" -> "紧急"; else -> p
    }
}
