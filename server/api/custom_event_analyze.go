package api

import (
	"app-manager/agent"
	"app-manager/event"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type startEventAnalyzeBody struct {
	DeviceID     uint     `json:"device_id" binding:"required"`
	MinScans     int      `json:"min_scans"`
	ProbeMode    string   `json:"probe_mode"`
	ProbeActions []string `json:"probe_actions"`
}

// StartCustomEventAnalyze POST /api/custom-events/analyze/start
// 向 Agent 下发探针监听，多次扫码后由 STOMP 推送观测与定义匹配建议。
func StartCustomEventAnalyze(c *gin.Context) {
	var req startEventAnalyzeBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.DeviceID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id 无效"})
		return
	}
	if _, err := agent.AgentConnectionKeyCandidates(strconv.FormatUint(uint64(req.DeviceID), 10)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.SendToDevice(req.DeviceID, map[string]interface{}{
		"type":   "command",
		"action": "stop_custom_event_listen",
	}) {
		// 探针模式替代正式监听，离线时仍创建会话供 UI 展示
	}
	probeMode := strings.TrimSpace(req.ProbeMode)
	if probeMode == "" {
		probeMode = event.ProbeModePreset
	}
	if probeMode != event.ProbeModePreset && probeMode != event.ProbeModeCustom {
		c.JSON(http.StatusBadRequest, gin.H{"error": "probe_mode 须为 preset 或 custom"})
		return
	}
	if probeMode == event.ProbeModeCustom && len(event.NormalizeProbePatterns(req.ProbeActions)) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "自定义探针须至少填写一个 Action（支持 com.vendor.* 通配）"})
		return
	}
	catalog := event.CollectProbeActions()
	probe := event.BuildProbeActions(probeMode, req.ProbeActions, catalog)
	if len(probe.RegisterActions) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法解析探针 Action，请检查输入或使用预设探针"})
		return
	}
	sess := event.StartAnalyzeSession(req.DeviceID, probeMode, probe.Patterns)
	probeData := map[string]interface{}{
		"session_id": sess.ID,
		"actions":    probe.RegisterActions,
	}
	if len(probe.Patterns) > 0 {
		probeData["patterns"] = probe.Patterns
	}
	agentOK := agent.AgentHub.SendToDevice(req.DeviceID, map[string]interface{}{
		"type":   "command",
		"action": "start_custom_event_probe",
		"data":   probeData,
	})
	minScans := req.MinScans
	if minScans <= 0 {
		minScans = 2
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"session_id":     sess.ID,
			"device_id":      sess.DeviceID,
			"active":         sess.Active,
			"min_scans":      minScans,
			"probe_mode":     sess.ProbeMode,
			"probe_patterns": sess.ProbePatterns,
			"action_count":   len(probe.RegisterActions),
			"agent_notified": agentOK,
		},
	})
}

type stopEventAnalyzeBody struct {
	DeviceID uint `json:"device_id" binding:"required"`
}

// StopCustomEventAnalyze POST /api/custom-events/analyze/stop
func StopCustomEventAnalyze(c *gin.Context) {
	var req stopEventAnalyzeBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = agent.AgentHub.SendToDevice(req.DeviceID, map[string]interface{}{
		"type":   "command",
		"action": "stop_custom_event_probe",
	})
	sess, obs, sug, ok := event.StopAnalyzeSession(req.DeviceID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "无进行中的分析会话"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"session":      sess,
			"observations": obs,
			"suggestions":  sug,
		},
	})
}

// GetCustomEventAnalyzeSession GET /api/custom-events/analyze/session/:device_id
func GetCustomEventAnalyzeSession(c *gin.Context) {
	idStr := c.Param("device_id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device_id"})
		return
	}
	sess, obs, sug := event.GetActiveAnalyzeSession(uint(id64))
	if sess == nil {
		c.JSON(http.StatusOK, gin.H{"data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"session":      sess,
			"observations": obs,
			"suggestions":  sug,
		},
	})
}
