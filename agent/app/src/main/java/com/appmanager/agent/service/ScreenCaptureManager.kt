package com.appmanager.agent.service

import android.content.Context
import android.content.Intent
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.display.DisplayManager
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Display
import com.appmanager.agent.util.DisplayUtil
import com.appmanager.agent.util.MediaProjectionCapture
import com.appmanager.agent.ws.AgentWebSocket
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt
import org.webrtc.*

/**
 * 屏幕采集经 WebRTC 管线取帧，编码为 JPEG 后经主 WebSocket 上行（screen_frame），由服务器中转给浏览器。
 * 触控由 Web → 服务器 → [handleRelayTouch]，不再使用浏览器 WebRTC P2P。
 */
class ScreenCaptureManager(
    private val context: Context,
    private val webSocket: AgentWebSocket,
    private val deviceId: String
) {
    private val TAG = "ScreenCapture"

    private var eglBase: EglBase? = null
    private var factory: PeerConnectionFactory? = null
    private var videoCapturer: VideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoTrack: VideoTrack? = null
    private val touchIndicator = TouchIndicator(context)
    private var showTouchEffect = true
    private var mediaProjection: MediaProjection? = null
    private val jpegStopped = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    /** WebRTC 编码线程不宜直接 Gson + WebSocket 发大图，串行到单独线程降低崩溃/ANR 风险 */
    private val jpegSendExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "screen-jpeg-ws").apply { isDaemon = true }
    }
    private var displayManager: DisplayManager? = null
    private var displayListener: DisplayManager.DisplayListener? = null
    private val captureStopLock = Any()
    @Volatile
    private var captureReleased = false
    private val displayDebounceRunnable = Runnable {
        try {
            refreshCaptureAndSendMeta()
        } catch (e: Exception) {
            Log.e(TAG, "refreshCaptureAndSendMeta (display listener)", e)
        }
    }

    private val jpegVideoSink = object : VideoSink {
        override fun onFrame(frame: VideoFrame) {
            // 帧由 VideoTrack/VideoSource 在 onFrame 返回后释放；此处 release 会与管线重复释放，
            // 导致 TextureBuffer refcount < 1（CaptureThread FATAL）。
            if (jpegStopped.get()) return
            val now = SystemClock.elapsedRealtime()
            if (now - lastJpegEmitMs < MIN_JPEG_INTERVAL_MS) return
            val i420 = try {
                frame.buffer.toI420()
            } catch (e: Exception) {
                Log.e(TAG, "toI420 failed", e)
                return
            }
            if (i420 == null) return
            try {
                val w = i420.width
                val h = i420.height
                val nv21 = nv21FromI420(i420)
                val yuv = YuvImage(nv21, ImageFormat.NV21, w, h, null)
                val stream = ByteArrayOutputStream()
                yuv.compressToJpeg(Rect(0, 0, w, h), JPEG_QUALITY, stream)
                val jpeg = stream.toByteArray()
                lastJpegEmitMs = now
                val framePacket = buildScreenFramePacket(w, h, jpeg)
                jpegSendExecutor.execute {
                    try {
                        if (jpegStopped.get() || captureReleased) return@execute
                        webSocket.sendBinary(framePacket)
                    } catch (e: Exception) {
                        Log.e(TAG, "jpeg ws send", e)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "jpeg relay", e)
            } finally {
                i420.release()
            }
        }
    }

    private var lastJpegEmitMs = 0L

    fun getMediaProjection(): MediaProjection? = mediaProjection

    fun captureScreenshotPng(): ByteArray? = synchronized(captureStopLock) {
        val mp = mediaProjection ?: return@synchronized null
        val (pw, ph) = DisplayUtil.getPhysicalDisplaySize(context)
        var w = (pw / 2).coerceAtLeast(1)
        var h = (ph / 2).coerceAtLeast(1)
        val maxSide = 960
        if (w > maxSide || h > maxSide) {
            val scale = maxSide.toFloat() / maxOf(w, h)
            w = (w * scale).roundToInt().coerceAtLeast(1)
            h = (h * scale).roundToInt().coerceAtLeast(1)
        }
        return@synchronized try {
            MediaProjectionCapture.capturePng(context, mp, w, h)
        } catch (e: Exception) {
            Log.e(TAG, "captureScreenshotPng", e)
            null
        }
    }

    fun start(resultCode: Int, data: Intent) {
        Log.i(TAG, "start() called, resultCode=$resultCode")
        try {
            _start(data)
        } catch (e: Exception) {
            Log.e(TAG, "start() crashed: $e", e)
        }
    }

    private fun _start(data: Intent) {
        synchronized(captureStopLock) {
            captureReleased = false
        }
        jpegStopped.set(false)
        eglBase = EglBase.create()

        val factoryOpts = PeerConnectionFactory.Options().apply {
            disableNetworkMonitor = true
        }
        factory = PeerConnectionFactory.builder()
            .setOptions(factoryOpts)
            .setVideoEncoderFactory(
                DefaultVideoEncoderFactory(eglBase!!.eglBaseContext, true, true)
            )
            .setVideoDecoderFactory(
                DefaultVideoDecoderFactory(eglBase!!.eglBaseContext)
            )
            .createPeerConnectionFactory()

        videoCapturer = ScreenCapturerAndroid(data, object : MediaProjection.Callback() {
            override fun onStop() {
                Log.w(TAG, "MediaProjection stopped")
            }
        })

        surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase!!.eglBaseContext)
        videoSource = factory!!.createVideoSource(true)
        videoCapturer!!.initialize(surfaceTextureHelper, context, videoSource!!.capturerObserver)

        val (physW, physH) = DisplayUtil.getPhysicalDisplaySize(context)
        val width = (physW / 2).coerceAtLeast(1)
        val height = (physH / 2).coerceAtLeast(1)
        videoCapturer!!.startCapture(width, height, 15)

        // Android 14+：每个投屏授权令牌只能调用一次 getMediaProjection()，第二次会拿到只能产出黑屏的
        // projection。因此不自己再 getMediaProjection，而是复用 WebRTC ScreenCapturerAndroid 在
        // startCapture 内创建并持有的同一个 MediaProjection（供截图路径 captureScreenshotPng 使用）。
        mediaProjection = (videoCapturer as? ScreenCapturerAndroid)?.mediaProjection

        videoTrack = factory!!.createVideoTrack("screen_video", videoSource)
        videoTrack!!.setEnabled(true)
        videoTrack!!.addSink(jpegVideoSink)

        registerDisplayChangeListener()
        mainHandler.postDelayed({ sendScreenMeta() }, 400)

        Log.i(TAG, "Screen JPEG relay started")
    }

    private fun defaultDisplayId(): Int {
        val dm = context.applicationContext.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        return dm.getDisplay(Display.DEFAULT_DISPLAY)?.displayId ?: Display.DEFAULT_DISPLAY
    }

    private fun registerDisplayChangeListener() {
        unregisterDisplayChangeListener()
        val dm = context.applicationContext.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        displayManager = dm
        displayListener = object : DisplayManager.DisplayListener {
            override fun onDisplayAdded(displayId: Int) {}
            override fun onDisplayRemoved(displayId: Int) {}
            override fun onDisplayChanged(displayId: Int) {
                if (displayId != defaultDisplayId()) return
                mainHandler.removeCallbacks(displayDebounceRunnable)
                mainHandler.postDelayed(displayDebounceRunnable, 350)
            }
        }
        dm.registerDisplayListener(displayListener, mainHandler)
    }

    private fun unregisterDisplayChangeListener() {
        displayListener?.let { displayManager?.unregisterDisplayListener(it) }
        displayListener = null
        displayManager = null
        mainHandler.removeCallbacks(displayDebounceRunnable)
    }

    private fun refreshCaptureAndSendMeta() {
        val (nw, nh) = DisplayUtil.getPhysicalDisplaySize(context)
        try {
            videoCapturer?.changeCaptureFormat((nw / 2).coerceAtLeast(1), (nh / 2).coerceAtLeast(1), 15)
        } catch (e: Exception) {
            Log.w(TAG, "changeCaptureFormat failed: $e")
        }
        sendScreenMeta()
    }

    private fun sendScreenMeta() {
        val (dw, dh) = DisplayUtil.getPhysicalDisplaySize(context)
        val sw = (dw / 2).coerceAtLeast(1)
        val sh = (dh / 2).coerceAtLeast(1)
        webSocket.send(
            mapOf(
                "type" to "screen_meta",
                "deviceId" to deviceId,
                "data" to mapOf(
                    "width" to dw,
                    "height" to dh,
                    "touch_width" to dw,
                    "touch_height" to dh,
                    "stream_width" to sw,
                    "stream_height" to sh
                )
            )
        )
    }

    /** Web 经服务器转发的触控 JSON（与原 DataChannel 载荷一致）。 */
    fun handleRelayTouch(json: String) {
        handleTouchPayload(json)
    }

    private fun handleTouchPayload(json: String) {
        try {
            val data = org.json.JSONObject(json)
            val action = data.optString("action")
            val type = data.optString("type")

            if (type == "ping") {
                val ts = data.optLong("ts", 0L)
                // 不经过 JPEG 发送队列，避免与大图串行导致延迟统计与触控体感变差
                try {
                    webSocket.send(
                        mapOf(
                            "type" to "screen_pong",
                            "deviceId" to deviceId,
                            "ts" to ts
                        )
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "screen_pong send", e)
                }
                return
            }

            if (action == "toggle_effect") {
                val en = data.getBoolean("enabled")
                mainHandler.post { showTouchEffect = en }
                return
            }

            val x = data.getInt("x")
            val y = data.getInt("y")
            val showEffect = data.optBoolean("showEffect", true)
            val execute = data.optBoolean("execute", true)

            if (showTouchEffect && showEffect) {
                touchIndicator.show(x, y)
            }
            if (!execute) return

            // dispatchGesture 须在主线程调用，否则部分 ROM 直接崩溃（WS 读线程上会闪退）
            when (action) {
                "tap" -> mainHandler.post {
                    try {
                        TouchAccessibilityService.performTap(x.toFloat(), y.toFloat())
                    } catch (e: Exception) {
                        Log.e(TAG, "performTap", e)
                    }
                }
                "swipe" -> {
                    val x2 = data.getInt("x2")
                    val y2 = data.getInt("y2")
                    val duration = data.getInt("duration")
                    mainHandler.post {
                        try {
                            TouchAccessibilityService.performSwipe(
                                x.toFloat(), y.toFloat(), x2.toFloat(), y2.toFloat(), duration.toLong()
                            )
                        } catch (e: Exception) {
                            Log.e(TAG, "performSwipe", e)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleTouchPayload", e)
        }
    }

    /** WebSocket 重连或 Web 再次请求投屏时，补发 screen_meta 便于浏览器恢复画面。 */
    fun notifyLinkReady() {
        if (jpegStopped.get() || captureReleased) return
        mainHandler.post {
            if (jpegStopped.get() || captureReleased) return@post
            sendScreenMeta()
        }
    }

    /** 兼容旧版 WebRTC 信令（已无浏览器 answer）；可忽略。 */
    @Suppress("UNUSED_PARAMETER")
    fun handleSignal(data: Map<String, Any>) {
        Log.d(TAG, "handleSignal ignored (server-relay mode)")
    }

    /**
     * 必须在主线程执行：含 [WindowManager]（点击效果浮窗）与 WebRTC 初始化线程约定。
     * [CommandDispatcher] 在 OkHttp WebSocket 读线程调用 [AgentService.stopScreenCapture]，若直接 stop 会闪退。
     */
    fun stop() {
        val work = Runnable {
            synchronized(captureStopLock) {
                if (captureReleased) {
                    Log.d(TAG, "stop() skipped (already released)")
                    return@Runnable
                }
                captureReleased = true
                jpegStopped.set(true)
                unregisterDisplayChangeListener()
                touchIndicator.clear()
                try {
                    videoTrack?.removeSink(jpegVideoSink)
                } catch (_: Exception) { /* noop */ }
                videoTrack?.dispose()
                videoTrack = null
                try {
                    videoCapturer?.stopCapture()
                } catch (e: InterruptedException) {
                    Log.w(TAG, "stopCapture interrupted: $e")
                }
                videoCapturer?.dispose()
                videoSource?.dispose()
                surfaceTextureHelper?.dispose()
                factory?.dispose()
                eglBase?.release()

                videoCapturer = null
                videoSource = null
                surfaceTextureHelper = null
                factory = null
                eglBase = null

                try {
                    mediaProjection?.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "mediaProjection.stop: $e")
                }
                mediaProjection = null

                try {
                    jpegSendExecutor.shutdown()
                    if (!jpegSendExecutor.awaitTermination(3, TimeUnit.SECONDS)) {
                        jpegSendExecutor.shutdownNow()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "jpegSendExecutor shutdown: $e")
                }

                Log.i(TAG, "Screen capture stopped")
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            work.run()
        } else {
            val latch = CountDownLatch(1)
            mainHandler.post {
                try {
                    work.run()
                } finally {
                    latch.countDown()
                }
            }
            try {
                if (!latch.await(20, TimeUnit.SECONDS)) {
                    Log.e(TAG, "stop() timeout waiting for main thread")
                }
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                Log.w(TAG, "stop() interrupted", e)
            }
        }
    }

    private companion object {
        /** 略提高上限帧率（约 11fps），仍低于 capture 15fps，减轻带宽与排队 */
        const val MIN_JPEG_INTERVAL_MS = 90L
        const val JPEG_QUALITY = 70

        /** 0x01 + width(u16 BE) + height(u16 BE) + jpeg；与服务器 / Web 约定一致 */
        private fun buildScreenFramePacket(w: Int, h: Int, jpeg: ByteArray): ByteArray {
            val cw = w.coerceIn(1, 65535)
            val ch = h.coerceIn(1, 65535)
            val out = ByteArray(5 + jpeg.size)
            out[0] = 1
            out[1] = (cw shr 8 and 0xff).toByte()
            out[2] = (cw and 0xff).toByte()
            out[3] = (ch shr 8 and 0xff).toByte()
            out[4] = (ch and 0xff).toByte()
            System.arraycopy(jpeg, 0, out, 5, jpeg.size)
            return out
        }

        private fun nv21FromI420(i420: VideoFrame.I420Buffer): ByteArray {
            val w = i420.width
            val h = i420.height
            val chromaW = w / 2
            val chromaH = h / 2
            val ySize = w * h
            val out = ByteArray(ySize + chromaW * chromaH * 2)
            val yStride = i420.strideY
            val yBuf = i420.dataY.duplicate()
            for (row in 0 until h) {
                yBuf.position(row * yStride)
                yBuf.get(out, row * w, w)
            }
            val uStride = i420.strideU
            val vStride = i420.strideV
            val uBuf = i420.dataU.duplicate()
            val vBuf = i420.dataV.duplicate()
            var off = ySize
            for (row in 0 until chromaH) {
                for (col in 0 until chromaW) {
                    val u = uBuf.get(row * uStride + col)
                    val v = vBuf.get(row * vStride + col)
                    out[off++] = v
                    out[off++] = u
                }
            }
            return out
        }
    }
}
