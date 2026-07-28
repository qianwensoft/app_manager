package auth

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// 资源中心权限键目录（供前端配置面板与后端校验共用）。
var (
	// ResourceDevicePerms 设备管理节点可配置的操作权限键。
	ResourceDevicePerms = []string{
		"adb",          // ADB 操作（重启/截图/输入/推拉文件/应用管理/录屏/shell 等）
		"install_apk",  // 拉取/导出已安装 APK
		"wireless_adb", // 开启无线 ADB
		"trigger_menu", // 触发 Agent 菜单
		"push_update",  // 推送 Agent 更新
		"speed_test",   // 测速
		"record",       // 音频录制
		"file",         // Agent 文件浏览/下载
	}
	// ResourceWorkOrderPerms 工单管理节点可配置的操作权限键。
	ResourceWorkOrderPerms = []string{
		"edit_fields",   // 编辑工单字段
		"change_status", // 变更状态
		"assign",        // 指派
		"delete",        // 删除
	}
)

// ResourceDeviceNode 解析后的设备管理节点（单个节点的可见范围与操作权限）。
type ResourceDeviceNode struct {
	GroupIDs    []uint
	DeviceIDs   []uint
	DetailPerms []string
}

// ResourceWorkOrderNode 解析后的工单管理节点。
type ResourceWorkOrderNode struct {
	TypeCodes   []string
	DetailPerms []string
}

// ResourcePermSet 某用户在资源中心的合并权限集（按节点保留，用于逐节点判定）。
type ResourcePermSet struct {
	HasAnyRole     bool
	DeviceNodes    []ResourceDeviceNode
	WorkOrderNodes []ResourceWorkOrderNode
}

func containsStr(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

func containsUint(list []uint, v uint) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// ResolveUserResourcePerms 解析用户所属资源角色 → 可见资源节点 → 合并权限集。
func ResolveUserResourcePerms(userID uint) *ResourcePermSet {
	set := &ResourcePermSet{}
	if userID == 0 || database.DB == nil {
		return set
	}
	var roleUsers []models.ResourceRoleUser
	database.DB.Where("user_id = ?", userID).Find(&roleUsers)
	if len(roleUsers) == 0 {
		return set
	}
	set.HasAnyRole = true
	roleIDs := make([]uint, 0, len(roleUsers))
	for _, ru := range roleUsers {
		roleIDs = append(roleIDs, ru.RoleID)
	}
	var roleNodes []models.ResourceRoleNode
	database.DB.Where("role_id IN ?", roleIDs).Find(&roleNodes)
	if len(roleNodes) == 0 {
		return set
	}
	nodeIDSet := map[uint]bool{}
	nodeIDs := make([]uint, 0, len(roleNodes))
	for _, rn := range roleNodes {
		if !nodeIDSet[rn.NodeID] {
			nodeIDSet[rn.NodeID] = true
			nodeIDs = append(nodeIDs, rn.NodeID)
		}
	}
	var nodes []models.ResourceNode
	database.DB.Where("id IN ?", nodeIDs).Find(&nodes)
	for _, n := range nodes {
		var cfg models.ResourceNodeConfig
		if strings.TrimSpace(n.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(n.ConfigJSON), &cfg)
		}
		switch n.NodeType {
		case "device_mgmt":
			set.DeviceNodes = append(set.DeviceNodes, ResourceDeviceNode{
				GroupIDs:    cfg.GroupIDs,
				DeviceIDs:   cfg.DeviceIDs,
				DetailPerms: cfg.DetailPerms,
			})
		case "workorder_mgmt":
			set.WorkOrderNodes = append(set.WorkOrderNodes, ResourceWorkOrderNode{
				TypeCodes:   cfg.TypeCodes,
				DetailPerms: cfg.DetailPerms,
			})
		}
	}
	return set
}

// deviceGroupIDs 返回设备所属的分组 ID 列表。
func deviceGroupIDs(deviceID uint) []uint {
	var members []models.DeviceGroupMember
	database.DB.Where("device_id = ?", deviceID).Find(&members)
	out := make([]uint, 0, len(members))
	for _, m := range members {
		out = append(out, m.GroupID)
	}
	return out
}

// AllowsDevice 逐节点判定：存在某设备节点同时满足「设备在其可见范围」且「授予该操作」。
func (s *ResourcePermSet) AllowsDevice(deviceID uint, groupIDs []uint, perm string) bool {
	for _, n := range s.DeviceNodes {
		if !containsStr(n.DetailPerms, perm) {
			continue
		}
		if containsUint(n.DeviceIDs, deviceID) {
			return true
		}
		for _, g := range groupIDs {
			if containsUint(n.GroupIDs, g) {
				return true
			}
		}
	}
	return false
}

// AllowsWorkOrder 逐节点判定：存在某工单节点覆盖该类型且授予操作。
// 节点 TypeCodes 为空表示覆盖全部类型。
func (s *ResourcePermSet) AllowsWorkOrder(typeCode, perm string) bool {
	for _, n := range s.WorkOrderNodes {
		if !containsStr(n.DetailPerms, perm) {
			continue
		}
		if len(n.TypeCodes) == 0 || containsStr(n.TypeCodes, typeCode) {
			return true
		}
	}
	return false
}

// RequireResourcePermission 资源中心敏感操作校验中间件。
//   - admin / operator：后台角色，直接放行（后台行为不变）。
//   - 其它登录用户：解析其资源角色权限集，校验目标资源与操作，失败 403。
//
// resourceKind: "device" | "workorder"；device 从路由 :id 解析设备并取其分组，
// workorder 从 :id 载入工单取其 type_code。
func RequireResourcePermission(resourceKind, perm string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("role")
		if role == "admin" || role == "operator" {
			c.Next()
			return
		}
		userID := c.GetUint("user_id")
		if userID == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			c.Abort()
			return
		}
		perms := ResolveUserResourcePerms(userID)
		if !perms.HasAnyRole {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			c.Abort()
			return
		}
		switch resourceKind {
		case "device":
			devID, ok := agent.ResolveDeviceID(c.Param("id"))
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
				c.Abort()
				return
			}
			if perms.AllowsDevice(devID, deviceGroupIDs(devID), perm) {
				c.Next()
				return
			}
		case "workorder":
			// 分享链接工单读写作用域（wo:rw:<id>）保持兼容。
			woID := strings.TrimSpace(c.Param("id"))
			if woID != "" {
				if v, ok := c.Get("wo_scopes"); ok {
					if scopes, ok := v.([]string); ok && containsStr(scopes, "wo:rw:"+woID) {
						c.Next()
						return
					}
				}
			}
			var wo models.WorkOrder
			if err := database.DB.Select("type_code").First(&wo, woID).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "work order not found"})
				c.Abort()
				return
			}
			if perms.AllowsWorkOrder(wo.TypeCode, perm) {
				c.Next()
				return
			}
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: resource permission denied"})
		c.Abort()
	}
}
