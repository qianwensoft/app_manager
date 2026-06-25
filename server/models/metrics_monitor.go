package models

import "time"

// ApiCallMetric 是按「分钟桶 × 端点 × 方法 × 来源 × 状态类」聚合的接口调用计数。
// 由内存计数中间件每分钟 flush 写入，用于「系统管理 → 运行监控」的调用量趋势与详情。
type ApiCallMetric struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	BucketTs     time.Time `gorm:"index:idx_apicall_bucket;not null" json:"bucket_ts"` // 分钟对齐时间桶
	Endpoint     string    `gorm:"size:200;index" json:"endpoint"`                     // 路由模板，如 /api/devices/:id；空归为 other
	Method       string    `gorm:"size:10" json:"method"`
	Source       string    `gorm:"size:16" json:"source"`      // internal / external / anonymous
	StatusClass  string    `gorm:"size:4" json:"status_class"` // 2xx / 3xx / 4xx / 5xx
	Count        int64     `json:"count"`                      // 该桶内请求数
	SumLatencyMs int64     `json:"sum_latency_ms"`             // 延迟之和（ms），用于算平均
}

// AgentOnlineSample 是 Agent 在线连接数的分钟级采样，用于在线数趋势图。
type AgentOnlineSample struct {
	ID       uint      `gorm:"primaryKey" json:"id"`
	SampleTs time.Time `gorm:"index;not null" json:"sample_ts"`
	Online   int       `json:"online"`
}
