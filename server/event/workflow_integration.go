package event

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/workflow"
	"log"
)

// HandleCustomEventWithWorkflow 处理自定义事件（扩展原有逻辑，支持 Workflow）
// 在原有的 CustomEvent 处理流程中调用此函数
func HandleCustomEventWithWorkflow(eventKey string, eventData map[string]interface{}, deviceID *uint) {
	// 1. 查询事件定义（包含扩展字段）
	var extended struct {
		ID              uint
		Key             string
		WorkflowID      *uint `gorm:"column:workflow_id"`
		WorkflowEnabled bool  `gorm:"column:workflow_enabled"`
	}

	if err := database.DB.Table("custom_event_definitions").
		Select("id, key, workflow_id, workflow_enabled").
		Where("key = ?", eventKey).
		First(&extended).Error; err != nil {
		log.Printf("[Event] Custom event definition not found: %s", eventKey)
		return
	}

	// 2. 原有逻辑：MQTT、STOMP 发布（保持不变）
	// publishToMQTT(eventData)
	// publishToSTOMP(eventData)

	// 3. 新增逻辑：检查是否绑定 Workflow
	if extended.WorkflowID == nil || !extended.WorkflowEnabled {
		return
	}

	// 4. 触发 Workflow
	log.Printf("[Event] Triggering workflow %d for custom event: %s", *extended.WorkflowID, eventKey)
	workflow.TriggerFromCustomEvent(*extended.WorkflowID, eventKey, eventData, deviceID)
}

// HandleFormEventWithWorkflow 处理表单事件（扩展原有逻辑，支持 Workflow）
// 在 FormAppEventRoute 匹配后调用此函数
func HandleFormEventWithWorkflow(route models.FormAppEventRoute, eventData map[string]interface{}, userID *uint) {
	// 1. 原有逻辑：页面跳转
	// 从扩展字段读取
	var extended struct {
		ActionType string `gorm:"column:action_type"`
		WorkflowID *uint  `gorm:"column:workflow_id"`
	}
	if err := database.DB.Table("form_app_event_routes").
		Select("action_type, workflow_id").
		Where("id = ?", route.ID).
		First(&extended).Error; err != nil {
		log.Printf("[Event] Failed to load form event route: %v", err)
		return
	}

	// 如果是 navigate 或 both，执行页面跳转（原有逻辑）
	if extended.ActionType == "navigate" || extended.ActionType == "both" {
		// navigateToPage(route.TargetPageKey, eventData)
		log.Printf("[Event] Navigate to page: %s", route.TargetPageKey)
	}

	// 2. 新增逻辑：如果是 workflow 或 both，触发 Workflow
	if (extended.ActionType == "workflow" || extended.ActionType == "both") && extended.WorkflowID != nil {
		log.Printf("[Event] Triggering workflow %d for form event", *extended.WorkflowID)
		workflow.TriggerFromFormEvent(*extended.WorkflowID, route.FormAppID, eventData, userID)
	}
}

// IntegrateWithExistingEventSystem 集成到现有事件系统的入口函数
// 在 main.go 或事件初始化时调用
func IntegrateWithExistingEventSystem() {
	log.Println("[Event] Workflow integration enabled for custom events and form events")
	// 这里可以注册事件监听器、Hook 等
}
