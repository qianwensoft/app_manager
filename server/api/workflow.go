package api

import (
	"app-manager/database"
	"app-manager/models"
	workflow2 "app-manager/workflow"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ListWorkflows 列出工作流
func ListWorkflows(c *gin.Context) {
	category := c.Query("category")
	triggerType := c.Query("trigger_type")
	enabled := c.Query("enabled")

	var workflows []models.WorkflowDefinition
	query := database.DB

	if category != "" {
		query = query.Where("category = ?", category)
	}
	if triggerType != "" {
		query = query.Where("trigger_type = ?", triggerType)
	}
	if enabled != "" {
		query = query.Where("enabled = ?", enabled == "true")
	}

	// 权限过滤：管理员可以看所有，普通用户只能看自己的或公开的
	userID := c.GetUint("user_id")
	role, _ := c.Get("role")
	if role != "admin" {
		query = query.Where("created_by = ? OR visibility = 'public'", userID)
	}

	if err := query.Order("created_at DESC").Find(&workflows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, workflows)
}

// GetWorkflow 获取单个工作流
func GetWorkflow(c *gin.Context) {
	id := c.Param("id")

	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}

	// 权限检查
	userID := c.GetUint("user_id")
	role, _ := c.Get("role")
	if role != "admin" && workflow.CreatedBy != userID && workflow.Visibility != "public" {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	c.JSON(http.StatusOK, workflow)
}

// CreateWorkflow 创建工作流
func CreateWorkflow(c *gin.Context) {
	var req models.WorkflowDefinition
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetUint("user_id")
	req.CreatedBy = userID

	// 验证 SchemaJSON 是否是有效的 JSON
	if !isValidJSON(req.SchemaJSON) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid schema_json"})
		return
	}

	if err := database.DB.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, req)
}

// UpdateWorkflow 更新工作流
func UpdateWorkflow(c *gin.Context) {
	id := c.Param("id")

	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}

	// 权限检查：只能修改自己的
	userID := c.GetUint("user_id")
	role, _ := c.Get("role")
	if role != "admin" && workflow.CreatedBy != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	var req models.WorkflowDefinition
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 验证 SchemaJSON
	if req.SchemaJSON != "" && !isValidJSON(req.SchemaJSON) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid schema_json"})
		return
	}

	// 更新字段
	updates := map[string]interface{}{
		"name":           req.Name,
		"description":    req.Description,
		"category":       req.Category,
		"schema_json":    req.SchemaJSON,
		"trigger_type":   req.TriggerType,
		"trigger_config": req.TriggerConfig,
		"enabled":        req.Enabled,
		"timeout":        req.Timeout,
		"max_concurrent": req.MaxConcurrent,
		"visibility":     req.Visibility,
	}

	if err := database.DB.Model(&workflow).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, workflow)
}

// DeleteWorkflow 删除工作流
func DeleteWorkflow(c *gin.Context) {
	id := c.Param("id")

	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}

	// 权限检查
	userID := c.GetUint("user_id")
	role, _ := c.Get("role")
	if role != "admin" && workflow.CreatedBy != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	if err := database.DB.Delete(&workflow).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// ExecuteWorkflow 手动触发工作流
func ExecuteWorkflow(c *gin.Context) {
	id := c.Param("id")

	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}

	if !workflow.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow is disabled"})
		return
	}

	// 解析输入
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		input = make(map[string]interface{})
	}

	userID := c.GetUint("user_id")

	// 创建执行记录
	execution := models.WorkflowExecution{
		WorkflowID:  workflow.ID,
		TriggerType: "manual",
		TriggerBy:   &userID,
		Status:      "pending",
		InputJSON:   marshalJSON(input),
	}
	if err := database.DB.Create(&execution).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 异步执行工作流
	if err := workflow2.LowCodeEngineInstance.ExecuteWorkflow(execution.ID, &workflow, input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"execution_id": execution.ID,
		"status":       "running",
		"message":      "Workflow execution started",
	})
}

// ListExecutions 列出工作流执行记录
func ListExecutions(c *gin.Context) {
	workflowID := c.Param("id")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var executions []models.WorkflowExecution
	var total int64

	query := database.DB.Where("workflow_id = ?", workflowID)

	// 过滤状态
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	query.Model(&models.WorkflowExecution{}).Count(&total)

	if err := query.
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&executions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     executions,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetExecution 获取执行详情
func GetExecution(c *gin.Context) {
	execID := c.Param("exec_id")

	var execution models.WorkflowExecution
	if err := database.DB.Preload("Workflow").First(&execution, execID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
		return
	}

	c.JSON(http.StatusOK, execution)
}

// CancelExecution 取消执行
func CancelExecution(c *gin.Context) {
	execID := c.Param("exec_id")

	var execution models.WorkflowExecution
	if err := database.DB.First(&execution, execID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
		return
	}

	if execution.Status != "running" && execution.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "execution is not running"})
		return
	}

	// 取消执行
	if err := workflow2.LowCodeEngineInstance.CancelExecution(execution.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "execution cancelled"})
}

// GetExecutionLiveStatus 获取执行实时状态
func GetExecutionLiveStatus(c *gin.Context) {
	execID := c.Param("exec_id")

	id, err := strconv.ParseUint(execID, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	execCtx, err := workflow2.LowCodeEngineInstance.GetExecutionStatus(uint(id))
	if err != nil {
		// 如果不在运行中，从数据库获取
		var execution models.WorkflowExecution
		if err := database.DB.First(&execution, execID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
			return
		}
		c.JSON(http.StatusOK, execution)
		return
	}

	// 返回实时状态
	execCtx.Mu.RLock()
	defer execCtx.Mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"execution_id":  execCtx.ExecutionID,
		"workflow_id":   execCtx.WorkflowID,
		"status":        execCtx.Status,
		"started_at":    execCtx.StartedAt,
		"current_node":  execCtx.CurrentNodeID,
		"node_statuses": execCtx.NodeStatuses,
		"logs":          execCtx.Logs,
		"variables":     execCtx.Variables,
	})
}

// TestWorkflow 测试工作流（不保存执行记录）
func TestWorkflow(c *gin.Context) {
	id := c.Param("id")

	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}

	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		input = make(map[string]interface{})
	}

	// TODO: 调用 workflow-engine 进行测试执行
	result := map[string]interface{}{
		"success": true,
		"message": "Test execution completed",
		"output":  map[string]interface{}{},
	}

	c.JSON(http.StatusOK, result)
}

// BindWorkflowToCustomEvent 绑定工作流到自定义事件
func BindWorkflowToCustomEvent(c *gin.Context) {
	eventID := c.Param("id")

	var req struct {
		WorkflowID uint `json:"workflow_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 验证 workflow 存在
	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, req.WorkflowID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow not found"})
		return
	}

	// 验证 event 存在
	var event models.CustomEventDefinition
	if err := database.DB.First(&event, eventID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	// 更新绑定
	if err := database.DB.Exec(`
		UPDATE custom_event_definitions
		SET workflow_id = ?, workflow_enabled = true
		WHERE id = ?
	`, req.WorkflowID, eventID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Workflow bound successfully"})
}

// UnbindWorkflowFromCustomEvent 解绑工作流
func UnbindWorkflowFromCustomEvent(c *gin.Context) {
	eventID := c.Param("id")

	if err := database.DB.Exec(`
		UPDATE custom_event_definitions
		SET workflow_id = NULL, workflow_enabled = false
		WHERE id = ?
	`, eventID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Workflow unbound successfully"})
}

// BindWorkflowToFormEvent 绑定工作流到表单事件
func BindWorkflowToFormEvent(c *gin.Context) {
	routeID := c.Param("route_id")

	var req struct {
		WorkflowID uint   `json:"workflow_id" binding:"required"`
		ActionType string `json:"action_type"` // navigate | workflow | both
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.ActionType == "" {
		req.ActionType = "workflow"
	}

	// 验证 workflow 存在
	var workflow models.WorkflowDefinition
	if err := database.DB.First(&workflow, req.WorkflowID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow not found"})
		return
	}

	// 更新路由
	if err := database.DB.Exec(`
		UPDATE form_app_event_routes
		SET workflow_id = ?, action_type = ?
		WHERE id = ?
	`, req.WorkflowID, req.ActionType, routeID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Workflow bound successfully"})
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

func isValidJSON(s string) bool {
	var js json.RawMessage
	return json.Unmarshal([]byte(s), &js) == nil
}
