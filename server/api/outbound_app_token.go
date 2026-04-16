package api

import (
	"net/http"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

func GetOutboundAppTokenStatus(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	st, err := outbound.TokenStatusForAPI(&a)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": st})
}

func PostOutboundAppTokenFetch(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := outbound.FetchAppToken(database.DB, &a); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.First(&a, a.ID).Error
	st, _ := outbound.TokenStatusForAPI(&a)
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": outboundAppToJSON(a), "token_status": st})
}

func PostOutboundAppTokenRefresh(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := outbound.RefreshAppToken(database.DB, &a); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.First(&a, a.ID).Error
	st, _ := outbound.TokenStatusForAPI(&a)
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": outboundAppToJSON(a), "token_status": st})
}
