package com.appmanager.agent.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.appmanager.agent.ws.AgentWebSocket
import com.google.gson.Gson
import org.webrtc.*
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * CameraStreamManager — 通过 WebRTC 将前/后摄像头画面推送给服务端 SFU，
 * 服务端再转发给浏览器查看端。
 *
 * 信令流程：
 *   1. Server → Agent: {"type":"command","action":"start_camera","camera":"back"|"front"}
 *   2. Agent → Server: {"type":"webrtc_offer","camera":"back","sdp":"..."}
 *   3. Server → Agent: {"type":"webrtc_answer","camera":"back","sdp":"..."}
 *   4. 双方交换 ICE candidate: {"type":"webrtc_ice_candidate","camera":"back","role":"publisher","candidate":{...}}
 *
 * 编解码：优先 H264（硬件），回退 VP8（软件）。
 */
class CameraStreamManager(
    private val context: Context,
    private val webSocket: AgentWebSocket
) {
    companion object {
        private const val TAG = "CameraStream"
        const val CAMERA_BACK  = "back"
        const val CAMERA_FRONT = "front"

        private val factoryInitialized = AtomicBoolean(false)

        fun ensureInitialized(context: Context) {
            if (factoryInitialized.compareAndSet(false, true)) {
                PeerConnectionFactory.initialize(
                    PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                        .setEnableInternalTracer(false)
                        .createInitializationOptions()
                )
            }
        }
    }

    private val gson = Gson()
    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "camera-webrtc").apply { isDaemon = true }
    }

    /** Per-camera session state */
    private inner class CameraSession(val cameraId: String) {
        var eglBase: EglBase? = null
        var factory: PeerConnectionFactory? = null
        var capturer: CameraVideoCapturer? = null
        var surfaceHelper: SurfaceTextureHelper? = null
        var videoSource: VideoSource? = null
        var videoTrack: VideoTrack? = null
        var pc: PeerConnection? = null
        val stopped = AtomicBoolean(false)
    }

    private val sessions = mutableMapOf<String, CameraSession>()
    private val sessionsLock = Any()

    // ── Public API ──────────────────────────────────────────────────────────────

    fun startCamera(cameraId: String) {
        executor.execute {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED
            ) {
                Log.w(TAG, "CAMERA permission not granted")
                webSocket.send(mapOf(
                    "type" to "camera_error",
                    "camera" to cameraId,
                    "message" to "未授予相机权限，请在 Agent「权限」页开启相机后重试"
                ))
                return@execute
            }
            synchronized(sessionsLock) {
                if (sessions.containsKey(cameraId)) {
                    Log.d(TAG, "camera $cameraId already running")
                    return@execute
                }
                // 检查是否已有其他摄像头在运行（设备不支持并发时提前拒绝）
                if (sessions.isNotEmpty() && !isConcurrentSupported()) {
                    val running = sessions.keys.first()
                    Log.w(TAG, "Device does not support concurrent cameras, $running is active")
                    webSocket.send(mapOf(
                        "type" to "camera_error",
                        "camera" to cameraId,
                        "message" to "设备不支持同时开启前后摄像头，请先关闭 ${if (running == "back") "后置" else "前置"}摄像头"
                    ))
                    return@execute
                }
                try {
                    val session = createSession(cameraId)
                    sessions[cameraId] = session
                } catch (e: Exception) {
                    Log.e(TAG, "startCamera $cameraId failed", e)
                    webSocket.send(mapOf(
                        "type" to "camera_error",
                        "camera" to cameraId,
                        "message" to "摄像头启动失败：${e.message}"
                    ))
                }
            }
        }
    }

    fun stopCamera(cameraId: String) {
        executor.execute {
            val removed = synchronized(sessionsLock) {
                sessions.remove(cameraId)?.also { releaseSession(it) } != null
            }
            if (removed) {
                webSocket.send(mapOf("type" to "webrtc_stop_camera", "camera" to cameraId))
            }
        }
    }

    fun stopAll() {
        executor.execute {
            val toStop = synchronized(sessionsLock) {
                val keys = sessions.keys.toList()
                sessions.values.forEach { releaseSession(it) }
                sessions.clear()
                keys
            }
            toStop.forEach { cameraId ->
                webSocket.send(mapOf("type" to "webrtc_stop_camera", "camera" to cameraId))
            }
        }
    }

    /** Called when server sends webrtc_answer for a camera */
    fun handleAnswer(cameraId: String, sdp: String) {
        executor.execute {
            val session = synchronized(sessionsLock) { sessions[cameraId] } ?: return@execute
            try {
                session.pc?.setRemoteDescription(
                    LoggingSdpObserver("setRemoteDesc[$cameraId]"),
                    SessionDescription(SessionDescription.Type.ANSWER, sdp)
                )
                Log.i(TAG, "Answer set for camera=$cameraId")
            } catch (e: Exception) {
                Log.e(TAG, "handleAnswer camera=$cameraId", e)
            }
        }
    }

    /** Called when server sends webrtc_ice_candidate for a camera */
    fun handleRemoteIce(cameraId: String, candidateJson: Map<String, Any>) {
        executor.execute {
            val session = synchronized(sessionsLock) { sessions[cameraId] } ?: return@execute
            try {
                val candidate = candidateJson["candidate"] as? String ?: return@execute
                val sdpMid = candidateJson["sdpMid"] as? String ?: ""
                val sdpMLineIndex = (candidateJson["sdpMLineIndex"] as? Number)?.toInt() ?: 0
                session.pc?.addIceCandidate(IceCandidate(sdpMid, sdpMLineIndex, candidate))
            } catch (e: Exception) {
                Log.e(TAG, "handleRemoteIce camera=$cameraId", e)
            }
        }
    }

    // ── Private helpers ─────────────────────────────────────────────────────────

    private fun isConcurrentSupported(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        return try {
            val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            cm.concurrentCameraIds.isNotEmpty()
        } catch (e: Exception) {
            false
        }
    }

    private fun createSession(cameraId: String): CameraSession {
        val session = CameraSession(cameraId)

        // 1. EGL context
        val eglBase = EglBase.create()
        session.eglBase = eglBase

        // 2. PeerConnectionFactory
        ensureInitialized(context)
        val videoEncoderFactory = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val videoDecoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        val factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(videoEncoderFactory)
            .setVideoDecoderFactory(videoDecoderFactory)
            .createPeerConnectionFactory()
        session.factory = factory

        // 3. Camera capturer
        val enumerator = Camera2Enumerator(context)
        val capturer = selectCamera(enumerator, cameraId)
            ?: throw IllegalStateException("No camera found for $cameraId")
        session.capturer = capturer

        val surfaceHelper = SurfaceTextureHelper.create("camera-$cameraId-surface", eglBase.eglBaseContext)
        session.surfaceHelper = surfaceHelper

        val videoSource = factory.createVideoSource(capturer.isScreencast)
        session.videoSource = videoSource

        capturer.initialize(surfaceHelper, context, videoSource.capturerObserver)
        // 同时开启两路摄像头时降低分辨率，避免硬件资源不足
        val concurrent = synchronized(sessionsLock) { sessions.size > 1 }
        val (width, height, fps) = if (concurrent) Triple(640, 480, 24) else Triple(1280, 720, 30)
        capturer.startCapture(width, height, fps)

        val videoTrack = factory.createVideoTrack("camera_$cameraId", videoSource)
        videoTrack.setEnabled(true)
        session.videoTrack = videoTrack

        val rtcConfig = PeerConnection.RTCConfiguration(
            listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
        ).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        val pc = factory.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                if (session.stopped.get()) return
                val msg = mapOf(
                    "type" to "webrtc_ice_candidate",
                    "camera" to cameraId,
                    "role" to "publisher",
                    "candidate" to mapOf(
                        "candidate" to candidate.sdp,
                        "sdpMid" to candidate.sdpMid,
                        "sdpMLineIndex" to candidate.sdpMLineIndex
                    )
                )
                webSocket.send(msg)
            }
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
                Log.i(TAG, "PC[$cameraId] state=$state")
                if (state == PeerConnection.PeerConnectionState.FAILED) {
                    stopCamera(cameraId)
                }
            }
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
            override fun onIceConnectionReceivingChange(p: Boolean) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
            override fun onSignalingChange(state: PeerConnection.SignalingState) {}
            override fun onAddStream(stream: MediaStream) {}
            override fun onRemoveStream(stream: MediaStream) {}
            override fun onDataChannel(dc: DataChannel) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(r: RtpReceiver, streams: Array<out MediaStream>) {}
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        }) ?: throw IllegalStateException("Failed to create PeerConnection for $cameraId")
        session.pc = pc

        // 5. Add video track to PC
        pc.addTrack(videoTrack, listOf("camera_stream_$cameraId"))

        // 6. Create offer and send to server
        pc.createOffer(object : LoggingSdpObserver("createOffer[$cameraId]") {
            override fun onCreateSuccess(sdp: SessionDescription) {
                pc.setLocalDescription(LoggingSdpObserver("setLocalDesc[$cameraId]"), sdp)
                val msg = mapOf(
                    "type" to "webrtc_offer",
                    "camera" to cameraId,
                    "sdp" to sdp.description
                )
                webSocket.send(msg)
                Log.i(TAG, "Offer sent for camera=$cameraId")
            }
        }, MediaConstraints())

        return session
    }

    private fun selectCamera(enumerator: Camera2Enumerator, cameraId: String): CameraVideoCapturer? {
        val wantFront = cameraId == CAMERA_FRONT
        val deviceNames = enumerator.deviceNames
        // first pass: match facing
        for (name in deviceNames) {
            val isFront = enumerator.isFrontFacing(name)
            if (isFront == wantFront) {
                val capturer = enumerator.createCapturer(name, null)
                if (capturer != null) return capturer
            }
        }
        // fallback: any camera
        for (name in deviceNames) {
            val capturer = enumerator.createCapturer(name, null)
            if (capturer != null) return capturer
        }
        return null
    }

    private fun releaseSession(session: CameraSession) {
        session.stopped.set(true)
        try { session.capturer?.stopCapture() } catch (_: Exception) {}
        try { session.capturer?.dispose() } catch (_: Exception) {}
        try { session.videoTrack?.dispose() } catch (_: Exception) {}
        try { session.videoSource?.dispose() } catch (_: Exception) {}
        try { session.surfaceHelper?.dispose() } catch (_: Exception) {}
        try { session.pc?.close() } catch (_: Exception) {}
        try { session.factory?.dispose() } catch (_: Exception) {}
        try { session.eglBase?.release() } catch (_: Exception) {}
        Log.i(TAG, "Session released for camera=${session.cameraId}")
    }

    /** Simple SdpObserver that logs errors */
    private open inner class LoggingSdpObserver(private val tag: String) : SdpObserver {
        override fun onCreateSuccess(sdp: SessionDescription) {}
        override fun onSetSuccess() { Log.d(TAG, "$tag onSetSuccess") }
        override fun onCreateFailure(error: String) { Log.e(TAG, "$tag onCreateFailure: $error") }
        override fun onSetFailure(error: String) { Log.e(TAG, "$tag onSetFailure: $error") }
    }
}
