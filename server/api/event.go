package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

func ListDeviceEvents(c *gin.Context) {
	var events []models.DeviceEvent
	query := database.DB.Order("created_at DESC")

	if deviceID := c.Query("device_id"); deviceID != "" {
		query = query.Where("device_id = ?", deviceID)
	}
	if eventType := c.Query("event_type"); eventType != "" {
		query = query.Where("event_type = ?", eventType)
	}

	query.Limit(100).Find(&events)
	c.JSON(http.StatusOK, gin.H{"data": events})
}

func GetEventTypes(c *gin.Context) {
	var types []string
	database.DB.Model(&models.DeviceEvent{}).Distinct("event_type").Pluck("event_type", &types)
	c.JSON(http.StatusOK, gin.H{"data": types})
}
