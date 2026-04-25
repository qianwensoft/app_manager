package datastack

import (
	"encoding/json"
	"strings"
)

// BufferIngress 从 datasets.meta_json 解析的入站片段（供 HTTP 写入 / 轮询）。
type BufferIngress struct {
	Kind              string `json:"kind"`
	WebhookSecret     string `json:"webhook_secret"`
	RawColumn         string `json:"raw_column"` // 单列写入时的列名，默认 payload
	PollURL           string `json:"poll_url"`
	PollIntervalSec   int    `json:"poll_interval_sec"`
	PollMethod        string `json:"poll_method"` // GET 默认
	PollHeadersJSON   string `json:"poll_headers_json"`
	PollBody          string `json:"poll_body"`
}

type bufferMetaEnvelope struct {
	Ingress     *BufferIngress `json:"ingress,omitempty"`
	BufferTable string         `json:"buffer_table,omitempty"`
}

// ParseBufferMeta 解析 meta_json（失败返回零值 err!=nil）。
func ParseBufferMeta(metaJSON string) (bufferMetaEnvelope, error) {
	var m bufferMetaEnvelope
	s := strings.TrimSpace(metaJSON)
	if s == "" {
		return m, nil
	}
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return m, err
	}
	return m, nil
}

func (m bufferMetaEnvelope) RawColumnOrDefault() string {
	if m.Ingress == nil {
		return "payload"
	}
	c := strings.TrimSpace(m.Ingress.RawColumn)
	if c == "" {
		return "payload"
	}
	return c
}
