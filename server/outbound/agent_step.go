package outbound

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"app-manager/agent"
	"app-manager/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ExecuteAgentOutboundStep 向事件来源设备下发 open_url、broadcast_intent 或 message（顶部提醒）。
func ExecuteAgentOutboundStep(db *gorm.DB, connector models.OutboundConnector, step models.OutboundConnectorStep,
	rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition, vars map[string]string, meta StepExecutionMeta,
) models.OutboundDelivery {
	st := NormalizeOutboundStepType(step.StepType)
	if meta.StepType == "" {
		meta.StepType = st
	}
	d := models.OutboundDelivery{
		DeviceEventID: rec.ID,
		ConnectorID:   connector.ID,
		PhaseID:       meta.PhaseID,
		StepID:        meta.StepID,
		StepType:      st,
		EndpointID:    0,
		Status:        "failed",
		Attempts:      1,
	}

	key, err := agent.AgentConnectionKey(strconv.FormatUint(uint64(rec.DeviceID), 10))
	if err != nil {
		d.Error = err.Error()
		d.DetailJSON = AgentSetupDetail(st, d.Error)
		_ = db.Create(&d).Error
		return d
	}
	if !agent.AgentHub.IsConnected(key) {
		d.Error = "Agent 未在线，无法反推设备"
		d.DetailJSON = AgentSetupDetail(st, d.Error)
		_ = db.Create(&d).Error
		return d
	}

	rawCfg := strings.TrimSpace(expandTemplate(step.ConfigJSON, vars))
	if rawCfg == "" {
		rawCfg = "{}"
	}
	d.RequestURL = "agent://" + st

	t0 := time.Now()
	cmdID := fmt.Sprintf("ob_%s", strings.ReplaceAll(uuid.New().String(), "-", ""))

	switch st {
	case "view_url":
		var m struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal([]byte(rawCfg), &m); err != nil {
			d.Error = "config_json: " + err.Error()
			d.DurationMS = time.Since(t0).Milliseconds()
			d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
			_ = db.Create(&d).Error
			return d
		}
		u := strings.TrimSpace(m.URL)
		if u == "" {
			d.Error = "缺少 url"
			d.DurationMS = time.Since(t0).Milliseconds()
			d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
			_ = db.Create(&d).Error
			return d
		}
		msg := map[string]interface{}{
			"type":       "command",
			"action":     "open_url",
			"command_id": cmdID,
			"data":       map[string]interface{}{"url": u, "embedded": true},
		}
		_ = agent.AgentHub.Send(key, msg)
		d.Status = "success"
		d.Error = ""
		d.DurationMS = time.Since(t0).Milliseconds()
		d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, cmdID, msg, "")
		_ = db.Create(&d).Error
		return d
	case "broadcast_intent":
		var m struct {
			Action  string                 `json:"action"`
			Package string                 `json:"package"`
			Extras  map[string]interface{} `json:"extras"`
		}
		if err := json.Unmarshal([]byte(rawCfg), &m); err != nil {
			d.Error = "config_json: " + err.Error()
			d.DurationMS = time.Since(t0).Milliseconds()
			d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
			_ = db.Create(&d).Error
			return d
		}
		if strings.TrimSpace(m.Action) == "" {
			d.Error = "缺少 action"
			d.DurationMS = time.Since(t0).Milliseconds()
			d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
			_ = db.Create(&d).Error
			return d
		}
		ex := map[string]interface{}{}
		for k, v := range m.Extras {
			k = strings.TrimSpace(k)
			if k == "" {
				continue
			}
			ex[k] = v
		}
		data := map[string]interface{}{
			"action": strings.TrimSpace(m.Action),
			"extras": ex,
		}
		if p := strings.TrimSpace(m.Package); p != "" {
			data["package"] = p
		}
		msg := map[string]interface{}{
			"type":       "command",
			"action":     "broadcast_intent",
			"command_id": cmdID,
			"data":       data,
		}
		_ = agent.AgentHub.Send(key, msg)
		d.Status = "success"
		d.Error = ""
		d.DurationMS = time.Since(t0).Milliseconds()
		d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, cmdID, msg, "")
		_ = db.Create(&d).Error
		return d
	case "message":
		var m struct {
			Title      string `json:"title"`
			Body       string `json:"body"`
			Text       string `json:"text"`
			Message    string `json:"message"`
			DurationMS int    `json:"duration_ms"`
		}
		if err := json.Unmarshal([]byte(rawCfg), &m); err != nil {
			d.Error = "config_json: " + err.Error()
			d.DurationMS = time.Since(t0).Milliseconds()
			d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
			_ = db.Create(&d).Error
			return d
		}
		body := strings.TrimSpace(m.Body)
		if body == "" {
			body = strings.TrimSpace(m.Text)
		}
		if body == "" {
			body = strings.TrimSpace(m.Message)
		}
		if body == "" {
			d.Error = "缺少正文（body / text / message 至少填一项）"
			d.DurationMS = time.Since(t0).Milliseconds()
			d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, "", nil, d.Error)
			_ = db.Create(&d).Error
			return d
		}
		title := strings.TrimSpace(m.Title)
		if title == "" {
			title = "通知"
		}
		dur := m.DurationMS
		if dur < 1500 {
			dur = 8000
		}
		if dur > 600_000 {
			dur = 600_000
		}
		msg := map[string]interface{}{
			"type":       "command",
			"action":     "show_device_message",
			"command_id": cmdID,
			"data": map[string]interface{}{
				"title":       title,
				"body":        body,
				"duration_ms": dur,
			},
		}
		_ = agent.AgentHub.Send(key, msg)
		d.Status = "success"
		d.Error = ""
		d.DurationMS = time.Since(t0).Milliseconds()
		d.DetailJSON = MarshalAgentDeliveryDetail(st, rawCfg, cmdID, msg, "")
		_ = db.Create(&d).Error
		return d
	default:
		d.Error = "未知 step_type: " + st
		d.DurationMS = time.Since(t0).Milliseconds()
		d.DetailJSON = AgentSetupDetail(st, d.Error)
		_ = db.Create(&d).Error
		return d
	}
}
