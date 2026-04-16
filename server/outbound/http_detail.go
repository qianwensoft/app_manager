package outbound

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

const maxHTTPDetailBody = 65536

func sanitizeHeadersForLog(h http.Header) map[string]string {
	if h == nil {
		return map[string]string{}
	}
	out := make(map[string]string)
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
