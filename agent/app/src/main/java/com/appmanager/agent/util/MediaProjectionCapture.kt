package com.appmanager.agent.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.io.ByteArrayOutputStream
import java.nio.BufferUnderflowException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * 使用已有 [MediaProjection] 再建一路 VirtualDisplay + [ImageReader] 抓一帧 PNG。
 * 与 WebRTC 投屏可并存；需在用户已授权投屏、[ScreenCaptureManager] 持有 projection 时调用。
 */
object MediaProjectionCapture {
    private const val TAG = "ProjCapture"

    fun capturePng(context: Context, projection: MediaProjection, width: Int, height: Int): ByteArray? {
        val w = width.coerceAtLeast(1)
        val h = height.coerceAtLeast(1)
        val dpi = context.resources.displayMetrics.densityDpi

        var imageReader: ImageReader? = null
        var vd: VirtualDisplay? = null
        var capThread: HandlerThread? = null

        try {
            imageReader = ImageReader.newInstance(w, h, android.graphics.PixelFormat.RGBA_8888, 2)
            val latch = CountDownLatch(1)
            capThread = HandlerThread("am-cap").apply { start() }
            val handler = Handler(capThread.looper)
            val outBytes = arrayOfNulls<ByteArray>(1)
            val err = arrayOfNulls<Throwable>(1)

            imageReader.setOnImageAvailableListener({ reader ->
                try {
                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        try {
                            outBytes[0] = imageToPngBytes(image)
                        } finally {
                            image.close()
                        }
                    }
                } catch (e: Exception) {
                    err[0] = e
                } finally {
                    latch.countDown()
                }
            }, handler)

            vd = projection.createVirtualDisplay(
                "am_shot",
                w, h, dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.surface,
                null,
                handler
            )

            if (!latch.await(8, TimeUnit.SECONDS)) {
                Log.w(TAG, "capture timeout")
                return null
            }
            err[0]?.let { throw it }
            return outBytes[0]
        } catch (e: Exception) {
            Log.e(TAG, "capturePng", e)
            return null
        } finally {
            try {
                vd?.release()
            } catch (e: Exception) {
                Log.w(TAG, "vd.release: $e")
            }
            try {
                imageReader?.setOnImageAvailableListener(null, null)
                imageReader?.close()
            } catch (e: Exception) {
                Log.w(TAG, "ImageReader close: $e")
            }
            try {
                capThread?.quitSafely()
            } catch (e: Exception) {
                Log.w(TAG, "HandlerThread quit: $e")
            }
        }
    }

    private fun imageToPngBytes(image: Image): ByteArray {
        val w = image.width
        val h = image.height
        val plane = image.planes[0]
        val buffer = plane.buffer.duplicate()
        buffer.rewind()
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = (rowStride - pixelStride * w).coerceAtLeast(0)

        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        try {
            var offset = 0
            for (y in 0 until h) {
                for (x in 0 until w) {
                    if (offset + pixelStride > buffer.limit()) {
                        throw BufferUnderflowException()
                    }
                    val r = buffer.get(offset).toInt() and 0xff
                    val g = buffer.get(offset + 1).toInt() and 0xff
                    val b = buffer.get(offset + 2).toInt() and 0xff
                    val a = buffer.get(offset + 3).toInt() and 0xff
                    bitmap.setPixel(x, y, Color.argb(a, r, g, b))
                    offset += pixelStride
                }
                offset += rowPadding
            }
        } catch (e: Exception) {
            bitmap.recycle()
            throw e
        }
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 92, stream)
        bitmap.recycle()
        return stream.toByteArray()
    }
}
