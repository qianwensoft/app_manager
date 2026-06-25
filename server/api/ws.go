package api

import (
	"app-manager/agent"
	"app-manager/auth"
	"app-manager/cluster"
	"app-manager/database"
	"app-manager/datastack"
	"app-manager/event"
	appoutbound "app-manager/outbound"
	"app-manager/logcat"
	"app-manager/models"
	appoutbound "app-manager/outbound"
	"app-manager/screen"
	"app-manager/shell"
	wrtc "app-manager/webrtc"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// rawWsUpgrader：屏幕 / Shell / Logcat / Agent 等原生 WebSocket（浏览器通常不带 Sec-WebSocket-Protocol）。
// 若与 STOMP 共用带 Subprotocols 的 Upgrader，部分环境下屏幕握手会异常或连上即断。
var rawWsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// stompWsUpgrader 仅用于 StompWS：@stomp/stompjs 协商 v12.stomp / v11 / v10（见 stomp_ws.go）。
var stompWsUpgrader = websocket.Upgrader{
	CheckOrigin:  func(r *http.Request) bool { return true },
	Subprotocols: []string{"v12.stomp", "v11.stomp", "v10.stomp"},
}

func screenWSOutboundAllowed(c *gin.Context, msg map[string]interface{}) bool {
	modeVal, _ := c.Get("screen_auth_mode")
	mode, _ := modeVal.(string)
	if mode != "share" {
		return true
	}
	v, _ := c.Get("screen_share_scopes")
	set, ok := v.(map[string]struct{})
	if !ok || len(set) == 0 {
		return false
	}
	t, _ := msg["type"].(string)
	switch t {
	case "client_ping":
		return true
	case "viewer_stop_screen":
		return auth.ScopeSetAllows(set, auth.ScreenStop)
	case "screen_touch":
		data, _ := msg["data"].(map[string]interface{})
		if data != nil {
			if pt, ok := data["type"].(string); ok && pt == "ping" {
				return auth.ScopeSetAllows(set, auth.ScreenView)
			}
		}
		return auth.ScopeSetAllows(set, auth.ScreenTouch)
	default:
		return false
	}
}

// ScreenWS 浏览器仅连服务器；画面帧由 Agent→服务器→浏览器广播。
// 首连下发 start_screen；浏览器刷新/关闭连接不自动 stop_screen（保持 Agent 端授权会话），仅显式 viewer_stop_screen 下发 stop_screen。
func ScreenWS(c *gin.Context) {
	param := c.Param("deviceId")
	routeKey, devID, err := agent.CanonicalRouteKey(param)
	if err != nil {
		log.Printf("ScreenWS: reject param=%q: %v", param, err)
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if devID > 0 {
		var d models.Device
		if err := database.DB.First(&d, devID).Error; err == nil && !d.AllowRemoteScreen {
			c.JSON(http.StatusForbidden, gin.H{"error": "该设备未允许 Web 远程查看屏幕，请在 Android Agent 开启「允许远程查看屏幕」并保存"})
			return
		}
	}
	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	log.Printf("Browser connected to screen param=%s routeKey=%s", param, routeKey)
	screen.ScreenHub.RegisterViewer(routeKey, conn)
	needStart := cluster.ScreenViewerJoined(routeKey)
	startMsg := map[string]interface{}{
		"type":   "command",
		"action": "start_screen",
	}
	// 始终向在线 Agent 下发 start_screen：服务端 agentCaptureHeld 与端上实际采集可能不同步（重连/竞态）。
	if agent.AgentHub.SendToDevice(devID, startMsg) {
		log.Printf("Sent start_screen to agent devID=%d routeKey=%s (needStart=%v)", devID, routeKey, needStart)
	} else if needStart {
		log.Printf("start_screen skipped: agent offline devID=%d routeKey=%s", devID, routeKey)
	}
	defer func() {
		log.Printf("Browser disconnected from screen param=%s routeKey=%s", param, routeKey)
		screen.ScreenHub.UnregisterViewer(routeKey, conn)
		cluster.ScreenViewerLeft(routeKey)
		_ = conn.Close()
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("ScreenWS parse error [%s]: %v", routeKey, err)
			continue
		}
		if !screenWSOutboundAllowed(c, msg) {
			log.Printf("ScreenWS blocked by share scope [%s] type=%v", routeKey, msg["type"])
			continue
		}
		t, _ := msg["type"].(string)
		if t == "viewer_stop_screen" {
			screen.RequestViewerStopCapture(routeKey)
			_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
				"type":   "command",
				"action": "stop_screen",
			})
			log.Printf("viewer_stop_screen: sent stop_screen to agent [%s]", routeKey)
			ack, _ := json.Marshal(map[string]interface{}{"type": "viewer_stop_ack"})
			_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
			_ = conn.WriteMessage(websocket.TextMessage, ack)
			continue
		}
		if t == "client_ping" {
			reply, _ := json.Marshal(map[string]interface{}{
				"type": "client_pong",
				"ts":   msg["ts"],
			})
			_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
			_ = conn.WriteMessage(websocket.TextMessage, reply)
			continue
		}
		_ = agent.AgentHub.Send(routeKey, msg)
	}
}

func ShellWS(c *gin.Context) {
	param := c.Param("deviceId")
	var dev models.Device
	if err := agent.DeviceScope(param).First(&dev).Error; err != nil {
		log.Printf("ShellWS: device not found param=%q: %v", param, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "设备不存在"})
		return
	}

	adbSerial := strings.TrimSpace(dev.Serial)
	useADB := serialUsableWithAdb(adbSerial)
	if useADB {
		if st, err := getADB().GetState(adbSerial); err != nil || st != "device" {
			useADB = false
		}
	}

	var routeKey string
	if !useADB {
		var err error
		routeKey, err = agent.AgentConnectionKey(param)
		if err != nil {
			log.Printf("ShellWS: reject param=%q: %v", param, err)
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if !agent.AgentHub.IsConnected(routeKey) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线；若设备已通过 USB/网络 ADB 连到本服务器，请确保设备 serial 已录入且 adb devices 为 device 状态"})
			return
		}
	}

	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	if useADB {
		log.Printf("Browser shell (ADB PTY) param=%s serial=%s", param, adbSerial)
		shell.RunADBShell(conn, getADB().ExePath(), adbSerial)
		return
	}

	log.Printf("Browser connected to shell param=%s routeKey=%s", param, routeKey)
	if err := conn.WriteJSON(map[string]interface{}{
		"type": "shell_meta",
		"mode": "agent",
	}); err != nil {
		_ = conn.Close()
		return
	}
	shell.ShellHub.Register(routeKey, conn)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "start_shell",
	})

	defer func() {
		log.Printf("Browser disconnected from shell param=%s routeKey=%s", param, routeKey)
		shell.ShellHub.Unregister(routeKey)
		_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
			"type":   "command",
			"action": "stop_shell",
		})
		_ = conn.Close()
	}()

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
			continue
		}
		if len(data) == 0 {
			continue
		}
		_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
			"type":   "command",
			"action": "shell_input",
			"data":   map[string]interface{}{"command": string(data)},
		})
	}
}

func logcatFiltersFromQuery(c *gin.Context) []string {
	if arr := c.QueryArray("filter"); len(arr) > 0 {
		return logcat.NormalizeFilters(arr)
	}
	if f := strings.TrimSpace(c.Query("filter")); f != "" {
		return logcat.NormalizeFilters([]string{f})
	}
	return nil
}

func LogcatWS(c *gin.Context) {
	param := c.Param("deviceId")
	filters := logcatFiltersFromQuery(c)

	// 查询设备，判断是否可以走 ADB
	var dev models.Device
	if err := agent.DeviceScope(param).First(&dev).Error; err != nil {
		log.Printf("LogcatWS: device not found param=%q: %v", param, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "设备不存在"})
		return
	}

	adbSerial := strings.TrimSpace(dev.Serial)
	useADB := serialUsableWithAdb(adbSerial)
	if useADB {
		s, _, err := ensureADBConnected(adbSerial)
		if err != nil {
			log.Printf("LogcatWS: ADB not reachable serial=%s: %v, falling back to agent", adbSerial, err)
			useADB = false
		} else {
			adbSerial = s
		}
	}

	var routeKey string
	if !useADB {
		var err error
		routeKey, err = agent.AgentConnectionKey(param)
		if err != nil {
			log.Printf("LogcatWS: reject param=%q: %v", param, err)
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if !agent.AgentHub.IsConnected(routeKey) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线；若设备已通过 USB/网络 ADB 连接，请确保设备 serial 已录入且 adb devices 为 device 状态"})
			return
		}
	}

	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	// ADB 模式：直接用 adb logcat 流式输出（连接保持到 session 结束）
	if useADB {
		log.Printf("Browser logcat (ADB) param=%s serial=%s filters=%v", param, adbSerial, filters)
		_, err := logcat.NewSession(adbSerial, conn, getADB().ExePath(), filters)
		if err != nil {
			log.Printf("LogcatWS: ADB session error serial=%s: %v", adbSerial, err)
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[error] 无法启动 ADB logcat: "+err.Error()))
			_ = conn.Close()
		}
		return
	}

	// Agent 模式
	log.Printf("Browser connected to logcat param=%s routeKey=%s", param, routeKey)
	logcat.LogcatHub.Register(routeKey, conn)

	// 通知 Agent 开始 logcat
	agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "start_logcat",
		"data":   map[string]interface{}{"filters": filters},
	})

	defer func() {
		log.Printf("Browser disconnected from logcat param=%s routeKey=%s", param, routeKey)
		logcat.LogcatHub.Unregister(routeKey)
		agent.AgentHub.Send(routeKey, map[string]interface{}{
			"type":   "command",
			"action": "stop_logcat",
		})
		conn.Close()
	}()

	// 保持连接存活
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

func AgentWS(c *gin.Context) {
	deviceID := c.Param("deviceId")
	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	agent.SyncDeviceStatus(deviceID, true)
	emitAgentSystemEvent("device.online", deviceID)
	done := agent.AgentHub.Register(deviceID, conn)
	<-done
	// 重连竞态：若本连接已被新连接替换，则离线判定交给新连接，避免把在线设备误标离线。
	if agent.AgentHub.IsCurrentConn(deviceID, conn) {
		return
	}
	if !agent.AgentHub.HasLocal(deviceID) {
		agent.SyncDeviceStatus(deviceID, false)
		emitAgentSystemEvent("device.offline", deviceID)
	}
}

func emitAgentSystemEvent(eventType, deviceKey string) {
	devID, ok := agent.ResolveDeviceID(deviceKey)
	if !ok {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"device_id": devID,
		"agent_key": deviceKey,
	})
	appoutbound.NotifySystemEvent(eventType, devID, string(payload))
}

func init() {
	agent.OnAgentConnect = func(deviceID string) {
		RestoreDeviceCustomEventListenForAgentKey(deviceID)
	}
	agent.OnAgentDisconnect = func(deviceID string) {
		routeKey := agent.CanonicalRouteKeyFromWS(deviceID)
		screen.AbortServerRecording(routeKey)
		screen.ResetCaptureRoute(routeKey)
		screen.ScreenHub.CloseAllForDevice(routeKey)
		if routeKey != deviceID {
			screen.AbortServerRecording(deviceID)
			screen.ResetCaptureRoute(deviceID)
			screen.ScreenHub.CloseAllForDevice(deviceID)
		}
		wrtc.CameraHub.RemoveAllPublishers(routeKey)
		cluster.PublishWebRTCStopCamera(routeKey, wrtc.CameraBack)
		cluster.PublishWebRTCStopCamera(routeKey, wrtc.CameraFront)
	}
	// Handle uplink messages from agents
	agent.SetMessageHandler(func(deviceID string, msg map[string]interface{}) {
		routeKey := agent.CanonicalRouteKeyFromWS(deviceID)
		msgType, _ := msg["type"].(string)
		switch msgType {
		case "screen_frame":
			screen.MarkAgentCaptureHeld(routeKey)
			raw, err := json.Marshal(msg)
			if err == nil {
				screen.ScreenHub.BroadcastText(routeKey, raw)
				cluster.PublishScreenText(routeKey, raw)
			}
			if data, ok := msg["data"].(map[string]interface{}); ok {
				screen.AppendRecordingFrame(routeKey, data)
			}
		case "screen_meta", "screen_pong":
			raw, err := json.Marshal(msg)
			if err == nil {
				screen.ScreenHub.BroadcastText(routeKey, raw)
				cluster.PublishScreenText(routeKey, raw)
			}
		case "heartbeat", "device_info":
			if data, ok := msg["data"].(map[string]interface{}); ok {
				agent.HandleHeartbeat(deviceID, data)
			} else {
				agent.HandleHeartbeat(deviceID, map[string]interface{}{})
			}
			if msgType == "device_info" {
				if rid, ok := msg["push_request_id"].(string); ok && rid != "" {
					agent.DeliverDeviceInfoPushDone(rid)
				}
			}
		case "shell_output":
			if out, ok := wsShellOutputPayload(msg["data"]); ok {
				shell.ShellHub.SendToClient(deviceID, out)
				cluster.PublishShellOutput(deviceID, out)
			}
		case "logcat_output":
			if data, ok := msg["data"].(string); ok {
				logcat.LogcatHub.SendToClient(deviceID, []byte(data))
				cluster.PublishLogcatOutput(deviceID, []byte(data))
			}
		case "wireless_adb_guide_ack":
			if devID, ok := agent.ResolveDeviceID(deviceID); ok {
				data, _ := msg["data"].(map[string]interface{})
				tokenMatched := true
				if data != nil {
					if v, ok := data["token_matched"].(bool); ok {
						tokenMatched = v
					}
				}
				var scannedID int64
				if data != nil {
					switch v := data["device_id"].(type) {
					case float64:
						scannedID = int64(v)
					case int64:
						scannedID = v
					}
				}
				PublishWirelessAdbGuideAck(devID, tokenMatched, scannedID)
			}
		case "custom_event_probe":
			if devID, ok := agent.ResolveDeviceID(deviceID); ok {
				data, _ := msg["data"].(map[string]interface{})
				if data != nil {
					sid, _ := data["session_id"].(string)
					action, _ := data["intent_action"].(string)
					extras, _ := data["extras"].(map[string]interface{})
					event.RecordAnalyzeProbe(devID, sid, action, extras)
				}
			}
		case "device_event":
			eventType, _ := msg["eventType"].(string)
			eventData, _ := msg["eventData"].(string)
			if eventType != "" {
				if devID, ok := agent.ResolveDeviceID(deviceID); ok {
					event.RecordAnalyzeDeviceEvent(devID, eventData)
					rec := models.DeviceEvent{
						DeviceID:  devID,
						EventType: eventType,
						EventData: eventData,
					}
					if err := database.DB.Create(&rec).Error; err == nil {
						var d models.Device
						var devPtr *models.Device
						if err := database.DB.First(&d, devID).Error; err == nil {
							devPtr = &d
						}
						event.PublishDeviceCustomEventSTOMP(rec, devPtr)
						appoutbound.NotifyDeviceEvent(rec, devPtr)
						go datastack.DispatchEventToEventBoundDatasets(database.DB, rec.EventType, rec.EventData)
					}
				}
			}
		case "screenshot_result":
			reqID, _ := msg["request_id"].(string)
			if reqID == "" {
				return
			}
			ok := false
			switch v := msg["success"].(type) {
			case bool:
				ok = v
			case float64:
				ok = v != 0
			}
			if !ok {
				errMsg, _ := msg["error"].(string)
				if errMsg == "" {
					errMsg = "截图失败"
				}
				agent.DeliverScreenshotResult(reqID, nil, errMsg)
				return
			}
			b64, _ := msg["data"].(string)
			raw, err := base64.StdEncoding.DecodeString(b64)
			if err != nil {
				agent.DeliverScreenshotResult(reqID, nil, err.Error())
				return
			}
			agent.DeliverScreenshotResult(reqID, raw, "")
		case "speed_test_result":
			reqID, _ := msg["request_id"].(string)
			if reqID == "" {
				return
			}
			ok := wsMsgBool(msg, "success")
			errStr, _ := msg["error"].(string)
			if !ok {
				if errStr == "" {
					errStr = "测速失败"
				}
				agent.DeliverSpeedtestReply(reqID, agent.SpeedtestReply{Err: errStr})
				return
			}
			phase, _ := msg["phase"].(string)
			rep := agent.SpeedtestReply{
				Phase:         phase,
				DownloadMs:    wsMsgInt64(msg, "download_ms"),
				UploadMs:      wsMsgInt64(msg, "upload_ms"),
				DownloadBytes: wsMsgInt64(msg, "download_bytes"),
				UploadBytes:   wsMsgInt64(msg, "upload_bytes"),
			}
			agent.DeliverSpeedtestReply(reqID, rep)
		case "installed_apps_result":
			reqID, _ := msg["request_id"].(string)
			if reqID == "" {
				return
			}
			if !wsMsgBool(msg, "success") {
				errStr, _ := msg["error"].(string)
				if errStr == "" {
					errStr = "获取已安装应用失败"
				}
				agent.DeliverInstalledAppsResult(reqID, nil, errStr)
				return
			}
			apps := parseInstalledAppsEntries(msg["apps"])
			agent.DeliverInstalledAppsResult(reqID, apps, "")
		case "fs_list_result":
			reqID, _ := msg["request_id"].(string)
			if reqID == "" {
				return
			}
			if !wsMsgBool(msg, "success") {
				errStr, _ := msg["error"].(string)
				if errStr == "" {
					errStr = "列目录失败"
				}
				agent.DeliverFsListResult(reqID, nil, "", errStr)
				return
			}
			var entries []agent.FsListEntry
			if arr, ok := msg["entries"].([]interface{}); ok {
				for _, it := range arr {
					m, ok := it.(map[string]interface{})
					if !ok {
						continue
					}
					name, _ := m["name"].(string)
					typ, _ := m["type"].(string)
					if name == "" || (typ != "file" && typ != "dir") {
						continue
					}
					entries = append(entries, agent.FsListEntry{
						Name:  name,
						Type:  typ,
						Size:  wsMsgInt64(m, "size"),
						Mtime: wsMsgInt64(m, "mtime"),
					})
				}
			}
			nextTok, _ := msg["next_page_token"].(string)
			agent.DeliverFsListResult(reqID, entries, nextTok, "")
		case "fs_download_result":
			reqID, _ := msg["request_id"].(string)
			if reqID == "" {
				return
			}
			if !wsMsgBool(msg, "success") {
				errStr, _ := msg["error"].(string)
				if errStr == "" {
					errStr = "下载失败"
				}
				agent.DeliverFsDownloadResult(reqID, nil, errStr)
				return
			}
			dataB64, _ := msg["data_base64"].(string)
			data, err := base64.StdEncoding.DecodeString(dataB64)
			if err != nil {
				agent.DeliverFsDownloadResult(reqID, nil, "解码失败")
				return
			}
			agent.DeliverFsDownloadResult(reqID, data, "")
		case "fs_upload_progress":
			uploadID, _ := msg["upload_id"].(string)
			if uploadID == "" {
				return
			}
			agent.DeliverFsUploadEvent(uploadID, agent.FsUploadEvent{
				UploadID:      uploadID,
				Type:          "fs_upload_progress",
				ReceivedBytes: wsMsgInt64(msg, "received_bytes"),
				Ok:            wsMsgBool(msg, "success"),
				Error:         wsMsgStr(msg, "error"),
			})
		case "fs_upload_done":
			uploadID, _ := msg["upload_id"].(string)
			if uploadID == "" {
				return
			}
			agent.DeliverFsUploadEvent(uploadID, agent.FsUploadEvent{
				UploadID: uploadID,
				Type:     "fs_upload_done",
				Ok:       wsMsgBool(msg, "success"),
				Error:    wsMsgStr(msg, "error"),
			})
		case "user_notice":
			screen.ScreenHub.SendJSONToClient(deviceID, msg)
		case "install_task_result":
			cid, _ := msg["command_id"].(string)
			if cid == "" {
				cid, _ = msg["commandId"].(string)
			}
			if cid == "" {
				return
			}
			ok := wsMsgBool(msg, "success")
			out, _ := msg["output"].(string)
			errStr, _ := msg["error"].(string)
			if ok {
				agent.DeliverInstallTaskResult(cid, out, "")
			} else {
				if errStr == "" {
					errStr = out
				}
				if errStr == "" {
					errStr = "安装失败"
				}
				agent.DeliverInstallTaskResult(cid, out, errStr)
			}
		case "command_result":
			// 通用命令结果（如远程打印调试）。Agent 回传 commandId/success/output。
			cid, _ := msg["commandId"].(string)
			if cid == "" {
				cid, _ = msg["command_id"].(string)
			}
			if cid == "" {
				return
			}
			out, _ := msg["output"].(string)
			agent.DeliverCommandResult(cid, wsMsgBool(msg, "success"), out)
		case "webrtc_offer":
			// Agent 发来摄像头 WebRTC offer
			routeKey := agent.CanonicalRouteKeyFromWS(deviceID)
			_, offerDevID, _ := agent.CanonicalRouteKey(deviceID)
			camera, _ := msg["camera"].(string)
			sdp, _ := msg["sdp"].(string)
			if camera != "" && sdp != "" {
				sendFn := func(m interface{}) {
					if offerDevID > 0 {
						_ = agent.AgentHub.SendToDevice(offerDevID, m)
					} else {
						_ = agent.AgentHub.Send(routeKey, m)
					}
				}
				if err := wrtc.CameraHub.HandleAgentOffer(routeKey, wrtc.CameraType(camera), sdp, sendFn); err != nil {
					log.Printf("WebRTC agent offer error device=%s camera=%s: %v", routeKey, camera, err)
				}
			}
		case "webrtc_ice_candidate":
			// Agent 发来 ICE candidate
			routeKey := agent.CanonicalRouteKeyFromWS(deviceID)
			camera, _ := msg["camera"].(string)
			if camera != "" {
				if cand, ok := msg["candidate"].(map[string]interface{}); ok {
					raw, _ := json.Marshal(cand)
					_ = wrtc.CameraHub.HandleAgentICE(routeKey, wrtc.CameraType(camera), raw)
				}
			}
		case "webrtc_stop_camera":
			// Agent 主动停止摄像头推流
			routeKey := agent.CanonicalRouteKeyFromWS(deviceID)
			camera, _ := msg["camera"].(string)
			if camera != "" {
				wrtc.CameraHub.RemovePublisher(routeKey, wrtc.CameraType(camera))
				cluster.PublishWebRTCStopCamera(routeKey, wrtc.CameraType(camera))
				log.Printf("WebRTC: agent stopped camera device=%s camera=%s", routeKey, camera)
			}
		case "camera_error":
			// Agent 摄像头启动失败，转发错误给所有等待的 viewer
			routeKey := agent.CanonicalRouteKeyFromWS(deviceID)
			camera, _ := msg["camera"].(string)
			message, _ := msg["message"].(string)
			if camera != "" {
				wrtc.CameraHub.BroadcastError(routeKey, wrtc.CameraType(camera), message)
				cluster.PublishWebRTCCameraError(routeKey, wrtc.CameraType(camera), message)
				log.Printf("WebRTC: camera error device=%s camera=%s: %s", routeKey, camera, message)
			}
		default:
			raw, _ := json.Marshal(msg)
			log.Printf("Agent msg [%s]: %s", deviceID, string(raw))
		}
	})
}

// wsShellOutputPayload 将 Agent 上行的 shell 输出统一为字节，供浏览器二进制帧转发（避免非法 UTF-8 写 Text 失败）。
func wsShellOutputPayload(v interface{}) ([]byte, bool) {
	if v == nil {
		return nil, false
	}
	switch t := v.(type) {
	case string:
		return []byte(t), true
	case []byte:
		return t, true
	case json.Number:
		return []byte(t.String()), true
	default:
		return []byte(fmt.Sprint(t)), true
	}
}

func wsMsgInt64(m map[string]interface{}, k string) int64 {
	v, ok := m[k]
	if !ok {
		return 0
	}
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	case int:
		return int64(x)
	default:
		return 0
	}
}

func wsMsgStr(m map[string]interface{}, k string) string {
	v, ok := m[k]
	if !ok || v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func wsMsgBool(m map[string]interface{}, k string) bool {
	v, ok := m[k]
	if !ok {
		return false
	}
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	default:
		return false
	}
}

func parseInstalledAppsEntries(v interface{}) []agent.InstalledAppEntry {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	out := make([]agent.InstalledAppEntry, 0, len(arr))
	for _, x := range arr {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		pkg, _ := m["package_name"].(string)
		if pkg == "" {
			continue
		}
		vn, _ := m["version_name"].(string)
		label, _ := m["app_label"].(string)
		out = append(out, agent.InstalledAppEntry{
			PackageName: pkg,
			VersionName: vn,
			VersionCode: int(wsMsgInt64(m, "version_code")),
			AppLabel:    label,
			IsSystem:    wsMsgBool(m, "is_system"),
		})
	}
	return out
}

// cameraWsWriteMu guards concurrent writes to a single websocket.Conn.
var cameraWsWriteMu sync.Map // viewerID → *sync.Mutex

func cameraWsWrite(viewerID string, conn *websocket.Conn, msg interface{}) {
	raw, err := json.Marshal(msg)
	if err != nil {
		return
	}
	mu, _ := cameraWsWriteMu.LoadOrStore(viewerID, &sync.Mutex{})
	mu.(*sync.Mutex).Lock()
	defer mu.(*sync.Mutex).Unlock()
	_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	_ = conn.WriteMessage(websocket.TextMessage, raw)
}

// CameraWS handles browser ↔ server WebRTC signaling for camera streams.
// URL: /ws/camera/:deviceId?camera=back|front
func CameraWS(c *gin.Context) {
	param := c.Param("deviceId")
	routeKey, devID, err := agent.CanonicalRouteKey(param)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	camera := wrtc.CameraType(c.DefaultQuery("camera", "back"))
	if camera != wrtc.CameraBack && camera != wrtc.CameraFront {
		c.JSON(http.StatusBadRequest, gin.H{"error": "camera must be back or front"})
		return
	}

	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	viewerID := uuid.New().String()
	log.Printf("CameraWS: viewer=%s device=%s camera=%s connected", viewerID, routeKey, camera)

	sendFn := func(msg interface{}) {
		cameraWsWrite(viewerID, conn, msg)
	}

	// Register viewer first — so error messages from agent can be delivered
	wrtc.CameraHub.RegisterViewer(routeKey, camera, viewerID, sendFn)
	if mime := cluster.LookupWebRTCTrackMime(routeKey, string(camera)); mime != "" {
		wrtc.CameraHub.HandleRemoteTrackReady(routeKey, camera, mime)
	}

	needStartCamera := cluster.IncrCameraViewer(routeKey, string(camera))
	if needStartCamera {
		startMsg := map[string]interface{}{
			"type":        "command",
			"action":      "start_camera",
			"camera":      string(camera),
			"ice_servers": wrtc.ICEServersJSON(),
		}
		if !agent.AgentHub.SendToDevice(devID, startMsg) {
			log.Printf("CameraWS: agent offline device=%s (devID=%d), cannot start_camera", routeKey, devID)
			wrtc.CameraHub.BroadcastError(routeKey, camera, "Agent 未在线，无法启动摄像头")
		} else {
			log.Printf("CameraWS: sent start_camera device=%s camera=%s", routeKey, camera)
		}
	}

	defer func() {
		localRemaining := wrtc.CameraHub.RemoveViewer(routeKey, viewerID, camera)
		globalRemaining := cluster.DecrCameraViewer(routeKey, string(camera))
		cameraWsWriteMu.Delete(viewerID)
		_ = conn.Close()
		log.Printf("CameraWS: viewer=%s device=%s camera=%s disconnected, local=%d global=%d", viewerID, routeKey, camera, localRemaining, globalRemaining)
		// 全集群最后一个 viewer 断开时通知 agent 停止摄像头
		stopMsg := map[string]interface{}{
			"type":   "command",
			"action": "stop_camera",
			"camera": string(camera),
		}
		if cluster.Enabled() {
			if globalRemaining <= 0 {
				_ = agent.AgentHub.SendToDevice(devID, stopMsg)
				log.Printf("CameraWS: sent stop_camera to agent device=%s camera=%s", routeKey, camera)
			}
		} else if localRemaining == 0 {
			_ = agent.AgentHub.SendToDevice(devID, stopMsg)
			log.Printf("CameraWS: sent stop_camera to agent device=%s camera=%s", routeKey, camera)
		}
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		msgType, _ := msg["type"].(string)
		switch msgType {
		case "webrtc_answer":
			// Browser sends answer to server's offer
			sdp, _ := msg["sdp"].(string)
			if sdp != "" {
				if err := wrtc.CameraHub.HandleViewerAnswer(routeKey, camera, viewerID, sdp); err != nil {
					log.Printf("CameraWS HandleViewerAnswer error viewer=%s: %v", viewerID, err)
				}
			}
		case "webrtc_ice_candidate":
			if cand, ok := msg["candidate"].(map[string]interface{}); ok {
				raw, _ := json.Marshal(cand)
				_ = wrtc.CameraHub.HandleViewerICE(routeKey, viewerID, camera, raw)
			}
		case "ping":
			sendFn(map[string]interface{}{"type": "pong"})
		}
	}
}
