package workflow

import (
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"log"
	"time"
)

// TriggerFromCustomEvent 从自定义事件触发工作流（兼容原有事件系统）
func TriggerFromCustomEvent(workflowID uint, eventKey string, eventData map[string]interface{}, deviceID *uint) {
	// 加载 Workflow
	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, workflowID).Error; err != nil {
		log.Printf("[Workflow] Failed to load workflow %d: %v", workflowID, err)
		return
	}

	if !workflow.Enabled {
		log.Printf("[Workflow] Workflow %d is disabled", workflowID)
		return
	}

	// 检查触发条件
	if !checkTriggerConditions(workflow.TriggerConfig, eventData) {
		log.Printf("[Workflow] Workflow %d trigger conditions not met", workflowID)
		return
	}

	// 创建执行记录
	inputData := map[string]interface{}{
		"event_key":  eventKey,
		"event_data": eventData,
		"device_id":  deviceID,
		"timestamp":  time.Now().Unix(),
	}

	execution := models.WorkflowExecution{
		WorkflowID:  workflowID,
		TriggerType: "custom_event",
		DeviceID:    deviceID,
		Status:      "pending",
		InputJSON:   marshalJSON(inputData),
	}

	if err := database.DB.Create(&execution).Error; err != nil {
		log.Printf("[Workflow] Failed to create execution: %v", err)
		return
	}

	log.Printf("[Workflow] Created execution %d for workflow %d (custom_event: %s)", execution.ID, workflowID, eventKey)

	// 异步执行工作流
	go executeWorkflowAsync(execution.ID, workflow, inputData)
}

// TriggerFromFormEvent 从表单事件触发工作流
func TriggerFromFormEvent(workflowID uint, formAppID uint, eventData map[string]interface{}, userID *uint) {
	// 加载 Workflow
	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, workflowID).Error; err != nil {
		log.Printf("[Workflow] Failed to load workflow %d: %v", workflowID, err)
		return
	}

	if !workflow.Enabled {
		log.Printf("[Workflow] Workflow %d is disabled", workflowID)
		return
	}

	// 检查触发条件
	if !checkTriggerConditions(workflow.TriggerConfig, eventData) {
		log.Printf("[Workflow] Workflow %d trigger conditions not met", workflowID)
		return
	}

	// 创建执行记录
	inputData := map[string]interface{}{
		"form_app_id": formAppID,
		"event_data":  eventData,
		"user_id":     userID,
		"timestamp":   time.Now().Unix(),
	}

	execution := models.WorkflowExecution{
		WorkflowID:  workflowID,
		TriggerType: "form_event",
		TriggerBy:   userID,
		Status:      "pending",
		InputJSON:   marshalJSON(inputData),
	}

	if err := database.DB.Create(&execution).Error; err != nil {
		log.Printf("[Workflow] Failed to create execution: %v", err)
		return
	}

	log.Printf("[Workflow] Created execution %d for workflow %d (form_event)", execution.ID, workflowID)

	// 异步执行工作流
	go executeWorkflowAsync(execution.ID, workflow, inputData)
}

// checkTriggerConditions 检查触发条件
func checkTriggerConditions(triggerConfigJSON string, eventData map[string]interface{}) bool {
	if triggerConfigJSON == "" {
		return true // 无条件，默认触发
	}

	var config struct {
		Conditions []struct {
			Field    string      `json:"field"`
			Operator string      `json:"operator"` // eq | ne | gt | lt | contains | regex
			Value    interface{} `json:"value"`
		} `json:"conditions"`
	}

	if err := json.Unmarshal([]byte(triggerConfigJSON), &config); err != nil {
		log.Printf("[Workflow] Failed to parse trigger config: %v", err)
		return true // 解析失败，默认触发
	}

	if len(config.Conditions) == 0 {
		return true
	}

	// 检查所有条件（AND 逻辑）
	for _, cond := range config.Conditions {
		fieldValue, exists := eventData[cond.Field]
		if !exists {
			return false // 字段不存在，条件不满足
		}

		if !evaluateCondition(fieldValue, cond.Operator, cond.Value) {
			return false
		}
	}

	return true
}

// evaluateCondition 评估单个条件
func evaluateCondition(fieldValue interface{}, operator string, expectedValue interface{}) bool {
	switch operator {
	case "eq":
		return fieldValue == expectedValue
	case "ne":
		return fieldValue != expectedValue
	case "gt":
		if fv, ok := fieldValue.(float64); ok {
			if ev, ok := expectedValue.(float64); ok {
				return fv > ev
			}
		}
		return false
	case "lt":
		if fv, ok := fieldValue.(float64); ok {
			if ev, ok := expectedValue.(float64); ok {
				return fv < ev
			}
		}
		return false
	case "contains":
		if fv, ok := fieldValue.(string); ok {
			if ev, ok := expectedValue.(string); ok {
				return contains(fv, ev)
			}
		}
		return false
	default:
		return false
	}
}

// executeWorkflowAsync 异步执行工作流（TODO: 集成 workflow-engine）
func executeWorkflowAsync(executionID uint, workflow models.WorkflowDefinition, inputData map[string]interface{}) {
	startTime := time.Now()

	// 更新状态为 running
	database.DB.Model(&models.WorkflowExecution{}).Where("id = ?", executionID).Updates(map[string]interface{}{
		"status":     "running",
		"started_at": startTime,
	})

	// TODO: 调用 workflow-engine 后端执行
	// 这里是占位实现，实际应该调用 workflow-engine 的 Go 包或 HTTP API
	//
	// 示例：
	// import "workflow-engine/engine"
	// result, err := engine.Execute(workflow.SchemaJSON, inputData)

	log.Printf("[Workflow] Executing workflow %d (execution %d)...", workflow.ID, executionID)

	// 模拟执行（实际应该调用 workflow-engine）
	time.Sleep(2 * time.Second)

	// 更新执行结果
	completedTime := time.Now()
	updates := map[string]interface{}{
		"status":       "completed",
		"completed_at": completedTime,
		"output_json":  marshalJSON(map[string]interface{}{"success": true, "message": "Placeholder execution"}),
	}

	database.DB.Model(&models.WorkflowExecution{}).Where("id = ?", executionID).Updates(updates)

	log.Printf("[Workflow] Execution %d completed in %.2fs", executionID, completedTime.Sub(startTime).Seconds())
}

// 辅助函数
func marshalJSON(v interface{}) string {
	if v == nil {
		return "{}"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && s[:len(substr)] == substr
}
