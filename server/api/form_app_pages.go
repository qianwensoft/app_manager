package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func GetFormAppPages(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	var pages []models.FormAppPage
	if err := database.DB.Where("form_app_id = ?", formAppID).Order("sort_order ASC, id ASC").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": pages})
}

func CreateFormAppPage(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	var page models.FormAppPage
	if err := c.ShouldBindJSON(&page); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	page.FormAppID = uint(formAppID)

	if err := database.DB.Create(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": page})
}

func GetFormAppPage(c *gin.Context) {
	pageID, err := strconv.ParseUint(c.Param("page_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page_id"})
		return
	}

	var page models.FormAppPage
	if err := database.DB.First(&page, pageID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": page})
}

func UpdateFormAppPage(c *gin.Context) {
	pageID, err := strconv.ParseUint(c.Param("page_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page_id"})
		return
	}

	var page models.FormAppPage
	if err := database.DB.First(&page, pageID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	var updates models.FormAppPage
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&page).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": page})
}

func DeleteFormAppPage(c *gin.Context) {
	pageID, err := strconv.ParseUint(c.Param("page_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page_id"})
		return
	}

	if err := database.DB.Delete(&models.FormAppPage{}, pageID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func DuplicateFormAppPage(c *gin.Context) {
	pageID, err := strconv.ParseUint(c.Param("page_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page_id"})
		return
	}

	var original models.FormAppPage
	if err := database.DB.First(&original, pageID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	duplicate := models.FormAppPage{
		FormAppID:     original.FormAppID,
		PageKey:       original.PageKey + "_copy",
		PageType:      original.PageType,
		Title:         original.Title + " (Copy)",
		DesignSchema:  original.DesignSchema,
		DatasetID:     original.DatasetID,
		InterfaceCode: original.InterfaceCode,
		ConfigJSON:    original.ConfigJSON,
		SortOrder:     original.SortOrder + 1,
	}

	if err := database.DB.Create(&duplicate).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": duplicate})
}

func BatchDeleteFormAppPages(c *gin.Context) {
	var req struct {
		PageIDs []uint `json:"page_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Delete(&models.FormAppPage{}, req.PageIDs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted", "count": len(req.PageIDs)})
}

// ClearFormAppPages deletes all pages for a given form app (used by "重新生成")
func ClearFormAppPages(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	// delete all page links first
	database.DB.Where("from_page_key IN (SELECT page_key FROM form_app_pages WHERE form_app_id = ?)", formAppID).Delete(&models.FormAppPageLink{})
	database.DB.Where("form_app_id = ?", formAppID).Delete(&models.FormAppPage{})

	c.JSON(http.StatusOK, gin.H{"message": "cleared"})
}

func ReorderFormAppPages(c *gin.Context) {
	var req struct {
		Orders []struct {
			PageID    uint `json:"page_id"`
			SortOrder int  `json:"sort_order"`
		} `json:"orders" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx := database.DB.Begin()
	for _, order := range req.Orders {
		if err := tx.Model(&models.FormAppPage{}).Where("id = ?", order.PageID).Update("sort_order", order.SortOrder).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "reordered"})
}
