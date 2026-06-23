package com.appmanager.agent.adapter

import android.graphics.BitmapFactory
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.ServerUrlUtil
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.text.DecimalFormat
import kotlin.concurrent.thread

data class Attachment(
    val id: Int,
    val kind: String,
    val fileName: String,
    val fileSize: Long,
    val workOrderId: Int
)

class AttachmentAdapter(
    private val attachments: List<Attachment>,
    private val context: android.content.Context,
    private val onPreviewClick: (Attachment) -> Unit
) : RecyclerView.Adapter<AttachmentAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivThumbnail: ImageView = view.findViewById(R.id.ivThumbnail)
        val tvFileName: TextView = view.findViewById(R.id.tvFileName)
        val tvFileInfo: TextView = view.findViewById(R.id.tvFileInfo)
        val btnPreview: ImageButton = view.findViewById(R.id.btnPreview)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_attachment, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val attachment = attachments[position]
        holder.tvFileName.text = attachment.fileName
        holder.tvFileInfo.text = "${getKindDisplay(attachment.kind)} · ${formatFileSize(attachment.fileSize)}"

        // 设置缩略图
        when (attachment.kind) {
            "photo" -> {
                loadThumbnail(holder.ivThumbnail, attachment)
            }
            "video" -> {
                holder.ivThumbnail.setImageResource(android.R.drawable.ic_media_play)
            }
            "audio" -> {
                holder.ivThumbnail.setImageResource(android.R.drawable.ic_btn_speak_now)
            }
            else -> {
                holder.ivThumbnail.setImageResource(android.R.drawable.ic_menu_gallery)
            }
        }

        holder.btnPreview.setOnClickListener {
            onPreviewClick(attachment)
        }

        holder.itemView.setOnClickListener {
            onPreviewClick(attachment)
        }
    }

    override fun getItemCount() = attachments.size

    private fun getKindDisplay(kind: String): String {
        return when (kind) {
            "photo" -> "图片"
            "video" -> "视频"
            "audio" -> "音频"
            else -> "文件"
        }
    }

    private fun formatFileSize(size: Long): String {
        if (size <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB")
        val digitGroups = (Math.log10(size.toDouble()) / Math.log10(1024.0)).toInt()
        val df = DecimalFormat("#,##0.#")
        return df.format(size / Math.pow(1024.0, digitGroups.toDouble())) + " " + units[digitGroups]
    }

    private fun loadThumbnail(imageView: ImageView, attachment: Attachment) {
        thread {
            try {
                val config = AgentConfig.get(context)
                val baseUrl = ServerUrlUtil.httpBaseFromWs(config.serverUrl)
                val url = "$baseUrl/api/work-orders/${attachment.workOrderId}/items/${attachment.id}/download"

                val client = OkHttpClient()
                val request = Request.Builder()
                    .url(url)
                    .header("X-Device-Token", config.deviceToken)
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        response.body?.byteStream()?.use { inputStream ->
                            val bitmap = BitmapFactory.decodeStream(inputStream)
                            (context as? android.app.Activity)?.runOnUiThread {
                                imageView.setImageBitmap(bitmap)
                            }
                        }
                    }
                }
            } catch (e: IOException) {
                android.util.Log.e("AttachmentAdapter", "Failed to load thumbnail", e)
            }
        }
    }
}
