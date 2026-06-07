package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// requireAgentDevice 从 X-Device-Token 解析设备（与 /ws/agent/:key、ResolveDeviceID 一致）。
func requireAgentDevice(c *gin.Context) (*models.Device, bool) {
	token := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing X-Device-Token"})
		return nil, false
	}
	dev, ok := agent.LookupDeviceByConnectionKey(token)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return nil, false
	}
	return dev, true
}

// AgentListCustomEventDefinitions GET /api/agent/custom-event-definitions
// 供 Agent App 只读展示：仅返回本机当前激活监听快照中的已启用定义（无快照或未激活时为空）。
func AgentListCustomEventDefinitions(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	var st models.DeviceCustomListenState
	if err := database.DB.Where("device_id = ? AND active = ?", dev.ID, true).First(&st).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"data": []customEventDefinitionOut{}})
		return
	}
	defIDs := st.DefinitionIDs()
	if len(defIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": []customEventDefinitionOut{}})
		return
	}
	var rows []models.CustomEventDefinition
	if err := database.DB.Model(&models.CustomEventDefinition{}).Preload("Group").Where("id IN ? AND enabled = ?", defIDs, true).Order("group_id ASC, id ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]customEventDefinitionOut, 0, len(rows))
	for i := range rows {
		out = append(out, toDefOut(&rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// AgentListOutboundConnectors GET /api/agent/outbound-connectors
// 供 Agent App 只读展示：按连接器绑定的设备范围过滤（未绑定设备=全局）。
func AgentListOutboundConnectors(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	var rows []models.OutboundConnector
	if err := database.DB.Order("priority ASC, id ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, co := range rows {
		var scopeCnt int64
		database.DB.Model(&models.OutboundConnectorDevice{}).Where("connector_id = ?", co.ID).Count(&scopeCnt)
		if scopeCnt > 0 {
			var hit int64
			database.DB.Model(&models.OutboundConnectorDevice{}).Where("connector_id = ? AND device_id = ?", co.ID, dev.ID).Count(&hit)
			if hit == 0 {
				continue
			}
		}
		if outbound.ConnectorDeviceExcluded(database.DB, co.ID, dev.ID) {
			continue
		}
		var defs []models.OutboundConnectorDefinition
		database.DB.Where("connector_id = ?", co.ID).Find(&defs)
		eventKeys := make([]string, 0, len(defs))
		for _, d := range defs {
			var def models.CustomEventDefinition
			if database.DB.First(&def, d.DefinitionID).Error == nil && strings.TrimSpace(def.Key) != "" {
				eventKeys = append(eventKeys, strings.TrimSpace(def.Key))
			}
		}
		devicePaused := outbound.DeviceOutboundConnectorPaused(database.DB, co.ID, dev.ID)
		out = append(out, gin.H{
			"id":                     co.ID,
			"name":                   co.Name,
			"description":            co.Description,
			"connector_code":         co.ConnectorCode,
			"delivery_mode":          co.DeliveryMode,
			"default_timeout_ms":     co.DefaultTimeoutMS,
			"default_retry_max":      co.DefaultRetryMax,
			"debounce_same_event_ms": co.DebounceSameEventMS,
			"debounce_diff_event_ms": co.DebounceDiffEventMS,
			"debounce_same_scan_ms":  co.DebounceSameScanMS,
			"loop_cooldown_ms":       co.LoopCooldownMS,
			"priority":               co.Priority,
			"enabled":                co.Enabled,
			"event_keys":             eventKeys,
			"device_paused":          devicePaused,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// AgentGetCustomEventListenState GET /api/agent/custom-events/listen-state
// 返回本机（Token 对应设备）在库中的监听快照，无记录时 data 为 null。
func AgentGetCustomEventListenState(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	var st models.DeviceCustomListenState
	if err := database.DB.Where("device_id = ?", dev.ID).First(&st).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"data": nil})
		return
	}
	payload := gin.H{
		"device_id":        st.DeviceID,
		"active":           st.Active,
		"updated_at":       st.UpdatedAt,
		"definition_ids":   st.DefinitionIDs(),
		"event_keys":       st.EventKeys(),
		"definition_names": st.DefinitionNames(),
	}
	if st.Active {
		if defs, err := loadDefinitionsByIDs(st.DefinitionIDs()); err == nil && len(defs) > 0 {
			if rules := buildAgentRules(defs); len(rules) > 0 {
				payload["rules"] = rules
				payload["loop_guard"] = outbound.OutboundLoopGuardPayload()
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": payload})
}

// AgentPauseCustomEventListen POST /api/agent/custom-events/listen/pause
// 与 Web「暂停」一致：下发 stop_custom_event_listen 并将库中快照标为未激活。
func AgentPauseCustomEventListen(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	results := dispatchCustomEventListen([]uint{dev.ID}, "stop_custom_event_listen", nil)
	persistListenStateAfterStop(results)
	agentOK := len(results) > 0 && results[0].OK
	c.JSON(http.StatusOK, gin.H{"ok": true, "agent_notified": agentOK})
}

// AgentDeleteCustomEventListenState DELETE /api/agent/custom-events/listen-state
// 与 Web「删除」一致：下发 stop 并删除该设备监听快照行。
func AgentDeleteCustomEventListenState(c *gin.Context) {
	dev, ok := requireAgentDevice(c)
	if !ok {
		return
	}
	results := dispatchCustomEventListen([]uint{dev.ID}, "stop_custom_event_listen", nil)
	persistListenStateAfterStop(results)
	if err := database.DB.Where("device_id = ?", dev.ID).Delete(&models.DeviceCustomListenState{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	agentOK := len(results) > 0 && results[0].OK
	c.JSON(http.StatusOK, gin.H{"ok": true, "agent_notified": agentOK})
}
