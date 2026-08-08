package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─────────────────────────────────────────────────────────────────────────────
// MDM Enterprise CRUD (admin only)
// ─────────────────────────────────────────────────────────────────────────────

// ListMDMEnterprises GET /api/mdm/enterprises
func ListMDMEnterprises(c *gin.Context) {
	var list []models.MDMEnterprise
	database.DB.Order("id desc").Find(&list)
	c.JSON(http.StatusOK, gin.H{"data": list})
}

// CreateMDMEnterprise POST /api/mdm/enterprises
func CreateMDMEnterprise(c *gin.Context) {
	var req struct {
		Name            string `json:"name"`
		Code            string `json:"code"`
		Description     string `json:"description"`
		AllowedCapsJSON string `json:"allowed_caps_json"`
		Enabled         bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" || req.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name 和 code 不能为空"})
		return
	}
	ent := models.MDMEnterprise{
		Name:            req.Name,
		Code:            req.Code,
		Description:     req.Description,
		AllowedCapsJSON: req.AllowedCapsJSON,
		Enabled:         req.Enabled,
		CreatedBy:       c.GetUint("user_id"),
	}
	if err := database.DB.Create(&ent).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": ent})
}

// UpdateMDMEnterprise PUT /api/mdm/enterprises/:id
func UpdateMDMEnterprise(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var ent models.MDMEnterprise
	if err := database.DB.First(&ent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "enterprise not found"})
		return
	}
	var req struct {
		Name            string `json:"name"`
		Code            string `json:"code"`
		Description     string `json:"description"`
		AllowedCapsJSON string `json:"allowed_caps_json"`
		Enabled         *bool  `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != "" {
		ent.Name = req.Name
	}
	if req.Code != "" {
		ent.Code = req.Code
	}
	ent.Description = req.Description
	ent.AllowedCapsJSON = req.AllowedCapsJSON
	if req.Enabled != nil {
		ent.Enabled = *req.Enabled
	}
	if err := database.DB.Save(&ent).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": ent})
}

// DeleteMDMEnterprise DELETE /api/mdm/enterprises/:id
func DeleteMDMEnterprise(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := database.DB.Delete(&models.MDMEnterprise{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// ─────────────────────────────────────────────────────────────────────────────
// Device MDM config
// ─────────────────────────────────────────────────────────────────────────────

// GetDeviceMDMConfig GET /api/devices/:id/mdm
func GetDeviceMDMConfig(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var cfg models.DeviceMDMConfig
	database.DB.FirstOrInit(&cfg, models.DeviceMDMConfig{DeviceID: device.ID})
	var ent *models.MDMEnterprise
	if cfg.EnterpriseID > 0 {
		var e models.MDMEnterprise
		if database.DB.First(&e, cfg.EnterpriseID).Error == nil {
			ent = &e
		}
	}
	// 返回全部启用的企业列表供前端选择器使用
	var enterprises []models.MDMEnterprise
	database.DB.Where("enabled = ?", true).Order("id asc").Find(&enterprises)
	c.JSON(http.StatusOK, gin.H{"config": cfg, "enterprise": ent, "enterprises": enterprises})
}

// UpdateDeviceMDMConfig PUT /api/devices/:id/mdm
func UpdateDeviceMDMConfig(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		MDMEnabled   bool `json:"mdm_enabled"`
		EnterpriseID uint `json:"enterprise_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var cfg models.DeviceMDMConfig
	database.DB.FirstOrInit(&cfg, models.DeviceMDMConfig{DeviceID: device.ID})
	prevEnabled := cfg.MDMEnabled
	cfg.DeviceID = device.ID
	cfg.MDMEnabled = req.MDMEnabled
	cfg.EnterpriseID = req.EnterpriseID
	if err := database.DB.Save(&cfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Notify agent only when mdm_enabled changes.
	if prevEnabled != req.MDMEnabled {
		routeKey, rerr := agent.AgentConnectionKey(c.Param("id"))
		if rerr == nil && agent.AgentHub.IsConnected(routeKey) {
			enterpriseCode := ""
			if req.EnterpriseID > 0 {
				var e models.MDMEnterprise
				if database.DB.First(&e, req.EnterpriseID).Error == nil {
					enterpriseCode = e.Code
				}
			}
			_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
				"type":   "command",
				"action": "set_mdm_mode",
				"data": map[string]interface{}{
					"enabled":         req.MDMEnabled,
					"enterprise_code": enterpriseCode,
				},
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": cfg})
}

// SyncDeviceMDMStatus POST /api/devices/:id/mdm/sync
func SyncDeviceMDMStatus(c *gin.Context) {
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
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}

	cmdID := "mdm_" + randomAgentRequestID()
	ch := agent.RegisterCommandResultWait(cmdID)
	defer agent.ForgetCommandResultWait(cmdID)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":      "command",
		"action":    "get_mdm_status",
		"commandId": cmdID,
		"data":      map[string]interface{}{},
	})

	select {
	case reply := <-ch:
		if !reply.Success {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Agent 返回错误: " + reply.Output})
			return
		}
		var statusData struct {
			IsDeviceOwner          bool   `json:"is_device_owner"`
			HasWriteSecureSettings bool   `json:"has_write_secure_settings"`
			CapabilitiesJSON       string `json:"capabilities_json"`
		}
		if jerr := json.Unmarshal([]byte(reply.Output), &statusData); jerr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "解析 Agent 返回数据失败: " + jerr.Error()})
			return
		}
		var cfg models.DeviceMDMConfig
		database.DB.FirstOrInit(&cfg, models.DeviceMDMConfig{DeviceID: device.ID})
		now := time.Now()
		cfg.DeviceID = device.ID
		cfg.IsDeviceOwner = statusData.IsDeviceOwner
		cfg.HasWriteSecureSettings = statusData.HasWriteSecureSettings
		if statusData.CapabilitiesJSON != "" {
			cfg.CapabilitiesJSON = statusData.CapabilitiesJSON
		}
		cfg.LastSyncAt = &now
		if serr := database.DB.Save(&cfg).Error; serr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": serr.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": cfg})
	case <-time.After(10 * time.Second):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Agent 响应超时"})
	}
}

// GetDeviceNTPConfig POST /api/devices/:id/mdm/ntp — GET semantics, agent round-trip required
func GetDeviceNTPConfig(c *gin.Context) {
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
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return
	}

	cmdID := "mdm_" + randomAgentRequestID()
	ch := agent.RegisterCommandResultWait(cmdID)
	defer agent.ForgetCommandResultWait(cmdID)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":      "command",
		"action":    "get_ntp_config",
		"commandId": cmdID,
		"data":      map[string]interface{}{},
	})

	select {
	case reply := <-ch:
		if !reply.Success {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Agent 返回错误: " + reply.Output})
			return
		}
		var ntpData struct {
			NTPServer  string `json:"ntp_server"`
			NTPTimeout int64  `json:"ntp_timeout"`
		}
		if jerr := json.Unmarshal([]byte(reply.Output), &ntpData); jerr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "解析 NTP 配置失败: " + jerr.Error()})
			return
		}
		var cfg models.DeviceMDMConfig
		database.DB.FirstOrInit(&cfg, models.DeviceMDMConfig{DeviceID: device.ID})
		cfg.DeviceID = device.ID
		cfg.NTPServer = ntpData.NTPServer
		cfg.NTPTimeout = ntpData.NTPTimeout
		_ = database.DB.Save(&cfg)
		c.JSON(http.StatusOK, gin.H{"ntp_server": ntpData.NTPServer, "ntp_timeout": ntpData.NTPTimeout})
	case <-time.After(8 * time.Second):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Agent 响应超时"})
	}
}

// SetDeviceNTPConfig PUT /api/devices/:id/mdm/ntp
func SetDeviceNTPConfig(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		NTPServer  string `json:"ntp_server"`
		NTPTimeout int64  `json:"ntp_timeout"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	cmdID := "mdm_" + randomAgentRequestID()
	ch := agent.RegisterCommandResultWait(cmdID)
	defer agent.ForgetCommandResultWait(cmdID)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":      "command",
		"action":    "set_ntp_config",
		"commandId": cmdID,
		"data": map[string]interface{}{
			"ntp_server":  req.NTPServer,
			"ntp_timeout": req.NTPTimeout,
		},
	})

	select {
	case reply := <-ch:
		if !reply.Success {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Agent 返回错误: " + reply.Output})
			return
		}
		var cfg models.DeviceMDMConfig
		database.DB.FirstOrInit(&cfg, models.DeviceMDMConfig{DeviceID: device.ID})
		cfg.DeviceID = device.ID
		cfg.NTPServer = req.NTPServer
		cfg.NTPTimeout = req.NTPTimeout
		if serr := database.DB.Save(&cfg).Error; serr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": serr.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": cfg})
	case <-time.After(8 * time.Second):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Agent 响应超时"})
	}
}

// GetMDMEnterpriseList GET /api/mdm/enterprises/list — operator-accessible selector list
func GetMDMEnterpriseList(c *gin.Context) {
	var list []models.MDMEnterprise
	database.DB.Where("enabled = ?", true).Order("id asc").Select("id, name, code, description").Find(&list)
	c.JSON(http.StatusOK, gin.H{"data": list})
}

// ── Device Owner 策略命令（通用 helper） ─────────────────────────────────────

// sendDpmCommand 向 Agent 发送 Device Owner 策略命令并等待结果。
func sendDpmCommand(c *gin.Context, deviceID uint, action string, data map[string]interface{}, timeout time.Duration) (agent.CommandResultReply, bool) {
	routeKey, err := agent.AgentConnectionKey(strconv.FormatUint(uint64(deviceID), 10))
	if err != nil || !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Agent 未在线"})
		return agent.CommandResultReply{}, false
	}
	cmdID := "dpm_" + randomAgentRequestID()
	ch := agent.RegisterCommandResultWait(cmdID)
	defer agent.ForgetCommandResultWait(cmdID)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":      "command",
		"action":    action,
		"commandId": cmdID,
		"data":      data,
	})
	select {
	case reply := <-ch:
		return reply, true
	case <-time.After(timeout):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Agent 响应超时"})
		return agent.CommandResultReply{}, false
	}
}

// ── 锁屏 ─────────────────────────────────────────────────────────────────────

// LockDevice POST /api/devices/:id/mdm/lock
func LockDevice(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_lock_now", map[string]interface{}{}, 8*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	logAudit(c, "device_mdm_lock", "锁屏", &device.ID)
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}

// ── 擦除设备（两步确认）────────────────────────────────────────────────────────

var wipeTokens sync.Map // token -> deviceID, 60s 有效

// PrepareWipeDevice POST /api/devices/:id/mdm/wipe/prepare  (admin only)
func PrepareWipeDevice(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	token := randomAgentRequestID() + randomAgentRequestID() // 32 hex chars
	wipeTokens.Store(token, device.ID)
	go func() {
		time.Sleep(60 * time.Second)
		wipeTokens.Delete(token)
	}()
	c.JSON(http.StatusOK, gin.H{"token": token, "expires_in": 60, "confirm_field": device.Model})
}

// ConfirmWipeDevice POST /api/devices/:id/mdm/wipe/confirm  (admin only)
func ConfirmWipeDevice(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		Token   string `json:"token"   binding:"required"`
		Confirm string `json:"confirm" binding:"required"` // 设备 Model 名称
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	storedID, ok := wipeTokens.Load(req.Token)
	if !ok {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "token 无效或已过期（60s 内有效）"})
		return
	}
	if storedID.(uint) != device.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "token 与设备不匹配"})
		return
	}
	wipeTokens.Delete(req.Token)

	reply, ok := sendDpmCommand(c, device.ID, "mdm_wipe_device",
		map[string]interface{}{"confirm": req.Confirm}, 10*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	logAudit(c, "device_mdm_wipe", "擦除设备", &device.ID)
	c.JSON(http.StatusOK, gin.H{"message": "擦除指令已下发"})
}

// ── 重启 ─────────────────────────────────────────────────────────────────────

// MDMRebootDevice POST /api/devices/:id/mdm/reboot  (Device Owner 重启)
func MDMRebootDevice(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_reboot", map[string]interface{}{}, 8*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}

// ── 硬件管控 ─────────────────────────────────────────────────────────────────

// SetHardwarePolicy PUT /api/devices/:id/mdm/hardware
// body: { "camera_disabled": bool, "screen_capture_disabled": bool }
func SetHardwarePolicy(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		CameraDisabled        *bool `json:"camera_disabled"`
		ScreenCaptureDisabled *bool `json:"screen_capture_disabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	results := map[string]interface{}{}
	if req.CameraDisabled != nil {
		r, ok := sendDpmCommand(c, device.ID, "mdm_set_camera",
			map[string]interface{}{"disabled": *req.CameraDisabled}, 8*time.Second)
		if !ok {
			return
		}
		results["camera"] = map[string]interface{}{"success": r.Success, "message": r.Output}
	}
	if req.ScreenCaptureDisabled != nil {
		r, ok := sendDpmCommand(c, device.ID, "mdm_set_screen_capture",
			map[string]interface{}{"disabled": *req.ScreenCaptureDisabled}, 8*time.Second)
		if !ok {
			return
		}
		results["screen_capture"] = map[string]interface{}{"success": r.Success, "message": r.Output}
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// ── 密码策略 ─────────────────────────────────────────────────────────────────

// SetPasswordPolicy PUT /api/devices/:id/mdm/password-policy
// body: { "quality": "numeric|alphabetic|alphanumeric|complex|none", "min_length": 6 }
func SetPasswordPolicy(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		Quality   string `json:"quality"`
		MinLength int    `json:"min_length"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_set_password_policy",
		map[string]interface{}{"quality": req.Quality, "min_length": req.MinLength}, 8*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}

// ── 用户限制 ─────────────────────────────────────────────────────────────────

// SetUserRestriction PUT /api/devices/:id/mdm/user-restriction
// body: { "restriction": "no_factory_reset", "enabled": true }
func SetUserRestriction(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		Restriction string `json:"restriction" binding:"required"`
		Enabled     bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_set_user_restriction",
		map[string]interface{}{"restriction": req.Restriction, "enabled": req.Enabled}, 8*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}

// ── 应用管控 ─────────────────────────────────────────────────────────────────

// SetAppRestriction PUT /api/devices/:id/mdm/app-restriction
// body: { "package_name": "com.xx", "hidden": bool, "uninstall_blocked": bool }
func SetAppRestriction(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		PackageName      string `json:"package_name" binding:"required"`
		Hidden           *bool  `json:"hidden"`
		UninstallBlocked *bool  `json:"uninstall_blocked"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	results := map[string]interface{}{}
	if req.Hidden != nil {
		r, ok := sendDpmCommand(c, device.ID, "mdm_set_app_hidden",
			map[string]interface{}{"package_name": req.PackageName, "hidden": *req.Hidden}, 8*time.Second)
		if !ok {
			return
		}
		results["hidden"] = map[string]interface{}{"success": r.Success, "message": r.Output}
	}
	if req.UninstallBlocked != nil {
		r, ok := sendDpmCommand(c, device.ID, "mdm_set_uninstall_blocked",
			map[string]interface{}{"package_name": req.PackageName, "blocked": *req.UninstallBlocked}, 8*time.Second)
		if !ok {
			return
		}
		results["uninstall_blocked"] = map[string]interface{}{"success": r.Success, "message": r.Output}
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// ── Kiosk 模式 ────────────────────────────────────────────────────────────────

// SetKioskMode PUT /api/devices/:id/mdm/kiosk
// body: { "enabled": true, "packages": ["com.example.kiosk"] }
func SetKioskMode(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		Enabled  bool     `json:"enabled"`
		Packages []string `json:"packages"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data := map[string]interface{}{"enabled": req.Enabled}
	if len(req.Packages) > 0 {
		data["packages"] = req.Packages
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_set_kiosk", data, 8*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}

// ── 时间 / 时区 ──────────────────────────────────────────────────────────────

// SetDeviceTime PUT /api/devices/:id/mdm/time
// body: { "time_ms": 1690000000000, "timezone": "Asia/Shanghai" }
func SetDeviceTime(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	var req struct {
		TimeMs   int64  `json:"time_ms"`
		Timezone string `json:"timezone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	results := map[string]interface{}{}
	if req.TimeMs > 0 {
		r, ok := sendDpmCommand(c, device.ID, "mdm_set_time",
			map[string]interface{}{"time_ms": req.TimeMs}, 8*time.Second)
		if !ok {
			return
		}
		results["time"] = map[string]interface{}{"success": r.Success, "message": r.Output}
	}
	if req.Timezone != "" {
		r, ok := sendDpmCommand(c, device.ID, "mdm_set_timezone",
			map[string]interface{}{"timezone": req.Timezone}, 8*time.Second)
		if !ok {
			return
		}
		results["timezone"] = map[string]interface{}{"success": r.Success, "message": r.Output}
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// ── 策略快照 ─────────────────────────────────────────────────────────────────

// GetPolicySnapshot POST /api/devices/:id/mdm/policy-snapshot
func GetPolicySnapshot(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_get_policy_snapshot", map[string]interface{}{}, 8*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	c.JSON(http.StatusOK, gin.H{"snapshot": json.RawMessage(reply.Output)})
}

// RevokeDeviceOwner POST /api/devices/:id/mdm/revoke-do  (admin only)
// 撤销设备的 Device Owner 状态（先清策略，再 clearDeviceOwnerApp）。
func RevokeDeviceOwner(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_revoke_device_owner",
		map[string]interface{}{}, 10*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	// 同步更新数据库：清除 DO 状态
	var cfg models.DeviceMDMConfig
	database.DB.FirstOrInit(&cfg, models.DeviceMDMConfig{DeviceID: device.ID})
	cfg.DeviceID = device.ID
	cfg.IsDeviceOwner = false
	cfg.CapabilitiesJSON = ""
	cfg.UpdatedAt = time.Now()
	database.DB.Save(&cfg)
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}

// ClearAllMDMPolicies POST /api/devices/:id/mdm/clear-policies  (admin/operator)
// 清除设备上所有已应用的 Device Owner 策略（不撤销 DO 身份）。
func ClearAllMDMPolicies(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil {
		return
	}
	reply, ok := sendDpmCommand(c, device.ID, "mdm_clear_all_policies",
		map[string]interface{}{}, 10*time.Second)
	if !ok {
		return
	}
	if !reply.Success {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}

// ── Settings.Global/Secure 系统设置端点 ──────────────────────────────────────

// GetSystemSettings POST /api/devices/:id/mdm/system-settings/snapshot
func GetSystemSettings(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil { return }
	reply, ok := sendDpmCommand(c, device.ID, "mdm_get_system_settings", map[string]interface{}{}, 8*time.Second)
	if !ok { return }
	if !reply.Success { c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output}); return }
	c.JSON(http.StatusOK, gin.H{"snapshot": json.RawMessage(reply.Output)})
}

// ApplySystemSetting PUT /api/devices/:id/mdm/system-settings
// body: { "action": "mdm_set_adb", "data": {...} }
func ApplySystemSetting(c *gin.Context) {
	device := getDeviceByID(c)
	if device == nil { return }
	var req struct {
		Action string                 `json:"action" binding:"required"`
		Data   map[string]interface{} `json:"data"`
	}
	if err := c.ShouldBindJSON(&req); err != nil { c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()}); return }
	if req.Data == nil { req.Data = map[string]interface{}{} }

	allowedActions := map[string]bool{
		"mdm_set_adb": true, "mdm_set_animation": true, "mdm_set_location_mode": true,
		"mdm_enable_accessibility": true, "mdm_set_auto_time": true, "mdm_set_wifi": true,
		"mdm_set_bluetooth": true, "mdm_set_airplane": true, "mdm_set_stay_on": true,
		"mdm_set_unknown_sources": true, "mdm_set_zen_mode": true,
		"mdm_set_global_setting": true, "mdm_set_secure_setting": true,
	}
	if !allowedActions[req.Action] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的 action: " + req.Action})
		return
	}

	reply, ok := sendDpmCommand(c, device.ID, req.Action, req.Data, 8*time.Second)
	if !ok { return }
	if !reply.Success { c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reply.Output}); return }
	c.JSON(http.StatusOK, gin.H{"message": reply.Output})
}
