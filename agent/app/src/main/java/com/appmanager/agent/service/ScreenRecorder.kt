package com.appmanager.agent.service

import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.util.Log
import java.io.File

class ScreenRecorder(
    private val context: Context,
    private val mediaProjection: MediaProjection,
    private val width: Int,
    private val height: Int
) {
    private val TAG = "ScreenRecorder"
    private var mediaRecorder: MediaRecorder? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var outputFile: File? = null

    fun start(): String? {
        try {
            outputFile = File(context.getExternalFilesDir(null), "screen_${System.currentTimeMillis()}.mp4")

            mediaRecorder = MediaRecorder().apply {
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setVideoSize(width, height)
                setVideoFrameRate(30)
                setVideoEncodingBitRate(5000000)
                setOutputFile(outputFile!!.absolutePath)
                prepare()
            }

            virtualDisplay = mediaProjection.createVirtualDisplay(
                "ScreenRecorder",
                width, height, 1,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                mediaRecorder!!.surface,
                null, null
            )

            mediaRecorder?.start()
            Log.i(TAG, "Recording started: ${outputFile!!.absolutePath}")
            return outputFile!!.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            stop()
            return null
        }
    }

    fun stop(): String? {
        try {
            mediaRecorder?.stop()
            mediaRecorder?.release()
            virtualDisplay?.release()
            Log.i(TAG, "Recording stopped")
            return outputFile?.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop recording", e)
            return null
        } finally {
            mediaRecorder = null
            virtualDisplay = null
        }
    }
}
