package com.appmanager.agent.ui

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AppVersions
import com.google.android.material.appbar.MaterialToolbar
import okhttp3.*
import org.json.JSONObject
import java.io.File
import java.io.IOException

class SystemUpdateActivity : AppCompatActivity() {

    private lateinit var tvCurrentVersion: TextView
    private lateinit var tvUpdateStatus: TextView
    private lateinit var btnCheckUpdate: Button
    private lateinit var btnDownloadUpdate: Button
    private lateinit var progressBar: ProgressBar

    private var downloadId: Long = -1
    private var updateApkFile: File? = null
    private var latestVersion: String? = null
    private var downloadUrl: String? = null

    private val downloadCompleteReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
            if (id == downloadId) {
                installUpdate()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_system_update)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        tvCurrentVersion = findViewById(R.id.tvCurrentVersion)
        tvUpdateStatus = findViewById(R.id.tvUpdateStatus)
        btnCheckUpdate = findViewById(R.id.btnCheckUpdate)
        btnDownloadUpdate = findViewById(R.id.btnDownloadUpdate)
        progressBar = findViewById(R.id.progressBar)

        // 显示当前版本
        tvCurrentVersion.text = getString(R.string.system_update_current_version) + ": " +
            AppVersions.displayLabel(this)

        btnCheckUpdate.setOnClickListener { checkForUpdates() }
        btnDownloadUpdate.setOnClickListener { downloadUpdate() }

        // 注册下载完成监听器
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        ContextCompat.registerReceiver(this, downloadCompleteReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(downloadCompleteReceiver)
        } catch (_: Exception) {}
    }

    private fun checkForUpdates() {
        val config = AgentConfig.get(this)
        if (config.serverUrl.isEmpty()) {
            Toast.makeText(this, R.string.system_update_no_server, Toast.LENGTH_SHORT).show()
            return
        }

        btnCheckUpdate.isEnabled = false
        progressBar.visibility = View.VISIBLE
        tvUpdateStatus.text = getString(R.string.system_update_checking)

        val client = OkHttpClient()
        val request = Request.Builder()
            .url("${config.serverUrl.trimEnd('/')}/api/agent/update/check")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    btnCheckUpdate.isEnabled = true
                    progressBar.visibility = View.GONE
                    tvUpdateStatus.text = getString(R.string.system_update_failed)
                    Toast.makeText(this@SystemUpdateActivity, R.string.system_update_failed, Toast.LENGTH_SHORT).show()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string()
                runOnUiThread {
                    btnCheckUpdate.isEnabled = true
                    progressBar.visibility = View.GONE

                    if (response.isSuccessful && body != null) {
                        handleUpdateResponse(body)
                    } else {
                        tvUpdateStatus.text = getString(R.string.system_update_failed)
                        Toast.makeText(this@SystemUpdateActivity, R.string.system_update_failed, Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })
    }

    private fun handleUpdateResponse(jsonBody: String) {
        try {
            val json = JSONObject(jsonBody)
            val hasUpdate = json.optBoolean("hasUpdate", false)

            if (hasUpdate) {
                latestVersion = json.optString("version", "")
                downloadUrl = json.optString("downloadUrl", "")
                val changelog = json.optString("changelog", "")

                tvUpdateStatus.text = getString(R.string.system_update_available, latestVersion)
                btnDownloadUpdate.visibility = View.VISIBLE

                // 显示更新日志
                if (changelog.isNotEmpty()) {
                    AlertDialog.Builder(this)
                        .setTitle("发现新版本")
                        .setMessage("版本 $latestVersion\n\n更新内容：\n$changelog")
                        .setPositiveButton("立即下载") { _, _ -> downloadUpdate() }
                        .setNegativeButton("稍后") { _, _ -> }
                        .show()
                }
            } else {
                tvUpdateStatus.text = getString(R.string.system_update_latest)
                btnDownloadUpdate.visibility = View.GONE
            }
        } catch (e: Exception) {
            tvUpdateStatus.text = getString(R.string.system_update_failed)
            Toast.makeText(this, R.string.system_update_failed, Toast.LENGTH_SHORT).show()
        }
    }

    private fun downloadUpdate() {
        if (downloadUrl.isNullOrEmpty()) {
            Toast.makeText(this, "下载链接无效", Toast.LENGTH_SHORT).show()
            return
        }

        btnDownloadUpdate.isEnabled = false
        progressBar.visibility = View.VISIBLE
        tvUpdateStatus.text = "正在下载更新..."

        val fileName = "AppManager-Agent-$latestVersion.apk"
        val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
            setTitle("AppManager Agent 更新")
            setDescription("正在下载版本 $latestVersion")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
        }

        val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        downloadId = downloadManager.enqueue(request)

        updateApkFile = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName)
    }

    private fun installUpdate() {
        btnDownloadUpdate.isEnabled = true
        progressBar.visibility = View.GONE
        tvUpdateStatus.text = "下载完成，准备安装..."

        val file = updateApkFile ?: return

        if (!file.exists()) {
            Toast.makeText(this, "更新文件不存在", Toast.LENGTH_SHORT).show()
            return
        }

        val intent = Intent(Intent.ACTION_VIEW)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            intent.setDataAndType(uri, "application/vnd.android.package-archive")
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            intent.setDataAndType(Uri.fromFile(file), "application/vnd.android.package-archive")
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        try {
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "无法启动安装程序", Toast.LENGTH_SHORT).show()
        }
    }
}
