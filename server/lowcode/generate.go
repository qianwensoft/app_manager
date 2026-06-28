package lowcode

import (
	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/mcp"
	"app-manager/models"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GenerateFromTable 从数据源表自动生成页面（复用 form-app 逻辑）
func GenerateFromTable(c *gin.Context) {
	var req struct {
		DataSourceID uint   `json:"data_source_id"`
		Table        string `json:"table"`
		PrimaryKey   string `json:"primary_key"`
		Mode         string `json:"mode"` // select_schema | create_schema
		Options      struct {
			GenerateList   bool `json:"generate_list"`
			GenerateDetail bool `json:"generate_detail"`
			GenerateForm   bool `json:"generate_form"`
			AutoWorkflow   bool `json:"auto_workflow"`
		} `json:"options"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.DataSourceID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data_source_id required"})
		return
	}

	table := strings.TrimSpace(req.Table)
	if table == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "table required"})
		return
	}

	pk := strings.TrimSpace(req.PrimaryKey)
	if pk == "" {
		pk = "id"
	}

	// 加载数据源
	var dataSource models.DataSource
	if err := database.DB.First(&dataSource, req.DataSourceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "data source not found"})
		return
	}

	// 打开数据库连接
	sqlDB, err := dbdriver.OpenDataSource(&dataSource)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer sqlDB.Close()

	// 读取表结构
	cols, err := dbdriver.ListColumns(sqlDB, dataSource.Type, table)
	if err != nil || len(cols) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read table columns"})
		return
	}

	// 生成 Puck State 和 Formily Schema
	puckState := generatePuckStateFromColumns(cols, req.Options)
	workflowDef := ""
	if req.Options.AutoWorkflow {
		workflowDef = generateWorkflowFromTable(table, pk, cols)
	}

	// 创建页面
	userID := uint(0)
	if uid, exists := c.Get("userID"); exists {
		userID = uid.(uint)
	}

	page := LowCodePage{
		Code:          fmt.Sprintf("auto_%s_%d", table, time.Now().Unix()),
		Name:          fmt.Sprintf("Auto-generated: %s", table),
		Category:      "form",
		PuckState:     puckState,
		WorkflowDef:   workflowDef,
		DataSourceID:  &req.DataSourceID,
		PublishStatus: 0,
		Version:       1,
		CreatedBy:     userID,
	}

	if err := database.DB.Create(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": page})
}

// AIGenerate 使用 AI 生成页面
func AIGenerate(c *gin.Context) {
	var req struct {
		Prompt       string `json:"prompt"`
		DataSourceID uint   `json:"data_source_id"`
		Mode         string `json:"mode"`       // quick | full
		Screenshot   string `json:"screenshot"` // base64 image
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(req.Prompt) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "prompt required"})
		return
	}

	// 构建系统提示词
	systemPrompt := buildAISystemPrompt(req.DataSourceID)

	// 调用 Claude API
	var responseText string
	var err error
	if req.Screenshot != "" {
		responseText, _, err = mcp.CallClaudeVision(systemPrompt, req.Screenshot, "image/png", req.Prompt)
	} else {
		responseText, _, err = mcp.CallClaude(systemPrompt, req.Prompt)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("AI generation failed: %v", err)})
		return
	}

	// 解析 Claude 返回的 JSON
	jsonStr := mcp.ExtractJSON(responseText)
	var aiResponse struct {
		PuckState      map[string]interface{}   `json:"puck_state"`
		FormilySchemas map[string]interface{}   `json:"formily_schemas"`
		WorkflowDef    map[string]interface{}   `json:"workflow_def"`
		DataInterfaces []map[string]interface{} `json:"data_interfaces"`
		EventRoutes    []map[string]interface{} `json:"event_routes"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &aiResponse); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to parse AI response: %v", err)})
		return
	}

	// 转换为字符串
	puckStateJSON, _ := json.Marshal(aiResponse.PuckState)
	workflowDefJSON, _ := json.Marshal(aiResponse.WorkflowDef)

	// 创建页面
	userID := uint(0)
	if uid, exists := c.Get("userID"); exists {
		userID = uid.(uint)
	}

	page := LowCodePage{
		Code:          fmt.Sprintf("ai_%d", time.Now().Unix()),
		Name:          fmt.Sprintf("AI Generated: %s", truncateString(req.Prompt, 50)),
		Category:      "form",
		PuckState:     string(puckStateJSON),
		WorkflowDef:   string(workflowDefJSON),
		DataSourceID:  &req.DataSourceID,
		PublishStatus: 0,
		Version:       1,
		CreatedBy:     userID,
	}

	if err := database.DB.Create(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":        page,
		"ai_response": aiResponse,
	})
}

// 辅助函数

func buildAISystemPrompt(dataSourceID uint) string {
	prompt := `你是一个低代码平台设计专家。根据用户需求生成完整的页面配置。

请生成以下 JSON 配置：
1. puck_state: Puck 编辑器状态（页面布局、组件配置）
2. formily_schemas: 表单字段定义（包含验证规则、联动逻辑）
3. workflow_def: 事件工作流（生命周期、用户交互、数据事件）
4. data_interfaces: 数据接口定义（查询、提交、更新）
5. event_routes: 事件路由配置（扫码跳转、按钮点击）

输出纯 JSON，不要包含 markdown 代码块。`

	if dataSourceID > 0 {
		var dataSource models.DataSource
		if err := database.DB.First(&dataSource, dataSourceID).Error; err == nil {
			prompt += fmt.Sprintf("\n\n数据源类型：%s\n数据源名称：%s", dataSource.Type, dataSource.Name)

			// TODO: 列出现有表（可选）
		}
	}

	return prompt
}

func generatePuckStateFromColumns(cols []dbdriver.ColumnInfo, options struct {
	GenerateList   bool `json:"generate_list"`
	GenerateDetail bool `json:"generate_detail"`
	GenerateForm   bool `json:"generate_form"`
	AutoWorkflow   bool `json:"auto_workflow"`
}) string {
	// 简化实现：生成基本的表单布局
	components := []map[string]interface{}{}

	for _, col := range cols {
		if col.PrimaryKey {
			continue
		}

		component := map[string]interface{}{
			"type": "FormilyField",
			"props": map[string]interface{}{
				"fieldKey": col.Name,
				"fieldSchema": map[string]interface{}{
					"type":        mapDBTypeToFormilyType(col.DataType),
					"title":       col.Name,
					"x-component": "Input",
					"x-decorator": "FormItem",
				},
			},
		}
		components = append(components, component)
	}

	state := map[string]interface{}{
		"content": components,
		"root": map[string]interface{}{
			"title": "Auto-generated Form",
		},
	}

	stateJSON, _ := json.Marshal(state)
	return string(stateJSON)
}

func generateWorkflowFromTable(table, pk string, cols []dbdriver.ColumnInfo) string {
	// 简化实现：生成基本的 CRUD 工作流
	workflow := map[string]interface{}{
		"id":   fmt.Sprintf("workflow_%s", table),
		"name": fmt.Sprintf("CRUD Workflow for %s", table),
		"nodes": []map[string]interface{}{
			{
				"id":   "start",
				"type": "start",
				"data": map[string]interface{}{"label": "Start"},
			},
			{
				"id":   "submit",
				"type": "form_submit",
				"data": map[string]interface{}{
					"label": "Submit Form",
					"config": map[string]interface{}{
						"table": table,
						"pk":    pk,
					},
				},
			},
			{
				"id":   "end",
				"type": "end",
				"data": map[string]interface{}{"label": "End"},
			},
		},
		"edges": []map[string]interface{}{
			{"id": "e1", "source": "start", "target": "submit"},
			{"id": "e2", "source": "submit", "target": "end"},
		},
	}

	workflowJSON, _ := json.Marshal(workflow)
	return string(workflowJSON)
}

func mapDBTypeToFormilyType(dbType string) string {
	dbType = strings.ToLower(dbType)
	if strings.Contains(dbType, "int") {
		return "number"
	}
	if strings.Contains(dbType, "date") || strings.Contains(dbType, "time") {
		return "string"
	}
	if strings.Contains(dbType, "text") {
		return "string"
	}
	return "string"
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
