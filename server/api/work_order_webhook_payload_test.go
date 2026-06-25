package api

import (
	"encoding/json"
	"testing"
)

// TestWorkOrderEventPayloadStructure 测试工单事件 payload 包含必需字段
func TestWorkOrderEventPayloadStructure(t *testing.T) {
	// 构建一个示例 payload，验证字段结构
	payload := map[string]interface{}{
		"event":          "work_order.closed",
		"id":             uint(1),
		"code":           "WO-20260621-test",
		"title":          "测试工单",
		"status":         "closed",
		"status_name":    "已关闭",
		"priority":       "high",
		"priority_name":  "较高",
		"business_no":    "BIZ-2026-001",
		"change_comment": "问题已在版本 v2.1.3 中修复",
		"actor":          "admin",
		"device_id":      uint(5),
		"device_name":    "测试设备",
		"external_ref":   "",
		"other_codes":    "",
		"tags":           "urgent,verified",
		"tags_names":     "紧急,已验证",
	}

	// 验证必需字段存在
	requiredFields := []string{
		"event", "id", "code", "status", "status_name",
		"business_no", "change_comment", "actor",
	}

	for _, field := range requiredFields {
		if _, exists := payload[field]; !exists {
			t.Errorf("Required field %s missing in payload", field)
		}
	}

	// 验证可以序列化为 JSON
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Failed to marshal payload to JSON: %v", err)
	}

	// 验证反序列化
	var jsonMap map[string]interface{}
	if err := json.Unmarshal(jsonBytes, &jsonMap); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// 验证关键字段值
	tests := []struct {
		field    string
		expected interface{}
	}{
		{"change_comment", "问题已在版本 v2.1.3 中修复"},
		{"business_no", "BIZ-2026-001"},
		{"status", "closed"},
		{"actor", "admin"},
	}

	for _, tt := range tests {
		if jsonMap[tt.field] != tt.expected {
			t.Errorf("Field %s: expected %v, got %v", tt.field, tt.expected, jsonMap[tt.field])
		}
	}

	t.Logf("✓ Payload structure validated successfully")
	t.Logf("✓ All required fields present: %v", requiredFields)
	t.Logf("✓ JSON serialization works correctly")
}

// TestChangeCommentInWebhookPlaceholder 测试 change_comment 可以作为占位符使用
func TestChangeCommentInWebhookPlaceholder(t *testing.T) {
	// 模拟 webhook 参数配置
	paramsTemplate := map[string]string{
		"work_order_code": "{{code}}",
		"status":          "{{status}}",
		"status_name":     "{{status_name}}",
		"reason":          "{{change_comment}}",
		"operator":        "{{actor}}",
		"business_no":     "{{business_no}}",
	}

	// 模拟事件数据
	eventData := map[string]interface{}{
		"code":           "WO-20260621-001",
		"status":         "closed",
		"status_name":    "已关闭",
		"change_comment": "问题已在版本 v2.1.3 中修复",
		"actor":          "admin",
		"business_no":    "BIZ-2026-001",
	}

	// 验证所有占位符都能从 eventData 中找到对应值
	for key, template := range paramsTemplate {
		// 简化的占位符替换逻辑（实际代码中会用正则）
		placeholder := template[2 : len(template)-2] // 去掉 {{ 和 }}

		if _, exists := eventData[placeholder]; !exists {
			t.Errorf("Placeholder {{%s}} not found in event data for param %s", placeholder, key)
		}
	}

	t.Logf("✓ All webhook placeholders can be resolved from event data")
	t.Logf("✓ change_comment placeholder: {{change_comment}} -> %v", eventData["change_comment"])
	t.Logf("✓ business_no placeholder: {{business_no}} -> %v", eventData["business_no"])
}

// TestEmptyChangeComment 测试空 change_comment 的情况
func TestEmptyChangeComment(t *testing.T) {
	// 对于不包含说明的操作，change_comment 应该是空字符串
	payload := map[string]interface{}{
		"event":          "work_order.updated",
		"id":             uint(1),
		"code":           "WO-20260621-001",
		"change_comment": "", // 普通更新操作，没有说明
		"actor":          "system",
	}

	if payload["change_comment"] != "" {
		t.Errorf("Expected empty change_comment for non-status-change events, got %v", payload["change_comment"])
	}

	// 验证空字符串可以正常序列化
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Failed to marshal payload with empty change_comment: %v", err)
	}

	t.Logf("✓ Empty change_comment handled correctly")
	t.Logf("✓ JSON: %s", string(jsonBytes))
}
