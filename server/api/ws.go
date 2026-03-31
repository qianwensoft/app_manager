package api

import (
	"app-manager/agent"
	"app-manager/auth"
	"app-manager/database"
	"app-manager/logcat"
	"app-manager/models"
	"app-manager/screen"
	"app-manager/shell"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
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
	routeKey, err := agent.AgentConnectionKey(param)
	if err != nil {
		log.Printf("ScreenWS: reject param=%q: %v", param, err)
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if devID, ok := agent.ResolveDeviceID(param); ok {
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
	needStart := screen.ViewerJoined(routeKey)
	if needStart {
		_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
			"type":   "command",
			"action": "start_screen",
		})
		log.Printf("Sent start_screen to agent [%s] (first viewer)", routeKey)
	}
	defer func() {
		log.Printf("Browser disconnected from screen param=%s routeKey=%s", param, routeKey)
		screen.ScreenHub.UnregisterViewer(routeKey, conn)
		screen.ViewerLeft(routeKey)
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

func LogcatWS(c *gin.Context) {
	param := c.Param("deviceId")
	routeKey, err := agent.AgentConnectionKey(param)
	if err != nil {
		log.Printf("LogcatWS: reject param=%q: %v", param, err)
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	filter := c.Query("filter")
	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	log.Printf("Browser connected to logcat param=%s routeKey=%s", param, routeKey)
	logcat.LogcatHub.Register(routeKey, conn)

	// Tell agent to start logcat
	agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "start_logcat",
		"data":   map[string]interface{}{"filter": filter},
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

	// Keep connection alive
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
	done := agent.AgentHub.Register(deviceID, conn)
	<-done
	agent.SyncDeviceStatus(deviceID, false)
}

func init() {
	agent.OnAgentDisconnect = func(deviceID string) {
		screen.AbortServerRecording(deviceID)
		screen.ResetCaptureRoute(deviceID)
		screen.ScreenHub.CloseAllForDevice(deviceID)
	}
	// Handle uplink messages from agents
	agent.SetMessageHandler(func(deviceID string, msg map[string]interface{}) {
		msgType, _ := msg["type"].(string)
		switch msgType {
		case "screen_frame":
			screen.MarkAgentCaptureHeld(deviceID)
			raw, err := json.Marshal(msg)
			if err == nil {
				screen.ScreenHub.BroadcastText(deviceID, raw)
			}
			if data, ok := msg["data"].(map[string]interface{}); ok {
				screen.AppendRecordingFrame(deviceID, data)
			}
		case "screen_meta", "screen_pong":
			raw, err := json.Marshal(msg)
			if err == nil {
				screen.ScreenHub.BroadcastText(deviceID, raw)
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
			}
		case "logcat_output":
			if data, ok := msg["data"].(string); ok {
				logcat.LogcatHub.SendToClient(deviceID, []byte(data))
			}
		case "device_event":
			eventType, _ := msg["eventType"].(string)
			eventData, _ := msg["eventData"].(string)
			if eventType != "" {
				if devID, ok := agent.ResolveDeviceID(deviceID); ok {
					database.DB.Create(&models.DeviceEvent{
						DeviceID:  devID,
						EventType: eventType,
						EventData: eventData,
					})
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

