package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"fmt"
	"net/http"
	"strconv"

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

// DeployAgentMenus 绑定菜单到设备并递增 revision、推送 WS
func DeployAgentMenus(c *gin.Context) {
	var body deployMenusBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for _, did := range body.DeviceIDs {
		var dev models.Device
		if err := database.DB.First(&dev, did).Error; err != nil {
			continue
		}
		// 清除旧绑定（简化：每次全量替换这些 menu_ids）
		database.DB.Where("device_id = ?", did).Delete(&models.AgentMenuAssignment{})
		for _, mid := range body.MenuIDs {
			database.DB.Create(&models.AgentMenuAssignment{MenuID: mid, DeviceID: did})
		}
		dev.AgentMenuRevision++
		database.DB.Model(&dev).Update("agent_menu_revision", dev.AgentMenuRevision)
		pushAgentMenuSync(did, dev.AgentMenuRevision)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func pushAgentMenuSync(deviceID uint, revision uint) {
	key, err := agent.AgentConnectionKey(fmt.Sprintf("%d", deviceID))
	if err != nil || !agent.AgentHub.IsConnected(key) {
		return
	}
	menus := buildMenuPayloadForDevice(deviceID)
	msg := map[string]interface{}{
		"type": "agent_menu_sync",
		"data": map[string]interface{}{
			"revision": revision,
			"menus":    menus,
		},
	}
	_ = agent.AgentHub.Send(key, msg)
}

func buildMenuPayloadForDevice(deviceID uint) []map[string]interface{} {
	var as []models.AgentMenuAssignment
	database.DB.Where("device_id = ?", deviceID).Find(&as)
	out := []map[string]interface{}{}
	for _, a := range as {
		var m models.AgentMenuItem
		if err := database.DB.First(&m, a.MenuID).Error; err != nil {
			continue
		}
		var scada models.ScadaInfo
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
		out = append(out, map[string]interface{}{
			"id":                  m.ID,
			"title":               m.Title,
			"icon":                m.Icon,
			"target_type":         m.TargetType,
			"target_ref":          m.TargetRef,
			"show_on_agent_home":  m.ShowOnAgentHome,
			"intent_action":       m.IntentAction,
			"default_extras_json": m.DefaultExtrasJSON,
			"preview_path":        previewPath,
			"content_version":     contentVer,
		})
	}
	return out
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
		c.JSON(http.StatusOK, gin.H{"revision": dev.AgentMenuRevision, "menus": []interface{}{}, "unchanged": true})
		return
	}
	menus := buildMenuPayloadForDevice(dev.ID)
	c.JSON(http.StatusOK, gin.H{"revision": dev.AgentMenuRevision, "menus": menus})
}
