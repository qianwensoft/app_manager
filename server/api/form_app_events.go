package api

import (
	"app-manager/models"
	"app-manager/stomp"
	"encoding/json"
	"time"
)

// publishFormAppEvent 发布表单应用事件到 STOMP topic
func publishFormAppEvent(event string, app models.FormAppInfo) {
	payload := map[string]interface{}{
		"event":           event,
		"id":              app.ID,
		"code":            app.Code,
		"name":            app.Name,
		"description":     app.Description,
		"mode":            app.Mode,
		"publish_status":  app.PublishStatus,
		"content_version": app.ContentVersion,
		"updated_at":      app.UpdatedAt.Format(time.RFC3339),
	}
	if body, err := json.Marshal(payload); err == nil {
		stomp.DefaultHub.PublishJSON("/topic/form-app-events", string(body))
	}
}
