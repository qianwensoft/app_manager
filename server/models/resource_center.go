package models

import "time"

// ResourceNode 资源节点树。资源中心的核心配置对象，支持树形分组。
// NodeType:
//   - group          纯分组节点（左侧树的分支，不承载具体内容）
//   - device_mgmt     设备管理节点（ConfigJSON 含 group_ids/device_ids/detail_perms）
//   - workorder_mgmt  工单管理节点（ConfigJSON 含 type_codes/detail_perms）
//   - scada           组态预览节点（ConfigJSON 含 scada_id/scada_code/open_mode）
//   - form_app        表单应用节点（ConfigJSON 含 form_code/open_mode）
//   - link            自定义链接节点（ConfigJSON 含 url/open_mode）
type ResourceNode struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	ParentID   *uint          `json:"parent_id"` // nil = 根
	Name       string         `gorm:"size:100;not null" json:"name"`
	NodeType   string         `gorm:"size:32;not null;default:'group'" json:"node_type"`
	Icon       string         `gorm:"size:200" json:"icon"`
	SortOrder  int            `gorm:"default:0" json:"sort_order"`
	ConfigJSON string         `gorm:"type:text" json:"config_json"`
	Children   []ResourceNode `gorm:"-" json:"children,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
}

// ResourceRole 资源角色，关联资源节点与用户。
type ResourceRole struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:100;not null" json:"name"`
	Code        string    `gorm:"size:64;uniqueIndex" json:"code"`
	Description string    `gorm:"size:500" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ResourceRoleNode 资源角色 - 资源节点 关联（决定角色可见哪些节点）。
type ResourceRoleNode struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RoleID    uint      `gorm:"uniqueIndex:idx_role_node;index" json:"role_id"`
	NodeID    uint      `gorm:"uniqueIndex:idx_role_node;index" json:"node_id"`
	CreatedAt time.Time `json:"created_at"`
}

// ResourceRoleUser 资源角色 - 用户 关联（把用户分配进资源角色）。
type ResourceRoleUser struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RoleID    uint      `gorm:"uniqueIndex:idx_role_user;index" json:"role_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_role_user;index" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// ResourceNodeConfig 是 ResourceNode.ConfigJSON 的解析结构（各类叶子节点共用一份宽松结构）。
type ResourceNodeConfig struct {
	// device_mgmt
	GroupIDs  []uint `json:"group_ids,omitempty"`
	DeviceIDs []uint `json:"device_ids,omitempty"`
	// workorder_mgmt
	TypeCodes []string `json:"type_codes,omitempty"`
	// 两类通用：详情页可执行的操作权限键集合
	DetailPerms []string `json:"detail_perms,omitempty"`
	// scada（组态预览）
	ScadaID   uint   `json:"scada_id,omitempty"`
	ScadaCode string `json:"scada_code,omitempty"`
	// form_app（表单应用）
	FormCode string `json:"form_code,omitempty"`
	// link（自定义链接）
	URL string `json:"url,omitempty"`
	// scada/form_app/link 通用：嵌入方式 iframe（默认，内嵌）| blank（新标签页打开）
	OpenMode string `json:"open_mode,omitempty"`
}
