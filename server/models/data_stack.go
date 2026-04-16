package models

import "time"

// DataSource 数据源连接配置
type DataSource struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"size:200" json:"name"`
	Type         string    `gorm:"size:32" json:"type"` // sqlite, mysql, postgres, http
	DSN          string    `gorm:"type:text" json:"dsn"`
	ConfigJSON   string    `gorm:"type:text" json:"config_json"` // 扩展：host,port,user 等 JSON
	ReadOnly     bool      `gorm:"default:true" json:"read_only"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Dataset 数据集定义（查询或事务步骤）
type Dataset struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DataSourceID *uint     `gorm:"index" json:"data_source_id"`
	Name        string    `gorm:"size:200" json:"name"`
	Kind        string    `gorm:"size:32;default:query" json:"kind"` // query, transaction
	Definition  string    `gorm:"type:text" json:"definition"`        // SQL 或 HTTP 模板
	StepsJSON   string    `gorm:"type:text" json:"steps_json"`       // 事务：步骤数组 JSON
	ParamSchema string    `gorm:"type:text" json:"param_schema"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// DataInterfaceGroup 数据接口分组
type DataInterfaceGroup struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:200" json:"name"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DataInterface 对外数据接口
type DataInterface struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	GroupID      *uint     `gorm:"index" json:"group_id"`
	Category     string    `gorm:"size:100;index" json:"category"`
	Name         string    `gorm:"size:200" json:"name"`
	Slug         string    `gorm:"uniqueIndex;size:120" json:"slug"`
	Kind         string    `gorm:"size:32;default:query" json:"kind"` // query, transaction
	DatasetID    uint      `gorm:"index" json:"dataset_id"`
	Method       string    `gorm:"size:10;default:POST" json:"method"`
	Enabled      bool      `gorm:"default:true" json:"enabled"`
	RequiredScopes string  `gorm:"type:text" json:"required_scopes"` // JSON 数组，可选
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
