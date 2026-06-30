package com.appmanager.agent.x5

import android.content.Context
import android.os.Build
import android.util.Log
import com.appmanager.agent.config.AgentConfig
import com.tencent.smtt.export.external.TbsCoreSettings
import com.tencent.smtt.sdk.QbSdk
import com.tencent.smtt.sdk.TbsListener
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

/**
 * X5 内核管理器
 * 负责检查、下载、安装 X5 内核
 */
object X5KernelManager {
    private const val TAG = "X5KernelManager"
    private const val MAX_RETRY = 3
    private const val KERNEL_DIR = "x5_kernel"

    enum class KernelState {
        NOT_INSTALLED,      // 未安装
        DOWNLOADING,        // 下载中
        INSTALLING,         // 安装中
        INSTALLED,          // 已安装
        FAILED,             // 失败（超过重试次数）
        SYSTEM_WEBVIEW      // 降级使用系统 WebView
    }

    @Volatile
    private var currentState = KernelState.NOT_INSTALLED

    @Volatile
    private var retryCount = 0

    @Volatile
    private var localVersion = 0  // 本地已安装的版本号

    private val okHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
            .build()
    }

    /**
     * 初始化 X5 内核（在 AgentService.onCreate 中调用）
     */
    fun init(context: Context) {
        // 仅 Android 9+ 使用 x5
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            Log.d(TAG, "Android version < 9, using system WebView")
            currentState = KernelState.SYSTEM_WEBVIEW
            return
        }

        // 配置 X5 内核参数
        val settings = HashMap<String, Any>().apply {
            put(TbsCoreSettings.TBS_SETTINGS_USE_SPEEDY_CLASSLOADER, true)
            put(TbsCoreSettings.TBS_SETTINGS_USE_DEXLOADER_SERVICE, true)
        }
        QbSdk.initTbsSettings(settings)

        // 设置下载监听
        QbSdk.setDownloadWithoutWifi(true)  // 允许非 WiFi 下载
        QbSdk.setTbsListener(object : TbsListener {
            override fun onDownloadFinish(code: Int) {
                Log.d(TAG, "X5 kernel download finished: code=$code")
                if (code == 100) {
                    currentState = KernelState.INSTALLING
                }
            }

            override fun onInstallFinish(code: Int) {
                Log.d(TAG, "X5 kernel install finished: code=$code")
                if (code == 200) {
                    currentState = KernelState.INSTALLED
                    localVersion = QbSdk.getTbsVersion(context)
                    retryCount = 0
                    Log.i(TAG, "X5 kernel installed successfully, version=$localVersion")
                } else {
                    Log.e(TAG, "X5 kernel install failed, code=$code")
                    handleInstallFailed()
                }
            }

            override fun onDownloadProgress(progress: Int) {
                Log.v(TAG, "X5 kernel downloading: $progress%")
            }
        })

        // 预初始化 X5 内核
        QbSdk.preInit(context, object : QbSdk.PreInitCallback {
            override fun onCoreInitFinished() {
                localVersion = QbSdk.getTbsVersion(context)
                currentState = if (localVersion > 0) {
                    Log.i(TAG, "X5 kernel already installed, version=$localVersion")
                    KernelState.INSTALLED
                } else {
                    Log.d(TAG, "X5 kernel not installed")
                    KernelState.NOT_INSTALLED
                }
            }

            override fun onViewInitFinished(success: Boolean) {
                Log.d(TAG, "X5 WebView init: success=$success")
            }
        })
    }

    /**
     * 检查并更新内核（心跳时调用）
     */
    suspend fun checkAndUpdate(context: Context, serverUrl: String, token: String) {
        if (currentState == KernelState.SYSTEM_WEBVIEW || currentState == KernelState.FAILED) {
            return  // 已降级或失败，不再尝试
        }

        try {
            val latest = fetchLatestVersion(serverUrl, token)

            // Android 版本检查
            if (Build.VERSION.SDK_INT < latest.minAndroid) {
                Log.w(TAG, "Device Android version (${Build.VERSION.SDK_INT}) < required (${latest.minAndroid})")
                currentState = KernelState.SYSTEM_WEBVIEW
                return
            }

            if (latest.versionCode > localVersion) {
                Log.i(TAG, "New kernel version available: ${latest.version} (local: $localVersion)")
                downloadAndInstall(context, serverUrl, token, latest)
            } else {
                Log.d(TAG, "Kernel is up to date: $localVersion")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check kernel update", e)
        }
    }

    /**
     * 获取当前状态（供 WebView 创建时判断）
     */
    fun getState(): KernelState = currentState

    fun getLocalVersion(): Int = localVersion

    private fun handleInstallFailed() {
        retryCount++
        if (retryCount >= MAX_RETRY) {
            Log.w(TAG, "X5 kernel install failed $MAX_RETRY times, fallback to system WebView")
            currentState = KernelState.FAILED
        } else {
            currentState = KernelState.NOT_INSTALLED
        }
    }

    private suspend fun fetchLatestVersion(serverUrl: String, token: String): KernelVersionInfo =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("$serverUrl/api/x5-kernel/latest")
                .header("X-Device-Token", token)
                .get()
                .build()

            val response = okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) {
                throw Exception("Failed to fetch latest version: ${response.code}")
            }

            val json = response.body?.string() ?: throw Exception("Empty response")
            parseKernelVersionInfo(json)
        }

    private suspend fun downloadAndInstall(
        context: Context,
        serverUrl: String,
        token: String,
        version: KernelVersionInfo
    ) {
        currentState = KernelState.DOWNLOADING
        val kernelDir = File(context.filesDir, KERNEL_DIR)
        kernelDir.mkdirs()

        val localFile = File(kernelDir, "tbs_core_${version.versionCode}.tbs")

        try {
            // 下载内核文件（支持断点续传）
            downloadWithResume(
                url = "$serverUrl${version.downloadUrl}",
                token = token,
                localFile = localFile,
                expectedMD5 = version.fileMD5,
                totalSize = version.fileSize
            )

            // 安装内核
            Log.i(TAG, "Installing X5 kernel from ${localFile.absolutePath}")
            currentState = KernelState.INSTALLING
            // QbSdk.installLocalTbsCore 会异步安装，通过 TbsListener 回调结果
            try {
                QbSdk.installLocalTbsCore(
                    context,
                    0,  // 安装类型：0 表示从文件安装
                    localFile.absolutePath
                )
                Log.i(TAG, "X5 kernel installation started")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start X5 kernel installation", e)
                handleInstallFailed()
            }
            // 安装结果通过 TbsListener.onInstallFinish 回调
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download/install kernel", e)
            handleInstallFailed()
            localFile.delete()
        }
    }

    private suspend fun downloadWithResume(
        url: String,
        token: String,
        localFile: File,
        expectedMD5: String,
        totalSize: Long
    ) = withContext(Dispatchers.IO) {
        // 检查是否已存在且 MD5 匹配
        if (localFile.exists()) {
            val existingMD5 = calculateMD5(localFile)
            if (existingMD5.equals(expectedMD5, ignoreCase = true)) {
                Log.d(TAG, "Kernel file already exists and MD5 matches, skip download")
                return@withContext
            } else {
                Log.w(TAG, "Existing file MD5 mismatch, re-download")
                localFile.delete()
            }
        }

        var downloadedBytes = 0L
        val requestBuilder = Request.Builder()
            .url(url)
            .header("X-Device-Token", token)

        // 支持断点续传
        if (localFile.exists()) {
            downloadedBytes = localFile.length()
            if (downloadedBytes < totalSize) {
                requestBuilder.header("Range", "bytes=$downloadedBytes-")
                Log.d(TAG, "Resume download from byte $downloadedBytes")
            }
        }

        val response = okHttpClient.newCall(requestBuilder.build()).execute()
        if (!response.isSuccessful && response.code != 206) {
            throw Exception("Download failed: ${response.code}")
        }

        response.body?.let { body ->
            body.byteStream().use { input ->
                localFile.outputStream().use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var lastLogTime = System.currentTimeMillis()

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead

                        // 每秒记录一次进度
                        val now = System.currentTimeMillis()
                        if (now - lastLogTime > 1000) {
                            val progress = (downloadedBytes * 100 / totalSize).toInt()
                            Log.d(TAG, "Download progress: $progress% ($downloadedBytes/$totalSize)")
                            lastLogTime = now
                        }
                    }
                }
            }
        } ?: throw Exception("Response body is null")

        // 验证 MD5
        val actualMD5 = calculateMD5(localFile)
        if (!actualMD5.equals(expectedMD5, ignoreCase = true)) {
            localFile.delete()
            throw Exception("MD5 mismatch: expected=$expectedMD5, actual=$actualMD5")
        }

        Log.i(TAG, "Kernel downloaded successfully, MD5 verified")
    }

    private fun calculateMD5(file: File): String {
        val md = MessageDigest.getInstance("MD5")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                md.update(buffer, 0, bytesRead)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun parseKernelVersionInfo(json: String): KernelVersionInfo {
        // 简单的 JSON 解析
        val versionRegex = """"version"\s*:\s*"([^"]+)"""".toRegex()
        val versionCodeRegex = """"version_code"\s*:\s*(\d+)""".toRegex()
        val fileSizeRegex = """"file_size"\s*:\s*(\d+)""".toRegex()
        val fileMD5Regex = """"file_md5"\s*:\s*"([^"]+)"""".toRegex()
        val downloadUrlRegex = """"download_url"\s*:\s*"([^"]+)"""".toRegex()
        val minAndroidRegex = """"min_android"\s*:\s*(\d+)""".toRegex()

        val version = versionRegex.find(json)?.groupValues?.get(1) ?: throw Exception("Missing version")
        val versionCode = versionCodeRegex.find(json)?.groupValues?.get(1)?.toInt() ?: throw Exception("Missing version_code")
        val fileSize = fileSizeRegex.find(json)?.groupValues?.get(1)?.toLong() ?: throw Exception("Missing file_size")
        val fileMD5 = fileMD5Regex.find(json)?.groupValues?.get(1) ?: throw Exception("Missing file_md5")
        val downloadUrl = downloadUrlRegex.find(json)?.groupValues?.get(1) ?: throw Exception("Missing download_url")
        val minAndroid = minAndroidRegex.find(json)?.groupValues?.get(1)?.toInt() ?: 28

        return KernelVersionInfo(version, versionCode, fileSize, fileMD5, downloadUrl, minAndroid)
    }
}

data class KernelVersionInfo(
    val version: String,
    val versionCode: Int,
    val fileSize: Long,
    val fileMD5: String,
    val downloadUrl: String,
    val minAndroid: Int
)
