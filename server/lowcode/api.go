package lowcode

import (
	"app-manager/auth"
	"app-manager/database"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// RegisterRoutes 注册低代码平台路由
func RegisterRoutes(r *gin.RouterGroup) {
	lc := r.Group("/lowcode", auth.AuthMiddleware())
	{
		// 页面管理
		lc.GET("/pages", auth.RequireRole("admin", "operator", "viewer"), ListPages)
		lc.POST("/pages", auth.RequireRole("admin", "operator"), CreatePage)
		lc.GET("/pages/:id", auth.RequireRole("admin", "operator", "viewer"), GetPage)
		lc.PUT("/pages/:id", auth.RequireRole("admin", "operator"), UpdatePage)
		lc.DELETE("/pages/:id", auth.RequireRole("admin"), DeletePage)
		lc.POST("/pages/:id/publish", auth.RequireRole("admin", "operator"), PublishPage)

		// 自动生成
		lc.POST("/pages/generate-from-table", auth.RequireRole("admin", "operator"), GenerateFromTable)

		// AI 生成
		lc.POST("/pages/ai-generate", auth.RequireRole("admin", "operator"), AIGenerate)

		// 版本管理
		lc.GET("/pages/:id/versions", auth.RequireRole("admin", "operator", "viewer"), ListPageVersions)
		lc.POST("/pages/:id/rollback/:version", auth.RequireRole("admin", "operator"), RollbackVersion)

		// 工作流管理
		lc.GET("/workflows", auth.RequireRole("admin", "operator", "viewer"), ListWorkflows)
		lc.GET("/workflows/:id", auth.RequireRole("admin", "operator", "viewer"), GetWorkflow)
		lc.POST("/workflows", auth.RequireRole("admin", "operator"), CreateWorkflow)
		lc.PUT("/workflows/:id", auth.RequireRole("admin", "operator"), UpdateWorkflow)
		lc.DELETE("/workflows/:id", auth.RequireRole("admin"), DeleteWorkflow)
	}
}

// ListPages 列出所有页面
func ListPages(c *gin.Context) {
	category := c.Query("category")
	var pages []LowCodePage
	q := database.DB.Model(&LowCodePage{})
	if category != "" {
		q = q.Where("category = ?", category)
	}
	if err := q.Order("id DESC").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": pages})
}

// GetPage 获取页面详情
func GetPage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var page LowCodePage
	if err := database.DB.First(&page, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": page})
}

// CreatePage 创建页面
func CreatePage(c *gin.Context) {
	var page LowCodePage
	if err := c.ShouldBindJSON(&page); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(page.Code) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}

	// 检查 code 唯一性
	var exist LowCodePage
	if err := database.DB.Where("code = ?", page.Code).First(&exist).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code already exists"})
		return
	}

	// 设置创建者
	if userID, exists := c.Get("userID"); exists {
		page.CreatedBy = userID.(uint)
	}

	page.Version = 1
	if err := database.DB.Create(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 创建初始版本
	version := LowCodePageVersion{
		PageID:      page.ID,
		Version:     page.Version,
		PuckState:   page.PuckState,
		WorkflowDef: page.WorkflowDef,
		ChangeLog:   "Initial version",
		CreatedBy:   page.CreatedBy,
	}
	database.DB.Create(&version)

	c.JSON(http.StatusOK, gin.H{"data": page})
}

// UpdatePage 更新页面
func UpdatePage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var body LowCodePage
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var page LowCodePage
	if err := database.DB.First(&page, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	// 更新字段
	page.Name = body.Name
	page.Category = body.Category
	page.PuckState = body.PuckState
	page.WorkflowDef = body.WorkflowDef
	page.DataSourceID = body.DataSourceID
	page.Version++

	if err := database.DB.Save(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 创建版本快照
	userID := uint(0)
	if uid, exists := c.Get("userID"); exists {
		userID = uid.(uint)
	}
	version := LowCodePageVersion{
		PageID:      page.ID,
		Version:     page.Version,
		PuckState:   page.PuckState,
		WorkflowDef: page.WorkflowDef,
		ChangeLog:   "Updated",
		CreatedBy:   userID,
	}
	database.DB.Create(&version)

	c.JSON(http.StatusOK, gin.H{"data": page})
}

// DeletePage 删除页面
func DeletePage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := database.DB.Delete(&LowCodePage{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// PublishPage 发布页面
func PublishPage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := database.DB.Model(&LowCodePage{}).Where("id = ?", id).Update("publish_status", 1).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "published"})
}

// ListPageVersions 列出页面版本历史
func ListPageVersions(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var versions []LowCodePageVersion
	if err := database.DB.Where("page_id = ?", id).Order("version DESC").Find(&versions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": versions})
}

// RollbackVersion 回滚到指定版本
func RollbackVersion(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	version, _ := strconv.ParseInt(c.Param("version"), 10, 64)

	var historyVersion LowCodePageVersion
	if err := database.DB.Where("page_id = ? AND version = ?", id, version).First(&historyVersion).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "version not found"})
		return
	}

	var page LowCodePage
	if err := database.DB.First(&page, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	// 恢复到历史版本
	page.PuckState = historyVersion.PuckState
	page.WorkflowDef = historyVersion.WorkflowDef
	page.Version++

	if err := database.DB.Save(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 创建新版本记录
	userID := uint(0)
	if uid, exists := c.Get("userID"); exists {
		userID = uid.(uint)
	}
	newVersion := LowCodePageVersion{
		PageID:      page.ID,
		Version:     page.Version,
		PuckState:   page.PuckState,
		WorkflowDef: page.WorkflowDef,
		ChangeLog:   fmt.Sprintf("Rollback to version %d", version),
		CreatedBy:   userID,
	}
	database.DB.Create(&newVersion)

	c.JSON(http.StatusOK, gin.H{"data": page})
}

// ListWorkflows 列出工作流
func ListWorkflows(c *gin.Context) {
	var workflows []LowCodeWorkflow
	if err := database.DB.Order("id DESC").Find(&workflows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": workflows})
}

// GetWorkflow 获取工作流详情
func GetWorkflow(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var workflow LowCodeWorkflow
	if err := database.DB.First(&workflow, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": workflow})
}

// CreateWorkflow 创建工作流
func CreateWorkflow(c *gin.Context) {
	var workflow LowCodeWorkflow
	if err := c.ShouldBindJSON(&workflow); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(workflow.Code) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}

	var exist LowCodeWorkflow
	if err := database.DB.Where("code = ?", workflow.Code).First(&exist).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code already exists"})
		return
	}

	if err := database.DB.Create(&workflow).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": workflow})
}

// UpdateWorkflow 更新工作流
func UpdateWorkflow(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var body LowCodeWorkflow
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var workflow LowCodeWorkflow
	if err := database.DB.First(&workflow, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}

	workflow.Name = body.Name
	workflow.Description = body.Description
	workflow.WorkflowDef = body.WorkflowDef
	workflow.TriggerType = body.TriggerType
	workflow.TriggerConfig = body.TriggerConfig
	workflow.Enabled = body.Enabled

	if err := database.DB.Save(&workflow).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": workflow})
}

// DeleteWorkflow 删除工作流
func DeleteWorkflow(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := database.DB.Delete(&LowCodeWorkflow{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
