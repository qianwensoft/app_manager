package api

import (
	"app-manager/adb"
	"app-manager/agent"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

func ListDevices(c *gin.Context) {
	var devices []models.Device
	database.DB.Find(&devices)
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
	now := time.Now()
	device := models.Device{
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
			"model":               device.Model,
			"brand":               device.Brand,
			"os_version":          device.OSVersion,
			"sdk_version":         device.SDKVersion,
			"resolution":          device.Resolution,
			"ip_address":          device.IP,
			"battery":             device.Battery,
			"cpu_usage":           device.CPUUsage,
			"memory_used":         device.MemoryUsed,
			"memory_total":        device.MemoryTotal,
			"total_memory":        device.TotalMemory,
			"total_storage":       device.TotalStorage,
			"storage_used":        device.StorageUsed,
			"network_type":        device.NetworkType,
			"wifi_ssid":           device.WifiSSID,
			"wifi_signal":         device.WifiSignal,
			"wifi_speed":          device.WifiSpeed,
			"network_connected":   device.NetworkConnected,
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

	// 优先：Agent 在线时由端上 MediaProjection 截图（需已在 Web 打开「屏幕查看」并完成授权）
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
			name := fmt.Sprintf("screenshot_%s_%s.png", device.Serial, time.Now().Format("20060102_150405"))
			c.Header("Content-Type", "image/png")
			c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
			c.Data(http.StatusOK, "image/png", res.PNG)
		case <-time.After(25 * time.Second):
			agent.ForgetScreenshotWait(reqID)
			c.JSON(http.StatusGatewayTimeout, gin.H{"error": "截图超时。请确认 Agent 在线，并先在 Web 端打开「屏幕查看」完成录屏授权后再试。"})
		}
		return
	}

	if !serialUsableWithAdb(device.Serial) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "当前设备仅通过 Agent 接入：请保持 Agent 在线并在 Web 打开「屏幕查看」授权后使用截图；或改用 USB/网络 ADB 绑定真实串号后使用本接口。",
		})
		return
	}
	// 使用系统临时目录，避免依赖 storage.path 权限或工作目录下的 ./uploads
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
	name := fmt.Sprintf("screenshot_%s_%s.png", device.Serial, time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "image/png")
	c.FileAttachment(tmpPath, name)
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

func GetDeviceGroups(c *gin.Context) {
	var groups []string
	database.DB.Model(&models.Device{}).Distinct("group_name").Where("group_name != ''").Pluck("group_name", &groups)
	c.JSON(http.StatusOK, gin.H{"data": groups})
}
