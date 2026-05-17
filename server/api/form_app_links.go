package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func GetFormAppPageLinks(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	var links []models.FormAppPageLink
	if err := database.DB.Where("form_app_id = ?", formAppID).Find(&links).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": links})
}

func CreateFormAppPageLink(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	var link models.FormAppPageLink
	if err := c.ShouldBindJSON(&link); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	link.FormAppID = uint(formAppID)

	if err := database.DB.Create(&link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": link})
}

func UpdateFormAppPageLink(c *gin.Context) {
	linkID, err := strconv.ParseUint(c.Param("link_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link_id"})
		return
	}

	var link models.FormAppPageLink
	if err := database.DB.First(&link, linkID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}

	var updates models.FormAppPageLink
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&link).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": link})
}

func DeleteFormAppPageLink(c *gin.Context) {
	linkID, err := strconv.ParseUint(c.Param("link_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link_id"})
		return
	}

	if err := database.DB.Delete(&models.FormAppPageLink{}, linkID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
