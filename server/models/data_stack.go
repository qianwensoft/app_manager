package models

import "time"

// DataSource 数据源连接配置
type DataSource struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Code       string    `gorm:"size:80;uniqueIndex" json:"code"` // 业务编码，管理端路由与展示以编码为主
	Name       string    `gorm:"size:200" json:"name"`
	Type       string    `gorm:"size:32" json:"type"` // sqlite, mysql, postgres, sqlserver
	DSN        string    `gorm:"type:text" json:"dsn"`
	ConfigJSON string    `gorm:"type:text" json:"config_json"` // 扩展：host,port,user 等 JSON
	ReadOnly   *bool     `gorm:"default:true" json:"read_only"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// IsReadOnly returns true if ReadOnly is nil (default) or explicitly true.
func (d *DataSource) IsReadOnly() bool {
	if d.ReadOnly == nil {
		return true
	}
	return *d.ReadOnly
}

// Dataset 数据集定义
// kind: static — definition 存 JSON 对象数组，固定表数据，可不绑数据源；
//
//	query — definition 为在选定数据源上执行的 SQL；
//	buffer — 缓存表/入站：meta_json 配置 ingress（http_webhook 事件通知 或 http_poll 轮询）与 buffer_table；
//	  definition 多为对缓冲物理表的查询 SQL；须绑定数据源；
//	transaction — steps_json 为 SQL 步骤数组，需数据源且非只读。
//
// meta_json 约定（节选）：
//   - query：sql_shape 为 fixed_table（固定表/视图）或 dynamic_sql（动态 SQL）；
//     fixed_table 时可用 table_binding 描述绑定：object_name、object_kind(table|view)、
//     binding_mode 为 existing_selected（选用已有）或 created_by_dataset（本数据集执行建表 DDL 创建）。
//   - buffer：ingress.kind=http_webhook（事件通知）时默认必须配置 buffer_table 落库缓存；
//     ingress.kind=http_poll（轮询）可通过 ingress.cache_required=false 省略物理缓冲表。轮询类仍可继续创建多个
//     数据接口做参数化细管。接入出站连接器时应避免 HTTP 步骤回调本系统开放数据接口形成环。
type Dataset struct {
	ID           uint            `gorm:"primaryKey" json:"id"`
	Code         string          `gorm:"size:80;uniqueIndex" json:"code"` // 业务编码
	DataSourceID *uint           `gorm:"index" json:"data_source_id"`
	DataSource   *DataSource     `gorm:"foreignKey:DataSourceID" json:"data_source,omitempty"`
	Category     string          `gorm:"size:100;index" json:"category"`
	Name         string          `gorm:"size:200" json:"name"`
	Kind         string          `gorm:"size:32;default:query" json:"kind"` // static, query, buffer, transaction
	Definition   string          `gorm:"type:text" json:"definition"`       // static: JSON 行数组；query/buffer: SQL
	StepsJSON    string          `gorm:"type:text" json:"steps_json"`       // 事务：步骤数组 JSON
	ParamSchema  string          `gorm:"type:text" json:"param_schema"`
	MetaJSON         string          `gorm:"type:text" json:"meta_json"`          // 入站、缓冲表名等扩展 JSON
	MultiSourcesJSON string          `gorm:"type:text" json:"multi_sources_json"` // 多数据源配置：[{"alias":"db_hz","data_source_id":1},...]；非空时 kind 须为 query/queryOne/transaction
	Structures       []DataStructure `gorm:"foreignKey:DatasetID" json:"structures,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// DataStructure 数据集下一级：列契约 / 形状封装；同一数据集可有多个结构供不同接口引用。
type DataStructure struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	DatasetID          uint      `gorm:"index;uniqueIndex:idx_ds_structure_code" json:"dataset_id"`
	Dataset            *Dataset  `gorm:"foreignKey:DatasetID" json:"dataset,omitempty"`
	Code               string    `gorm:"size:80;uniqueIndex:idx_ds_structure_code" json:"code"`
	Name               string    `gorm:"size:200" json:"name"`
	SchemaJSON         string    `gorm:"type:text" json:"schema_json"`
	DefaultParamValues string    `gorm:"type:text" json:"default_param_values"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
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
	ID                uint           `gorm:"primaryKey" json:"id"`
	GroupID           *uint          `gorm:"index" json:"group_id"`
	Category          string         `gorm:"size:100;index" json:"category"`
	Name              string         `gorm:"size:200" json:"name"`
	Code              string         `gorm:"uniqueIndex;size:120" json:"code"` // 开放 API 路径主键；可与 slug 相同
	Slug              string         `gorm:"uniqueIndex;size:120" json:"slug"`
	Kind              string         `gorm:"size:32;default:query" json:"kind"` // query — returns []row; queryOne — returns first row as object (or null); transaction; workflow
	DatasetID         *uint          `gorm:"index" json:"dataset_id"` // workflow类型时可为NULL
	Dataset           *Dataset       `gorm:"foreignKey:DatasetID" json:"dataset,omitempty"`
	DataStructureID   *uint          `gorm:"index" json:"data_structure_id"`
	DataStructure     *DataStructure `gorm:"foreignKey:DataStructureID" json:"data_structure,omitempty"`
	ParamDefaultsJSON string         `gorm:"type:text" json:"param_defaults_json"` // 本接口默认参数组 JSON
	Method            string         `gorm:"size:10;default:POST" json:"method"`
	Enabled           bool           `gorm:"default:true" json:"enabled"`
	RequiredScopes    string         `gorm:"type:text" json:"required_scopes"` // JSON 数组，可选
	// StaticCrudOp 非空时：绑定数据集须为 kind=static，开放路由按操作读写 JSON 行表，不走 SQL。
	// 取值 list | create | update | delete；空字符串表示普通 query/transaction 行为。
	StaticCrudOp string `gorm:"size:16;default:''" json:"static_crud_op"`
	// SchemaJSON 接口关联的字段 schema（JSON Schema 格式），用于模拟数据生成与文档。
	// 自动生成的接口由 GenerateCrudInterfaces 写入；手动接口可自由编辑。
	StepsJSON  string `gorm:"type:text" json:"steps_json"` // 事务接口：SQL 步骤数组 JSON
	SchemaJSON string `gorm:"type:text" json:"schema_json"`
	// workflow类型专用字段
	WorkflowJSON      string `gorm:"type:text" json:"workflow_json"`      // 工作流定义JSON
	DatasourcesJSON   string `gorm:"type:text" json:"datasources_json"`   // 多数据源配置JSON
	// 声明式整形（数据集深度定制）：空值=关闭，向后兼容。仅作用于 query/queryOne（部分作用于 static）。
	ParamContractJSON string    `gorm:"type:text" json:"param_contract_json"` // []ParamSpec：参数契约（类型/必填/枚举/范围/正则/默认）
	FieldMappingJSON  string    `gorm:"type:text" json:"field_mapping_json"`  // ProjectionSpec：输出字段投影/重命名
	ExtraFiltersJSON  string    `gorm:"type:text" json:"extra_filters_json"`  // []ShapeFilter：附加过滤条件
	SortJSON          string    `gorm:"type:text" json:"sort_json"`           // []SortSpec：排序
	PaginationJSON          string    `gorm:"type:text" json:"pagination_json"`           // PaginationSpec：分页默认值+上限
	PinnedDatasourceAlias   string    `gorm:"size:80;default:''" json:"pinned_datasource_alias"` // 多数据源：非空时固定使用该别名；空=调用时必传 datasource_alias
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}
