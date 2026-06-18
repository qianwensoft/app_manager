package outbound

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

// ExecuteAppScriptStep 连接器独立步骤：执行内联脚本，或某外部应用上已保存的 before_request / after_response 脚本（不写 HTTP）。
// config_json 支持占位符展开，字段：
//   - code（可选）：内联 ES5 代码（function main(ctx)）；非空时直接执行内联代码，忽略 app_id/hook。
//   - timeout_ms（可选，配合 code）：内联脚本超时。
//   - app_id（内联缺省时必填）、hook（可选，before_request | after_response）：引用应用已存脚本。
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
		Attempts:      1,
		RequestURL:    "app_script://",
	}
	if vars == nil {
		vars = TemplateVars(rec, dev, def)
	}

	t0 := time.Now()
	appID, hook, err := runAppScriptCore(db, step, vars)
	d.RequestURL = "app_script://" + hook
	d.DurationMS = time.Since(t0).Milliseconds()
	if err != nil {
		d.Error = err.Error()
		d.DetailJSON = marshalAppScriptStepDetail(appID, hook, d.Error)
		_ = db.Create(&d).Error
		return d
	}
	d.Status = "success"
	d.Error = ""
	d.DetailJSON = marshalAppScriptStepDetail(appID, hook, "")
	_ = db.Create(&d).Error
	return d
}

// runAppScriptCore 执行 app_script 步骤的实际脚本（不写 OutboundDelivery），供生产与预览/调试共用。
// 返回解析出的 appID、hook（内联代码时 hook="inline"）与执行错误。
func runAppScriptCore(db *gorm.DB, step models.OutboundConnectorStep, vars map[string]string) (uint, string, error) {
	raw := strings.TrimSpace(expandTemplate(step.ConfigJSON, vars))
	if raw == "" {
		raw = "{}"
	}
	var cfg struct {
		AppID     uint   `json:"app_id"`
		Hook      string `json:"hook"`
		Code      string `json:"code"`
		TimeoutMS int    `json:"timeout_ms"`
	}
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return 0, "", fmt.Errorf("config_json: %w", err)
	}

	// 内联代码优先：不依赖 app_id。
	if strings.TrimSpace(cfg.Code) != "" {
		env := &ScriptEnv{}
		if err := RunInlineScript(cfg.Code, "app_script_inline", cfg.TimeoutMS, vars, env); err != nil {
			return 0, "inline", err
		}
		applyScriptOutResp(vars, 0, env)
		return 0, "inline", nil
	}

	if cfg.AppID == 0 {
		return 0, cfg.Hook, fmt.Errorf("config 中须设置 app_id（外部应用 ID）或内联 code")
	}
	hook := NormalizeAppScriptHook(cfg.Hook)
	var app models.OutboundApp
	if err := db.First(&app, cfg.AppID).Error; err != nil {
		return cfg.AppID, string(hook), fmt.Errorf("外部应用不存在")
	}
	if !app.Enabled {
		return cfg.AppID, string(hook), fmt.Errorf("外部应用已禁用")
	}
	env := &ScriptEnv{}
	if err := RunAppExtensionScript(hook, &app, vars, env); err != nil {
		return cfg.AppID, string(hook), err
	}
	applyScriptOutResp(vars, 0, env)
	return cfg.AppID, string(hook), nil
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
