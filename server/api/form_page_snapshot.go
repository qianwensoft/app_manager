package api

import (
	"net/http"
	"strconv"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListPageSnapshots 列出某页面的字段快照（按时间倒序）。
func ListPageSnapshots(c *gin.Context) {
	pageID, err := strconv.ParseUint(c.Param("page_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page_id"})
		return
	}
	var snaps []models.FormPageSnapshot
	if err := database.DB.Where("page_id = ?", pageID).Order("id DESC").Find(&snaps).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": snaps})
}

// AISavePage AI 编辑保存：先把当前页状态记为快照，再写入新字段。
func AISavePage(c *gin.Context) {
	pageID, err := strconv.ParseUint(c.Param("page_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page_id"})
		return
	}
	var req struct {
		ConfigJSON   string `json:"config_json"`
		DesignSchema string `json:"design_schema"`
		Source       string `json:"source"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var page models.FormAppPage
	if err := database.DB.First(&page, pageID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	err = database.DB.Transaction(func(tx *gorm.DB) error {
		// 保存前状态非空时记录快照（首次为全新页则跳过空快照）
		if page.ConfigJSON != "" {
			snap := models.FormPageSnapshot{
				PageID:       page.ID,
				FormAppID:    page.FormAppID,
				ConfigJSON:   page.ConfigJSON,
				DesignSchema: page.DesignSchema,
				Source:       req.Source,
				Kind:         "ai_save",
			}
			if e := tx.Create(&snap).Error; e != nil {
				return e
			}
		}
		updateMap := map[string]any{}
		if req.ConfigJSON != "" {
			updateMap["config_json"] = req.ConfigJSON
		}
		if req.DesignSchema != "" {
			updateMap["design_schema"] = req.DesignSchema
		}
		if len(updateMap) == 0 {
			return nil
		}
		return tx.Model(&page).Updates(updateMap).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.First(&page, pageID)
	logAudit(c, "表单页面", "AI 保存页面字段 "+page.Title, nil)
	c.JSON(http.StatusOK, gin.H{"data": page})
}

// RollbackPageSnapshot 回滚到指定快照：先记当前状态，再写回目标快照内容。
func RollbackPageSnapshot(c *gin.Context) {
	pageID, err := strconv.ParseUint(c.Param("page_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page_id"})
		return
	}
	snapID, err := strconv.ParseUint(c.Param("snapshot_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid snapshot_id"})
		return
	}

	var page models.FormAppPage
	if err := database.DB.First(&page, pageID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	var target models.FormPageSnapshot
	if err := database.DB.First(&target, snapID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "快照不存在"})
		return
	}
	if target.PageID != page.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "快照不属于该页面"})
		return
	}

	err = database.DB.Transaction(func(tx *gorm.DB) error {
		// 记录回滚前的当前状态
		if page.ConfigJSON != "" {
			snap := models.FormPageSnapshot{
				PageID:       page.ID,
				FormAppID:    page.FormAppID,
				ConfigJSON:   page.ConfigJSON,
				DesignSchema: page.DesignSchema,
				Source:       "回滚前自动保存",
				Kind:         "rollback",
			}
			if e := tx.Create(&snap).Error; e != nil {
				return e
			}
		}
		return tx.Model(&page).Updates(map[string]any{
			"config_json":   target.ConfigJSON,
			"design_schema": target.DesignSchema,
		}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.First(&page, pageID)
	logAudit(c, "表单页面", "回滚页面字段 "+page.Title, nil)
	c.JSON(http.StatusOK, gin.H{"data": page})
}
