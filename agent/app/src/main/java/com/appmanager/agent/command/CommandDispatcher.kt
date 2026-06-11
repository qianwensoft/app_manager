package com.appmanager.agent.command

import android.util.Log
import com.appmanager.agent.AgentMenuSync
import com.appmanager.agent.DeviceProfileSync
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.OutboundMessagePresenter
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
            "agent_menu_sync" -> {
                val data = msg.data as? Map<*, *>
                if (data != null) {
                    AgentMenuSync.applyFromServer(service, data)
                } else {
                    Log.w(TAG, "agent_menu_sync missing data")
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
            "webrtc_answer" -> {
                // Server sends back answer to camera offer
                val camera = msg.camera ?: ""
                val sdp    = msg.sdp ?: ""
                if (camera.isNotEmpty() && sdp.isNotEmpty()) {
                    service.handleCameraWebRTCAnswer(camera, sdp)
                } else {
                    Log.w(TAG, "webrtc_answer missing camera or sdp")
                }
            }
            "webrtc_ice_candidate" -> {
                // Server sends ICE candidate for camera (role=publisher means for agent)
                val camera    = msg.camera ?: ""
                val candidate = msg.candidate
                if (camera.isNotEmpty() && candidate != null) {
                    service.handleCameraWebRTCIce(camera, candidate)
                } else {
                    Log.w(TAG, "webrtc_ice_candidate missing camera or candidate")
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
                    CommandAction.START_SCREEN  -> service.requestScreenCapture()
                    CommandAction.STOP_SCREEN   -> service.stopScreenCapture()
                    CommandAction.START_SHELL   -> service.startShell()
                    CommandAction.STOP_SHELL    -> service.stopShell()
                    CommandAction.SHELL_INPUT   -> {
                        val cmd = (msg.data as? Map<*, *>)?.get("command") as? String
                        if (cmd != null) service.executeShellCommand(cmd)
                    }
                    CommandAction.START_LOGCAT  -> {
                        val m = msg.data as? Map<*, *>
                        val filters = parseLogcatFilters(m)
                        service.startLogcat(filters)
                    }
                    CommandAction.STOP_LOGCAT   -> service.stopLogcat()
                    CommandAction.START_RECORDING -> service.startRecording()
                    CommandAction.STOP_RECORDING  -> service.stopRecording()
                    CommandAction.START_AUDIO_RECORDING -> service.startAudioRecording()
                    CommandAction.STOP_AUDIO_RECORDING -> service.stopAudioRecording()
                    CommandAction.START_CAMERA -> {
                        val camera = (msg.data as? Map<*, *>)?.get("camera") as? String
                            ?: msg.camera
                            ?: "back"
                        service.startCamera(camera)
                    }
                    CommandAction.STOP_CAMERA -> {
                        val camera = (msg.data as? Map<*, *>)?.get("camera") as? String
                            ?: msg.camera
                            ?: "back"
                        service.stopCamera(camera)
                    }
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
                    CommandAction.OPEN_WIRELESS_ADB -> service.openWirelessAdbSettings()
                    CommandAction.TRIGGER_AGENT_MENU -> {
                        val m = msg.data as? Map<*, *>
                        val action = (m?.get("intent_action") as? String)?.trim()
                        if (!action.isNullOrEmpty()) {
                            service.triggerAgentMenuIntent(action)
                        } else {
                            Log.w(TAG, "trigger_agent_menu missing intent_action")
                        }
                    }
                    CommandAction.FS_LIST -> FsCommandHandler.list(msg, service)
                    CommandAction.FS_DOWNLOAD -> FsCommandHandler.download(msg, service)
                    CommandAction.FS_UPLOAD_BEGIN -> FsCommandHandler.uploadBegin(msg, service)
                    CommandAction.FS_UPLOAD_CHUNK -> FsCommandHandler.uploadChunk(msg, service)
                    CommandAction.FS_UPLOAD_END -> FsCommandHandler.uploadEnd(msg, service)
                    CommandAction.FS_UPLOAD_CANCEL -> FsCommandHandler.uploadCancel(msg, service)
                    CommandAction.START_CUSTOM_EVENT_LISTEN -> {
                        try {
                            val data = msg.data as? Map<*, *>
                            com.appmanager.agent.util.CustomEventBroadcastHelper.configureLoopGuard(data)
                            val rules = com.appmanager.agent.util.CustomEventBroadcastHelper
                                .parseRulesFromServer(data)
                            com.appmanager.agent.util.CustomEventBroadcastHelper.start(service, rules)
                            Log.i(TAG, "Custom event listen started, rules=${rules?.size ?: 0} (using defaults=${rules == null})")
                        } catch (t: Throwable) {
                            Log.e(TAG, "start_custom_event_listen failed", t)
                        }
                    }
                    CommandAction.STOP_CUSTOM_EVENT_LISTEN -> {
                        try {
                            com.appmanager.agent.util.CustomEventBroadcastHelper.stop(service)
                            Log.i(TAG, "Custom event listen stopped")
                        } catch (t: Throwable) {
                            Log.e(TAG, "stop_custom_event_listen failed", t)
                        }
                    }
                    CommandAction.START_CUSTOM_EVENT_PROBE -> {
                        try {
                            com.appmanager.agent.util.CustomEventProbeHelper.bind(service.webSocket, service.connectionDeviceToken)
                            val m = msg.data as? Map<*, *>
                            val sid = (m?.get("session_id") as? String)?.trim().orEmpty()
                            val rawActs = m?.get("actions") as? List<*>
                            val acts = rawActs?.mapNotNull { it?.toString()?.trim() }?.filter { it.isNotEmpty() }
                                ?: emptyList()
                            val rawPats = m?.get("patterns") as? List<*>
                            val pats = rawPats?.mapNotNull { it?.toString()?.trim() }?.filter { it.isNotEmpty() }
                                ?: emptyList()
                            if (sid.isEmpty()) {
                                Log.w(TAG, "start_custom_event_probe missing session_id")
                            } else {
                                com.appmanager.agent.util.CustomEventProbeHelper.start(service, sid, acts, pats)
                                Log.i(TAG, "Custom event probe started session=$sid actions=${acts.size} patterns=${pats.size}")
                            }
                        } catch (t: Throwable) {
                            Log.e(TAG, "start_custom_event_probe failed", t)
                        }
                    }
                    CommandAction.STOP_CUSTOM_EVENT_PROBE -> {
                        try {
                            com.appmanager.agent.util.CustomEventProbeHelper.stop(service)
                            Log.i(TAG, "Custom event probe stopped")
                        } catch (t: Throwable) {
                            Log.e(TAG, "stop_custom_event_probe failed", t)
                        }
                    }
                    CommandAction.OPEN_URL -> IntentCommandHandler.openUrl(msg, service)
                    CommandAction.BROADCAST_INTENT -> IntentCommandHandler.broadcastIntent(msg, service)
                    CommandAction.SHOW_DEVICE_MESSAGE -> {
                        val d = msg.data as? Map<*, *>
                        if (d == null) {
                            Log.w(TAG, "show_device_message missing data")
                            sendResult(service, msg.commandId, false, "missing data")
                        } else {
                            val title = (d["title"] as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: "通知"
                            val body = listOfNotNull(
                                d["body"] as? String,
                                d["text"] as? String,
                                d["message"] as? String
                            ).map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: ""
                            if (body.isEmpty()) {
                                sendResult(service, msg.commandId, false, "empty body")
                            } else {
                                val dur = when (val v = d["duration_ms"]) {
                                    is Number -> v.toInt()
                                    else -> 8000
                                }
                                OutboundMessagePresenter.show(service, title, body, dur)
                                sendResult(service, msg.commandId, true, "")
                            }
                        }
                    }
                    CommandAction.KEYBOARD_INPUT -> SystemCommandHandler.keyboardInput(msg, service)
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

    private fun parseLogcatFilters(data: Map<*, *>?): List<String> {
        if (data == null) return emptyList()
        val rawList = data["filters"] as? List<*>
        if (rawList != null) {
            val out = LinkedHashSet<String>()
            rawList.mapNotNull { it?.toString()?.trim() }.filter { it.isNotEmpty() }.forEach { out.add(it) }
            return out.toList()
        }
        val legacy = (data["filter"] as? String)?.trim().orEmpty()
        if (legacy.isEmpty()) return emptyList()
        return legacy.split(Regex("\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
    }
}
