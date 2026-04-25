package api

import (
	"net/http"
	"strings"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

type webhookEventTypeIn struct {
	EventType  string `json:"event_type"`
	Label      string `json:"label"`
	Remark     string `json:"remark"`
	SchemaJSON string `json:"schema_json"`
}

// ListOutboundWebhookEventTypes GET /api/outbound/webhooks/:id/event-types
func ListOutboundWebhookEventTypes(c *gin.Context) {
	webhookID := c.Param("id")
	var rows []models.OutboundWebhookEventType
	if err := database.DB.Where("webhook_id = ?", webhookID).Order("id ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// CreateOutboundWebhookEventType POST /api/outbound/webhooks/:id/event-types
func CreateOutboundWebhookEventType(c *gin.Context) {
	webhookID := c.Param("id")
	// verify webhook exists
	var wh models.OutboundWebhook
	if err := database.DB.First(&wh, webhookID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "webhook not found"})
		return
	}
	var req webhookEventTypeIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	et := strings.TrimSpace(req.EventType)
	if et == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_type 不能为空"})
		return
	}
	// check unique constraint per webhook
	var cnt int64
	database.DB.Model(&models.OutboundWebhookEventType{}).
		Where("webhook_id = ? AND event_type = ?", wh.ID, et).Count(&cnt)
	if cnt > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该 Webhook 下已存在相同的 event_type"})
		return
	}
	row := models.OutboundWebhookEventType{
		WebhookID:  wh.ID,
		EventType:  et,
		Label:      strings.TrimSpace(req.Label),
		Remark:     req.Remark,
		SchemaJSON: req.SchemaJSON,
	}
	if err := database.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

// UpdateOutboundWebhookEventType PUT /api/outbound/webhooks/:id/event-types/:etid
func UpdateOutboundWebhookEventType(c *gin.Context) {
	webhookID := c.Param("id")
	etid := c.Param("etid")
	var row models.OutboundWebhookEventType
	if err := database.DB.Where("id = ? AND webhook_id = ?", etid, webhookID).First(&row).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req webhookEventTypeIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// event_type may be updated if supplied and different
	if et := strings.TrimSpace(req.EventType); et != "" && et != row.EventType {
		var cnt int64
		database.DB.Model(&models.OutboundWebhookEventType{}).
			Where("webhook_id = ? AND event_type = ? AND id != ?", row.WebhookID, et, row.ID).Count(&cnt)
		if cnt > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该 Webhook 下已存在相同的 event_type"})
			return
		}
		row.EventType = et
	}
	row.Label = strings.TrimSpace(req.Label)
	row.Remark = req.Remark
	row.SchemaJSON = req.SchemaJSON
	if err := database.DB.Save(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

// DeleteOutboundWebhookEventType DELETE /api/outbound/webhooks/:id/event-types/:etid
func DeleteOutboundWebhookEventType(c *gin.Context) {
	webhookID := c.Param("id")
	etid := c.Param("etid")
	if err := database.DB.Where("id = ? AND webhook_id = ?", etid, webhookID).
		Delete(&models.OutboundWebhookEventType{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
