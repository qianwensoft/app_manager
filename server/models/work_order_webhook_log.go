package models

import "time"

// WorkOrderWebhookLog 工单外发日志（记录每次外发的结果，便于排查问题）
type WorkOrderWebhookLog struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	WebhookID       uint      `gorm:"index" json:"webhook_id"`                       // 关联 work_order_webhooks.id
	WebhookName     string    `gorm:"size:120" json:"webhook_name"`                  // webhook 名称快照
	WorkOrderID     uint      `gorm:"index" json:"work_order_id"`                    // 关联工单 ID
	WorkOrderCode   string    `gorm:"size:64;index" json:"work_order_code"`          // 工单编号快照
	Event           string    `gorm:"size:64;index" json:"event"`                    // 触发事件
	Target          string    `gorm:"size:24" json:"target"`                         // endpoint 或 connector
	TargetName      string    `gorm:"size:200" json:"target_name"`                   // 目标名称快照
	RequestJSON     string    `gorm:"type:text" json:"request_json"`                 // 原始参数映射（模板，未替换占位符）
	ResolvedJSON    string    `gorm:"type:text" json:"resolved_json"`                // 实际执行参数（占位符已替换）
	RequestURL      string    `gorm:"type:text" json:"request_url"`                  // 实际请求 URL
	RequestMethod   string    `gorm:"size:10" json:"request_method"`                 // 请求方法
	RequestHeaders  string    `gorm:"type:text" json:"request_headers"`              // 请求头（JSON）
	RequestBody     string    `gorm:"type:text" json:"request_body"`                 // 实际请求体
	Status          string    `gorm:"size:20;index;default:'pending'" json:"status"` // pending|success|failed
	StatusCode      int       `json:"status_code"`                                   // HTTP 状态码
	ResponseHeaders string    `gorm:"type:text" json:"response_headers"`             // 响应头（JSON）
	ResponseBody    string    `gorm:"type:text" json:"response_body"`                // 原始响应内容（截断到 20KB）
	ScriptResult    string    `gorm:"type:text" json:"script_result"`                // JS 脚本处理后的结果（JSON）
	ScriptLogs      string    `gorm:"type:text" json:"script_logs"`                  // 脚本执行日志（JSON array）
	ErrorMsg        string    `gorm:"type:text" json:"error_msg"`                    // 错误信息
	DurationMs      int64     `json:"duration_ms"`                                   // 耗时（毫秒）
	CreatedAt       time.Time `gorm:"index" json:"created_at"`
}

func (WorkOrderWebhookLog) TableName() string { return "work_order_webhook_logs" }
