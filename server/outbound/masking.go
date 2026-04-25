package outbound

import (
	"encoding/json"
	"net/http"
	"strings"

	"app-manager/models"
)

// SensitiveMasker 统一脱敏服务：收集敏感值列表，提供字符串/Map/Trace 脱敏方法。
// 使用方式：
//
//	m := NewSensitiveMasker(app)
//	m.AddTokenValues(responseBody)   // 可选：把响应中的 token 实际值也列入脱敏
//	masked := m.MaskString(s)
type SensitiveMasker struct {
	secrets []string
}

// NewSensitiveMasker 从应用参数中提取所有 sensitive=true 的参数值，初始化 masker。
func NewSensitiveMasker(app *models.OutboundApp) *SensitiveMasker {
	return &SensitiveMasker{secrets: collectSensitiveParamValues(app)}
}

// AddSecrets 追加任意额外敏感值（如动态获取的 token 实际值）。
func (m *SensitiveMasker) AddSecrets(vals ...string) {
	for _, v := range vals {
		if v != "" && v != "****" {
			m.secrets = append(m.secrets, v)
		}
	}
}

// AddTokenValues 从 JSON 响应体中提取 access_token / refresh_token 实际值并加入脱敏列表。
func (m *SensitiveMasker) AddTokenValues(body string) {
	m.AddSecrets(tokenValuesFromJSON(body)...)
}

// MaskString 替换字符串中所有已知敏感值为 "****"。
func (m *SensitiveMasker) MaskString(s string) string {
	for _, sec := range m.secrets {
		s = strings.ReplaceAll(s, sec, "****")
	}
	return s
}

// MaskStringMap 对 map 的每个值做脱敏，返回新 map（不修改原始）。
func (m *SensitiveMasker) MaskStringMap(hdr map[string]string) map[string]string {
	if len(hdr) == 0 {
		return hdr
	}
	out := make(map[string]string, len(hdr))
	for k, v := range hdr {
		out[k] = m.MaskString(v)
	}
	return out
}

// MaskTrace 对 TokenExchangeTrace 的请求/响应 body 与 headers 做深度脱敏，返回副本。
func (m *SensitiveMasker) MaskTrace(tr *TokenExchangeTrace) *TokenExchangeTrace {
	if tr == nil {
		return nil
	}
	cp := *tr
	cp.Request.Body = m.MaskString(cp.Request.Body)
	cp.Request.Headers = m.MaskStringMap(cp.Request.Headers)
	cp.Response.Body = m.MaskString(cp.Response.Body)
	cp.Response.Headers = m.MaskStringMap(cp.Response.Headers)
	return &cp
}

// MaskAppParamsInVars 将 sensitive=true 的应用参数在 vars 中替换为 "****"（不影响运行时替换）。
func (m *SensitiveMasker) MaskAppParamsInVars(vars map[string]string, app *models.OutboundApp) {
	MaskSensitiveAppParamsInVars(vars, app)
}

// SanitizeHTTPHeaders 对标准 HTTP Header 做脱敏：Authorization、Cookie、Set-Cookie 及含 api-key 的键
// 替换为 "[redacted]"，其余正常输出。返回 map[string]string（供日志/trace 使用）。
func SanitizeHTTPHeaders(h http.Header) map[string]string {
	if h == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(h))
	for k, vals := range h {
		lk := strings.ToLower(strings.TrimSpace(k))
		switch lk {
		case "authorization", "proxy-authorization", "cookie", "set-cookie":
			out[k] = "[redacted]"
		default:
			if strings.Contains(lk, "api-key") || strings.Contains(lk, "apikey") {
				out[k] = "[redacted]"
			} else {
				out[k] = strings.Join(vals, "; ")
			}
		}
	}
	return out
}

// --- 包级工具函数（保持向后兼容，供内部代码直接调用）---

// collectSensitiveParamValues 从应用参数 JSON 中提取 sensitive=true 的参数实际值。
func collectSensitiveParamValues(app *models.OutboundApp) []string {
	if app == nil {
		return nil
	}
	raw := strings.TrimSpace(app.AppParamsJSON)
	if raw == "" || raw == "[]" {
		return nil
	}
	var params []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &params); err != nil {
		return nil
	}
	var vals []string
	for _, p := range params {
		if sensitive, _ := p["sensitive"].(bool); !sensitive {
			continue
		}
		if v, _ := p["value"].(string); v != "" && v != "****" {
			vals = append(vals, v)
		}
	}
	return vals
}

// tokenValuesFromJSON 从 JSON body 中提取 access_token / refresh_token 的实际值。
func tokenValuesFromJSON(body string) []string {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(body), &m); err != nil {
		return nil
	}
	var vals []string
	for _, key := range []string{"access_token", "refresh_token"} {
		if v, ok := m[key].(string); ok && v != "" {
			vals = append(vals, v)
		}
	}
	return vals
}
