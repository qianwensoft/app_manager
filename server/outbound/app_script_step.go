package outbound

import (
	"encoding/json"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

// ExecuteAppScriptStep 连接器独立步骤：仅执行某外部应用上已保存的 before_request / after_response 脚本（不写 HTTP）。
// config_json 支持占位符展开，字段：app_id（必填）、hook（可选，before_request | after_response）。
func ExecuteAppScriptStep(db *gorm.DB, connector models.OutboundConnector, step models.OutboundConnectorStep,
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
		Attempts:   1,
		RequestURL: "app_script://",
	}
	if vars == nil {
		vars = TemplateVars(rec, dev, def)
	}

	raw := strings.TrimSpace(expandTemplate(step.ConfigJSON, vars))
	if raw == "" {
		raw = "{}"
	}
	var cfg struct {
		AppID uint   `json:"app_id"`
		Hook  string `json:"hook"`
	}
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		d.Error = "config_json: " + err.Error()
		d.DetailJSON = marshalAppScriptStepDetail(0, "", d.Error)
		_ = db.Create(&d).Error
		return d
	}
	if cfg.AppID == 0 {
		d.Error = "config 中须设置 app_id（外部应用 ID）"
		d.DetailJSON = marshalAppScriptStepDetail(0, cfg.Hook, d.Error)
		_ = db.Create(&d).Error
		return d
	}
	hook := NormalizeAppScriptHook(cfg.Hook)
	d.RequestURL = "app_script://" + string(hook)

	var app models.OutboundApp
	if err := db.First(&app, cfg.AppID).Error; err != nil {
		d.Error = "外部应用不存在"
		d.DetailJSON = marshalAppScriptStepDetail(cfg.AppID, string(hook), d.Error)
		_ = db.Create(&d).Error
		return d
	}
	if !app.Enabled {
		d.Error = "外部应用已禁用"
		d.DetailJSON = marshalAppScriptStepDetail(cfg.AppID, string(hook), d.Error)
		_ = db.Create(&d).Error
		return d
	}

	env := &ScriptEnv{}
	if hook == AppScriptHookAfterResponse {
		env.RespStatus = 0
		env.RespBody = ""
	}

	t0 := time.Now()
	if err := RunAppExtensionScript(hook, &app, vars, env); err != nil {
		d.Error = err.Error()
		d.DurationMS = time.Since(t0).Milliseconds()
		d.DetailJSON = marshalAppScriptStepDetail(cfg.AppID, string(hook), d.Error)
		_ = db.Create(&d).Error
		return d
	}
	d.Status = "success"
	d.Error = ""
	d.DurationMS = time.Since(t0).Milliseconds()
	d.DetailJSON = marshalAppScriptStepDetail(cfg.AppID, string(hook), "")
	_ = db.Create(&d).Error
	return d
}

func marshalAppScriptStepDetail(appID uint, hook, errMsg string) string {
	m := map[string]interface{}{
		"app_script": map[string]interface{}{
			"app_id": appID,
			"hook":   hook,
		},
	}
	if errMsg != "" {
		m["error"] = errMsg
	}
	b, _ := json.Marshal(m)
	return string(b)
}
