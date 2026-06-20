package models

import "time"

// WorkOrderWebhookLog 工单外发日志（记录每次外发的结果，便于排查问题）
type WorkOrderWebhookLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	WebhookID  uint      `gorm:"index" json:"webhook_id"`                      // 关联 work_order_webhooks.id
	WebhookName string   `gorm:"size:120" json:"webhook_name"`                 // webhook 名称快照
	WorkOrderID uint     `gorm:"index" json:"work_order_id"`                   // 关联工单 ID
	WorkOrderCode string `gorm:"size:64;index" json:"work_order_code"`         // 工单编号快照
	Event       string   `gorm:"size:64;index" json:"event"`                   // 触发事件
	Target      string   `gorm:"size:24" json:"target"`                        // endpoint 或 connector
	TargetName  string   `gorm:"size:200" json:"target_name"`                  // 目标名称快照
	RequestJSON string   `gorm:"type:text" json:"request_json"`                // 发送的参数（JSON）
	Status      string   `gorm:"size:20;index;default:'pending'" json:"status"` // pending|success|failed
	StatusCode  int      `json:"status_code"`                                  // HTTP 状态码
	ResponseBody string  `gorm:"type:text" json:"response_body"`               // 响应内容（截断到 10KB）
	ErrorMsg    string   `gorm:"type:text" json:"error_msg"`                   // 错误信息
	DurationMs  int64    `json:"duration_ms"`                                  // 耗时（毫秒）
	CreatedAt   time.Time `gorm:"index" json:"created_at"`
}

func (WorkOrderWebhookLog) TableName() string { return "work_order_webhook_logs" }
