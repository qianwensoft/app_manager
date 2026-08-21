package models

import "time"

// DocumentNode 文档管理节点树（邻接表）。文档管理模块的核心配置对象。
// NodeType:
//   - folder    纯分组节点（文档树的分支，不承载具体内容）
//   - doc       文档节点（承载文件：markdown/pdf/office/image/video 等）
//   - form_app  表单应用节点（ConfigJSON 含 form_code/page_key/open_mode，不落盘文件）
//
// DocType（仅 doc 节点有意义）:
//
//	markdown | word | excel | ppt | pdf | image | video | other
type DocumentNode struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	ParentID *uint  `gorm:"uniqueIndex:idx_docnode_parent_code,priority:1" json:"parent_id"` // nil = 根；与 Code 组成 sibling 级唯一复合索引
	Name     string `gorm:"size:200;not null" json:"name"`
	// Code 是节点的「URL 编码」：用于路由 /d/:code 直接定位节点（替代 /docs?id= 的 query 形式）。
	// 默认为节点名，**同级唯一**（与 parent_id 组成复合 unique index；SQLite/MySQL 均允许 NULL 多值，
	// 因此多个根节点可拥有相同的 code；而同级同名节点创建时会自动追加 -2/-3… 后缀）。
	// 注：GORM 的 uniqueIndex 单字段仅建立单列索引；要建立 (parent_id, code) 复合索引，
	// 必须两个字段都加同名 uniqueIndex 并以 priority 标注列顺序。
	Code             string         `gorm:"size:100;uniqueIndex:idx_docnode_parent_code,priority:2" json:"code"`
	NodeType         string         `gorm:"size:32;not null;default:'folder'" json:"node_type"`
	DocType          string         `gorm:"size:32" json:"doc_type"`
	Icon             string         `gorm:"size:200" json:"icon"`
	SortOrder        int            `gorm:"default:0" json:"sort_order"`
	StoragePath      string         `gorm:"size:500" json:"storage_path"` // 当前文件落盘路径（doc 节点）
	MimeType         string         `gorm:"size:200" json:"mime_type"`
	SizeBytes        int64          `json:"size_bytes"`
	CurrentVersionID *uint          `json:"current_version_id"` // 当前版本（DocumentVersion.ID）
	ConfigJSON       string         `gorm:"type:text" json:"config_json"`
	CreatedBy        uint           `json:"created_by"`
	Children         []DocumentNode `gorm:"-" json:"children,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

// DocumentVersion 文档版本。每次上传/替换文件或 OnlyOffice 保存回调各生成一版。
type DocumentVersion struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	NodeID      uint      `gorm:"index;not null" json:"node_id"`
	Version     int       `gorm:"not null;default:1" json:"version"`
	StoragePath string    `gorm:"size:500" json:"storage_path"`
	SizeBytes   int64     `json:"size_bytes"`
	MimeType    string    `gorm:"size:200" json:"mime_type"`
	ChangedBy   uint      `json:"changed_by"`
	Comment     string    `gorm:"size:500" json:"comment"`
	CreatedAt   time.Time `json:"created_at"`
}

// DocumentRole 文档角色，关联文档节点与用户（多级授权）。
type DocumentRole struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:100;not null" json:"name"`
	Code        string    `gorm:"size:64;uniqueIndex" json:"code"`
	Description string    `gorm:"size:500" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// DocumentRoleNode 文档角色 - 文档节点 关联（决定角色可见/可操作哪些节点）。
// PermsJSON 为该角色在此节点上被授予的操作权限键集合（JSON 字符串数组）。
type DocumentRoleNode struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RoleID    uint      `gorm:"uniqueIndex:idx_docrole_node;index" json:"role_id"`
	NodeID    uint      `gorm:"uniqueIndex:idx_docrole_node;index" json:"node_id"`
	PermsJSON string    `gorm:"type:text" json:"perms_json"`
	CreatedAt time.Time `json:"created_at"`
}

// DocumentRoleUser 文档角色 - 用户 关联（把用户分配进文档角色）。
type DocumentRoleUser struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RoleID    uint      `gorm:"uniqueIndex:idx_docrole_user;index" json:"role_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_docrole_user;index" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// DocumentNodeConfig 是 DocumentNode.ConfigJSON 的解析结构。
type DocumentNodeConfig struct {
	// form_app（表单应用节点）
	FormCode string `json:"form_code,omitempty"`
	PageKey  string `json:"page_key,omitempty"`
	// 嵌入方式 iframe（默认，内嵌）| blank（新标签页打开）
	OpenMode string `json:"open_mode,omitempty"`
	// 文档锚点列表（用于快速定位编辑块）
	Anchors []DocumentAnchor `json:"anchors,omitempty"`
}

// DocumentAnchor 文档锚点定义
type DocumentAnchor struct {
	ID    string `json:"id"`    // 锚点ID（唯一标识）
	Label string `json:"label"` // 显示名称
	Level int    `json:"level"` // 层级（用于缩进显示）
}

// DocumentProject 文档项目（文档库首页的项目分组）
type DocumentProject struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:200;not null" json:"name"`
	Code        string    `gorm:"size:100;uniqueIndex" json:"code"` // URL友好的唯一标识
	Description string    `gorm:"size:1000" json:"description"`
	Icon        string    `gorm:"size:200" json:"icon"`        // 项目图标
	Color       string    `gorm:"size:50" json:"color"`        // 项目主题色
	CategoryID  *uint     `gorm:"index" json:"category_id"`    // 所属分类
	SortOrder   int       `gorm:"default:0" json:"sort_order"` // 排序
	RootNodeID  *uint     `gorm:"index" json:"root_node_id"`   // 关联的文档根节点
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// DocumentProjectCategory 文档项目分类
type DocumentProjectCategory struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:200;not null" json:"name"`
	Code        string    `gorm:"size:100;uniqueIndex" json:"code"`
	Description string    `gorm:"size:500" json:"description"`
	Icon        string    `gorm:"size:200" json:"icon"`
	Color       string    `gorm:"size:50" json:"color"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
