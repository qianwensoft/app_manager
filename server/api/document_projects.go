package api

import (
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// 文档项目管理（Document Projects）
// 项目是文档库首页的分组容器，支持分类、卡片/列表双视图。
// ============================================================================

// ---------------------------------------------------------------------------
// 项目分类
// ---------------------------------------------------------------------------

// GetDocumentProjectCategories 返回所有项目分类
func GetDocumentProjectCategories(c *gin.Context) {
	var categories []models.DocumentProjectCategory
	database.DB.Order("sort_order ASC, id ASC").Find(&categories)
	c.JSON(http.StatusOK, gin.H{"data": categories})
}

// CreateDocumentProjectCategory 创建项目分类
func CreateDocumentProjectCategory(c *gin.Context) {
	var body struct {
		Name        string `json:"name"`
		Code        string `json:"code"`
		Description string `json:"description"`
		Icon        string `json:"icon"`
		Color       string `json:"color"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	category := models.DocumentProjectCategory{
		Name:        strings.TrimSpace(body.Name),
		Code:        strings.TrimSpace(body.Code),
		Description: body.Description,
		Icon:        body.Icon,
		Color:       body.Color,
		SortOrder:   body.SortOrder,
	}
	if err := database.DB.Create(&category).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": category})
}

// UpdateDocumentProjectCategory 更新项目分类
func UpdateDocumentProjectCategory(c *gin.Context) {
	id := c.Param("id")
	var category models.DocumentProjectCategory
	if err := database.DB.First(&category, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body struct {
		Name        string `json:"name"`
		Code        string `json:"code"`
		Description string `json:"description"`
		Icon        string `json:"icon"`
		Color       string `json:"color"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{
		"name":        strings.TrimSpace(body.Name),
		"code":        strings.TrimSpace(body.Code),
		"description": body.Description,
		"icon":        body.Icon,
		"color":       body.Color,
		"sort_order":  body.SortOrder,
	}
	if err := database.DB.Model(&category).Updates(updates).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": category})
}

// DeleteDocumentProjectCategory 删除项目分类
func DeleteDocumentProjectCategory(c *gin.Context) {
	id := c.Param("id")
	var category models.DocumentProjectCategory
	if err := database.DB.First(&category, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	// 检查是否有项目使用该分类
	var count int64
	database.DB.Model(&models.DocumentProject{}).Where("category_id = ?", category.ID).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该分类下还有项目，无法删除"})
		return
	}
	if err := database.DB.Delete(&category).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------------------------------------------------------------------------
// 项目
// ---------------------------------------------------------------------------

// GetDocumentProjects 返回所有项目（含关联的根节点信息）
func GetDocumentProjects(c *gin.Context) {
	var projects []models.DocumentProject
	database.DB.Order("sort_order ASC, id ASC").Find(&projects)

	// 拉取项目关联的文档根节点名称
	type ProjectWithNode struct {
		models.DocumentProject
		RootNodeName string `json:"root_node_name"`
	}
	out := make([]ProjectWithNode, 0, len(projects))
	for _, p := range projects {
		item := ProjectWithNode{DocumentProject: p}
		if p.RootNodeID != nil {
			var node models.DocumentNode
			if err := database.DB.Select("name").First(&node, *p.RootNodeID).Error; err == nil {
				item.RootNodeName = node.Name
			}
		}
		out = append(out, item)
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// GetDocumentProjectByCode 按 code 查询单个项目
func GetDocumentProjectByCode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}
	var project models.DocumentProject
	if err := database.DB.Where("code = ?", code).First(&project).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": project})
}

// CreateDocumentProject 创建项目（自动创建入口根节点）
func CreateDocumentProject(c *gin.Context) {
	var body struct {
		Name        string `json:"name"`
		Code        string `json:"code"`
		Description string `json:"description"`
		Icon        string `json:"icon"`
		Color       string `json:"color"`
		CategoryID  *uint  `json:"category_id"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}

	userID := c.GetUint("user_id")

	// 在事务中创建项目和根节点
	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 1. 创建根文档节点
	rootNode := models.DocumentNode{
		Name:      strings.TrimSpace(body.Name),
		NodeType:  "folder",
		CreatedBy: userID,
	}
	if err := tx.Create(&rootNode).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建根节点失败"})
		return
	}

	// 2. 创建项目并关联根节点
	project := models.DocumentProject{
		Name:        strings.TrimSpace(body.Name),
		Code:        strings.TrimSpace(body.Code),
		Description: body.Description,
		Icon:        body.Icon,
		Color:       body.Color,
		CategoryID:  body.CategoryID,
		SortOrder:   body.SortOrder,
		RootNodeID:  &rootNode.ID,
		CreatedBy:   userID,
	}
	if err := tx.Create(&project).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交事务失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": project})
}

// UpdateDocumentProject 更新项目
func UpdateDocumentProject(c *gin.Context) {
	id := c.Param("id")
	var project models.DocumentProject
	if err := database.DB.First(&project, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body struct {
		Name        string `json:"name"`
		Code        string `json:"code"`
		Description string `json:"description"`
		Icon        string `json:"icon"`
		Color       string `json:"color"`
		CategoryID  *uint  `json:"category_id"`
		SortOrder   int    `json:"sort_order"`
		RootNodeID  *uint  `json:"root_node_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{
		"name":        strings.TrimSpace(body.Name),
		"code":        strings.TrimSpace(body.Code),
		"description": body.Description,
		"icon":        body.Icon,
		"color":       body.Color,
		"category_id": body.CategoryID,
		"sort_order":  body.SortOrder,
		"root_node_id": body.RootNodeID,
	}
	if err := database.DB.Model(&project).Updates(updates).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": project})
}

// DeleteDocumentProject 删除项目
func DeleteDocumentProject(c *gin.Context) {
	id := c.Param("id")
	var project models.DocumentProject
	if err := database.DB.First(&project, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := database.DB.Delete(&project).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------------------------------------------------------------------------
// 更新文档节点的锚点列表
// ---------------------------------------------------------------------------

// UpdateDocumentAnchors 更新文档节点的锚点（从 Markdown 标题自动提取）
func UpdateDocumentAnchors(c *gin.Context) {
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body struct {
		Anchors []models.DocumentAnchor `json:"anchors"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 解析现有 config_json
	var cfg models.DocumentNodeConfig
	if node.ConfigJSON != "" {
		if err := json.Unmarshal([]byte(node.ConfigJSON), &cfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config_json"})
			return
		}
	}
	cfg.Anchors = body.Anchors
	configBytes, _ := json.Marshal(cfg)

	if err := database.DB.Model(&node).Update("config_json", string(configBytes)).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
