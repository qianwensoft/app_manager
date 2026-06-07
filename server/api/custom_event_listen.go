package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// BatchCustomEventListenBody 批量下发监听；规则来自已选定义或分组内全部启用定义，皆空则使用全局全部启用定义。
type BatchCustomEventListenBody struct {
	DeviceIDs      []uint `json:"device_ids" binding:"required"`
	DefinitionIDs  []uint `json:"definition_ids"`
	GroupIDs       []uint `json:"group_ids"`
}

// agentCustomEventRule 下发给 Android Agent 的单条映射。
type agentCustomEventRule struct {
	EventType string   `json:"event_type"`
	Actions   []string `json:"actions"`
	ExtraKeys []string `json:"extra_keys"`
}

// BatchStartCustomEventListen 向多台在线 Agent 下发 start_custom_event_listen（含 rules）。
func BatchStartCustomEventListen(c *gin.Context) {
	var req BatchCustomEventListenBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defs, err := resolveDefinitionsForListen(req.DefinitionIDs, req.GroupIDs)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rules := buildAgentRules(defs)
	if len(rules) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有可用的自定义事件定义（请先在「事件定义」中配置并启用）"})
		return
	}
	data := map[string]interface{}{
		"rules":      rules,
		"loop_guard": outbound.OutboundLoopGuardPayload(),
	}
	results := dispatchCustomEventListen(req.DeviceIDs, "start_custom_event_listen", data)
	persistListenStateAfterStart(defs, results)
	c.JSON(http.StatusOK, gin.H{"data": results})
}

// BatchStopListenBody 仅停止监听，不需传定义。
type BatchStopListenBody struct {
	DeviceIDs []uint `json:"device_ids" binding:"required"`
}

// BatchStopCustomEventListen 停止监听。
func BatchStopCustomEventListen(c *gin.Context) {
	var req BatchStopListenBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	results := dispatchCustomEventListen(req.DeviceIDs, "stop_custom_event_listen", nil)
	persistListenStateAfterStop(results)
	c.JSON(http.StatusOK, gin.H{"data": results})
}

type customEventListenResult struct {
	DeviceID uint   `json:"device_id"`
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
}

func dispatchCustomEventListen(deviceIDs []uint, action string, data map[string]interface{}) []customEventListenResult {
	out := make([]customEventListenResult, 0, len(deviceIDs))
	msg := map[string]interface{}{
		"type":   "command",
		"action": action,
	}
	if data != nil {
		msg["data"] = data
	}
	for _, id := range deviceIDs {
		r := customEventListenResult{DeviceID: id}
		if _, err := agent.AgentConnectionKeyCandidates(strconv.FormatUint(uint64(id), 10)); err != nil {
			r.Error = err.Error()
			out = append(out, r)
			continue
		}
		if !agent.AgentHub.SendToDevice(id, msg) {
			r.Error = "agent offline"
			out = append(out, r)
			continue
		}
		r.OK = true
		out = append(out, r)
	}
	return out
}

func resolveDefinitionsForListen(definitionIDs, groupIDs []uint) ([]models.CustomEventDefinition, error) {
	seen := make(map[uint]struct{})
	var out []models.CustomEventDefinition

	addRows := func(rows []models.CustomEventDefinition) {
		for i := range rows {
			if _, ok := seen[rows[i].ID]; ok {
				continue
			}
			seen[rows[i].ID] = struct{}{}
			out = append(out, rows[i])
		}
	}

	if len(definitionIDs) > 0 {
		var rows []models.CustomEventDefinition
		if err := database.DB.Where("id IN ? AND enabled = ?", definitionIDs, true).Order("id ASC").Find(&rows).Error; err != nil {
			return nil, err
		}
		addRows(rows)
	}
	if len(groupIDs) > 0 {
		var rows []models.CustomEventDefinition
		if err := database.DB.Where("group_id IN ? AND enabled = ?", groupIDs, true).Order("id ASC").Find(&rows).Error; err != nil {
			return nil, err
		}
		addRows(rows)
	}
	if len(definitionIDs) == 0 && len(groupIDs) == 0 {
		var rows []models.CustomEventDefinition
		if err := database.DB.Where("enabled = ?", true).Order("group_id ASC, id ASC").Find(&rows).Error; err != nil {
			return nil, err
		}
		addRows(rows)
	}

	for _, d := range out {
		if len(d.BroadcastActions()) == 0 || len(d.ExtraKeys()) == 0 {
			return nil, errInvalidDef(d.Key)
		}
	}
	return out, nil
}

type listenDefErr struct{ key string }

func (e listenDefErr) Error() string {
	return "定义 " + e.key + " 缺少广播动作或数据标签"
}

func errInvalidDef(key string) error { return listenDefErr{key: key} }

func buildAgentRules(defs []models.CustomEventDefinition) []agentCustomEventRule {
	rules := make([]agentCustomEventRule, 0, len(defs))
	for _, d := range defs {
		rules = append(rules, agentCustomEventRule{
			EventType: d.Key,
			Actions:   d.BroadcastActions(),
			ExtraKeys: d.ExtraKeys(),
		})
	}
	return rules
}

func loadDefinitionsByIDs(ids []uint) ([]models.CustomEventDefinition, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var rows []models.CustomEventDefinition
	if err := database.DB.Where("id IN ? AND enabled = ?", ids, true).Order("id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func agentListenRulesPayload(defs []models.CustomEventDefinition) map[string]interface{} {
	rules := buildAgentRules(defs)
	if len(rules) == 0 {
		return nil
	}
	return map[string]interface{}{
		"rules":      rules,
		"loop_guard": outbound.OutboundLoopGuardPayload(),
	}
}

// RestoreDeviceCustomEventListenForDeviceID Agent 重连后按库中 active 快照重新下发 start_custom_event_listen。
func RestoreDeviceCustomEventListenForDeviceID(deviceID uint) {
	if deviceID == 0 {
		return
	}
	var st models.DeviceCustomListenState
	if err := database.DB.Where("device_id = ? AND active = ?", deviceID, true).First(&st).Error; err != nil {
		return
	}
	defs, err := loadDefinitionsByIDs(st.DefinitionIDs())
	if err != nil || len(defs) == 0 {
		return
	}
	data := agentListenRulesPayload(defs)
	if data == nil {
		return
	}
	msg := map[string]interface{}{
		"type":   "command",
		"action": "start_custom_event_listen",
		"data":   data,
	}
	if agent.AgentHub.SendToDevice(deviceID, msg) {
		log.Printf("[custom-event] restored listen for device %d (%d rules)", deviceID, len(defs))
	}
}

// RestoreDeviceCustomEventListenForAgentKey 根据 WS 连接键解析设备 ID 并恢复监听。
func RestoreDeviceCustomEventListenForAgentKey(agentKey string) {
	devID, ok := agent.ResolveDeviceID(agentKey)
	if !ok {
		return
	}
	RestoreDeviceCustomEventListenForDeviceID(devID)
}
