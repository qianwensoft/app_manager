package com.appmanager.agent.command

import android.util.Log
import com.appmanager.agent.DeviceProfileSync
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ws.CommandAction
import com.appmanager.agent.ws.CommandResultMessage
import com.appmanager.agent.ws.Message
import com.google.gson.Gson

object CommandDispatcher {

    private const val TAG = "CommandDispatcher"

    fun dispatch(msg: Message, service: AgentService) {
        when (msg.type) {
            "device_profile_sync" -> {
                val data = msg.data as? Map<*, *>
                if (data != null) {
                    DeviceProfileSync.applyFromServer(service, data)
                } else {
                    Log.w(TAG, "device_profile_sync missing data")
                }
            }
            "webrtc_signal" -> {
                @Suppress("UNCHECKED_CAST")
                val data = msg.data as? Map<String, Any>
                if (data != null) {
                    service.handleWebRTCSignal(data)
                } else {
                    Log.w(TAG, "webrtc_signal missing data")
                }
            }
            "screen_touch" -> {
                val data = msg.data
                if (data == null) {
                    Log.w(TAG, "screen_touch missing data")
                } else {
                    val json = when (data) {
                        is String -> data
                        else -> Gson().toJson(data)
                    }
                    service.handleScreenTouchRelay(json)
                }
            }
            "command" -> {
                Log.i(TAG, "Dispatching command: ${msg.action}")
                when (msg.action) {
                    CommandAction.START_SCREEN  -> service.promptScreenCapturePermission()
                    CommandAction.STOP_SCREEN   -> service.stopScreenCapture()
                    CommandAction.START_SHELL   -> service.startShell()
                    CommandAction.STOP_SHELL    -> service.stopShell()
                    CommandAction.SHELL_INPUT   -> {
                        val cmd = (msg.data as? Map<*, *>)?.get("command") as? String
                        if (cmd != null) service.executeShellCommand(cmd)
                    }
                    CommandAction.START_LOGCAT  -> {
                        val filter = (msg.data as? Map<*, *>)?.get("filter") as? String ?: ""
                        service.startLogcat(filter)
                    }
                    CommandAction.STOP_LOGCAT   -> service.stopLogcat()
                    CommandAction.START_RECORDING -> service.startRecording()
                    CommandAction.STOP_RECORDING  -> service.stopRecording()
                    CommandAction.START_AUDIO_RECORDING -> service.startAudioRecording()
                    CommandAction.STOP_AUDIO_RECORDING -> service.stopAudioRecording()
                    CommandAction.INSTALL_APP   -> AppCommandHandler.install(msg, service)
                    CommandAction.UNINSTALL_APP -> AppCommandHandler.uninstall(msg, service)
                    CommandAction.START_APP     -> AppCommandHandler.startApp(msg, service)
                    CommandAction.STOP_APP      -> AppCommandHandler.stopApp(msg, service)
                    CommandAction.REBOOT        -> SystemCommandHandler.reboot(msg, service)
                    CommandAction.GET_INFO      -> SystemCommandHandler.getInfo(msg, service)
                    CommandAction.CAPTURE_SCREENSHOT -> {
                        val rid = (msg.data as? Map<*, *>)?.get("request_id") as? String
                            ?: (msg.data as? Map<*, *>)?.get("requestId") as? String
                        if (rid != null) {
                            service.captureScreenshot(rid)
                        } else {
                            Log.w(TAG, "capture_screenshot missing request_id")
                        }
                    }
                    CommandAction.SPEED_TEST_PING -> {
                        val rid = (msg.data as? Map<*, *>)?.get("request_id") as? String
                        if (rid != null) service.speedTestPing(rid)
                        else Log.w(TAG, "speed_test_ping missing request_id")
                    }
                    CommandAction.SPEED_TEST_THROUGHPUT -> {
                        val m = msg.data as? Map<*, *>
                        if (m == null) {
                            Log.w(TAG, "speed_test_throughput missing data")
                        } else {
                            val rid = m["request_id"] as? String
                            if (rid == null) {
                                Log.w(TAG, "speed_test_throughput missing request_id")
                            } else {
                                val down = m["download_path"] as? String ?: "/api/agent/speed-test/download?size=262144"
                                val up = m["upload_path"] as? String ?: "/api/agent/speed-test/upload"
                                val pb = (m["payload_bytes"] as? Number)?.toInt()?.coerceIn(1024, 2 * 1024 * 1024) ?: 262144
                                service.speedTestThroughput(rid, down, up, pb)
                            }
                        }
                    }
                    CommandAction.LIST_INSTALLED_APPS -> {
                        val m = msg.data as? Map<*, *>
                        val rid = m?.get("request_id") as? String
                        if (rid != null) {
                            service.sendInstalledAppsList(rid)
                        } else {
                            Log.w(TAG, "list_installed_apps missing request_id")
                        }
                    }
                    CommandAction.EXPORT_INSTALLED_APK -> {
                        val m = msg.data as? Map<*, *>
                        val rid = m?.get("request_id") as? String
                        val pkg = (m?.get("package_name") as? String)?.trim()
                        val up = (m?.get("upload_path") as? String)?.trim()
                        if (!rid.isNullOrBlank() && !pkg.isNullOrBlank() && !up.isNullOrBlank()) {
                            AppCommandHandler.exportInstalledApk(service, pkg, up)
                        } else {
                            Log.w(TAG, "export_installed_apk missing request_id, package_name or upload_path")
                        }
                    }
                    CommandAction.PUSH_DEVICE_INFO -> {
                        val m = msg.data as? Map<*, *>
                        val rid = m?.get("request_id") as? String
                        if (rid != null) {
                            service.pushDeviceInfoNow(rid)
                        } else {
                            Log.w(TAG, "push_device_info missing request_id")
                        }
                    }
                    CommandAction.FS_LIST -> FsCommandHandler.list(msg, service)
                    CommandAction.FS_DOWNLOAD -> FsCommandHandler.download(msg, service)
                    CommandAction.FS_UPLOAD_BEGIN -> FsCommandHandler.uploadBegin(msg, service)
                    CommandAction.FS_UPLOAD_CHUNK -> FsCommandHandler.uploadChunk(msg, service)
                    CommandAction.FS_UPLOAD_END -> FsCommandHandler.uploadEnd(msg, service)
                    CommandAction.FS_UPLOAD_CANCEL -> FsCommandHandler.uploadCancel(msg, service)
                    else -> Log.w(TAG, "Unknown command action: ${msg.action}")
                }
            }
            else -> Log.w(TAG, "Unknown message type: ${msg.type}")
        }
    }

    fun sendResult(service: AgentService, commandId: String?, success: Boolean, output: String = "") {
        commandId ?: return
        service.webSocket.send(CommandResultMessage(commandId = commandId, success = success, output = output))
    }
}
