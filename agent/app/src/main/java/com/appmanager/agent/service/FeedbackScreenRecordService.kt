package com.appmanager.agent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.appmanager.agent.R

/**
 * 问题反馈：独立的屏幕录制前台服务（mediaProjection 类型）。
 * 录制全屏到应用专属目录的 mp4，可在用户切到其他 App 复现问题时使用。
 * 与远程投屏的 ScreenProjectionForegroundService 互不影响。
 */
class FeedbackScreenRecordService : Service() {

    companion object {
        private const val TAG = "FeedbackScreenRec"
        private const val CHANNEL_ID = "feedback_screen_record"
        private const val NOTIF_ID = 1102

        const val ACTION_START = "com.appmanager.agent.feedback.REC_START"
        const val ACTION_STOP = "com.appmanager.agent.feedback.REC_STOP"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_DATA = "data"

        /** 录制结果广播：携带 mp4 绝对路径（成功）或空（失败）。 */
        const val ACTION_RESULT = "com.appmanager.agent.feedback.REC_RESULT"
        const val EXTRA_FILE_PATH = "file_path"

        @Volatile
        var isRecording: Boolean = false
            private set
    }

    private var projection: MediaProjection? = null
    private var recorder: ScreenRecorder? = null
    private var outputPath: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0
        try {
            ServiceCompat.startForeground(this, NOTIF_ID, buildNotification(), type)
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed: ${e.message}", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startRecording(intent)
            ACTION_STOP -> stopRecording()
        }
        return START_NOT_STICKY
    }

    private fun startRecording(intent: Intent) {
        if (isRecording) return
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        @Suppress("DEPRECATION")
        val data: Intent? = intent.getParcelableExtra(EXTRA_DATA)
        if (data == null) {
            Log.e(TAG, "missing projection data")
            broadcastResult(null)
            stopSelf()
            return
        }
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = mpm.getMediaProjection(resultCode, data)
        if (projection == null) {
            broadcastResult(null)
            stopSelf()
            return
        }
        val (w, h) = screenSize()
        recorder = ScreenRecorder(this, projection!!, w, h)
        // ScreenRecorder 在自身 getExternalFilesDir 下生成 screen_<ts>.mp4，start() 返回真实路径。
        outputPath = recorder?.start()
        if (outputPath == null) {
            broadcastResult(null)
            cleanup()
            stopSelf()
            return
        }
        isRecording = true
        Log.i(TAG, "recording -> $outputPath")
    }

    private fun stopRecording() {
        val path = recorder?.stop()
        isRecording = false
        cleanup()
        broadcastResult(path)
        stopSelf()
    }

    private fun cleanup() {
        try { projection?.stop() } catch (_: Exception) {}
        projection = null
        recorder = null
    }

    private fun broadcastResult(path: String?) {
        sendBroadcast(Intent(ACTION_RESULT).setPackage(packageName).putExtra(EXTRA_FILE_PATH, path))
    }

    private fun screenSize(): Pair<Int, Int> {
        val dm = DisplayMetrics()
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(dm)
        // 1/2 分辨率，降低体积；保持偶数。
        val w = (dm.widthPixels / 2) and 1.inv()
        val h = (dm.heightPixels / 2) and 1.inv()
        return w to h
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isRecording) {
            recorder?.stop()
            isRecording = false
        }
        cleanup()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "问题反馈录屏", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("问题反馈录屏中…")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .build()
}
