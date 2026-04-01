package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

func ListCustomEventGroups(c *gin.Context) {
	var list []models.CustomEventGroup
	database.DB.Order("sort_order ASC, id ASC").Find(&list)
	c.JSON(http.StatusOK, gin.H{"data": list})
}

func CreateCustomEventGroup(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	g := models.CustomEventGroup{
		Name:        req.Name,
		Description: req.Description,
		SortOrder:   req.SortOrder,
	}
	if err := database.DB.Create(&g).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": g})
}

func UpdateCustomEventGroup(c *gin.Context) {
	id := c.Param("id")
	var g models.CustomEventGroup
	if err := database.DB.First(&g, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		SortOrder   *int   `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != "" {
		g.Name = req.Name
	}
	g.Description = req.Description
	if req.SortOrder != nil {
		g.SortOrder = *req.SortOrder
	}
	if err := database.DB.Save(&g).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": g})
}

func DeleteCustomEventGroup(c *gin.Context) {
	id := c.Param("id")
	res := database.DB.Delete(&models.CustomEventDefinition{}, "group_id = ?", id)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": res.Error.Error()})
		return
	}
	if err := database.DB.Delete(&models.CustomEventGroup{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}
