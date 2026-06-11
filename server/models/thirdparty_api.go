package models

import "time"

// ThirdPartyApiEndpoint 第三方应用 API 端点配置
type ThirdPartyApiEndpoint struct {
	ID          uint                 `gorm:"primaryKey" json:"id"`
	ProviderID  uint                 `gorm:"index;not null" json:"provider_id"`
	Provider    *ThirdPartyProvider  `gorm:"foreignKey:ProviderID" json:"provider,omitempty"`
	Code        string               `gorm:"size:80;uniqueIndex" json:"code"` // 业务编码，用于在配置中引用
	Name        string               `gorm:"size:200" json:"name"`
	Description string               `gorm:"type:text" json:"description"`

	// HTTP 配置
	Method      string `gorm:"size:10;default:POST" json:"method"` // GET, POST, PUT, DELETE
	Path        string `gorm:"size:500" json:"path"`               // API 路径，如 /api/v1/employee/query

	// 请求配置
	HeadersJSON string `gorm:"type:text" json:"headers_json"` // 额外的 HTTP 头 JSON，如 {"Content-Type": "application/json"}

	// 参数映射配置（JSON Schema 格式，描述此端点接受的参数）
	ParamSchemaJSON string `gorm:"type:text" json:"param_schema_json"`

	// 响应映射配置
	ResponsePathJSON string `gorm:"type:text" json:"response_path_json"` // 响应数据的提取路径，如 {"data": "data.result"}

	Enabled   bool      `gorm:"default:true" json:"enabled"`
	CreatedBy uint      `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
