package datastack

import (
	"encoding/json"
	"fmt"
	"strings"
)

// 入站类型（写在 datasets.meta_json 的 ingress.kind；不在数据源上体现）。
const (
	IngressKindHTTPWebhook = "http_webhook" // 事件通知 / Webhook：默认必须落物理缓冲表
	IngressKindHTTPPoll    = "http_poll"    // 轮询拉取：可不建缓冲表，仅转发/内存态（产品可选）
	// 兼容别名
	IngressKindEventNotify = "event_notify"
)

// IngressPhysicalTableRequired 事件通知类默认必须配置缓冲物理表；轮询默认不强制。
func IngressPhysicalTableRequired(ingressKind string, cacheRequired *bool) bool {
	if cacheRequired != nil {
		return *cacheRequired
	}
	k := strings.ToLower(strings.TrimSpace(ingressKind))
	switch k {
	case IngressKindHTTPWebhook, IngressKindEventNotify, "webhook", "notify":
		return true
	case IngressKindHTTPPoll, "poll":
		return false
	default:
		// 未知类型：保守要求落表，避免丢数据
		return true
	}
}

type datasetMetaIngress struct {
	Kind          string `json:"kind"`
	CacheRequired *bool  `json:"cache_required,omitempty"`
}

type datasetMetaJSON struct {
	Ingress     *datasetMetaIngress `json:"ingress,omitempty"`
	BufferTable string              `json:"buffer_table,omitempty"`
}

// ValidateDatasetMetaForKind 校验 meta_json 与 kind 的组合（缓冲/入站类数据集）。
func ValidateDatasetMetaForKind(kind string, metaJSON string, dataSourceID *uint) error {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind != "buffer" {
		// 非 buffer：若写了 ingress，仍按入站规则校验（便于将来 query 挂载 meta）
		if strings.TrimSpace(metaJSON) == "" {
			return nil
		}
		var meta datasetMetaJSON
		if err := json.Unmarshal([]byte(metaJSON), &meta); err != nil {
			return fmt.Errorf("meta_json 须为合法 JSON")
		}
		if meta.Ingress == nil {
			return nil
		}
		return validateIngressAgainstBuffer(meta.Ingress, strings.TrimSpace(meta.BufferTable), dataSourceID)
	}

	if strings.TrimSpace(metaJSON) == "" {
		return fmt.Errorf("kind=buffer 须配置 meta_json（含 ingress）")
	}
	var meta datasetMetaJSON
	if err := json.Unmarshal([]byte(metaJSON), &meta); err != nil {
		return fmt.Errorf("meta_json 须为合法 JSON")
	}
	if meta.Ingress == nil || strings.TrimSpace(meta.Ingress.Kind) == "" {
		return fmt.Errorf("meta_json.ingress.kind 必填（如 http_webhook / http_poll）")
	}
	return validateIngressAgainstBuffer(meta.Ingress, strings.TrimSpace(meta.BufferTable), dataSourceID)
}

func validateIngressAgainstBuffer(ing *datasetMetaIngress, bufferTable string, dataSourceID *uint) error {
	if ing == nil {
		return nil
	}
	needTable := IngressPhysicalTableRequired(ing.Kind, ing.CacheRequired)
	if needTable {
		if dataSourceID == nil || *dataSourceID == 0 {
			return fmt.Errorf("事件通知类入站须绑定非空数据源并配置缓冲物理表（meta_json.buffer_table）")
		}
		if bufferTable == "" {
			return fmt.Errorf("事件通知类入站默认须配置 meta_json.buffer_table 以落库缓存")
		}
	}
	return nil
}
