package outbound

import (
	"encoding/json"
	"fmt"
	"strings"

	"app-manager/models"
)

// appParam 应用参数条目（与 AppParamsJSON 数组元素对应）。
type appParam struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	Sensitive bool   `json:"sensitive"`
}

// MergeAppParamsIntoVars 将应用参数（AppParamsJSON）注入占位符表。
// 占位符格式：{{app.<key>}}，例如 key="client_id" → {{app.client_id}}。
// sensitive 字段不影响注入（运行时均可用；API 响应层负责脱敏）。
// 同时将 token cache 字段注入为全局占位符：
//
//	{{app.access_token}}、{{app.refresh_token}}、{{app.token_expires_at}}
func MergeAppParamsIntoVars(vars map[string]string, app *models.OutboundApp) {
	if vars == nil || app == nil {
		return
	}
	// app_params
	raw := strings.TrimSpace(app.AppParamsJSON)
	if raw != "" && raw != "[]" && raw != "{}" {
		var params []appParam
		if err := json.Unmarshal([]byte(raw), &params); err == nil {
			for _, p := range params {
				k := strings.TrimSpace(p.Key)
				if k == "" {
					continue
				}
				vars["{{app."+k+"}}"] = p.Value
			}
		}
	}
	// token cache → {{app.access_token}} / {{app.refresh_token}} / {{app.token_expires_at}}
	if tc := strings.TrimSpace(app.TokenCacheJSON); tc != "" && tc != "{}" {
		cache, err := parseTokenCache(tc)
		if err == nil {
			if v := strings.TrimSpace(cache.AccessToken); v != "" {
				vars["{{app.access_token}}"] = v
			}
			if v := strings.TrimSpace(cache.RefreshToken); v != "" {
				vars["{{app.refresh_token}}"] = v
			}
			if !cache.ExpiresAt.IsZero() {
				vars["{{app.token_expires_at}}"] = cache.ExpiresAt.UTC().Format("2006-01-02T15:04:05Z")
			}
		}
	}
}

// MaskSensitiveAppParamsInVars 将 sensitive=true 的应用参数在 vars 中替换为 "****"。
// 用于 API 响应层（trace/delivery 详情），避免敏感值泄露。
func MaskSensitiveAppParamsInVars(vars map[string]string, app *models.OutboundApp) {
	if vars == nil || app == nil {
		return
	}
	raw := strings.TrimSpace(app.AppParamsJSON)
	if raw == "" || raw == "[]" || raw == "{}" {
		return
	}
	var params []appParam
	if err := json.Unmarshal([]byte(raw), &params); err != nil {
		return
	}
	for _, p := range params {
		k := strings.TrimSpace(p.Key)
		if k == "" || !p.Sensitive {
			continue
		}
		key := "{{app." + k + "}}"
		if _, ok := vars[key]; ok {
			vars[key] = "****"
		}
	}
}

// MaxTemplateParamEntries / MaxTemplateParamKeyLen 阶段/步骤默认占位符条数与键长上限。
const MaxTemplateParamEntries = 64
const MaxTemplateParamKeyLen = 160

// MergeStringStringMapIntoVars 将 string→string 写入占位符表（键应为完整占位符如 {{flow.x}}）。
func MergeStringStringMapIntoVars(vars map[string]string, kv map[string]string) {
	if vars == nil || len(kv) == 0 {
		return
	}
	for k, v := range kv {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		vars[k] = v
	}
}

// MergeParamsJSONObjectIntoVars 将 JSON 对象（任意值序列化为字符串）合并进 vars；用于阶段级 default_params。
func MergeParamsJSONObjectIntoVars(vars map[string]string, rawJSON string) {
	rawJSON = strings.TrimSpace(rawJSON)
	if rawJSON == "" || rawJSON == "{}" {
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &m); err != nil || m == nil {
		return
	}
	mm := make(map[string]string, len(m))
	for k, v := range m {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		mm[k] = strings.TrimSpace(fmt.Sprint(v))
	}
	MergeStringStringMapIntoVars(vars, mm)
}

// MergeStepParamMappingsFromConfigJSON 从步骤 config 的 param_mappings 数组解析并合并进 vars。
// 这是通用的参数映射处理（HTTP、agent 步骤等都可用）。
// 须在 MergeStepEventDataToContext 之后调用，以便引用 {{context.*}}。
// ParamMapping 类型定义见 data_interface_step.go。
func MergeStepParamMappingsFromConfigJSON(vars map[string]string, configJSON string) {
	configJSON = strings.TrimSpace(configJSON)
	if configJSON == "" || configJSON == "{}" {
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &m); err != nil || m == nil {
		return
	}
	raw, ok := m["param_mappings"]
	if !ok || raw == nil {
		return
	}
	rawJSON, err := json.Marshal(raw)
	if err != nil {
		return
	}
	var mappings []ParamMapping
	if err := json.Unmarshal(rawJSON, &mappings); err != nil {
		return
	}
	for _, mapping := range mappings {
		param := strings.TrimSpace(mapping.Param)
		if param == "" {
			continue
		}
		// 确保参数名带 {{}} 包装
		paramKey := param
		if !strings.HasPrefix(paramKey, "{{") {
			paramKey = "{{" + paramKey + "}}"
		}

		source := strings.ToLower(strings.TrimSpace(mapping.Source))
		value := strings.TrimSpace(mapping.Value)

		switch source {
		case "context":
			// value 可能是 "context.payload" 或已经是完整的 "{{context.payload}}"
			var lookupKey string
			if strings.HasPrefix(value, "{{") && strings.HasSuffix(value, "}}") {
				lookupKey = value
			} else if strings.HasPrefix(value, "context.") {
				lookupKey = "{{" + value + "}}"
			} else {
				lookupKey = "{{context." + value + "}}"
			}
			if v, ok := vars[lookupKey]; ok {
				vars[paramKey] = v
			}
		case "var":
			// value 是完整的占位符或需要展开的模板
			if v, ok := vars[value]; ok {
				vars[paramKey] = v
			} else {
				vars[paramKey] = expandTemplate(value, vars)
			}
		case "fixed":
			// 固定值，直接赋值
			vars[paramKey] = value
		default:
			// 未知 source，尝试作为模板展开
			vars[paramKey] = expandTemplate(value, vars)
		}
	}
}

// MergeStepTemplateParamsFromConfigJSON 从步骤 config 的 template_params 对象和 param_mappings 数组合并进 vars。
// 须在 MergeStepEventDataToContext 之后调用，以便引用 {{context.*}} 或覆盖 event_data 写入的 context。
// 优先级：param_mappings > template_params（param_mappings 是新版 UI 生成的配置）
func MergeStepTemplateParamsFromConfigJSON(vars map[string]string, configJSON string) {
	configJSON = strings.TrimSpace(configJSON)
	if configJSON == "" || configJSON == "{}" {
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &m); err != nil || m == nil {
		return
	}

	// 先处理 template_params（旧版，低优先级）
	raw, ok := m["template_params"]
	if ok && raw != nil {
		if t, ok := raw.(map[string]interface{}); ok && t != nil {
			mm := make(map[string]string, len(t))
			for k, v := range t {
				k = strings.TrimSpace(k)
				if k == "" {
					continue
				}
				mm[k] = strings.TrimSpace(fmt.Sprint(v))
			}
			MergeStringStringMapIntoVars(vars, mm)
		}
	}

	// 再处理 param_mappings（新版 UI，高优先级，会覆盖同名 template_params）
	rawMappings, ok := m["param_mappings"]
	if !ok || rawMappings == nil {
		return
	}
	rawJSON, err := json.Marshal(rawMappings)
	if err != nil {
		return
	}
	var mappings []ParamMapping
	if err := json.Unmarshal(rawJSON, &mappings); err != nil {
		return
	}
	for _, mapping := range mappings {
		param := strings.TrimSpace(mapping.Param)
		if param == "" {
			continue
		}
		// 确保参数名带 {{}} 包装
		paramKey := param
		if !strings.HasPrefix(paramKey, "{{") {
			paramKey = "{{" + paramKey + "}}"
		}

		source := strings.ToLower(strings.TrimSpace(mapping.Source))
		value := strings.TrimSpace(mapping.Value)

		switch source {
		case "context":
			// value 可能是 "context.payload" 或已经是完整的 "{{context.payload}}"
			var lookupKey string
			if strings.HasPrefix(value, "{{") && strings.HasSuffix(value, "}}") {
				lookupKey = value
			} else if strings.HasPrefix(value, "context.") {
				lookupKey = "{{" + value + "}}"
			} else {
				lookupKey = "{{context." + value + "}}"
			}
			if v, ok := vars[lookupKey]; ok {
				vars[paramKey] = v
			}
		case "var":
			// value 是完整的占位符或需要展开的模板
			if v, ok := vars[value]; ok {
				vars[paramKey] = v
			} else {
				vars[paramKey] = expandTemplate(value, vars)
			}
		case "fixed":
			// 固定值，直接赋值
			vars[paramKey] = value
		default:
			// 未知 source，尝试作为模板展开
			vars[paramKey] = expandTemplate(value, vars)
		}
	}
}
