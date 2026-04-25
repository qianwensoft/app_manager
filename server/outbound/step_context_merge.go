package outbound

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"

	"app-manager/models"
)

const (
	// ContextMergeOff 不在 vars 中注入 event_data 展平的键（兼容旧连接器）。
	ContextMergeOff = "off"
	// ContextMergeEventDataJSON 将 device_event.event_data 解析为 JSON 后展平为 {{context.<路径>}}（本步执行前写入）。
	ContextMergeEventDataJSON = "event_data_json"
	// ContextMergeHTTPResponseJSON 将本步 HTTP 响应体（2xx 且为 JSON）展平为 {{context.<路径>}}（请求成功之后写入，供后续步骤/脚本使用）。
	ContextMergeHTTPResponseJSON = "http_response_json"
)

const maxContextFlattenKeys = 300

func parseStepConfigMap(configJSON string) map[string]interface{} {
	s := strings.TrimSpace(configJSON)
	if s == "" || s == "{}" {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(s), &m); err != nil || m == nil {
		return nil
	}
	return m
}

func legacySingleContextMerge(m map[string]interface{}) string {
	if m == nil {
		return ContextMergeOff
	}
	v, ok := m["context_merge"]
	if !ok {
		return ContextMergeOff
	}
	switch strings.TrimSpace(strings.ToLower(fmt.Sprint(v))) {
	case ContextMergeHTTPResponseJSON, "http_response", "response_json":
		return ContextMergeHTTPResponseJSON
	case ContextMergeEventDataJSON, "on", "true", "1":
		return ContextMergeEventDataJSON
	default:
		return ContextMergeOff
	}
}

// StepContextMergeMode 读取旧版单一字段 context_merge（兼容旧数据）；不含 context_merge_before/after 时与运行时「二选一」语义一致。
func StepContextMergeMode(configJSON string) string {
	return legacySingleContextMerge(parseStepConfigMap(configJSON))
}

// ContextMergeBefore 执行前：是否将 device_event.event_data 按 JSON 展平写入 {{context.*}}，供本步 URL/Body/消息等模板入参使用。
func ContextMergeBefore(configJSON string) string {
	m := parseStepConfigMap(configJSON)
	if m == nil {
		return ContextMergeOff
	}
	if v, ok := m["context_merge_before"]; ok {
		switch strings.TrimSpace(strings.ToLower(fmt.Sprint(v))) {
		case ContextMergeEventDataJSON, "on", "true", "1":
			return ContextMergeEventDataJSON
		default:
			return ContextMergeOff
		}
	}
	if legacySingleContextMerge(m) == ContextMergeEventDataJSON {
		return ContextMergeEventDataJSON
	}
	return ContextMergeOff
}

// ContextMergeAfterHTTP 执行后（仅 HTTP）：是否在 2xx 后将响应 JSON body 展平写入 {{context.*}}，供后续步骤使用。
func ContextMergeAfterHTTP(configJSON string) string {
	m := parseStepConfigMap(configJSON)
	if m == nil {
		return ContextMergeOff
	}
	if v, ok := m["context_merge_after"]; ok {
		switch strings.TrimSpace(strings.ToLower(fmt.Sprint(v))) {
		case ContextMergeHTTPResponseJSON, "http_response", "response_json":
			return ContextMergeHTTPResponseJSON
		default:
			return ContextMergeOff
		}
	}
	if legacySingleContextMerge(m) == ContextMergeHTTPResponseJSON {
		return ContextMergeHTTPResponseJSON
	}
	return ContextMergeOff
}

// MergeStepEventDataToContext 将设备事件的 event_data JSON 展成 {{context.*}} 写入 vars（执行前，见 ContextMergeBefore）。
func MergeStepEventDataToContext(vars map[string]string, step models.OutboundConnectorStep, rec models.DeviceEvent) {
	if vars == nil {
		return
	}
	if ContextMergeBefore(step.ConfigJSON) != ContextMergeEventDataJSON {
		return
	}
	FlattenJSONEventDataIntoContext(vars, rec.EventData, "context", maxContextFlattenKeys)
}

// MergeHTTPResponseBodyToContext 将 HTTP 响应正文按 JSON 展平写入 targetVars（执行后，见 ContextMergeAfterHTTP）。
func MergeHTTPResponseBodyToContext(targetVars map[string]string, step models.OutboundConnectorStep, body []byte) {
	if targetVars == nil || len(body) == 0 {
		return
	}
	if ContextMergeAfterHTTP(step.ConfigJSON) != ContextMergeHTTPResponseJSON {
		return
	}
	FlattenJSONEventDataIntoContext(targetVars, string(body), "context", maxContextFlattenKeys)
}

// FlattenJSONEventDataIntoContext 将 JSON 文本展平到 vars；对象用点路径，数组与非对象根序列化为 JSON 字符串。
func FlattenJSONEventDataIntoContext(vars map[string]string, eventData, prefix string, maxKeys int) {
	trimmed := strings.TrimSpace(eventData)
	if trimmed == "" {
		return
	}
	var root interface{}
	if err := json.Unmarshal([]byte(trimmed), &root); err != nil {
		vars["{{"+prefix+"._parse_error}}"] = err.Error()
		if len(trimmed) > maxEventDataSubst {
			trimmed = trimmed[:maxEventDataSubst] + "...(truncated)"
		}
		vars["{{"+prefix+"._raw}}"] = trimmed
		return
	}
	n := 0
	truncated := false
	var walk func(path string, v interface{})
	walk = func(path string, v interface{}) {
		if n >= maxKeys {
			if !truncated {
				truncated = true
				vars["{{"+prefix+"._truncated}}"] = "true"
				log.Printf("[context] flatten truncated at %d keys (prefix=%s)", maxKeys, prefix)
			}
			return
		}
		ph := "{{" + prefix
		if path != "" {
			ph += "." + path
		}
		ph += "}}"
		switch t := v.(type) {
		case map[string]interface{}:
			for k, child := range t {
				sub := k
				if path != "" {
					sub = path + "." + k
				}
				walk(sub, child)
			}
		case []interface{}:
			b, err := json.Marshal(t)
			if err != nil {
				vars[ph] = ""
			} else {
				s := string(b)
				if len(s) > maxEventDataSubst {
					s = s[:maxEventDataSubst] + "...(truncated)"
				}
				vars[ph] = s
			}
			n++
		default:
			vars[ph] = jsonScalarToTemplateString(t)
			n++
		}
	}
	switch t := root.(type) {
	case map[string]interface{}:
		for k, v := range t {
			walk(k, v)
		}
	case []interface{}:
		b, err := json.Marshal(t)
		if err != nil {
			vars["{{"+prefix+"}}"] = ""
		} else {
			s := string(b)
			if len(s) > maxEventDataSubst {
				s = s[:maxEventDataSubst] + "...(truncated)"
			}
			vars["{{"+prefix+"}}"] = s
		}
	default:
		vars["{{"+prefix+"}}"] = jsonScalarToTemplateString(t)
	}
}

func jsonScalarToTemplateString(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'g', -1, 64)
	case json.Number:
		return t.String()
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return fmt.Sprint(t)
		}
		return string(b)
	}
}
