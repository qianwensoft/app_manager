package com.appmanager.agent.ui

import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.View
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import kotlin.concurrent.thread

/**
 * 图片预览 Activity
 * 全屏显示工单附件图片
 */
class ImagePreviewActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_WORK_ORDER_ID = "work_order_id"
        const val EXTRA_ATTACHMENT_ID = "attachment_id"
        const val EXTRA_FILE_NAME = "file_name"
    }

    private lateinit var ivPreview: ImageView
    private lateinit var loadingView: ProgressBar
    private lateinit var tvError: TextView

    private var workOrderId: Int = 0
    private var attachmentId: Int = 0
    private var fileName: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_image_preview)

        workOrderId = intent.getIntExtra(EXTRA_WORK_ORDER_ID, 0)
        attachmentId = intent.getIntExtra(EXTRA_ATTACHMENT_ID, 0)
        fileName = intent.getStringExtra(EXTRA_FILE_NAME) ?: "图片"

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = fileName

        ivPreview = findViewById(R.id.ivPreview)
        loadingView = findViewById(R.id.loadingView)
        tvError = findViewById(R.id.tvError)

        loadImage()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    private fun loadImage() {
        loadingView.visibility = View.VISIBLE
        tvError.visibility = View.GONE
        ivPreview.visibility = View.GONE

        thread {
            try {
                val config = AgentConfig.get(this)
                val baseUrl = ServerUrlUtil.httpBaseFromWs(config.serverUrl)
                val url = "$baseUrl/api/work-orders/$workOrderId/items/$attachmentId/download"

                val client = OkHttpClient()
                val request = Request.Builder()
                    .url(url)
                    .header("X-Device-Token", config.deviceToken)
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        response.body?.byteStream()?.use { inputStream ->
                            val bitmap = BitmapFactory.decodeStream(inputStream)
                            runOnUiThread {
                                loadingView.visibility = View.GONE
                                if (bitmap != null) {
                                    ivPreview.setImageBitmap(bitmap)
                                    ivPreview.visibility = View.VISIBLE
                                } else {
                                    tvError.text = "图片解码失败"
                                    tvError.visibility = View.VISIBLE
                                }
                            }
                        }
                    } else {
                        runOnUiThread {
                            loadingView.visibility = View.GONE
                            tvError.text = "加载失败: ${response.code}"
                            tvError.visibility = View.VISIBLE
                        }
                    }
                }
            } catch (e: IOException) {
                e.printStackTrace()
                runOnUiThread {
                    loadingView.visibility = View.GONE
                    tvError.text = "加载失败: ${e.message}"
                    tvError.visibility = View.VISIBLE
                    Toast.makeText(this, "加载图片失败", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
