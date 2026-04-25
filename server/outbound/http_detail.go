package outbound

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

const maxHTTPDetailBody = 65536

// sanitizeHeadersForLog 对 HTTP Header 做脱敏，委托给统一 SanitizeHTTPHeaders。
func sanitizeHeadersForLog(h http.Header) map[string]string {
	return SanitizeHTTPHeaders(h)
}

func truncateUTF8(s string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	s = s[:maxBytes]
	for len(s) > 0 && !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s + "\n…[truncated]"
}

func readResponseBodyLimited(body io.ReadCloser, max int) ([]byte, error) {
	if body == nil {
		return nil, nil
	}
	defer body.Close()
	return io.ReadAll(io.LimitReader(body, int64(max)))
}

// HTTPSetupDetail 记录未发起 HTTP 前的配置错误（便于投递日志展开查看）。
// AgentSetupDetail Agent 步骤在执行前失败（未下发命令）。
func AgentSetupDetail(stepType, errMsg string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"kind":      "agent",
		"step_type": stepType,
		"error":     truncateErr(errMsg, 4000),
	})
	return string(b)
}

// MarshalAgentDeliveryDetail 记录反推设备类步骤：已解析配置、下发命令摘要等。
func MarshalAgentDeliveryDetail(stepType, rawCfg, cmdID string, sentCommand interface{}, errMsg string) string {
	m := map[string]interface{}{
		"kind":      "agent",
		"step_type": stepType,
		"config":    truncateUTF8(rawCfg, 8000),
	}
	if cmdID != "" {
		m["command_id"] = cmdID
	}
	if sentCommand != nil {
		m["sent_command"] = sentCommand
	}
	if strings.TrimSpace(errMsg) != "" {
		m["error"] = truncateErr(errMsg, 4000)
	}
	m["note"] = "命令已发送至 Agent WebSocket；未等待设备端执行回执"
	b, _ := json.Marshal(m)
	return string(b)
}

func HTTPSetupDetail(phase, errMsg string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"kind":  "http",
		"phase": phase,
		"error": truncateErr(errMsg, 4000),
	})
	return string(b)
}

func marshalHTTPAttemptDetail(method, urlStr string, reqHeaders http.Header, bodyStr string, httpStatus int, respBody []byte, lastErr string) string {
	rb := string(respBody)
	if len(respBody) >= maxHTTPDetailBody {
		rb = truncateUTF8(rb, maxHTTPDetailBody)
	}
	m := map[string]interface{}{
		"kind": "http",
		"request": map[string]interface{}{
			"method":  method,
			"url":     urlStr,
			"headers": sanitizeHeadersForLog(reqHeaders),
			"body":    truncateUTF8(bodyStr, maxHTTPDetailBody),
		},
		"response": map[string]interface{}{
			"status": httpStatus,
			"body":   rb,
		},
	}
	if strings.TrimSpace(lastErr) != "" {
		m["last_error"] = truncateErr(lastErr, 4000)
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// HTTPDetailResponseBodyAndStatus 从 outbound_deliveries.detail_json 解析 HTTP 响应的 status 与 body 文本。
// fallbackHTTPStatus：当 JSON 内未带 status 或解析为 0 时，若该值在 200–299 则用作状态码（与 outbound_deliveries.http_status 列对齐）。
func HTTPDetailResponseBodyAndStatus(detailJSON string, fallbackHTTPStatus int) (body string, httpStatus int, ok bool) {
	detailJSON = strings.TrimSpace(detailJSON)
	detailJSON = strings.TrimPrefix(detailJSON, "\ufeff")
	if detailJSON == "" || detailJSON == "{}" {
		return "", 0, false
	}
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(detailJSON), &root); err != nil || root == nil {
		return "", 0, false
	}
	kind := strings.TrimSpace(fmt.Sprint(root["kind"]))
	isHTTP := strings.EqualFold(kind, "http")
	respRaw, hasResp := root["response"]
	if !isHTTP && hasResp {
		if _, okm := respRaw.(map[string]interface{}); okm {
			isHTTP = true
		}
	}
	if !isHTTP {
		return "", 0, false
	}
	if !hasResp || respRaw == nil {
		return "", 0, false
	}
	resp, _ := respRaw.(map[string]interface{})
	if resp == nil {
		return "", 0, false
	}
	httpStatus = httpDetailStatusInt(resp["status"])
	if httpStatus == 0 && fallbackHTTPStatus >= 200 && fallbackHTTPStatus < 300 {
		httpStatus = fallbackHTTPStatus
	}
	switch t := resp["body"].(type) {
	case string:
		body = t
	case nil:
		body = ""
	case map[string]interface{}, []interface{}:
		b, err := json.Marshal(t)
		if err != nil {
			body = fmt.Sprint(t)
		} else {
			body = string(b)
		}
	default:
		body = fmt.Sprint(t)
	}
	return body, httpStatus, true
}

func httpDetailStatusInt(v interface{}) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	default:
		var n int
		_, _ = fmt.Sscan(strings.TrimSpace(fmt.Sprint(v)), &n)
		return n
	}
}
