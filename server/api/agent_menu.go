package api

import (
	"app-manager/agent"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func ListAgentMenuItems(c *gin.Context) {
	var rows []models.AgentMenuItem
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateAgentMenuItem(c *gin.Context) {
	var body models.AgentMenuItem
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateAgentMenuItem(c *gin.Context) {
	id := c.Param("id")
	var body models.AgentMenuItem
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Model(&models.AgentMenuItem{}).Where("id = ?", id).Updates(map[string]interface{}{
		"title": body.Title, "icon": body.Icon, "target_type": body.TargetType, "target_ref": body.TargetRef,
		"show_on_agent_home": body.ShowOnAgentHome, "intent_action": body.IntentAction,
		"default_extras_json": body.DefaultExtrasJSON, "sort_order": body.SortOrder,
		"scan_config_json": body.ScanConfigJSON, "open_mode": body.OpenMode,
		"min_agent_version": body.MinAgentVersion, "required_caps_json": body.RequiredCapsJSON,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteAgentMenuItem(c *gin.Context) {
	database.DB.Delete(&models.AgentMenuItem{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type deployMenusBody struct {
	MenuIDs   []uint `json:"menu_ids"`
	DeviceIDs []uint `json:"device_ids"`
}

type menuExecutionReportBody struct {
	IntentAction   string `json:"intent_action"`
	EventType      string `json:"event_type"`
	ScanValue      string `json:"scan_value"`
	MatchedRule    string `json:"matched_rule"`
	TargetURL      string `json:"target_url"`
	Status         string `json:"status"`
	ErrorMessage   string `json:"error_message"`
	BundleRevision uint   `json:"bundle_revision"`
}

func bumpAgentMenuRevisionForDevices(deviceIDs []uint) {
	for _, did := range deviceIDs {
		var dev models.Device
		if err := database.DB.First(&dev, did).Error; err != nil {
			continue
		}
		dev.AgentMenuRevision++
		database.DB.Model(&dev).Update("agent_menu_revision", dev.AgentMenuRevision)
		pushAgentMenuSync(did, dev.AgentMenuRevision)
	}
}

// DeployAgentMenus 绑定菜单到设备并递增 revision、推送 WS
func DeployAgentMenus(c *gin.Context) {
	var body deployMenusBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for _, did := range body.DeviceIDs {
		// 清除旧绑定（简化：每次全量替换这些 menu_ids）
		database.DB.Where("device_id = ?", did).Delete(&models.AgentMenuAssignment{})
		for _, mid := range body.MenuIDs {
			database.DB.Create(&models.AgentMenuAssignment{MenuID: mid, DeviceID: did})
		}
	}
	bumpAgentMenuRevisionForDevices(body.DeviceIDs)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func pushAgentMenuSync(deviceID uint, revision uint) {
	key, err := agent.AgentConnectionKey(fmt.Sprintf("%d", deviceID))
	if err != nil || !agent.AgentHub.IsConnected(key) {
		return
	}
	bundle := buildMenuBundleForDevice(deviceID, revision)
	msg := map[string]interface{}{
		"type": "agent_menu_sync",
		"data": bundle,
	}
	_ = agent.AgentHub.Send(key, msg)
}

func versionGE(agentVersion, minVersion string) bool {
	a := strings.TrimSpace(agentVersion)
	b := strings.TrimSpace(minVersion)
	if b == "" {
		return true
	}
	parse := func(v string) []int {
		parts := strings.Split(v, ".")
		out := make([]int, 0, len(parts))
		for _, p := range parts {
			n, _ := strconv.Atoi(strings.TrimSpace(p))
			out = append(out, n)
		}
		return out
	}
	av := parse(a)
	bv := parse(b)
	max := len(av)
	if len(bv) > max {
		max = len(bv)
	}
	for i := 0; i < max; i++ {
		x, y := 0, 0
		if i < len(av) {
			x = av[i]
		}
		if i < len(bv) {
			y = bv[i]
		}
		if x > y {
			return true
		}
		if x < y {
			return false
		}
	}
	return true
}

func parseRequiredCaps(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil
	}
	return out
}

func hasRequiredCaps(deviceCaps map[string]bool, required []string) bool {
	for _, c := range required {
		if strings.TrimSpace(c) == "" {
			continue
		}
		if !deviceCaps[c] {
			return false
		}
	}
	return true
}

func parseDeviceCaps(s string) map[string]bool {
	out := map[string]bool{}
	if strings.TrimSpace(s) == "" {
		return out
	}
	var arr []string
	if err := json.Unmarshal([]byte(s), &arr); err != nil {
		return out
	}
	for _, c := range arr {
		c = strings.TrimSpace(c)
		if c != "" {
			out[c] = true
		}
	}
	return out
}

func buildMenuPayloadForDevice(deviceID uint) []map[string]interface{} {
	var dev models.Device
	_ = database.DB.First(&dev, deviceID).Error
	deviceCaps := parseDeviceCaps(dev.AgentCapabilitiesJSON)
	var as []models.AgentMenuAssignment
	database.DB.Where("device_id = ?", deviceID).Find(&as)
	out := []map[string]interface{}{}
	for _, a := range as {
		var m models.AgentMenuItem
		if err := database.DB.First(&m, a.MenuID).Error; err != nil {
			continue
		}
		if !versionGE(dev.AgentVersion, m.MinAgentVersion) {
			continue
		}
		if !hasRequiredCaps(deviceCaps, parseRequiredCaps(m.RequiredCapsJSON)) {
			continue
		}
		var scada models.ScadaInfo
		var formApp models.FormAppInfo
		previewPath := ""
		contentVer := int64(0)
		if m.TargetType == "scada_preview" && m.TargetRef != "" {
			if err := database.DB.Where("scada_code = ?", m.TargetRef).First(&scada).Error; err == nil {
				contentVer = scada.ContentVersion
				if scada.PublishStatus == 1 && scada.ShareToken != "" {
					// 只下发相对路径，Agent 用自己存储的 serverUrl 拼完整地址
					// 避免服务端推导的 host 与 Agent 实际访问地址不符（如内网穿透场景）
					previewPath = "/share/scada?token=" + scada.ShareToken
				}
			}
		}
		if (m.TargetType == "form_app" || m.TargetType == "form_app_preview" || m.TargetType == "form_app_scan_entry" || m.TargetType == "form_app_entry") && m.TargetRef != "" {
			if err := database.DB.Where("code = ?", m.TargetRef).First(&formApp).Error; err == nil {
				contentVer = formApp.ContentVersion
				if formApp.PublishStatus == 1 && formApp.ShareToken != "" {
					previewPath = "/form-app/preview/" + strconv.FormatUint(uint64(formApp.ID), 10)
				}
			}
		}
		formCode := strings.TrimSpace(m.FormAppCode)
		if formCode == "" {
			formCode = strings.TrimSpace(m.TargetRef)
		}
		pageKey := strings.TrimSpace(m.FormAppPageKey)
		if pageKey == "" {
			pageKey = "form"
		}
		entry := map[string]interface{}{
			"id":                  m.ID,
			"title":               m.Title,
			"icon":                m.Icon,
			"target_type":         m.TargetType,
			"target_ref":          m.TargetRef,
			"show_on_agent_home":  m.ShowOnAgentHome,
			"intent_action":       m.IntentAction,
			"default_extras_json": m.DefaultExtrasJSON,
			"scan_config_json":    m.ScanConfigJSON,
			"open_mode":           m.OpenMode,
			"min_agent_version":   m.MinAgentVersion,
			"required_caps_json":  m.RequiredCapsJSON,
			"preview_path":        previewPath,
			"content_version":     contentVer,
		}
		if m.TargetType == "form_app_entry" || formCode != "" {
			entry["form_app_code"] = formCode
			entry["form_app_page_key"] = pageKey
		}
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool {
		ii, _ := out[i]["id"].(uint)
		jj, _ := out[j]["id"].(uint)
		return ii < jj
	})
	return out
}

func buildLinkedPages(menus []map[string]interface{}) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(menus))
	for _, m := range menus {
		targetType, _ := m["target_type"].(string)
		targetRef, _ := m["target_ref"].(string)
		previewPath, _ := m["preview_path"].(string)
		if targetType == "" {
			continue
		}
		out = append(out, map[string]interface{}{
			"target_type":  targetType,
			"target_ref":   targetRef,
			"preview_path": previewPath,
		})
	}
	return out
}

func buildMenuBundleForDevice(deviceID uint, revision uint) map[string]interface{} {
	var dev models.Device
	_ = database.DB.First(&dev, deviceID).Error
	menus := buildMenuPayloadForDevice(deviceID)
	linked := buildLinkedPages(menus)
	payload := map[string]interface{}{
		"bundle_revision": revision,
		"menus":           menus,
		"linked_pages":    linked,
	}
	raw, _ := json.Marshal(payload)
	hash := sha256.Sum256(raw)
	hashHex := hex.EncodeToString(hash[:])
	secret := strings.TrimSpace(dev.AgentToken)
	if secret == "" {
		secret = strings.TrimSpace(config.C.JWT.Secret)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(hashHex))
	signature := hex.EncodeToString(mac.Sum(nil))
	payload["bundle_hash"] = hashHex
	payload["signature"] = signature
	return payload
}

// AgentMenuManifest Agent 拉取菜单（凭 X-Device-Token）
func AgentMenuManifest(c *gin.Context) {
	token := c.GetHeader("X-Device-Token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Device-Token"})
		return
	}
	var dev models.Device
	if err := database.DB.Where("agent_token = ?", token).First(&dev).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	sinceStr := c.Query("since")
	since := uint64(0)
	if sinceStr != "" {
		since, _ = strconv.ParseUint(sinceStr, 10, 64)
	}
	if uint64(dev.AgentMenuRevision) == since && since > 0 {
		c.JSON(http.StatusOK, gin.H{"bundle_revision": dev.AgentMenuRevision, "menus": []interface{}{}, "unchanged": true})
		return
	}
	c.JSON(http.StatusOK, buildMenuBundleForDevice(dev.ID, dev.AgentMenuRevision))
}

// AgentMenuExecutionReport Agent 上报执行链路（凭 X-Device-Token）
func AgentMenuExecutionReport(c *gin.Context) {
	token := c.GetHeader("X-Device-Token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Device-Token"})
		return
	}
	var dev models.Device
	if err := database.DB.Where("agent_token = ?", token).First(&dev).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	var body menuExecutionReportBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	logRow := models.AgentMenuExecutionLog{
		DeviceID:       dev.ID,
		IntentAction:   body.IntentAction,
		EventType:      body.EventType,
		ScanValue:      body.ScanValue,
		MatchedRule:    body.MatchedRule,
		TargetURL:      body.TargetURL,
		Status:         body.Status,
		ErrorMessage:   body.ErrorMessage,
		BundleRevision: body.BundleRevision,
	}
	if logRow.Status == "" {
		logRow.Status = "success"
	}
	if err := database.DB.Create(&logRow).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func ListAgentMenuExecutionLogs(c *gin.Context) {
	q := database.DB.Model(&models.AgentMenuExecutionLog{})
	if deviceID := c.Query("device_id"); deviceID != "" {
		q = q.Where("device_id = ?", deviceID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	var rows []models.AgentMenuExecutionLog
	q.Order("id DESC").Limit(200).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}
