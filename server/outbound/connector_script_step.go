package outbound

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

// connectorCustomScript 连接器全局自定义脚本配置（outbound_connectors.custom_script_json）。
type connectorCustomScript struct {
	Steps  []connectorScriptEntry `json:"steps"`
	Result connectorScriptEntry   `json:"result"`
}

type connectorScriptEntry struct {
	Name      string `json:"name"`
	Enabled   bool   `json:"enabled"`
	Code      string `json:"code"`
	TimeoutMS int    `json:"timeout_ms"`
}

// ParseConnectorCustomScript 解析连接器全局自定义脚本；空串返回零值。
func ParseConnectorCustomScript(raw string) connectorCustomScript {
	var cs connectorCustomScript
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" || raw == "null" {
		return cs
	}
	_ = json.Unmarshal([]byte(raw), &cs)
	return cs
}

// ExecuteConnectorScriptStep 连接器内联脚本步骤（step_type=connector_script）。
// config_json 字段：code（内联 ES5，function main(ctx)）、timeout_ms；或 ref（引用连接器全局 steps[].name）。
func ExecuteConnectorScriptStep(db *gorm.DB, connector models.OutboundConnector, step models.OutboundConnectorStep,
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
		RequestURL:    "connector_script://",
	}
	if vars == nil {
		vars = TemplateVars(rec, dev, def)
	}

	t0 := time.Now()
	err := runConnectorScriptCore(connector, step, vars)
	d.DurationMS = time.Since(t0).Milliseconds()
	if err != nil {
		d.Error = err.Error()
		d.DetailJSON = marshalConnectorScriptStepDetail(d.Error)
		_ = db.Create(&d).Error
		return d
	}
	d.Status = "success"
	d.DetailJSON = marshalConnectorScriptStepDetail("")
	_ = db.Create(&d).Error
	return d
}

// runConnectorScriptCore 执行 connector_script 步骤的实际脚本（不写 OutboundDelivery），供生产与预览共用。
func runConnectorScriptCore(connector models.OutboundConnector, step models.OutboundConnectorStep, vars map[string]string) error {
	raw := strings.TrimSpace(expandTemplate(step.ConfigJSON, vars))
	if raw == "" {
		raw = "{}"
	}
	var cfg struct {
		Code      string `json:"code"`
		Ref       string `json:"ref"`
		TimeoutMS int    `json:"timeout_ms"`
	}
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return fmt.Errorf("config_json: %w", err)
	}
	code := cfg.Code
	timeout := cfg.TimeoutMS
	// ref：从连接器全局 steps 里按 name 取代码
	if strings.TrimSpace(code) == "" && strings.TrimSpace(cfg.Ref) != "" {
		cs := ParseConnectorCustomScript(connector.CustomScriptJSON)
		for i := range cs.Steps {
			if cs.Steps[i].Name == cfg.Ref {
				if !cs.Steps[i].Enabled {
					return fmt.Errorf("引用的连接器脚本 %q 未启用", cfg.Ref)
				}
				code = cs.Steps[i].Code
				timeout = cs.Steps[i].TimeoutMS
				break
			}
		}
		if strings.TrimSpace(code) == "" {
			return fmt.Errorf("未找到连接器脚本 %q", cfg.Ref)
		}
	}
	if strings.TrimSpace(code) == "" {
		return fmt.Errorf("config 中须设置 code 或 ref")
	}
	env := &ScriptEnv{}
	if err := RunInlineScript(code, "connector_script", timeout, vars, env); err != nil {
		return err
	}
	applyScriptOutResp(vars, 0, env)
	return nil
}

func marshalConnectorScriptStepDetail(errMsg string) string {
	m := map[string]interface{}{"connector_script": map[string]interface{}{}}
	if errMsg != "" {
		m["error"] = errMsg
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// RunConnectorResultScript 接口模式全流程结束、应用 output_mappings 之后执行连接器全局 result 脚本，
// 整体改写返回值。output 为当前返回对象，contextVars 为 {{context.*}} 占位符表（可为 nil）。
// 脚本通过 ctx.getResponseBody() 读到 output 的 JSON、ctx.setResponseBody(json) 整体替换；
// 也可用 ctx.getContext/setContext 读写 context。返回（可能被改写的）新 output 与是否执行。
func RunConnectorResultScript(customScriptJSON string, output map[string]interface{}, contextVars map[string]string) (map[string]interface{}, bool, error) {
	cs := ParseConnectorCustomScript(customScriptJSON)
	if !cs.Result.Enabled || strings.TrimSpace(cs.Result.Code) == "" {
		return output, false, nil
	}
	// 序列化当前返回值作为脚本可读的响应体
	bodyBytes, _ := json.Marshal(output)
	vars := map[string]string{}
	for k, v := range contextVars {
		vars[k] = v
	}
	env := &ScriptEnv{RespStatus: 200, RespBody: string(bodyBytes)}
	if err := RunInlineScript(cs.Result.Code, "connector_result", cs.Result.TimeoutMS, vars, env); err != nil {
		return output, true, err
	}
	if env.OutRespBody != nil {
		var newOut map[string]interface{}
		if err := json.Unmarshal([]byte(*env.OutRespBody), &newOut); err != nil {
			return output, true, fmt.Errorf("返回值脚本输出非合法 JSON 对象: %w", err)
		}
		return newOut, true, nil
	}
	return output, true, nil
}
