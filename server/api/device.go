package api

import (
	"app-manager/adb"
	"app-manager/agent"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func getADB() *adb.Client {
	return adb.NewClient(config.C.ADB.Path, config.C.ADB.Timeout)
}

func randomAgentRequestID() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// serialUsableWithAdb 为 false 时表示扫码占位设备（serial 形如 agent-xxx），不能执行 adb -s。
func serialUsableWithAdb(serial string) bool {
	return serial != "" && !strings.HasPrefix(serial, "agent-")
}

// ensureADBConnected 确保 serial 对应的 adb 连接活跃。
// 对于无线 ADB（serial 为 ip:port 格式），先执行 adb connect 再检查状态。
// 返回可用的 serial（可能与入参相同）以及是否需要事后 disconnect。
func ensureADBConnected(serial string) (activeSerial string, needDisconnect bool, err error) {
	cli := getADB()

	// USB serial：不含 ":"，直接检查状态
	if !strings.Contains(serial, ":") {
		st, e := cli.GetState(serial)
		if e != nil || st != "device" {
			return "", false, fmt.Errorf("设备 %s 不在线（state=%s）", serial, st)
		}
		return serial, false, nil
	}

	// 无线 ADB（ip:port）：先 connect，不管当前是否在线
	parts := strings.SplitN(serial, ":", 2)
	port, convErr := strconv.Atoi(parts[1])
	if convErr != nil {
		return "", false, fmt.Errorf("serial 格式错误: %s", serial)
	}
	out, connErr := cli.ConnectTCP(parts[0], port)
	if connErr != nil || (!strings.Contains(out, "connected") && !strings.Contains(out, "already connected")) {
		return "", false, fmt.Errorf("adb connect %s 失败: %s", serial, out)
	}
	return serial, true, nil
}

func ListDevices(c *gin.Context) {
	var devices []models.Device
	q := database.DB
	if c.GetString("role") != "admin" {
		uid := c.GetUint("user_id")
		q = q.Where("user_id = ?", uid)
	}
	q.Find(&devices)
	c.JSON(http.StatusOK, gin.H{"data": devices})
}

func CreateDevice(c *gin.Context) {
	var req struct {
		Serial string `json:"serial" binding:"required"`
		Name   string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	uid := c.GetUint("user_id")
	now := time.Now()
	device := models.Device{
		UserID:     &uid,
		Serial:     req.Serial,
		Name:       req.Name,
		LastSeenAt: &now,
		CreatedAt:  now,
	}
	database.DB.Create(&device)
	c.JSON(http.StatusOK, gin.H{"data": device})
}

func GetDevice(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": device})
}

func UpdateDevice(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string  `json:"name"`
		GroupName   *string `json:"group_name"`   // nil=不传此项；指针非 nil 时可更新为空字符串（清空分组等）
		ServerAlias *string `json:"server_alias"` // 同上
		AgentToken  *string `json:"agent_token"`  // null=不改；""=清空；非空=绑定（须全局唯一）
	}
	c.ShouldBindJSON(&req)
	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	profileTouch := false
	if req.GroupName != nil {
		updates["group_name"] = *req.GroupName
		profileTouch = true
	}
	if req.ServerAlias != nil {
		updates["server_alias"] = *req.ServerAlias
		profileTouch = true
	}
	if req.AgentToken != nil {
		tok := strings.TrimSpace(*req.AgentToken)
		if tok != "" {
			var cnt int64
			database.DB.Model(&models.Device{}).Where("agent_token = ? AND id != ?", tok, id).Count(&cnt)
			if cnt > 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "该 Agent Token 已被其他设备使用"})
				return
			}
		}
		updates["agent_token"] = tok
	}
	if len(updates) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
		return
	}
	if err := database.DB.Model(&models.Device{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if profileTouch {
		if uid, err := strconv.ParseUint(id, 10, 64); err == nil && uid > 0 {
			agent.PushDeviceProfileToAgent(uint(uid))
			agent.PublishDeviceProfileUpdated(uint(uid))
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func DeleteDevice(c *gin.Context) {
	database.DB.Delete(&models.Device{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func ScanDevices(c *gin.Context) {
	client := getADB()
	serials, err := client.ListDevices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	now := time.Now()
	for _, serial := range serials {
		var device models.Device
		result := database.DB.Where("serial = ?", serial).First(&device)
		if result.Error != nil {
			device = models.Device{Serial: serial, Name: serial, Status: "online", LastSeenAt: &now}
			database.DB.Create(&device)
		} else {
			database.DB.Model(&device).Updates(map[string]interface{}{"status": "online", "last_seen_at": now})
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": serials})
}

func ConnectDevice(c *gin.Context) {
	var req struct {
		IP   string `json:"ip" binding:"required"`
		Port int    `json:"port"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Port == 0 {
		req.Port = 5555
	}
	client := getADB()
	out, err := client.ConnectTCP(req.IP, req.Port)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 连接成功（含 "already connected"）时更新对应设备状态
	outLow := strings.ToLower(out)
	if strings.Contains(outLow, "connected") && !strings.Contains(outLow, "failed") && !strings.Contains(outLow, "cannot") && !strings.Contains(outLow, "error") {
		serial := fmt.Sprintf("%s:%d", req.IP, req.Port)
		now := time.Now()
		database.DB.Model(&models.Device{}).
			Where("ip = ? OR serial = ?", req.IP, serial).
			Updates(map[string]interface{}{
				"status":              "online",
				"last_seen_at":        now,
				"wireless_adb_port":   req.Port,
				"wireless_adb_serial": "",
			})
	}

	c.JSON(http.StatusOK, gin.H{"message": out})
}

func GetDeviceInfo(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	// 如果是 Agent 连接的设备，直接返回数据库信息（含 Agent 心跳上报的网络/Wi‑Fi）
	if device.AgentConnected {
		c.JSON(http.StatusOK, gin.H{"data": map[string]interface{}{
			"model":             device.Model,
			"brand":             device.Brand,
			"os_version":        device.OSVersion,
			"sdk_version":       device.SDKVersion,
			"resolution":        device.Resolution,
			"ip_address":        device.IP,
			"battery":           device.Battery,
			"cpu_usage":         device.CPUUsage,
			"memory_used":       device.MemoryUsed,
			"memory_total":      device.MemoryTotal,
			"total_memory":      device.TotalMemory,
			"total_storage":     device.TotalStorage,
			"storage_used":      device.StorageUsed,
			"network_type":      device.NetworkType,
			"wifi_ssid":         device.WifiSSID,
			"wifi_signal":       device.WifiSignal,
			"wifi_speed":        device.WifiSpeed,
			"network_connected": device.NetworkConnected,
		}})
		return
	}

	// ADB 连接的设备，通过 ADB 获取信息
	client := getADB()
	info, err := client.GetDeviceInfo(device.Serial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&device).Updates(map[string]interface{}{
		"model": info.Model, "brand": info.Brand,
		"os_version": info.OSVersion, "sdk_version": info.SDKVersion,
		"cpu_info": info.CPUInfo, "total_memory": info.TotalMemory,
		"total_storage": info.TotalStorage, "resolution": info.Resolution,
		"ip_address": info.IPAddress, "last_seen_at": time.Now(),
	})
	c.JSON(http.StatusOK, gin.H{"data": info})
}

func parseDeviceInstalledAppsJSON(raw string) []agent.InstalledAppEntry {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []agent.InstalledAppEntry{}
	}
	var apps []agent.InstalledAppEntry
	if err := json.Unmarshal([]byte(raw), &apps); err != nil {
		return []agent.InstalledAppEntry{}
	}
	return apps
}

func GetDeviceApps(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	// Agent 在线：列表来自端上同步（Web 点「刷新」触发经 Agent 拉取并写入缓存）
	if device.AgentConnected {
		c.JSON(http.StatusOK, gin.H{"data": parseDeviceInstalledAppsJSON(device.AgentInstalledAppsJSON)})
		return
	}
	// 有可用 ADB 串号时优先走 ADB（与 Agent 缓存无关）
	if serialUsableWithAdb(device.Serial) {
		client := getADB()
		packages, err := client.ListPackages(device.Serial)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": packages})
		return
	}
	// 纯 Agent 占位设备离线：仍展示上次 Agent 上报的缓存
	c.JSON(http.StatusOK, gin.H{"data": parseDeviceInstalledAppsJSON(device.AgentInstalledAppsJSON)})
}

// RefreshDeviceAppsFromAgent 经在线 Agent 枚举已安装应用并写入设备缓存。
func RefreshDeviceAppsFromAgent(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线，无法刷新已安装应用"})
		return
	}
	rid := randomAgentRequestID()
	ch := agent.RegisterInstalledAppsWait(rid)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "list_installed_apps",
		"data": map[string]interface{}{
			"request_id": rid,
		},
	})
	select {
	case rep := <-ch:
		if rep.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": rep.Err})
			return
		}
		raw, jerr := json.Marshal(rep.Apps)
		if jerr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": jerr.Error()})
			return
		}
		database.DB.Model(device).Update("agent_installed_apps_json", string(raw))
		c.JSON(http.StatusOK, gin.H{"data": rep.Apps})
	case <-time.After(45 * time.Second):
		agent.ForgetInstalledAppsWait(rid)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "获取已安装应用超时"})
	}
}

// PullInstalledApkFromAgent 经在线 Agent 读取已安装包的 APK（多 split 时为 zip）并下载到浏览器。
func PullInstalledApkFromAgent(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		PackageName string `json:"package_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pkg := strings.TrimSpace(req.PackageName)
	if pkg == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty package_name"})
		return
	}
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线，无法导出 APK"})
		return
	}
	rid := randomAgentRequestID()
	ch := agent.RegisterPulledApkWait(rid, device.ID)
	uploadPath := "/api/agent/pulled-apk-upload?request_id=" + url.QueryEscape(rid)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "export_installed_apk",
		"data": map[string]interface{}{
			"request_id":   rid,
			"package_name": pkg,
			"upload_path":  uploadPath,
		},
	})
	select {
	case rep := <-ch:
		if rep.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": rep.Err})
			return
		}
		if rep.Path == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "无文件"})
			return
		}
		defer os.Remove(rep.Path)
		fname := rep.FileName
		if fname == "" {
			fname = fallbackPulledApkFilename(pkg, rep.Path)
		}
		c.Header("Content-Type", "application/octet-stream")
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fname))
		c.File(rep.Path)
	case <-time.After(12 * time.Minute):
		agent.ForgetPulledApkWait(rid)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "导出 APK 超时（体积大或设备权限不足）"})
	}
}

func fallbackPulledApkFilename(pkg, path string) string {
	base := strings.Map(func(r rune) rune {
		if r <= 31 || strings.ContainsRune("/\\:*?\"<>|", r) {
			return '_'
		}
		return r
	}, pkg)
	if base == "" {
		base = "app"
	}
	ext := ".apk"
	fh, err := os.Open(path)
	if err == nil {
		head := make([]byte, 4)
		_, _ = fh.Read(head)
		_ = fh.Close()
		if len(head) >= 4 && head[0] == 'P' && head[1] == 'K' && head[2] == 0x03 && head[3] == 0x04 {
			ext = "_splits.zip"
		}
	}
	return base + ext
}

// ExportInstalledApkToServer 从设备导出 APK 并保存到服务器 APK 管理系统（不下载到浏览器）
func ExportInstalledApkToServer(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		PackageName string `json:"package_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 package_name"})
		return
	}
	pkg := strings.TrimSpace(req.PackageName)
	if pkg == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty package_name"})
		return
	}
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线，无法导出 APK"})
		return
	}

	rid := randomAgentRequestID()
	ch := agent.RegisterPulledApkWait(rid, device.ID)
	uploadPath := "/api/agent/pulled-apk-upload?request_id=" + url.QueryEscape(rid)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "export_installed_apk",
		"data": map[string]interface{}{
			"request_id":   rid,
			"package_name": pkg,
			"upload_path":  uploadPath,
		},
	})

	select {
	case rep := <-ch:
		if rep.Err != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": rep.Err})
			return
		}
		if rep.Path == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "无文件"})
			return
		}
		defer os.Remove(rep.Path)

		fname := rep.FileName
		if fname == "" {
			fname = fallbackPulledApkFilename(pkg, rep.Path)
		}

		// 读取文件内容
		fileData, err := os.ReadFile(rep.Path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败: " + err.Error()})
			return
		}

		// 创建 APK 记录并保存文件
		app := models.App{
			Name:        fname,
			PackageName: pkg,
			VersionName: "", // 可以后续解析 APK 获取
			VersionCode: 0,
			FileSize:    int64(len(fileData)),
		}

		// 保存文件到存储路径
		storagePath := config.C.Storage.Path
		if storagePath == "" {
			storagePath = "./uploads"
		}
		destPath := filepath.Join(storagePath, fname)

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建目录失败: " + err.Error()})
			return
		}

		if err := os.WriteFile(destPath, fileData, 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败: " + err.Error()})
			return
		}

		app.FilePath = destPath

		// 保存到数据库
		if err := database.DB.Create(&app).Error; err != nil {
			os.Remove(destPath) // 清理文件
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存数据库失败: " + err.Error()})
			return
		}

		logAudit(c, "导出 APK", fmt.Sprintf("从设备 %s 导出应用 %s 到 APK 管理", device.Name, pkg), nil)
		c.JSON(http.StatusOK, gin.H{"message": "导出成功", "app": app})

	case <-time.After(5 * time.Minute):
		agent.ForgetPulledApkWait(rid)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "导出 APK 超时（体积大或设备权限不足）"})
	}
}

// RefreshAgentDeviceInfoFromAgent 通知在线 Agent 立即上报 device_info（含 Wi‑Fi SSID 等），写入库后返回最新设备行。
func RefreshAgentDeviceInfoFromAgent(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线，无法刷新端上网络与状态"})
		return
	}
	rid := randomAgentRequestID()
	ch := agent.RegisterDeviceInfoPushWait(rid)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "push_device_info",
		"data": map[string]interface{}{
			"request_id": rid,
		},
	})
	select {
	case <-ch:
		var d models.Device
		if err := database.DB.First(&d, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": d})
	case <-time.After(15 * time.Second):
		agent.ForgetDeviceInfoPushWait(rid)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Agent 上报设备信息超时"})
	}
}

// OpenWirelessAdbOnAgent 通知在线 Agent 打开系统「无线调试」设置页。
func OpenWirelessAdbOnAgent(c *gin.Context) {
	if !sendAgentCommand(c, "open_wireless_adb", nil) {
		return
	}
	logAudit(c, "无线 ADB", fmt.Sprintf("设备 %s 已下发打开无线调试", c.Param("id")), nil)
	c.JSON(http.StatusOK, gin.H{"message": "已通知 Agent 打开无线调试设置"})
}

// TriggerAgentMenuOnAgent 远程触发 Agent 菜单 intent_action（如无线 ADB 内置菜单）。
func TriggerAgentMenuOnAgent(c *gin.Context) {
	var req struct {
		IntentAction string `json:"intent_action" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 intent_action"})
		return
	}
	action := strings.TrimSpace(req.IntentAction)
	if action == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "intent_action 不能为空"})
		return
	}
	if !sendAgentCommand(c, "trigger_agent_menu", map[string]interface{}{
		"intent_action": action,
	}) {
		return
	}
	logAudit(c, "Agent 菜单", fmt.Sprintf("设备 %s 触发菜单 %s", c.Param("id"), action), nil)
	c.JSON(http.StatusOK, gin.H{"message": "已下发菜单触发", "intent_action": action})
}

func sendAgentCommand(c *gin.Context, action string, data map[string]interface{}) bool {
	device := getDeviceByID(c)
	if device == nil {
		return false
	}
	devID := device.ID
	if !agent.AgentHub.SendToDevice(devID, map[string]interface{}{
		"type":   "command",
		"action": action,
		"data":   data,
	}) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线，无法下发命令"})
		return false
	}
	return true
}

// PublishWirelessAdbGuideAck STOMP 推送无线 ADB 扫码回执到 Web。
func PublishWirelessAdbGuideAck(deviceID uint, tokenMatched bool, scannedDeviceID int64) {
	payload, _ := json.Marshal(map[string]interface{}{
		"type": "wireless_adb_guide_ack",
		"data": map[string]interface{}{
			"device_id":         deviceID,
			"scanned_device_id": scannedDeviceID,
			"token_matched":     tokenMatched,
		},
	})
	stomp.DefaultHub.PublishJSON(fmt.Sprintf("/topic/device/%d/wireless-adb", deviceID), string(payload))
}

// ADB 快捷操作
func AdbReboot(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	if err := getADB().Reboot(device.Serial); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func AdbScreenshot(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}

	var pngData []byte
	var screenshotErr error

	// 优先：Agent 在线时由端上 MediaProjection 截图
	if routeKey, keyErr := agent.AgentConnectionKey(c.Param("id")); keyErr == nil && agent.AgentHub.IsConnected(routeKey) {
		reqID := newScreenshotRequestID()
		ch := agent.RegisterScreenshotWait(reqID)
		_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
			"type":   "command",
			"action": "capture_screenshot",
			"data":   map[string]interface{}{"request_id": reqID},
		})
		select {
		case res := <-ch:
			if res.Err != "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": res.Err})
				return
			}
			if len(res.PNG) == 0 {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "截图数据为空"})
				return
			}
			pngData = res.PNG
		case <-time.After(25 * time.Second):
			agent.ForgetScreenshotWait(reqID)
			c.JSON(http.StatusGatewayTimeout, gin.H{"error": "截图超时。请确认 Agent 在线，并先在 Web 端打开「屏幕查看」完成录屏授权后再试。"})
			return
		}
	} else {
		if !serialUsableWithAdb(device.Serial) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "当前设备仅通过 Agent 接入：请保持 Agent 在线并在 Web 打开「屏幕查看」授权后使用截图；或改用 USB/网络 ADB 绑定真实串号后使用本接口。",
			})
			return
		}
		tmp, err := os.CreateTemp("", "am_screenshot_*.png")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		tmpPath := tmp.Name()
		_ = tmp.Close()
		defer os.Remove(tmpPath)

		if err := getADB().Screenshot(device.Serial, tmpPath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		pngData, screenshotErr = os.ReadFile(tmpPath)
		if screenshotErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": screenshotErr.Error()})
			return
		}
	}

	// 保存到服务器
	dir := filepath.Join(config.C.Storage.Path, "device_media", fmt.Sprintf("device_%d", device.ID))
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	name := fmt.Sprintf("screenshot_%s_%s.png", device.Serial, time.Now().Format("20060102_150405"))
	savePath := filepath.Join(dir, fmt.Sprintf("%d_%d.png", device.ID, time.Now().UnixMilli()))
	if err := os.WriteFile(savePath, pngData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	row := models.DeviceMedia{
		DeviceID:    device.ID,
		Category:    "screenshot",
		FileName:    name,
		FilePath:    savePath,
		FileSize:    int64(len(pngData)),
		ContentType: "image/png",
	}
	if err := database.DB.Create(&row).Error; err != nil {
		_ = os.Remove(savePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"id": row.ID, "device_id": row.DeviceID, "category": row.Category,
		"file_name": row.FileName, "file_size": row.FileSize,
		"content_type": row.ContentType, "created_at": row.CreatedAt,
	}})
	logAudit(c, "截图", fmt.Sprintf("设备 %s 截图并存档", device.Name), &device.ID)
}

func newScreenshotRequestID() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func AdbKeyEvent(c *gin.Context) {
	var req struct {
		Keycode int `json:"keycode" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	getADB().KeyEvent(device.Serial, req.Keycode)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// AgentNavKey 通过 Agent WebSocket 触发无障碍 performGlobalAction
// （back / home / recents / notifications / quick_settings / power_dialog / lock_screen），
// 用于纯 Agent 设备无 ADB 时的虚拟按键。无 Agent 在线返回 503，便于前端回退到 ADB keyevent。
func AgentNavKey(c *gin.Context) {
	var req struct {
		Key string `json:"key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if getDeviceByID(c) == nil {
		return
	}
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}
	if sendErr := agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "nav_key",
		"data": map[string]interface{}{
			"key": req.Key,
		},
	}); sendErr != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "下发失败: " + sendErr.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func AdbInputText(c *gin.Context) {
	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	getADB().InputText(device.Serial, req.Text)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func AdbPush(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}

func AdbPull(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}

func AdbStartApp(c *gin.Context) {
	var req struct {
		Package string `json:"package" binding:"required"`
	}
	c.ShouldBindJSON(&req)
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	getADB().StartApp(device.Serial, req.Package)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func AdbStopApp(c *gin.Context) {
	var req struct {
		Package string `json:"package" binding:"required"`
	}
	c.ShouldBindJSON(&req)
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	getADB().StopApp(device.Serial, req.Package)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func AdbClearApp(c *gin.Context) {
	var req struct {
		Package string `json:"package" binding:"required"`
	}
	c.ShouldBindJSON(&req)
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	getADB().ClearApp(device.Serial, req.Package)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func AdbGrantPermission(c *gin.Context) {
	var req struct {
		Package    string `json:"package" binding:"required"`
		Permission string `json:"permission" binding:"required"`
	}
	c.ShouldBindJSON(&req)
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	getADB().GrantPermission(device.Serial, req.Package, req.Permission)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func AdbListFiles(c *gin.Context) {
	path := c.DefaultQuery("path", "/sdcard")
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	out, err := getADB().ListFiles(device.Serial, path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func getDeviceByID(c *gin.Context) *models.Device {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return nil
	}
	return &device
}

func AdbInputTouch(c *gin.Context) {
	var req struct {
		Action   string `json:"action"`
		X        int    `json:"x"`
		Y        int    `json:"y"`
		X2       int    `json:"x2"`
		Y2       int    `json:"y2"`
		Duration int    `json:"duration"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	device := getDeviceByID(c)
	if device == nil {
		return
	}

	var out string
	var err error
	if req.Action == "tap" {
		out, err = getADB().InputTap(device.Serial, req.X, req.Y)
	} else if req.Action == "swipe" {
		out, err = getADB().InputSwipe(device.Serial, req.X, req.Y, req.X2, req.Y2, req.Duration)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"output": out})
}

func AdbPushFile(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tmpPath := filepath.Join(os.TempDir(), file.Filename)
	if err := c.SaveUploadedFile(file, tmpPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer os.Remove(tmpPath)

	remotePath := "/sdcard/Download/" + file.Filename
	if _, err := getADB().Push(device.Serial, tmpPath, remotePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	mimeType := mime.TypeByExtension(filepath.Ext(file.Filename))
	cmd := fmt.Sprintf("am start -a android.intent.action.VIEW -d file://%s -t %s", remotePath, mimeType)
	getADB().Shell(device.Serial, cmd)

	c.JSON(http.StatusOK, gin.H{"path": remotePath})
}

func StartAudioRecording(c *gin.Context) {
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "start_audio_recording",
	})
	logAudit(c, "开始录音", fmt.Sprintf("设备 %s 开始录音", c.Param("id")), nil)
	c.JSON(http.StatusOK, gin.H{"message": "录音已开始"})
}

func StopAudioRecording(c *gin.Context) {
	routeKey, err := agent.AgentConnectionKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":   "command",
		"action": "stop_audio_recording",
	})
	logAudit(c, "停止录音", fmt.Sprintf("设备 %s 停止录音", c.Param("id")), nil)
	c.JSON(http.StatusOK, gin.H{"message": "录音已停止"})
}

func GetDeviceGroups(c *gin.Context) {
	var groups []string
	database.DB.Model(&models.Device{}).Distinct("group_name").Where("group_name != ''").Pluck("group_name", &groups)
	c.JSON(http.StatusOK, gin.H{"data": groups})
}

// AdbConnectByAgentIP 用设备 Agent 心跳上报的 IP + 指定端口，让服务器发起 adb connect。
// 若请求体包含 ip 字段则优先使用（配对后直接用配对结果的 IP 连接）。
// 连接成功后将 serial 更新到设备记录，并返回 serial 供前端后续操作。
func AdbConnectByAgentIP(c *gin.Context) {
	var req struct {
		Port int    `json:"port"`
		IP   string `json:"ip"` // 可选：覆盖 DB 中的 device.IP（如配对后直接传）
	}
	_ = c.ShouldBindJSON(&req)
	if req.Port == 0 {
		req.Port = 5555
	}

	device := getDeviceByID(c)
	if device == nil {
		return
	}

	ip := strings.TrimSpace(req.IP)
	if ip == "" {
		ip = strings.TrimSpace(device.IP)
	}
	if ip == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "设备尚未上报 IP 地址，请确认 Agent 已在线并完成心跳"})
		return
	}

	serial := fmt.Sprintf("%s:%d", ip, req.Port)
	cli := getADB()
	noteAdbConnectAttempt(serial)
	out, err := cli.ConnectTCP(ip, req.Port)
	if err != nil {
		_ = cli.Disconnect(serial)
		clearAdbConnectingNote(serial)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "output": out})
		return
	}

	// adb connect 失败时 exit=0 但输出含 "failed"/"cannot"
	outLow := strings.ToLower(out)
	if strings.Contains(outLow, "failed") || strings.Contains(outLow, "cannot") || strings.Contains(outLow, "error") {
		_ = cli.Disconnect(serial)
		clearAdbConnectingNote(serial)
		c.JSON(http.StatusBadRequest, gin.H{"error": out, "ip": ip, "port": req.Port})
		return
	}

	st := waitAdbSerialState(cli, serial, 6*time.Second)
	if st != "device" {
		_ = cli.Disconnect(serial)
		clearAdbConnectingNote(serial)
		msg := out
		if st == "connecting" {
			msg = "连接超时：设备未在限定时间内进入 device 状态，请确认无线调试已开启且端口正确"
		} else if st != "" && st != "no_device" {
			msg = fmt.Sprintf("连接未就绪（adb state=%s）", st)
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": msg, "ip": ip, "port": req.Port, "state": st, "output": out})
		return
	}
	clearAdbConnectingNote(serial)
	adbKeepaliveClearBackoff(serial)

	// 连接成功：仅持久化端口；IP 每次取 Agent 上报
	now := time.Now()
	dbUpdates := map[string]interface{}{
		"wireless_adb_port":   req.Port,
		"wireless_adb_serial": "",
		"status":              "online",
		"last_seen_at":        now,
	}
	if !serialUsableWithAdb(device.Serial) || strings.Contains(device.Serial, ":") {
		dbUpdates["serial"] = serial
	}
	_ = database.DB.Model(&models.Device{}).Where("id = ?", device.ID).Updates(dbUpdates).Error

	logAudit(c, "ADB 无线连接", fmt.Sprintf("设备 %d adb connect %s → %s", device.ID, serial, out), &device.ID)
	c.JSON(http.StatusOK, gin.H{"message": out, "ip": ip, "port": req.Port, "serial": serial})
}

// AdbPairByAgentIP 用 Agent 上报的 IP + 配对端口 + 配对码，让服务器发起 adb pair。
// 适用于 Android 11+ 无线调试「使用配对码配对设备」。
// 配对成功后还需调用 AdbConnectByAgentIP（connect 端口与 pair 端口不同）完成连接。
func AdbPairByAgentIP(c *gin.Context) {
	var req struct {
		Port int    `json:"port" binding:"required"`
		Code string `json:"code" binding:"required"`
		IP   string `json:"ip"` // 可选：QR 码直接携带 IP 时使用，覆盖 DB 中的 device.IP
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数：port（配对端口）和 code（6位配对码）均为必填"})
		return
	}

	device := getDeviceByID(c)
	if device == nil {
		return
	}
	ip := strings.TrimSpace(req.IP)
	if ip == "" {
		ip = strings.TrimSpace(device.IP)
	}
	if ip == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "设备尚未上报 IP 地址，请确认 Agent 已在线并完成心跳"})
		return
	}

	out, err := getADB().PairTCP(ip, req.Port, req.Code)
	clean := cleanPairOutput(out)
	log.Printf("AdbPairByAgentIP: adb pair %s:%d code=%s → err=%v output=%q", ip, req.Port, req.Code, err, clean)
	if err != nil {
		outLow := strings.ToLower(clean)
		var reason string
		switch {
		case strings.Contains(outLow, "protocol fault"), strings.Contains(outLow, "connection refused"), strings.Contains(outLow, "no route"):
			reason = fmt.Sprintf("无法连接到 %s:%d，请确认设备已开启无线调试，且配对端口填写正确", ip, req.Port)
		case strings.Contains(outLow, "failed to pair"), strings.Contains(outLow, "bad code"), strings.Contains(outLow, "incorrect"):
			reason = "配对码不正确，请重新查看手机上显示的6位配对码"
		default:
			reason = "配对失败: " + clean
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": reason, "output": clean})
		return
	}
	// exit=0 即成功
	logAudit(c, "ADB 无线配对", fmt.Sprintf("设备 %d adb pair %s:%d → %s", device.ID, ip, req.Port, clean), &device.ID)
	c.JSON(http.StatusOK, gin.H{"message": clean, "ip": ip, "port": req.Port})
}

// GrantAgentReadLogs 通过 ADB 为 Agent 包授予 android.permission.READ_LOGS 权限。
// 该权限是 signature/privileged 级别，普通安装无法自行申请，只能通过 adb pm grant 授权。
// 授权后 Agent 才能通过 logcat 命令读取其他 App 的日志。
//
// 连接策略（按优先级）：
//  1. 设备已有真实 ADB serial 且 adb get-state == device → 直接用
//  2. 仅 Agent 连接 → 用 Agent 心跳上报的 IP 自动执行 adb connect <ip>:5555，
//     授权完成后自动 disconnect（临时连接，不影响设备记录）。
func GrantAgentReadLogs(c *gin.Context) {
	const (
		agentPkg   = "com.appmanager.agent"
		permission = "android.permission.READ_LOGS"
	)

	device := getDeviceByID(c)
	if device == nil {
		return
	}

	serial, needDisconnect, herr := resolveDeviceAdbSerial(device)
	if herr != nil {
		c.JSON(herr.code, gin.H{"error": herr.msg, "output": herr.output})
		return
	}

	adbCli := getADB()
	out, err := adbCli.Shell(serial, "pm", "grant", agentPkg, permission)
	if needDisconnect {
		_ = adbCli.Disconnect(serial)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "授权失败: " + err.Error(), "output": out})
		return
	}
	logAudit(c, "授权 READ_LOGS", fmt.Sprintf("设备 %d adb pm grant %s %s (serial=%s)", device.ID, agentPkg, permission, serial), &device.ID)
	c.JSON(http.StatusOK, gin.H{"message": "READ_LOGS 权限授权成功，重启 Agent 后生效", "output": out})
}

// adbGrantError 携带 HTTP 状态与提示，供 resolveDeviceAdbSerial 把连接失败原因透传给前端。
type adbGrantError struct {
	code   int
	msg    string
	output string
}

func (e *adbGrantError) Error() string { return e.msg }

// resolveDeviceAdbSerial 复用 READ_LOGS 授权的连接策略，返回一个当前可用的 ADB serial：
//  1. 设备已有真实 ADB serial 且在线 → 直接用
//  2. 仅 Agent 连接 → 用 Agent 心跳上报的 IP 临时 adb connect <ip>:5555（needDisconnect=true）
//
// 调用方在 Shell 执行后，若 needDisconnect 为真须 Disconnect 释放临时连接。
func resolveDeviceAdbSerial(device *models.Device) (serial string, needDisconnect bool, herr *adbGrantError) {
	dbSerial := strings.TrimSpace(device.Serial)

	if serialUsableWithAdb(dbSerial) {
		s, nd, err := ensureADBConnected(dbSerial)
		if err == nil {
			return s, nd, nil
		}
		log.Printf("resolveDeviceAdbSerial: serial %s not usable: %v", dbSerial, err)
	}

	ip := strings.TrimSpace(device.IP)
	if ip == "" {
		return "", false, &adbGrantError{
			code: http.StatusServiceUnavailable,
			msg:  "设备 ADB 未在线，且 Agent 未上报 IP；请先在「无线 ADB ▾→第二步」完成连接后再授权",
		}
	}
	s, nd, err := ensureADBConnected(fmt.Sprintf("%s:5555", ip))
	if err != nil {
		return "", false, &adbGrantError{
			code:   http.StatusServiceUnavailable,
			msg:    fmt.Sprintf("adb connect %s:5555 失败，请先在「无线 ADB ▾→第二步」输入端口并点连接", ip),
			output: err.Error(),
		}
	}
	return s, nd, nil
}

// GrantAgentAccessibility 经 ADB 自助开启 Agent 无障碍服务，免去用户手动进设置页：
//  1. pm grant WRITE_SECURE_SETTINGS（development 权限，声明后可 grant）
//  2. settings put secure enabled_accessibility_services <服务>
//  3. settings put secure accessibility_enabled 1
//
// 授权后虚拟导航键（back/home/recents）即可经无障碍 performGlobalAction 执行。
func GrantAgentAccessibility(c *gin.Context) {
	const (
		agentPkg    = "com.appmanager.agent"
		secureSet   = "android.permission.WRITE_SECURE_SETTINGS"
		a11yService = "com.appmanager.agent/com.appmanager.agent.service.TouchAccessibilityService"
	)

	device := getDeviceByID(c)
	if device == nil {
		return
	}

	serial, needDisconnect, herr := resolveDeviceAdbSerial(device)
	if herr != nil {
		c.JSON(herr.code, gin.H{"error": herr.msg, "output": herr.output})
		return
	}

	adbCli := getADB()
	defer func() {
		if needDisconnect {
			_ = adbCli.Disconnect(serial)
		}
	}()

	// 1) 授予 WRITE_SECURE_SETTINGS
	if out, err := adbCli.Shell(serial, "pm", "grant", agentPkg, secureSet); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "授予 WRITE_SECURE_SETTINGS 失败: " + err.Error(), "output": out})
		return
	}

	// 2) 把本应用无障碍服务并入已启用列表（保留系统已有的其它无障碍服务）
	existing, _ := adbCli.Shell(serial, "settings", "get", "secure", "enabled_accessibility_services")
	existing = strings.TrimSpace(existing)
	if existing == "null" {
		existing = ""
	}
	merged := a11yService
	if existing != "" && !strings.Contains(existing, a11yService) {
		merged = existing + ":" + a11yService
	} else if existing != "" {
		merged = existing
	}
	if out, err := adbCli.Shell(serial, "settings", "put", "secure", "enabled_accessibility_services", merged); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入无障碍服务列表失败: " + err.Error(), "output": out})
		return
	}

	// 3) 打开无障碍总开关
	if out, err := adbCli.Shell(serial, "settings", "put", "secure", "accessibility_enabled", "1"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "开启无障碍总开关失败: " + err.Error(), "output": out})
		return
	}

	logAudit(c, "授权 无障碍", fmt.Sprintf("设备 %d 自助开启无障碍 (serial=%s)", device.ID, serial), &device.ID)
	c.JSON(http.StatusOK, gin.H{"message": "无障碍已开启，虚拟按键可直接使用"})
}

// GetAdbStatus 查询设备 USB 与无线 ADB 连接状态（轻量探测，不执行 reconnect）。
func GetAdbStatus(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	type Entry struct {
		Serial string `json:"serial"`
		IP     string `json:"ip,omitempty"`
		Port   int    `json:"port,omitempty"`
		State  string `json:"state"` // device / offline / unauthorized / no_device / not_configured
	}
	usb := Entry{}
	wireless := Entry{}
	cli := getADB()

	// USB serial：不含 ":" 且不是 agent- 前缀
	if serialUsableWithAdb(device.Serial) && !strings.Contains(device.Serial, ":") {
		usb.Serial = device.Serial
		usb.State = lookupAdbSerialState(cli, device.Serial)
	} else {
		usb.State = "not_configured"
	}

	// 无线 ADB：仅查询 adb server 已有连接状态，避免每次检测都 connect 导致长期卡在 connecting
	port := wirelessAdbPort(device)
	if port > 0 {
		wireless.Port = port
		ip := wirelessAdbIP(device, "")
		wireless.IP = ip
		if ip != "" {
			wireless.Serial = fmt.Sprintf("%s:%d", ip, port)
			wireless.State = resolveAdbSerialState(cli, wireless.Serial)
		} else {
			wireless.State = "not_configured"
		}
	} else {
		wireless.State = "not_configured"
	}

	c.JSON(http.StatusOK, gin.H{"usb": usb, "wireless": wireless})
}

// AdbWirelessDisconnect 断开无线 ADB。默认保留 wireless_adb_port 供下次重连；clear_record=true 时清除端口记录。
func AdbWirelessDisconnect(c *gin.Context) {
	var req struct {
		ClearRecord bool `json:"clear_record"`
	}
	_ = c.ShouldBindJSON(&req)

	device := getDeviceByID(c)
	if device == nil {
		return
	}
	serial := wirelessAdbSerial(device)
	if serial == "" && strings.Contains(device.Serial, ":") {
		serial = device.Serial
	}
	if serial == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "设备未配置无线 ADB 端口"})
		return
	}
	_ = getADB().Disconnect(serial)
	clearAdbConnectingNote(serial)
	if req.ClearRecord {
		_ = database.DB.Model(&models.Device{}).Where("id = ?", device.ID).Updates(map[string]interface{}{
			"wireless_adb_port":   0,
			"wireless_adb_serial": "",
		}).Error
		logAudit(c, "ADB 无线断开", fmt.Sprintf("设备 %d disconnect %s（已清除端口记录）", device.ID, serial), &device.ID)
		c.JSON(http.StatusOK, gin.H{"message": "已断开并清除记录", "serial": serial, "cleared": true})
		return
	}
	logAudit(c, "ADB 无线断开", fmt.Sprintf("设备 %d disconnect %s", device.ID, serial), &device.ID)
	c.JSON(http.StatusOK, gin.H{"message": "已断开", "serial": serial, "cleared": false})
}

// AdbShellRun 通过 ADB 在设备上执行单条 shell 命令（优先 USB，其次无线）。
func AdbShellRun(c *gin.Context) {
	var req struct {
		Command string `json:"command" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cmd := strings.TrimSpace(req.Command)
	if cmd == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "命令不能为空"})
		return
	}
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	// 优先 USB serial，其次无线
	adbSerial := ""
	if serialUsableWithAdb(device.Serial) && !strings.Contains(device.Serial, ":") {
		adbSerial = device.Serial
	} else if s := wirelessAdbSerial(device); s != "" {
		adbSerial = s
	} else if serialUsableWithAdb(device.Serial) {
		adbSerial = device.Serial
	}
	if adbSerial == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "设备无可用 ADB 连接（USB 或无线）"})
		return
	}
	activeSerial, needDisc, err := ensureADBConnected(adbSerial)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ADB 连接失败: " + err.Error()})
		return
	}
	if needDisc {
		defer getADB().Disconnect(activeSerial)
	}
	// 将命令字符串拆分成参数（shell -c 模式以保留管道/重定向等语法）
	out, _ := getADB().Shell(activeSerial, "sh", "-c", cmd)
	logAudit(c, "ADB Shell", fmt.Sprintf("设备 %d: %s", device.ID, cmd), &device.ID)
	c.JSON(http.StatusOK, gin.H{"output": out})
}

// cleanPairOutput 去掉 adb pair 输出里的 "Enter pairing code:" 提示行，保留实际结果。
func cleanPairOutput(out string) string {
	var lines []string
	for _, line := range strings.Split(out, "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(strings.ToLower(t), "enter pairing code") {
			continue
		}
		lines = append(lines, t)
	}
	return strings.Join(lines, "\n")
}

func logAudit(c *gin.Context, action, command string, deviceID *uint) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(uint)
	database.DB.Create(&models.AuditLog{
		UserID:    uid,
		DeviceID:  deviceID,
		Action:    action,
		Command:   command,
		IPAddress: c.ClientIP(),
	})
}
