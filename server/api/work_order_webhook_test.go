package api

import (
	"testing"
)

func TestWorkOrderStatusName(t *testing.T) {
	tests := []struct {
		status   string
		expected string
	}{
		{"open", "待处理"},
		{"in_progress", "处理中"},
		{"resolved", "已解决"},
		{"closed", "已关闭"},
		{"reopened", "重新打开"},
		{"unknown", "unknown"}, // 未知状态返回原值
	}

	for _, tt := range tests {
		result := workOrderStatusName(tt.status)
		if result != tt.expected {
			t.Errorf("workOrderStatusName(%q) = %q, want %q", tt.status, result, tt.expected)
		}
	}
}

func TestWorkOrderPriorityName(t *testing.T) {
	tests := []struct {
		priority string
		expected string
	}{
		{"normal", "普通"},
		{"high", "较高"},
		{"urgent", "紧急"},
		{"unknown", "unknown"}, // 未知优先级返回原值
	}

	for _, tt := range tests {
		result := workOrderPriorityName(tt.priority)
		if result != tt.expected {
			t.Errorf("workOrderPriorityName(%q) = %q, want %q", tt.priority, result, tt.expected)
		}
	}
}
