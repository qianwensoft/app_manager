package api

import (
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/storage"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================================
// 文档管理（Document Management）后台配置 + 前台运行时 API。
// 节点树 CRUD（folder/doc/form_app）、文件上传/下载、版本管理、文档角色授权。
// ============================================================================

// ---------------------------------------------------------------------------
// 文档节点树
// ---------------------------------------------------------------------------

// docTypeByExt 根据文件扩展名推断 DocType。
func docTypeByExt(filename string) string {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filename), "."))
	switch ext {
	case "doc", "docx", "rtf", "odt":
		return "word"
	case "xls", "xlsx", "csv", "ods":
		return "excel"
	case "ppt", "pptx", "odp":
		return "ppt"
	case "pdf":
		return "pdf"
	case "md", "markdown":
		return "markdown"
	case "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg":
		return "image"
	case "mp4", "webm", "mov", "avi", "mkv":
		return "video"
	default:
		return "other"
	}
}

// GetDocumentNodes 返回文档节点树（含 children）。
//   - admin/operator：全量树。
//   - 其它用户：按文档角色可见节点过滤，并回填祖先路径。
func GetDocumentNodes(c *gin.Context) {
	var nodes []models.DocumentNode
	database.DB.Order("sort_order ASC, id ASC").Find(&nodes)

	role := c.GetString("role")
	if role != "admin" && role != "operator" {
		userID := c.GetUint("user_id")
		perms := auth.ResolveUserDocumentPerms(userID)
		nodes = filterVisibleDocumentNodes(nodes, perms)
	}
	c.JSON(http.StatusOK, gin.H{"data": buildDocumentNodeTree(nodes, nil)})
}

// filterVisibleDocumentNodes 保留被授权节点及其全部祖先（保证树可展开到根）。
func filterVisibleDocumentNodes(all []models.DocumentNode, perms *auth.DocumentPermSet) []models.DocumentNode {
	byID := map[uint]models.DocumentNode{}
	for _, n := range all {
		byID[n.ID] = n
	}
	visible := map[uint]bool{}
	// 被授权的节点，其整棵子树可见。
	for _, n := range all {
		if perms.Allows(n.ID, "read") {
			visible[n.ID] = true
		}
	}
	// 回填祖先路径。
	for id := range map[uint]bool(visible) {
		cur := byID[id].ParentID
		for cur != nil {
			if visible[*cur] {
				break
			}
			visible[*cur] = true
			cur = byID[*cur].ParentID
		}
	}
	out := make([]models.DocumentNode, 0, len(visible))
	for _, n := range all {
		if visible[n.ID] {
			out = append(out, n)
		}
	}
	return out
}

// buildDocumentNodeTree 从平铺列表构造以 parent 为根的子树。
func buildDocumentNodeTree(all []models.DocumentNode, parent *uint) []models.DocumentNode {
	out := make([]models.DocumentNode, 0)
	for _, n := range all {
		match := (parent == nil && n.ParentID == nil) ||
			(parent != nil && n.ParentID != nil && *n.ParentID == *parent)
		if !match {
			continue
		}
		n.Children = buildDocumentNodeTree(all, &n.ID)
		out = append(out, n)
	}
	return out
}

type documentNodeBody struct {
	ParentID   *uint  `json:"parent_id"`
	Name       string `json:"name"`
	// Code：URL 编码；可空；空时由后端按 name 生成（同级下保证唯一，冲突自动追加 -2/-3…）。
	Code       string `json:"code"`
	NodeType   string `json:"node_type"`
	DocType    string `json:"doc_type"`
	Icon       string `json:"icon"`
	SortOrder  int    `json:"sort_order"`
	ConfigJSON string `json:"config_json"`
}

func normalizeDocNodeType(t string) string {
	switch t {
	case "folder", "doc", "form_app":
		return t
	default:
		return "folder"
	}
}

// generateUniqueDocCode 同 parent_id 下生成不冲突的 code：base 来自请求或节点名，冲突则 -2/-3… 后缀。
// 仅做轻量 SQL 检查（limit 默认 32），对极端同名情况足够收敛。
func generateUniqueDocCode(tx *gorm.DB, parentID *uint, base string) string {
	clean := normalizeDocCode(base)
	if clean == "" {
		clean = "untitled"
	}
	candidate := clean
	for n := 2; n < 1024; n++ {
		var count int64
		q := tx.Model(&models.DocumentNode{}).Where("code = ?", candidate)
		if parentID == nil {
			q = q.Where("parent_id IS NULL")
		} else {
			q = q.Where("parent_id = ?", *parentID)
		}
		q.Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", clean, n)
	}
	// 极端兜底：附加纳秒时间戳。
	return fmt.Sprintf("%s-%d", clean, time.Now().UnixNano()%1_000_000)
}

// normalizeDocCode 把任意字符串规整成合法 code：小写、URL 安全、合并连续分隔符、剔除首尾非 [a-z0-9-_]。
//   - 字母数字原样保留（且自动小写化）；
//   - '-' / '_' 原样保留，但相邻同类分隔符合并为单个（"a  /b"→"a-b"，"foo___bar"→"foo_bar"，"a   b"→"a-b"）；
//   - 其他非字母数字字符→' ' 折叠成 '-'；
//   - 收尾去除所有 '-' 与 '_'，避免 URL 路径首尾出现 -；
//   - 截断到 100 字符。
func normalizeDocCode(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return ""
	}
	var b strings.Builder
	var prevSep byte // 最近一次写出的分隔符：'-' / '_' / 0
	writeSep := func(sep byte) {
		// 与上一分隔符相同则跳过；与 '-'/'_' 不同则保留（默认 '-' 折叠代替 '_'）。
		switch prevSep {
		case sep, '-', '_':
			// 已折叠或与上次相同，丢掉
		default:
			b.WriteByte(sep)
			prevSep = sep
		}
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevSep = 0
		case r == '-':
			writeSep('-')
		case r == '_':
			writeSep('_')
		default:
			writeSep('-')
		}
	}
	out := strings.Trim(b.String(), "-_")
	if len(out) > 100 {
		out = out[:100]
	}
	return out
}

// CreateDocumentNode 新建文档节点（folder/doc/form_app）。
// code 字段未传时按 name 规整生成；与同级已存在 code 冲突自动追加 -2/-3…。
func CreateDocumentNode(c *gin.Context) {
	var body documentNodeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	node := models.DocumentNode{
		ParentID:   body.ParentID,
		Name:       strings.TrimSpace(body.Name),
		NodeType:   normalizeDocNodeType(body.NodeType),
		DocType:    body.DocType,
		Icon:       body.Icon,
		SortOrder:  body.SortOrder,
		ConfigJSON: body.ConfigJSON,
		CreatedBy:  c.GetUint("user_id"),
	}

	// 在事务里生成唯一 code，确保并发创建同名同级不会撞 unique index。
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// 前端显式传 code 且非空 → 按原值去唯一化（用户主动指定）；
		// 否则按 name 自动生成。
		var baseCode string
		if trimmed := strings.TrimSpace(body.Code); trimmed != "" {
			baseCode = normalizeDocCode(trimmed)
		}
		if baseCode == "" {
			baseCode = normalizeDocCode(node.Name)
		}
		if baseCode == "" {
			baseCode = "untitled"
		}
		node.Code = generateUniqueDocCode(tx, node.ParentID, baseCode)
		return tx.Create(&node).Error
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": node})
}

// UpdateDocumentNode 更新文档节点（重命名/移动/改配置/code）。
func UpdateDocumentNode(c *gin.Context) {
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body documentNodeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"parent_id":   body.ParentID,
		"name":        strings.TrimSpace(body.Name),
		"icon":        body.Icon,
		"sort_order":  body.SortOrder,
		"config_json": body.ConfigJSON,
	}
	// 节点类型/文档类型仅在显式传入时更新（避免误清空）。
	if body.NodeType != "" {
		updates["node_type"] = normalizeDocNodeType(body.NodeType)
	}
	if body.DocType != "" {
		updates["doc_type"] = body.DocType
	}

	// code 字段：仅在请求里出现且非空时更新；需要保证同 parent_id 下唯一。
	if trimmed := strings.TrimSpace(body.Code); trimmed != "" {
		newCode := normalizeDocCode(trimmed)
		if newCode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code 含无效字符"})
			return
		}
		if newCode != node.Code {
			err := database.DB.Transaction(func(tx *gorm.DB) error {
				var count int64
				q := tx.Model(&models.DocumentNode{}).Where("id <> ? AND code = ?", node.ID, newCode)
				if node.ParentID == nil {
					q = q.Where("parent_id IS NULL")
				} else {
					q = q.Where("parent_id = ?", *node.ParentID)
				}
				q.Count(&count)
				if count > 0 {
					return fmt.Errorf("同级已存在编码 %q", newCode)
				}
				return nil
			})
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			updates["code"] = newCode
		}
	}

	if err := database.DB.Model(&node).Updates(updates).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": node})
}

// resolveDocNodeByCode 按 code 解析单个节点（全树匹配，返回首个可见的）。
//   - admin/operator：全量匹配；
//   - 其它用户：仅解析其可见节点（按文档角色过滤）。
func resolveDocNodeByCode(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}
	var matches []models.DocumentNode
	database.DB.Where("code = ?", code).Order("id ASC").Find(&matches)
	if len(matches) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	role := c.GetString("role")
	if role == "admin" || role == "operator" {
		c.JSON(http.StatusOK, gin.H{"data": matches[0]})
		return
	}
	// 按可见权限过滤；任一匹配即返回。
	userID := c.GetUint("user_id")
	perms := auth.ResolveUserDocumentPerms(userID)
	for _, n := range matches {
		if perms.Allows(n.ID, "read") {
			c.JSON(http.StatusOK, gin.H{"data": n})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not visible"})
}

// collectDocDescendants 返回 parentID 的所有后代节点 ID（不含自身）。
func collectDocDescendants(all []models.DocumentNode, parentID uint) []uint {
	out := make([]uint, 0)
	for _, n := range all {
		if n.ParentID != nil && *n.ParentID == parentID {
			out = append(out, n.ID)
			out = append(out, collectDocDescendants(all, n.ID)...)
		}
	}
	return out
}

// DeleteDocumentNode 删除文档节点（递归子树 + 版本记录 + 角色-节点分配）。
func DeleteDocumentNode(c *gin.Context) {
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var all []models.DocumentNode
	database.DB.Find(&all)
	toDelete := collectDocDescendants(all, node.ID)
	toDelete = append(toDelete, node.ID)

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Where("id IN ?", toDelete).Delete(&models.DocumentNode{}).Error; e != nil {
			return e
		}
		if e := tx.Where("node_id IN ?", toDelete).Delete(&models.DocumentVersion{}).Error; e != nil {
			return e
		}
		if e := tx.Where("node_id IN ?", toDelete).Delete(&models.DocumentRoleNode{}).Error; e != nil {
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
// 文件上传 / 下载 / 版本
// ---------------------------------------------------------------------------

// UploadDocumentFile 上传/替换文档文件 → 生成新 DocumentVersion，并更新节点当前指针。
func UploadDocumentFile(c *gin.Context) {
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	if maxB := config.C.Storage.DocMaxBytes(); file.Size > maxB {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("文件超过上限 %d MB", maxB/(1024*1024))})
		return
	}
	path, err := storage.SaveFile(file, "docs")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	comment := strings.TrimSpace(c.PostForm("comment"))
	mimeType := file.Header.Get("Content-Type")

	// 计算版本号（该节点已有最大版本 + 1）。
	var maxVer int
	database.DB.Model(&models.DocumentVersion{}).
		Where("node_id = ?", node.ID).
		Select("COALESCE(MAX(version),0)").Scan(&maxVer)
	ver := models.DocumentVersion{
		NodeID:      node.ID,
		Version:     maxVer + 1,
		StoragePath: path,
		SizeBytes:   file.Size,
		MimeType:    mimeType,
		ChangedBy:   c.GetUint("user_id"),
		Comment:     comment,
	}
	if err := database.DB.Create(&ver).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 更新节点当前文件指针；未显式指定 doc_type 时按扩展名推断。
	docType := node.DocType
	if docType == "" {
		docType = docTypeByExt(file.Filename)
	}
	updates := map[string]interface{}{
		"storage_path":       path,
		"mime_type":          mimeType,
		"size_bytes":         file.Size,
		"current_version_id": ver.ID,
		"doc_type":           docType,
		"node_type":          "doc",
	}
	database.DB.Model(&node).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"data": ver, "doc_type": docType})
}

// DownloadDocumentFile 下载节点当前文件（登录用户，经权限中间件）。
func DownloadDocumentFile(c *gin.Context) {
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if node.StoragePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no file"})
		return
	}
	filename := node.Name
	if ext := filepath.Ext(node.StoragePath); ext != "" && !strings.HasSuffix(strings.ToLower(filename), strings.ToLower(ext)) {
		filename += ext
	}
	c.FileAttachment(node.StoragePath, filename)
}

// GetDocumentVersions 返回节点的版本历史（倒序）。
func GetDocumentVersions(c *gin.Context) {
	id := c.Param("id")
	var versions []models.DocumentVersion
	database.DB.Where("node_id = ?", id).Order("version DESC").Find(&versions)
	c.JSON(http.StatusOK, gin.H{"data": versions})
}

// RevertDocumentVersion 将节点当前文件回退到指定历史版本（复制其存储指针，生成新版本记录）。
func RevertDocumentVersion(c *gin.Context) {
	id := c.Param("id")
	versionID := c.Param("versionId")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var target models.DocumentVersion
	if err := database.DB.Where("node_id = ?", node.ID).First(&target, versionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "version not found"})
		return
	}
	var maxVer int
	database.DB.Model(&models.DocumentVersion{}).
		Where("node_id = ?", node.ID).
		Select("COALESCE(MAX(version),0)").Scan(&maxVer)
	newVer := models.DocumentVersion{
		NodeID:      node.ID,
		Version:     maxVer + 1,
		StoragePath: target.StoragePath,
		SizeBytes:   target.SizeBytes,
		MimeType:    target.MimeType,
		ChangedBy:   c.GetUint("user_id"),
		Comment:     fmt.Sprintf("回退到版本 v%d", target.Version),
	}
	if err := database.DB.Create(&newVer).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&node).Updates(map[string]interface{}{
		"storage_path":       target.StoragePath,
		"mime_type":          target.MimeType,
		"size_bytes":         target.SizeBytes,
		"current_version_id": newVer.ID,
	})
	c.JSON(http.StatusOK, gin.H{"data": newVer})
}

// GetDocumentContent 返回文本类文档（markdown/other 文本）的原始内容，供前端编辑器加载。
func GetDocumentContent(c *gin.Context) {
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if node.StoragePath == "" {
		c.JSON(http.StatusOK, gin.H{"content": ""})
		return
	}
	data, err := readFileString(node.StoragePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"content": data})
}

type saveContentBody struct {
	Content string `json:"content"`
	Comment string `json:"comment"`
}

// SaveDocumentContent 保存文本类文档内容为新版本（Markdown 协同快照落盘 / 手动保存）。
func SaveDocumentContent(c *gin.Context) {
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body saveContentBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	path, size, err := writeDocText(node.ID, body.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var maxVer int
	database.DB.Model(&models.DocumentVersion{}).
		Where("node_id = ?", node.ID).
		Select("COALESCE(MAX(version),0)").Scan(&maxVer)
	ver := models.DocumentVersion{
		NodeID:      node.ID,
		Version:     maxVer + 1,
		StoragePath: path,
		SizeBytes:   size,
		MimeType:    "text/markdown",
		ChangedBy:   c.GetUint("user_id"),
		Comment:     strings.TrimSpace(body.Comment),
	}
	database.DB.Create(&ver)
	docType := node.DocType
	if docType == "" {
		docType = "markdown"
	}
	database.DB.Model(&node).Updates(map[string]interface{}{
		"storage_path":       path,
		"mime_type":          "text/markdown",
		"size_bytes":         size,
		"current_version_id": ver.ID,
		"doc_type":           docType,
		"node_type":          "doc",
	})
	c.JSON(http.StatusOK, gin.H{"data": ver})
}

// ---------------------------------------------------------------------------
// 文档角色
// ---------------------------------------------------------------------------

// GetDocumentRoles 返回文档角色列表（含绑定节点权限与用户）。
func GetDocumentRoles(c *gin.Context) {
	var roles []models.DocumentRole
	database.DB.Order("id ASC").Find(&roles)

	roleNodes := map[uint][]gin.H{}
	var rns []models.DocumentRoleNode
	database.DB.Find(&rns)
	for _, rn := range rns {
		var perms []string
		if strings.TrimSpace(rn.PermsJSON) != "" {
			_ = json.Unmarshal([]byte(rn.PermsJSON), &perms)
		}
		roleNodes[rn.RoleID] = append(roleNodes[rn.RoleID], gin.H{"node_id": rn.NodeID, "perms": perms})
	}
	roleUsers := map[uint][]uint{}
	var rus []models.DocumentRoleUser
	database.DB.Find(&rus)
	for _, ru := range rus {
		roleUsers[ru.RoleID] = append(roleUsers[ru.RoleID], ru.UserID)
	}

	out := make([]gin.H, 0, len(roles))
	for _, r := range roles {
		nodes := roleNodes[r.ID]
		if nodes == nil {
			nodes = []gin.H{}
		}
		userIDs := roleUsers[r.ID]
		if userIDs == nil {
			userIDs = []uint{}
		}
		out = append(out, gin.H{
			"id":          r.ID,
			"name":        r.Name,
			"code":        r.Code,
			"description": r.Description,
			"created_at":  r.CreatedAt,
			"updated_at":  r.UpdatedAt,
			"nodes":       nodes,
			"user_ids":    userIDs,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

type documentRoleBody struct {
	Name        string `json:"name"`
	Code        string `json:"code"`
	Description string `json:"description"`
}

// CreateDocumentRole 新建文档角色。
func CreateDocumentRole(c *gin.Context) {
	var body documentRoleBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	role := models.DocumentRole{
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

// UpdateDocumentRole 更新文档角色。
func UpdateDocumentRole(c *gin.Context) {
	id := c.Param("id")
	var role models.DocumentRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body documentRoleBody
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

// DeleteDocumentRole 删除文档角色及其分配。
func DeleteDocumentRole(c *gin.Context) {
	id := c.Param("id")
	var role models.DocumentRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Delete(&models.DocumentRole{}, role.ID).Error; e != nil {
			return e
		}
		if e := tx.Where("role_id = ?", role.ID).Delete(&models.DocumentRoleNode{}).Error; e != nil {
			return e
		}
		if e := tx.Where("role_id = ?", role.ID).Delete(&models.DocumentRoleUser{}).Error; e != nil {
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

type setDocRoleNodesBody struct {
	Nodes []struct {
		NodeID uint     `json:"node_id"`
		Perms  []string `json:"perms"`
	} `json:"nodes"`
}

// SetDocumentRoleNodes 全量替换角色的节点授权（每节点带权限键集合）。
func SetDocumentRoleNodes(c *gin.Context) {
	id := c.Param("id")
	roleID, _ := strconv.ParseUint(id, 10, 64)
	var role models.DocumentRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body setDocRoleNodesBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Where("role_id = ?", roleID).Delete(&models.DocumentRoleNode{}).Error; e != nil {
			return e
		}
		for _, n := range body.Nodes {
			perms := n.Perms
			if perms == nil {
				perms = []string{}
			}
			pj, _ := json.Marshal(perms)
			rn := models.DocumentRoleNode{RoleID: uint(roleID), NodeID: n.NodeID, PermsJSON: string(pj)}
			if e := tx.Create(&rn).Error; e != nil {
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

type setDocRoleUsersBody struct {
	UserIDs []uint `json:"user_ids"`
}

// SetDocumentRoleUsers 全量替换角色的用户集合。
func SetDocumentRoleUsers(c *gin.Context) {
	id := c.Param("id")
	roleID, _ := strconv.ParseUint(id, 10, 64)
	var role models.DocumentRole
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body setDocRoleUsersBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Where("role_id = ?", roleID).Delete(&models.DocumentRoleUser{}).Error; e != nil {
			return e
		}
		for _, uid := range body.UserIDs {
			ru := models.DocumentRoleUser{RoleID: uint(roleID), UserID: uid}
			if e := tx.Create(&ru).Error; e != nil {
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

// GetDocumentPermCatalog 返回文档权限键目录（供前端配置面板）。
func GetDocumentPermCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": auth.DocumentPerms})
}

// ---------------------------------------------------------------------------
// 前台运行时
// ---------------------------------------------------------------------------

// GetDocumentPortalPermissions 返回当前用户对每个可见节点的权限键集合（前台按此裁剪操作按钮）。
func GetDocumentPortalPermissions(c *gin.Context) {
	role := c.GetString("role")
	if role == "admin" || role == "operator" {
		c.JSON(http.StatusOK, gin.H{"is_admin": true, "perms": gin.H{}})
		return
	}
	userID := c.GetUint("user_id")
	perms := auth.ResolveUserDocumentPerms(userID)
	var nodes []models.DocumentNode
	database.DB.Select("id").Find(&nodes)
	out := gin.H{}
	for _, n := range nodes {
		granted := []string{}
		for _, p := range auth.DocumentPerms {
			if perms.Allows(n.ID, p) {
				granted = append(granted, p)
			}
		}
		if len(granted) > 0 {
			out[strconv.FormatUint(uint64(n.ID), 10)] = granted
		}
	}
	c.JSON(http.StatusOK, gin.H{"is_admin": false, "perms": out})
}
