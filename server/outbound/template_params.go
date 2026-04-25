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
//   {{app.access_token}}、{{app.refresh_token}}、{{app.token_expires_at}}
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

// MergeStepTemplateParamsFromConfigJSON 从步骤 config 的 template_params 对象合并进 vars（须在 MergeStepEventDataToContext 之后调用，以便覆盖 event_data 写入的 context）。
func MergeStepTemplateParamsFromConfigJSON(vars map[string]string, configJSON string) {
	configJSON = strings.TrimSpace(configJSON)
	if configJSON == "" || configJSON == "{}" {
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(configJSON), &m); err != nil || m == nil {
		return
	}
	raw, ok := m["template_params"]
	if !ok || raw == nil {
		return
	}
	t, ok := raw.(map[string]interface{})
	if !ok || t == nil {
		return
	}
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
