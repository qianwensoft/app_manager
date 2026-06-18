package com.appmanager.agent.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AppVersions
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import okhttp3.*
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class SystemUpdateActivity : AppCompatActivity() {

    private lateinit var tvCurrentVersion: TextView
    private lateinit var tvUpdateStatus: TextView
    private lateinit var btnCheckUpdate: Button
    private lateinit var btnDownloadUpdate: Button
    private lateinit var progressBar: ProgressBar

    private var updateApkFile: File? = null
    private var latestVersion: String? = null
    private var downloadUrl: String? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    /** 当前下载任务取消标志（重新下载或退出时置位） */
    private var downloadCancelled = AtomicBoolean(false)
    private var downloadCall: Call? = null
    /** 跳转「未知来源」授权页后，返回时是否需要自动续上安装 */
    private var pendingInstall = false

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
    }

    override fun onDestroy() {
        super.onDestroy()
        // 取消进行中的下载，避免回调持有已销毁的 Activity
        downloadCancelled.set(true)
        downloadCall?.cancel()
        mainHandler.removeCallbacksAndMessages(null)
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
        val httpBase = ServerUrlUtil.httpBaseFromWs(config.serverUrl)
        val request = Request.Builder()
            .url("$httpBase/api/agent/update/check")
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

            // 服务端有最新包，但还需与本机版本号比较，相同则视为无需更新
            val serverVersionCode = json.optInt("versionCode", 0)
            val localVersionCode = AppVersions.versionCodeLong(this)
            val reallyHasUpdate = hasUpdate &&
                (serverVersionCode <= 0 || serverVersionCode > localVersionCode)

            if (reallyHasUpdate) {
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

    /** 服务端可能返回相对路径（/api/agent-updates/N/download），DownloadManager 需要绝对 URL。 */
    private fun resolveDownloadUrl(raw: String): String {
        if (raw.startsWith("http://", true) || raw.startsWith("https://", true)) {
            return raw
        }
        val base = ServerUrlUtil.httpBaseFromWs(AgentConfig.get(this).serverUrl)
        val path = if (raw.startsWith("/")) raw else "/$raw"
        return base + path
    }

    private fun downloadUpdate() {
        if (downloadUrl.isNullOrEmpty()) {
            Toast.makeText(this, "下载链接无效", Toast.LENGTH_SHORT).show()
            return
        }

        val absoluteUrl = resolveDownloadUrl(downloadUrl!!)

        btnDownloadUpdate.isEnabled = false
        progressBar.visibility = View.VISIBLE
        progressBar.isIndeterminate = false
        progressBar.max = 100
        progressBar.progress = 0
        tvUpdateStatus.text = getString(R.string.system_update_downloading, 0)

        val fileName = "AppManager-Agent-$latestVersion.apk"
        // 下到应用专属外部目录：无需任何运行时存储权限。
        val dest = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
        if (dest.exists()) dest.delete()
        updateApkFile = dest

        downloadCancelled.set(false)
        startStreamingDownload(absoluteUrl, dest)
    }

    /**
     * 自管理流式下载：用 OkHttp 边下边写，按字节实时计算百分比与速度。
     * 相比 DownloadManager，能在服务端返回 Content-Length 时给出真实进度，
     * 并能展示瞬时下载速度（DownloadManager 无法提供速度）。
     */
    private fun startStreamingDownload(url: String, dest: File) {
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
        val request = Request.Builder().url(url).get().build()
        val call = client.newCall(request)
        downloadCall = call

        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (downloadCancelled.get()) return
                mainHandler.post { onDownloadFailed() }
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { resp ->
                    val body = resp.body
                    if (!resp.isSuccessful || body == null) {
                        if (!downloadCancelled.get()) mainHandler.post { onDownloadFailed() }
                        return
                    }
                    val total = body.contentLength() // 服务端无 Content-Length 时为 -1
                    try {
                        body.byteStream().use { input ->
                            dest.outputStream().use { output ->
                                val buf = ByteArray(64 * 1024)
                                var downloaded = 0L
                                var lastUiAt = 0L
                                var lastUiBytes = 0L
                                var lastSpeed = 0L // bytes/s
                                while (true) {
                                    if (downloadCancelled.get()) { call.cancel(); return }
                                    val read = input.read(buf)
                                    if (read < 0) break
                                    output.write(buf, 0, read)
                                    downloaded += read

                                    // UI 刷新节流：每 ~300ms 一次，计算瞬时速度
                                    val now = System.currentTimeMillis()
                                    if (now - lastUiAt >= 300) {
                                        val dt = (now - lastUiAt).coerceAtLeast(1)
                                        if (lastUiAt > 0) {
                                            lastSpeed = (downloaded - lastUiBytes) * 1000 / dt
                                        }
                                        lastUiAt = now
                                        lastUiBytes = downloaded
                                        postProgress(downloaded, total, lastSpeed)
                                    }
                                }
                                output.flush()
                            }
                        }
                    } catch (e: Exception) {
                        if (!downloadCancelled.get()) mainHandler.post { onDownloadFailed() }
                        return
                    }
                    if (downloadCancelled.get()) return
                    // 完成：补满 100% 并安装
                    mainHandler.post {
                        progressBar.progress = 100
                        tvUpdateStatus.text = getString(R.string.system_update_download_done)
                        installUpdate()
                    }
                }
            }
        })
    }

    /** 把实时进度/速度刷到 UI（主线程）。 */
    private fun postProgress(downloaded: Long, total: Long, speedBytesPerSec: Long) {
        mainHandler.post {
            val speedStr = formatSpeed(speedBytesPerSec)
            if (total > 0) {
                val pct = (downloaded * 100 / total).toInt().coerceIn(0, 100)
                progressBar.isIndeterminate = false
                progressBar.progress = pct
                tvUpdateStatus.text = getString(
                    R.string.system_update_downloading_detail,
                    pct, formatSize(downloaded), formatSize(total), speedStr,
                )
            } else {
                // 无 Content-Length：显示已下载量与速度，进度条走不确定式
                progressBar.isIndeterminate = true
                tvUpdateStatus.text = getString(
                    R.string.system_update_downloading_nosize,
                    formatSize(downloaded), speedStr,
                )
            }
        }
    }

    private fun formatSize(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024) return String.format("%.0f KB", kb)
        val mb = kb / 1024.0
        if (mb < 1024) return String.format("%.1f MB", mb)
        return String.format("%.2f GB", mb / 1024.0)
    }

    private fun formatSpeed(bytesPerSec: Long): String {
        if (bytesPerSec <= 0) return "-- KB/s"
        return "${formatSize(bytesPerSec)}/s"
    }

    private fun onDownloadFailed() {
        btnDownloadUpdate.isEnabled = true
        progressBar.visibility = View.GONE
        tvUpdateStatus.text = getString(R.string.system_update_download_failed)
        Toast.makeText(this, R.string.system_update_download_failed, Toast.LENGTH_SHORT).show()
    }

    private fun installUpdate() {
        btnDownloadUpdate.isEnabled = true
        progressBar.progress = 100
        progressBar.visibility = View.GONE
        tvUpdateStatus.text = getString(R.string.system_update_download_done)

        val file = updateApkFile ?: return

        if (!file.exists()) {
            Toast.makeText(this, "更新文件不存在", Toast.LENGTH_SHORT).show()
            return
        }

        // Android 8+ 安装未知来源应用需逐应用授权，未授权时跳转设置页
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(this)
                .setTitle("需要安装权限")
                .setMessage("系统要求授权「安装未知应用」才能完成更新。授权后请重新点击安装。")
                .setPositiveButton("去授权") { _, _ ->
                    try {
                        startActivity(
                            Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:$packageName")
                            )
                        )
                    } catch (_: Exception) {
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES))
                    }
                    pendingInstall = true
                }
                .setNegativeButton("取消", null)
                .show()
            return
        }

        launchInstaller(file)
    }

    private fun launchInstaller(file: File) {
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

    override fun onResume() {
        super.onResume()
        // 从「未知来源」授权页返回后，若已授权则自动继续安装
        if (pendingInstall) {
            pendingInstall = false
            val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
                packageManager.canRequestPackageInstalls()
            val file = updateApkFile
            if (granted && file != null && file.exists()) {
                launchInstaller(file)
            }
        }
    }
}
