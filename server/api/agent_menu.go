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
	"gorm.io/gorm"
)

// isAdmin 当前请求是否为 admin 角色。
func isAdmin(c *gin.Context) bool {
	return c.GetString("role") == "admin"
}

// scopeMenusToUser 非 admin 仅可见/管理自己名下的菜单。
func scopeMenusToUser(c *gin.Context, q *gorm.DB) *gorm.DB {
	if isAdmin(c) {
		return q
	}
	return q.Where("user_id = ?", c.GetUint("user_id"))
}

// userOwnsMenus 校验给定菜单 ID 全部属于当前用户（admin 直接放行）。
func userOwnsMenus(c *gin.Context, menuIDs []uint) bool {
	if isAdmin(c) || len(menuIDs) == 0 {
		return true
	}
	var cnt int64
	database.DB.Model(&models.AgentMenuItem{}).
		Where("id IN ? AND user_id = ?", menuIDs, c.GetUint("user_id")).
		Count(&cnt)
	return int(cnt) == len(uniqueUints(menuIDs))
}

// userOwnsDevices 校验给定设备 ID 全部属于当前用户（admin 直接放行）。
func userOwnsDevices(c *gin.Context, deviceIDs []uint) bool {
	if isAdmin(c) || len(deviceIDs) == 0 {
		return true
	}
	var cnt int64
	database.DB.Model(&models.Device{}).
		Where("id IN ? AND user_id = ?", deviceIDs, c.GetUint("user_id")).
		Count(&cnt)
	return int(cnt) == len(uniqueUints(deviceIDs))
}

func uniqueUints(in []uint) []uint {
	seen := map[uint]bool{}
	out := make([]uint, 0, len(in))
	for _, v := range in {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

func ListAgentMenuItems(c *gin.Context) {
	var rows []models.AgentMenuItem
	scopeMenusToUser(c, database.DB).Order("sort_order ASC, id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateAgentMenuItem(c *gin.Context) {
	var body models.AgentMenuItem
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 归属创建者；admin 创建的菜单同样归属其账号（便于矩阵管理）。
	uid := c.GetUint("user_id")
	body.UserID = &uid
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
	if !isAdmin(c) {
		var existing models.AgentMenuItem
		if err := database.DB.First(&existing, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if existing.UserID == nil || *existing.UserID != c.GetUint("user_id") {
			c.JSON(http.StatusForbidden, gin.H{"error": "无权操作该菜单"})
			return
		}
	}
	if err := database.DB.Model(&models.AgentMenuItem{}).Where("id = ?", id).Updates(map[string]interface{}{
		"title": body.Title, "icon": body.Icon, "target_type": body.TargetType, "target_ref": body.TargetRef,
		"show_on_agent_home": body.ShowOnAgentHome, "intent_action": body.IntentAction,
		"default_extras_json": body.DefaultExtrasJSON, "sort_order": body.SortOrder,
		"scan_config_json": body.ScanConfigJSON, "open_mode": body.OpenMode,
		"min_agent_version": body.MinAgentVersion, "required_caps_json": body.RequiredCapsJSON,
		"form_app_base_url": body.FormAppBaseUrl,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteAgentMenuItem(c *gin.Context) {
	id := c.Param("id")
	if !isAdmin(c) {
		var existing models.AgentMenuItem
		if err := database.DB.First(&existing, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if existing.UserID == nil || *existing.UserID != c.GetUint("user_id") {
			c.JSON(http.StatusForbidden, gin.H{"error": "无权操作该菜单"})
			return
		}
	}
	// 解绑该菜单在所有设备上的分配，并刷新受影响设备的菜单（避免设备端残留悬空菜单）。
	var affected []models.AgentMenuAssignment
	database.DB.Where("menu_id = ?", id).Find(&affected)
	deviceIDs := make([]uint, 0, len(affected))
	for _, a := range affected {
		deviceIDs = append(deviceIDs, a.DeviceID)
	}
	database.DB.Where("menu_id = ?", id).Delete(&models.AgentMenuAssignment{})
	database.DB.Delete(&models.AgentMenuItem{}, id)
	bumpAgentMenuRevisionForDevices(uniqueUints(deviceIDs))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type deployMenusBody struct {
	MenuIDs   []uint `json:"menu_ids"`
	DeviceIDs []uint `json:"device_ids"`
	Mode      string `json:"mode"` // append（默认，追加不覆盖）| replace（整体替换该设备菜单集合）
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

// DeployAgentMenus 绑定菜单到设备并递增 revision、推送 WS。
// mode=append（默认）：追加本次菜单，不删除设备已有的其它菜单；
// mode=replace：将该设备的菜单集合整体替换为本次 menu_ids。
func DeployAgentMenus(c *gin.Context) {
	var body deployMenusBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !userOwnsDevices(c, body.DeviceIDs) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权操作部分设备"})
		return
	}
	if !userOwnsMenus(c, body.MenuIDs) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权下发部分菜单"})
		return
	}
	replace := body.Mode == "replace"
	for _, did := range body.DeviceIDs {
		if replace {
			// 整体替换：清空该设备现有绑定，再写入本次集合。
			database.DB.Where("device_id = ?", did).Delete(&models.AgentMenuAssignment{})
		}
		for _, mid := range body.MenuIDs {
			// 追加：upsert，避免重复绑定同一菜单（idx_menu_device 唯一约束）。
			database.DB.
				Where("menu_id = ? AND device_id = ?", mid, did).
				FirstOrCreate(&models.AgentMenuAssignment{MenuID: mid, DeviceID: did})
		}
	}
	bumpAgentMenuRevisionForDevices(body.DeviceIDs)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetAgentMenuMatrix 返回当前账号 scoped 的设备列表、菜单列表与现有分配，供前端渲染勾选矩阵。
func GetAgentMenuMatrix(c *gin.Context) {
	var menus []models.AgentMenuItem
	scopeMenusToUser(c, database.DB).Order("sort_order ASC, id ASC").Find(&menus)

	var devices []models.Device
	dq := database.DB
	if !isAdmin(c) {
		dq = dq.Where("user_id = ?", c.GetUint("user_id"))
	}
	dq.Order("id ASC").Find(&devices)
	deviceList := make([]map[string]interface{}, 0, len(devices))
	deviceIDs := make([]uint, 0, len(devices))
	for _, d := range devices {
		deviceIDs = append(deviceIDs, d.ID)
		name := d.Name
		if name == "" {
			name = d.Serial
		}
		deviceList = append(deviceList, map[string]interface{}{
			"id":     d.ID,
			"name":   name,
			"serial": d.Serial,
			"status": d.Status,
		})
	}

	// 仅返回 scoped 设备上、且属于 scoped 菜单的分配，避免泄露他人数据。
	menuIDSet := map[uint]bool{}
	for _, m := range menus {
		menuIDSet[m.ID] = true
	}
	assignments := map[uint][]uint{} // deviceID -> []menuID
	if len(deviceIDs) > 0 {
		var as []models.AgentMenuAssignment
		database.DB.Where("device_id IN ?", deviceIDs).Find(&as)
		for _, a := range as {
			if !menuIDSet[a.MenuID] {
				continue
			}
			assignments[a.DeviceID] = append(assignments[a.DeviceID], a.MenuID)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"menus":       menus,
		"devices":     deviceList,
		"assignments": assignments,
	})
}

type setAssignmentsBody struct {
	DeviceID uint   `json:"device_id"`
	MenuIDs  []uint `json:"menu_ids"`
}

// SetAgentMenuAssignments 将单台设备的菜单集合整体设置为 menu_ids（矩阵保存）。
// 删除仅在当前账号可见的菜单范围内进行：保留该设备上不属于当前账号的菜单分配
// （如 admin 管理的全局菜单），避免误删他人下发的菜单。
func SetAgentMenuAssignments(c *gin.Context) {
	var body setAssignmentsBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !userOwnsDevices(c, []uint{body.DeviceID}) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权操作该设备"})
		return
	}
	if !userOwnsMenus(c, body.MenuIDs) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权下发部分菜单"})
		return
	}

	// 当前账号可见的菜单 ID 集合（删除只在此范围内进行）。
	var scopedMenus []models.AgentMenuItem
	scopeMenusToUser(c, database.DB).Find(&scopedMenus)
	scopedSet := map[uint]bool{}
	for _, m := range scopedMenus {
		scopedSet[m.ID] = true
	}

	// 设备现有分配。
	var existing []models.AgentMenuAssignment
	database.DB.Where("device_id = ?", body.DeviceID).Find(&existing)
	existingSet := map[uint]bool{}
	for _, a := range existing {
		existingSet[a.MenuID] = true
	}

	want := map[uint]bool{}
	for _, mid := range uniqueUints(body.MenuIDs) {
		want[mid] = true
	}

	// 删除：scoped 范围内、当前已绑定但目标集合不含的菜单。
	toDelete := make([]uint, 0)
	for mid := range existingSet {
		if scopedSet[mid] && !want[mid] {
			toDelete = append(toDelete, mid)
		}
	}
	if len(toDelete) > 0 {
		database.DB.Where("device_id = ? AND menu_id IN ?", body.DeviceID, toDelete).
			Delete(&models.AgentMenuAssignment{})
	}
	// 新增：目标集合中尚未绑定的菜单。
	for mid := range want {
		if !existingSet[mid] {
			database.DB.Create(&models.AgentMenuAssignment{MenuID: mid, DeviceID: body.DeviceID})
		}
	}

	bumpAgentMenuRevisionForDevices([]uint{body.DeviceID})
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
					// 指向独立 React SCADA 应用的免登分享路由（旧 /share/scada Vue 页已随迁移删除）
					previewPath = "/scada-editor/share/" + scada.ShareToken
				} else {
					// 组态未正确发布（缺少 share_token），跳过该菜单以避免 Agent 无法打开
					continue
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
		// webview_url 类型：target_ref 直接是完整 URL，下发给 Agent
		if m.TargetType == "webview_url" && strings.TrimSpace(m.TargetRef) != "" {
			previewPath = strings.TrimSpace(m.TargetRef)
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
			"form_app_base_url":   strings.TrimSpace(m.FormAppBaseUrl),
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
