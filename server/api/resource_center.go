package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================================
// 资源中心（Resource Center）后台配置 + 前台运行时 API。
// 后台：节点树 CRUD、资源角色 CRUD、角色-节点/角色-用户分配、矩阵。
// 前台：解析当前用户可见资源树与权限集。
// ============================================================================

// ---------------------------------------------------------------------------
// 节点树
// ---------------------------------------------------------------------------

// GetResourceNodes 返回资源节点树（含 children）。
func GetResourceNodes(c *gin.Context) {
	var nodes []models.ResourceNode
	database.DB.Order("sort_order ASC, id ASC").Find(&nodes)
	c.JSON(http.StatusOK, gin.H{"data": buildResourceNodeTree(nodes, nil)})
}

// buildResourceNodeTree 从平铺列表构造以 parent 为根的子树。
func buildResourceNodeTree(all []models.ResourceNode, parent *uint) []models.ResourceNode {
	out := make([]models.ResourceNode, 0)
	for _, n := range all {
		match := (parent == nil && n.ParentID == nil) ||
			(parent != nil && n.ParentID != nil && *n.ParentID == *parent)
		if !match {
			continue
		}
		n.Children = buildResourceNodeTree(all, &n.ID)
		out = append(out, n)
	}
	return out
}

type resourceNodeBody struct {
	ParentID   *uint  `json:"parent_id"`
	Name       string `json:"name"`
	NodeType   string `json:"node_type"`
	Icon       string `json:"icon"`
	SortOrder  int    `json:"sort_order"`
	ConfigJSON string `json:"config_json"`
}

func normalizeNodeType(t string) string {
	switch t {
	case "group", "device_mgmt", "workorder_mgmt", "scada", "form_app", "link":
		return t
	default:
		return "group"
	}
}

// CreateResourceNode 新建资源节点。
func CreateResourceNode(c *gin.Context) {
	var body resourceNodeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	node := models.ResourceNode{
		ParentID:   body.ParentID,
		Name:       strings.TrimSpace(body.Name),
		NodeType:   normalizeNodeType(body.NodeType),
		Icon:       body.Icon,
		SortOrder:  body.SortOrder,
		ConfigJSON: body.ConfigJSON,
	}
	if err := database.DB.Create(&node).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": node})
}

// UpdateResourceNode 更新资源节点。
func UpdateResourceNode(c *gin.Context) {
	id := c.Param("id")
	var node models.ResourceNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body resourceNodeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{
		"parent_id":   body.ParentID,
		"name":        strings.TrimSpace(body.Name),
		"node_type":   normalizeNodeType(body.NodeType),
		"icon":        body.Icon,
		"sort_order":  body.SortOrder,
		"config_json": body.ConfigJSON,
	}
	if err := database.DB.Model(&node).Updates(updates).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": node})
}

// DeleteResourceNode 删除资源节点（级联删除子节点与相关角色-节点分配）。
func DeleteResourceNode(c *gin.Context) {
	id := c.Param("id")
	var node models.ResourceNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var all []models.ResourceNode
	database.DB.Find(&all)
	toDelete := collectDescendants(all, node.ID)
	toDelete = append(toDelete, node.ID)

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Where("id IN ?", toDelete).Delete(&models.ResourceNode{}).Error; e != nil {
			return e
		}
		if e := tx.Where("node_id IN ?", toDelete).Delete(&models.ResourceRoleNode{}).Error; e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// collectDescendants 返回 parentID 的所有后代节点 ID（不含自身）。
func collectDescendants(all []models.ResourceNode, parentID uint) []uint {
	out := make([]uint, 0)
	for _, n := range all {
		if n.ParentID != nil && *n.ParentID == parentID {
			out = append(out, n.ID)
			out = append(out, collectDescendants(all, n.ID)...)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// 资源角色
// ---------------------------------------------------------------------------

// GetResourceRoles 返回资源角色列表（含绑定的节点 ID 与用户 ID）。
func GetResourceRoles(c *gin.Context) {
	var roles []models.ResourceRole
	database.DB.Order("id ASC").Find(&roles)

	roleNodes := map[uint][]uint{}
	var rns []models.ResourceRoleNode
	database.DB.Find(&rns)
	for _, rn := range rns {
		roleNodes[rn.RoleID] = append(roleNodes[rn.RoleID], rn.NodeID)
	}
	roleUsers := map[uint][]uint{}
	var rus []models.ResourceRoleUser
	database.DB.Find(&rus)
	for _, ru := range rus {
		roleUsers[ru.RoleID] = append(roleUsers[ru.RoleID], ru.UserID)
	}

	out := make([]map[string]interface{}, 0, len(roles))
	for _, r := range roles {
		nodeIDs := roleNodes[r.ID]
		if nodeIDs == nil {
			nodeIDs = []uint{}
		}
		userIDs := roleUsers[r.ID]
		if userIDs == nil {
			userIDs = []uint{}
		}
		out = append(out, map[string]interface{}{
			"id":          r.ID,
			"name":        r.Name,
			"code":        r.Code,
			"description": r.Description,
			"created_at":  r.CreatedAt,
			"updated_at":  r.UpdatedAt,
			"node_ids":    nodeIDs,
			"user_ids":    userIDs,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

type resourceRoleBody struct {
	Name        string `json:"name"`
	Code        string `json:"code"`
	Description string `json:"description"`
}

// CreateResourceRole 新建资源角色。
func CreateResourceRole(c *gin.Context) {
	var body resourceRoleBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	role := models.ResourceRole{
		Name:        strings.TrimSpace(body.Name),
		Code:        strings.TrimSpace(body.Code),
		Description: body.Description,
	}
	if err := database.DB.Create(&role).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": role})
}

// UpdateResourceRole 更新资源角色。
func UpdateResourceRole(c *gin.Context) {
	id := c.Param("id")
	var role models.ResourceRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body resourceRoleBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{
		"name":        strings.TrimSpace(body.Name),
		"code":        strings.TrimSpace(body.Code),
		"description": body.Description,
	}
	if err := database.DB.Model(&role).Updates(updates).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": role})
}

// DeleteResourceRole 删除资源角色及其分配。
func DeleteResourceRole(c *gin.Context) {
	id := c.Param("id")
	var role models.ResourceRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Delete(&models.ResourceRole{}, role.ID).Error; e != nil {
			return e
		}
		if e := tx.Where("role_id = ?", role.ID).Delete(&models.ResourceRoleNode{}).Error; e != nil {
			return e
		}
		if e := tx.Where("role_id = ?", role.ID).Delete(&models.ResourceRoleUser{}).Error; e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------------------------------------------------------------------------
// 分配（角色-节点 / 角色-用户，全量替换）
// ---------------------------------------------------------------------------

type setRoleNodesBody struct {
	NodeIDs []uint `json:"node_ids"`
}

// SetResourceRoleNodes 全量替换角色可见的资源节点集合。
func SetResourceRoleNodes(c *gin.Context) {
	id := c.Param("id")
	var role models.ResourceRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body setRoleNodesBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Where("role_id = ?", role.ID).Delete(&models.ResourceRoleNode{}).Error; e != nil {
			return e
		}
		for _, nid := range uniqueUints(body.NodeIDs) {
			if e := tx.Create(&models.ResourceRoleNode{RoleID: role.ID, NodeID: nid}).Error; e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type setRoleUsersBody struct {
	UserIDs []uint `json:"user_ids"`
}

// SetResourceRoleUsers 全量替换角色关联的用户集合。
func SetResourceRoleUsers(c *gin.Context) {
	id := c.Param("id")
	var role models.ResourceRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body setRoleUsersBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Where("role_id = ?", role.ID).Delete(&models.ResourceRoleUser{}).Error; e != nil {
			return e
		}
		for _, uid := range uniqueUints(body.UserIDs) {
			if e := tx.Create(&models.ResourceRoleUser{RoleID: role.ID, UserID: uid}).Error; e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetResourceMatrix 返回 节点 x 角色 矩阵：所有节点、所有角色、每个角色勾选的节点。
func GetResourceMatrix(c *gin.Context) {
	var nodes []models.ResourceNode
	database.DB.Order("sort_order ASC, id ASC").Find(&nodes)
	var roles []models.ResourceRole
	database.DB.Order("id ASC").Find(&roles)

	assignments := map[uint][]uint{} // roleID -> []nodeID
	var rns []models.ResourceRoleNode
	database.DB.Find(&rns)
	for _, rn := range rns {
		assignments[rn.RoleID] = append(assignments[rn.RoleID], rn.NodeID)
	}
	for _, r := range roles {
		if assignments[r.ID] == nil {
			assignments[r.ID] = []uint{}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"nodes":       nodes,
		"roles":       roles,
		"assignments": assignments,
	})
}

// GetResourcePermCatalog 返回可配置的操作权限键目录（供后台配置面板使用）。
func GetResourcePermCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"device_perms":    auth.ResourceDevicePerms,
		"workorder_perms": auth.ResourceWorkOrderPerms,
	})
}

// ---------------------------------------------------------------------------
// 前台运行时（/api/portal）：解析当前用户可见资源树与权限集。
// ---------------------------------------------------------------------------

// expandDeviceScope 将 group_ids 经 DeviceGroupMember 展开为设备 ID，与显式 device_ids 求并集。
func expandDeviceScope(groupIDs, deviceIDs []uint) []uint {
	seen := map[uint]bool{}
	out := make([]uint, 0)
	for _, id := range deviceIDs {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	if len(groupIDs) > 0 {
		var members []models.DeviceGroupMember
		database.DB.Where("group_id IN ?", groupIDs).Find(&members)
		for _, m := range members {
			if !seen[m.DeviceID] {
				seen[m.DeviceID] = true
				out = append(out, m.DeviceID)
			}
		}
	}
	return out
}

// resolveVisibleNodeIDs 解析当前用户所属资源角色 → 并集可见叶子节点 ID。
func resolveVisibleNodeIDs(userID uint) map[uint]bool {
	visible := map[uint]bool{}
	if userID == 0 {
		return visible
	}
	var roleUsers []models.ResourceRoleUser
	database.DB.Where("user_id = ?", userID).Find(&roleUsers)
	if len(roleUsers) == 0 {
		return visible
	}
	roleIDs := make([]uint, 0, len(roleUsers))
	for _, ru := range roleUsers {
		roleIDs = append(roleIDs, ru.RoleID)
	}
	var roleNodes []models.ResourceRoleNode
	database.DB.Where("role_id IN ?", roleIDs).Find(&roleNodes)
	for _, rn := range roleNodes {
		visible[rn.NodeID] = true
	}
	return visible
}

// GetPortalResourceTree 返回当前用户可见的资源树。
// 规则：并集可见节点 → 回填其所有祖先 group 节点 → 构造树。
// admin 可见全部节点。
func GetPortalResourceTree(c *gin.Context) {
	role := c.GetString("role")
	userID := c.GetUint("user_id")

	var all []models.ResourceNode
	database.DB.Order("sort_order ASC, id ASC").Find(&all)

	var kept []models.ResourceNode
	if role == "admin" {
		kept = all
	} else {
		visible := resolveVisibleNodeIDs(userID)
		if len(visible) == 0 {
			c.JSON(http.StatusOK, gin.H{"data": []models.ResourceNode{}})
			return
		}
		byID := map[uint]models.ResourceNode{}
		for _, n := range all {
			byID[n.ID] = n
		}
		// 回填祖先，保证树结构完整。
		keepSet := map[uint]bool{}
		for nid := range visible {
			cur := nid
			for {
				if keepSet[cur] {
					break
				}
				node, ok := byID[cur]
				if !ok {
					break
				}
				keepSet[cur] = true
				if node.ParentID == nil {
					break
				}
				cur = *node.ParentID
			}
		}
		for _, n := range all {
			if keepSet[n.ID] {
				kept = append(kept, n)
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": buildEnrichedPortalTree(kept, nil)})
}

// buildEnrichedPortalTree 构造前台资源树，并对叶子节点附带解析后的配置与解析后的设备 ID。
func buildEnrichedPortalTree(all []models.ResourceNode, parent *uint) []gin.H {
	out := make([]gin.H, 0)
	for _, n := range all {
		match := (parent == nil && n.ParentID == nil) ||
			(parent != nil && n.ParentID != nil && *n.ParentID == *parent)
		if !match {
			continue
		}
		node := gin.H{
			"id":         n.ID,
			"parent_id":  n.ParentID,
			"name":       n.Name,
			"node_type":  n.NodeType,
			"icon":       n.Icon,
			"sort_order": n.SortOrder,
			"children":   buildEnrichedPortalTree(all, &n.ID),
		}
		var cfg models.ResourceNodeConfig
		if strings.TrimSpace(n.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(n.ConfigJSON), &cfg)
		}
		switch n.NodeType {
		case "device_mgmt":
			node["group_ids"] = cfg.GroupIDs
			node["device_ids"] = cfg.DeviceIDs
			node["resolved_device_ids"] = expandDeviceScope(cfg.GroupIDs, cfg.DeviceIDs)
			node["detail_perms"] = cfg.DetailPerms
		case "workorder_mgmt":
			node["type_codes"] = cfg.TypeCodes
			node["detail_perms"] = cfg.DetailPerms
		case "scada":
			node["scada_id"] = cfg.ScadaID
			node["scada_code"] = cfg.ScadaCode
			node["open_mode"] = cfg.OpenMode
			// 附带发布状态与分享令牌，前台优先用正式发布地址（/scada-editor/share/<token>），
			// 未发布时回退到预览地址。
			if cfg.ScadaID != 0 {
				var si models.ScadaInfo
				if err := database.DB.Select("publish_status", "share_token").First(&si, cfg.ScadaID).Error; err == nil {
					node["publish_status"] = si.PublishStatus
					node["share_token"] = si.ShareToken
				}
			}
		case "form_app":
			node["form_code"] = cfg.FormCode
			node["open_mode"] = cfg.OpenMode
		case "link":
			node["url"] = cfg.URL
			node["open_mode"] = cfg.OpenMode
		}
		out = append(out, node)
	}
	return out
}

// GetPortalStats 返回资源中心首页概览统计：授权设备数（在线/离线）、相关工单数（按状态）、
// 以及各类资源节点数量。admin 统计全量；其他用户仅统计其资源角色授权范围内的数据。
func GetPortalStats(c *gin.Context) {
	role := c.GetString("role")
	userID := c.GetUint("user_id")
	isAdmin := role == "admin"

	// ---- 节点计数（当前用户可见范围内）----
	var all []models.ResourceNode
	database.DB.Find(&all)
	nodeVisible := func(id uint) bool { return true }
	if !isAdmin {
		visible := resolveVisibleNodeIDs(userID)
		nodeVisible = func(id uint) bool { return visible[id] }
	}
	nodeCounts := gin.H{"group": 0, "device_mgmt": 0, "workorder_mgmt": 0, "scada": 0, "form_app": 0, "link": 0}
	for _, n := range all {
		if !nodeVisible(n.ID) {
			continue
		}
		if cur, ok := nodeCounts[n.NodeType].(int); ok {
			nodeCounts[n.NodeType] = cur + 1
		}
	}

	// ---- 设备统计 ----
	// deviceBase 每次调用返回带作用域过滤的全新查询，避免 GORM 条件累积。
	var deviceIDs []uint
	deviceScoped := true
	if !isAdmin {
		perms := auth.ResolveUserResourcePerms(userID)
		devIDSet := map[uint]bool{}
		for _, n := range perms.DeviceNodes {
			for _, id := range expandDeviceScope(n.GroupIDs, n.DeviceIDs) {
				devIDSet[id] = true
			}
		}
		if len(devIDSet) == 0 {
			deviceScoped = false // 无授权设备
		} else {
			for id := range devIDSet {
				deviceIDs = append(deviceIDs, id)
			}
		}
	}
	deviceBase := func() *gorm.DB {
		q := database.DB.Model(&models.Device{})
		if !isAdmin {
			q = q.Where("id IN ?", deviceIDs)
		}
		return q
	}
	var devTotal, devOnline int64
	if deviceScoped {
		deviceBase().Count(&devTotal)
		deviceBase().Where("status = ?", "online").Count(&devOnline)
	}

	// ---- 工单统计（未归档）----
	var woTypeCodes []string
	woAllTypes := isAdmin
	woScoped := true
	if !isAdmin {
		perms := auth.ResolveUserResourcePerms(userID)
		typeSet := map[string]bool{}
		hasWONode := false
		for _, n := range perms.WorkOrderNodes {
			hasWONode = true
			if len(n.TypeCodes) == 0 {
				woAllTypes = true
				break
			}
			for _, tc := range n.TypeCodes {
				typeSet[tc] = true
			}
		}
		if !hasWONode {
			woScoped = false
		} else if !woAllTypes {
			for tc := range typeSet {
				woTypeCodes = append(woTypeCodes, tc)
			}
		}
	}
	woBase := func() *gorm.DB {
		q := database.DB.Model(&models.WorkOrder{}).Where("archived = ?", false)
		if !woAllTypes {
			q = q.Where("type_code IN ?", woTypeCodes)
		}
		return q
	}
	var woTotal, woOpen, woInProgress, woClosed int64
	if woScoped {
		woBase().Count(&woTotal)
		woBase().Where("status IN ?", []string{"open", "reopened"}).Count(&woOpen)
		woBase().Where("status = ?", "in_progress").Count(&woInProgress)
		woBase().Where("status IN ?", []string{"closed", "resolved"}).Count(&woClosed)
	}

	c.JSON(http.StatusOK, gin.H{
		"is_admin": isAdmin,
		"device": gin.H{
			"total":   devTotal,
			"online":  devOnline,
			"offline": devTotal - devOnline,
		},
		"workorder": gin.H{
			"total":       woTotal,
			"open":        woOpen,
			"in_progress": woInProgress,
			"closed":      woClosed,
		},
		"node_counts": nodeCounts,
	})
}

// GetPortalPermissions 返回当前用户解析后的权限集（前端唯一真源）。
// 结构：device -> { group_ids, device_ids, perms }[], workorder -> { type_codes, perms }[]。
func GetPortalPermissions(c *gin.Context) {
	role := c.GetString("role")
	userID := c.GetUint("user_id")

	resp := gin.H{
		"is_admin":   role == "admin",
		"devices":    []gin.H{},
		"workorders": []gin.H{},
	}
	if role == "admin" {
		c.JSON(http.StatusOK, resp)
		return
	}

	perms := auth.ResolveUserResourcePerms(userID)
	devs := make([]gin.H, 0, len(perms.DeviceNodes))
	for _, n := range perms.DeviceNodes {
		devs = append(devs, gin.H{
			"group_ids":  n.GroupIDs,
			"device_ids": n.DeviceIDs,
			// resolved_device_ids：group_ids 经 DeviceGroupMember 展开后与 device_ids 的并集，
			// 供前端直接按扁平设备 ID 集过滤列表（设备列表只有 group_name 字符串，无 org group id）。
			"resolved_device_ids": expandDeviceScope(n.GroupIDs, n.DeviceIDs),
			"perms":               n.DetailPerms,
		})
	}
	wos := make([]gin.H, 0, len(perms.WorkOrderNodes))
	for _, n := range perms.WorkOrderNodes {
		wos = append(wos, gin.H{
			"type_codes": n.TypeCodes,
			"perms":      n.DetailPerms,
		})
	}
	resp["devices"] = devs
	resp["workorders"] = wos
	c.JSON(http.StatusOK, resp)
}
