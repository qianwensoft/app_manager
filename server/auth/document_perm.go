package auth

import (
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// DocumentPerms 文档管理权限键目录（供前端配置面板与后端校验共用）。
//   - read     查看/预览文档
//   - download 下载文档文件
//   - edit     编辑内容 / 上传替换 / 移动 / 版本回退
//   - delete   删除节点
//   - share    创建分享链接
//   - manage   管理该节点子树（含子节点增删）
var DocumentPerms = []string{"read", "download", "edit", "delete", "share", "manage"}

// DocumentPermSet 某用户在文档管理的合并权限集（按节点保留授予的权限键）。
type DocumentPermSet struct {
	HasAnyRole bool
	// nodePerms: nodeID -> 该节点被显式授予的权限键集合
	nodePerms map[uint]map[string]bool
	// parentOf: 全量节点的父指针，用于沿 ParentID 继承父节点权限
	parentOf map[uint]*uint
}

// ResolveUserDocumentPerms 解析用户所属文档角色 → 角色-节点授权 → 合并权限集。
func ResolveUserDocumentPerms(userID uint) *DocumentPermSet {
	set := &DocumentPermSet{
		nodePerms: map[uint]map[string]bool{},
		parentOf:  map[uint]*uint{},
	}
	if userID == 0 || database.DB == nil {
		return set
	}
	var roleUsers []models.DocumentRoleUser
	database.DB.Where("user_id = ?", userID).Find(&roleUsers)
	if len(roleUsers) == 0 {
		return set
	}
	set.HasAnyRole = true
	roleIDs := make([]uint, 0, len(roleUsers))
	for _, ru := range roleUsers {
		roleIDs = append(roleIDs, ru.RoleID)
	}

	var roleNodes []models.DocumentRoleNode
	database.DB.Where("role_id IN ?", roleIDs).Find(&roleNodes)
	for _, rn := range roleNodes {
		perms := set.nodePerms[rn.NodeID]
		if perms == nil {
			perms = map[string]bool{}
			set.nodePerms[rn.NodeID] = perms
		}
		var keys []string
		if strings.TrimSpace(rn.PermsJSON) != "" {
			_ = json.Unmarshal([]byte(rn.PermsJSON), &keys)
		}
		// 未显式配置权限时，至少给 read（可见即可读）。
		if len(keys) == 0 {
			perms["read"] = true
		}
		for _, k := range keys {
			perms[k] = true
		}
	}

	// 载入全量节点父指针，供继承判定。
	var nodes []models.DocumentNode
	database.DB.Select("id", "parent_id").Find(&nodes)
	for _, n := range nodes {
		set.parentOf[n.ID] = n.ParentID
	}
	return set
}

// Allows 判定某用户对某节点是否具备指定权限。
// 从该节点起沿 ParentID 向上查找，任一祖先节点被授予该权限即放行（父权限继承给子树）。
func (s *DocumentPermSet) Allows(nodeID uint, perm string) bool {
	if s == nil {
		return false
	}
	cur := &nodeID
	visited := map[uint]bool{}
	for cur != nil {
		if visited[*cur] {
			break
		}
		visited[*cur] = true
		if perms, ok := s.nodePerms[*cur]; ok {
			if perms[perm] {
				return true
			}
		}
		parent, ok := s.parentOf[*cur]
		if !ok {
			break
		}
		cur = parent
	}
	return false
}

// VisibleNodeIDs 返回被显式授权的节点 ID 集合（用于前台树过滤，再回填祖先）。
func (s *DocumentPermSet) VisibleNodeIDs() map[uint]bool {
	out := map[uint]bool{}
	if s == nil {
		return out
	}
	for nid := range s.nodePerms {
		out[nid] = true
	}
	return out
}

// RequireDocumentPermission 文档管理敏感操作校验中间件。
//   - admin / operator：后台角色，直接放行（后台行为不变）。
//   - 其它登录用户：解析其文档角色权限集，校验目标节点与操作，失败 403。
//
// 目标节点从路由参数 :id 解析（文档节点 ID）。
func RequireDocumentPermission(perm string) gin.HandlerFunc {
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
		perms := ResolveUserDocumentPerms(userID)
		if !perms.HasAnyRole {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			c.Abort()
			return
		}
		nodeID64, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
			c.Abort()
			return
		}
		if perms.Allows(uint(nodeID64), perm) {
			c.Next()
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: document permission denied"})
		c.Abort()
	}
}
