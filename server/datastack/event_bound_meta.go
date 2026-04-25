package datastack

import (
	"encoding/json"
	"fmt"
	"strings"
)

// EventBindingMeta event_bound 数据集在 meta_json.event_binding 中存储的配置。
// source_type 可为 "custom_event_def"（设备自定义事件）或 "webhook_push"（外部 Webhook 推送）。
type EventBindingMeta struct {
	SourceType        string   `json:"source_type"`         // "custom_event_def" | "webhook_push"
	SourceID          uint     `json:"source_id"`           // custom_event_def: CustomEventDefinition.ID
	SourceKey         string   `json:"source_key"`          // custom_event_def: 事件 key，冗余存储用于查询过滤
	WebhookID         *uint    `json:"webhook_id,omitempty"` // webhook_push: OutboundWebhook.ID
	TableName         string   `json:"table_name"`          // 目标物理表名
	SchemaInitialized bool     `json:"schema_initialized"`  // 首次事件后置 true
	SchemaColumns     []string `json:"schema_columns"`      // 已建表列名列表（不含系统列）
}

// eventBoundMetaEnvelope meta_json 顶层信封（event_bound 类型使用）。
type eventBoundMetaEnvelope struct {
	EventBinding *EventBindingMeta `json:"event_binding,omitempty"`
}

// ParseEventBoundMeta 解析数据集 meta_json 中的 event_binding 片段。
func ParseEventBoundMeta(metaJSON string) (EventBindingMeta, error) {
	s := strings.TrimSpace(metaJSON)
	if s == "" {
		return EventBindingMeta{}, nil
	}
	var env eventBoundMetaEnvelope
	if err := json.Unmarshal([]byte(s), &env); err != nil {
		return EventBindingMeta{}, fmt.Errorf("meta_json 须为合法 JSON: %w", err)
	}
	if env.EventBinding == nil {
		return EventBindingMeta{}, nil
	}
	return *env.EventBinding, nil
}

// MarshalEventBoundMeta 将 EventBindingMeta 序列化回 meta_json 字符串。
func MarshalEventBoundMeta(m EventBindingMeta) (string, error) {
	env := eventBoundMetaEnvelope{EventBinding: &m}
	b, err := json.Marshal(env)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ValidateEventBoundMeta 校验 event_bound 数据集的 meta_json 合法性。
func ValidateEventBoundMeta(metaJSON string) error {
	s := strings.TrimSpace(metaJSON)
	if s == "" {
		return fmt.Errorf("event_bound 数据集须配置 meta_json.event_binding")
	}
	m, err := ParseEventBoundMeta(s)
	if err != nil {
		return err
	}
	switch m.SourceType {
	case "custom_event_def":
		if m.SourceID == 0 {
			return fmt.Errorf("meta_json.event_binding.source_id 必填")
		}
		if m.SourceKey == "" {
			return fmt.Errorf("meta_json.event_binding.source_key 必填")
		}
	case "webhook_push":
		if m.WebhookID == nil || *m.WebhookID == 0 {
			return fmt.Errorf("meta_json.event_binding.webhook_id 必填（webhook_push 类型）")
		}
	case "":
		return fmt.Errorf("meta_json.event_binding.source_type 必填（custom_event_def 或 webhook_push）")
	default:
		return fmt.Errorf("meta_json.event_binding.source_type 不支持: %q", m.SourceType)
	}
	return nil
}

// SanitizeEventTableName 将事件 key 转换为安全表名：前缀 evt_，非字母数字替换为下划线，截断至 48 字符。
func SanitizeEventTableName(eventKey string) string {
	var b strings.Builder
	b.WriteString("evt_")
	for _, r := range eventKey {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	s := strings.ToLower(b.String())
	if len(s) > 48 {
		s = s[:48]
	}
	return s
}
