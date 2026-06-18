package api

import (
	"net/http"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// ListAISkills 列出技能，可按 enabled/category 过滤。
func ListAISkills(c *gin.Context) {
	q := database.DB.Model(&models.AISkill{})
	if v := c.Query("enabled"); v != "" {
		q = q.Where("enabled = ?", v == "true" || v == "1")
	}
	if v := c.Query("category"); v != "" {
		q = q.Where("category = ?", v)
	}
	var skills []models.AISkill
	if err := q.Order("sort_order ASC, id DESC").Find(&skills).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": skills})
}

// GetAISkill 获取单个技能。
func GetAISkill(c *gin.Context) {
	var skill models.AISkill
	if err := database.DB.First(&skill, c.Param("skill_id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "技能不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": skill})
}

// CreateAISkill 新建技能。
func CreateAISkill(c *gin.Context) {
	var skill models.AISkill
	if err := c.ShouldBindJSON(&skill); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	skill.ID = 0
	if err := database.DB.Create(&skill).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	logAudit(c, "AI 技能", "创建技能 "+skill.Name, nil)
	c.JSON(http.StatusOK, gin.H{"data": skill})
}

// UpdateAISkill 更新技能。
func UpdateAISkill(c *gin.Context) {
	var skill models.AISkill
	if err := database.DB.First(&skill, c.Param("skill_id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "技能不存在"})
		return
	}
	var req models.AISkill
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 只更新可编辑字段，保留 ID/创建时间
	skill.Name = req.Name
	skill.Description = req.Description
	skill.Category = req.Category
	skill.SystemPrompt = req.SystemPrompt
	skill.FieldSnippetJSON = req.FieldSnippetJSON
	skill.Enabled = req.Enabled
	skill.SortOrder = req.SortOrder
	if err := database.DB.Save(&skill).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	logAudit(c, "AI 技能", "更新技能 "+skill.Name, nil)
	c.JSON(http.StatusOK, gin.H{"data": skill})
}

// DeleteAISkill 删除技能。
func DeleteAISkill(c *gin.Context) {
	var skill models.AISkill
	if err := database.DB.First(&skill, c.Param("skill_id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "技能不存在"})
		return
	}
	if err := database.DB.Delete(&skill).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	logAudit(c, "AI 技能", "删除技能 "+skill.Name, nil)
	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}
