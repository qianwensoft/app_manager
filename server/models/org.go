package models

import "time"

// Department 部门（支持树形结构）
type Department struct {
	ID         uint        `gorm:"primaryKey" json:"id"`
	ParentID   *uint       `json:"parent_id"`
	Name       string      `gorm:"size:100;not null" json:"name"`
	Code       string      `gorm:"size:64;uniqueIndex" json:"code"`
	SortOrder  int         `json:"sort_order"`
	Children   []Department `gorm:"-" json:"children,omitempty"`
	CreatedAt  time.Time   `json:"created_at"`
}

// Position 岗位
type Position struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	DepartmentID uint      `json:"department_id"`
	Name         string    `gorm:"size:100;not null" json:"name"`
	Code         string    `gorm:"size:64;uniqueIndex" json:"code"`
	SortOrder    int       `json:"sort_order"`
	CreatedAt    time.Time `json:"created_at"`
}

// UserDepartment 用户-部门-岗位关联
type UserDepartment struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index" json:"user_id"`
	DepartmentID uint      `gorm:"index" json:"department_id"`
	PositionID   *uint     `json:"position_id"`
	IsPrimary    bool      `json:"is_primary"`
	CreatedAt    time.Time `json:"created_at"`
}

// DeviceGroup 设备分组（替代 Device.GroupName 字符串，支持树形）
type DeviceGroup struct {
	ID        uint        `gorm:"primaryKey" json:"id"`
	ParentID  *uint       `json:"parent_id"`
	Name      string      `gorm:"size:100;not null" json:"name"`
	Code      string      `gorm:"size:64;uniqueIndex" json:"code"`
	SortOrder int         `json:"sort_order"`
	Children  []DeviceGroup `gorm:"-" json:"children,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
}

// DeviceGroupMember 设备-分组关联
type DeviceGroupMember struct {
	DeviceID uint `gorm:"primaryKey" json:"device_id"`
	GroupID  uint `gorm:"primaryKey;index" json:"group_id"`
}
