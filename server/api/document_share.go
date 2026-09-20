package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// 文档项目免登录分享（供 Agent App 菜单只读打开整棵项目文档树）。
// 与 SCADA / 表单应用的 ShareToken 机制对齐：项目需先「发布」生成 token，
// 分享期间以 ?share=<token> 校验，仅提供只读访问，不支持编辑/上传/协同。
// ============================================================================

// resolveSharedDocumentProject 按 code + share token 校验并返回已发布项目。
func resolveSharedDocumentProject(c *gin.Context) (*models.DocumentProject, bool) {
	code := c.Param("code")
	token := strings.TrimSpace(c.Query("share"))
	if code == "" || token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code and share token required"})
		return nil, false
	}
	var project models.DocumentProject
	if err := database.DB.Where("code = ? AND publish_status = ? AND share_token = ?", code, 1, token).
		First(&project).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid or unpublished share"})
		return nil, false
	}
	return &project, true
}

// GetSharedDocumentProject 免登录：按分享 token 返回项目基础信息。
func GetSharedDocumentProject(c *gin.Context) {
	project, ok := resolveSharedDocumentProject(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": project})
}

// GetSharedDocumentNodes 免登录：返回分享项目关联根节点及其整棵子树（只读）。
func GetSharedDocumentNodes(c *gin.Context) {
	project, ok := resolveSharedDocumentProject(c)
	if !ok {
		return
	}
	if project.RootNodeID == nil {
		c.JSON(http.StatusOK, gin.H{"data": []models.DocumentNode{}})
		return
	}
	var nodes []models.DocumentNode
	database.DB.Order("sort_order ASC, id ASC").Find(&nodes)
	tree := buildDocumentNodeTree(nodes, nil)
	root := findSharedNode(tree, *project.RootNodeID)
	if root == nil {
		c.JSON(http.StatusOK, gin.H{"data": []models.DocumentNode{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": []models.DocumentNode{*root}})
}

func findSharedNode(nodes []models.DocumentNode, id uint) *models.DocumentNode {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
		if found := findSharedNode(nodes[i].Children, id); found != nil {
			return found
		}
	}
	return nil
}

// nodeWithinSharedProject 校验节点是否属于该分享项目关联的子树（防止越权访问其他项目/私有文档）。
func nodeWithinSharedProject(project *models.DocumentProject, nodeID uint) bool {
	if project.RootNodeID == nil {
		return false
	}
	var nodes []models.DocumentNode
	database.DB.Order("sort_order ASC, id ASC").Find(&nodes)
	tree := buildDocumentNodeTree(nodes, nil)
	root := findSharedNode(tree, *project.RootNodeID)
	if root == nil {
		return false
	}
	return findSharedNode([]models.DocumentNode{*root}, nodeID) != nil
}

// GetSharedDocumentContent 免登录：读取分享子树内某文本节点的内容（Markdown 只读展示）。
func GetSharedDocumentContent(c *gin.Context) {
	project, ok := resolveSharedDocumentProject(c)
	if !ok {
		return
	}
	nodeID := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, nodeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if !nodeWithinSharedProject(project, node.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
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

// DownloadSharedDocumentFile 免登录：下载分享子树内节点的当前文件（图片/PDF/视频等只读预览）。
func DownloadSharedDocumentFile(c *gin.Context) {
	project, ok := resolveSharedDocumentProject(c)
	if !ok {
		return
	}
	nodeID := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, nodeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if !nodeWithinSharedProject(project, node.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
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
