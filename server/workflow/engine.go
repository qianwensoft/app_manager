package workflow

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/dop251/goja"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Engine 工单工作流引擎：监听工单事件，执行自动化动作。
type Engine struct {
	mu sync.RWMutex
}

var DefaultEngine = &Engine{}

// WorkflowAction 工作流动作配置。
type WorkflowAction struct {
	Type   string                 `json:"type"` // execute_js | update_work_order | create_work_order | query_work_orders
	Config map[string]interface{} `json:"config"`
}

// WorkflowContext 工作流执行上下文。
type WorkflowContext struct {
	WorkOrder *models.WorkOrder      `json:"work_order"`
	Event     string                 `json:"event"`
	Actor     string                 `json:"actor"`
	Variables map[string]interface{} `json:"variables"` // JS 执行时的共享变量
	Logs      []string               `json:"logs"`      // JS 执行日志
}

// Dispatch 分发工单事件到匹配的工作流。
func (e *Engine) Dispatch(event string, wo *models.WorkOrder, actor string) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var workflows []models.WorkOrderWorkflow
	q := database.DB.Where("enabled = ?", true)
	// 匹配类型：空（全局）或精确匹配。
	q = q.Where("type_code = ? OR type_code = '' OR type_code IS NULL", wo.TypeCode)
	q.Order("sort_order ASC, id ASC").Find(&workflows)

	for _, wf := range workflows {
		if !matchEvent(wf.Events, event) {
			continue
		}
		// 异步执行，避免阻塞主流程。
		go e.executeWorkflow(&wf, event, wo, actor)
	}
}

// matchEvent 检查事件是否匹配工作流配置。
func matchEvent(eventsJSON, event string) bool {
	if strings.TrimSpace(eventsJSON) == "" {
		return true // 空表示匹配所有事件
	}
	var events []string
	if err := json.Unmarshal([]byte(eventsJSON), &events); err != nil {
		return false
	}
	if len(events) == 0 {
		return true
	}
	for _, e := range events {
		if e == event {
			return true
		}
	}
	return false
}

// executeWorkflow 执行单个工作流。
func (e *Engine) executeWorkflow(wf *models.WorkOrderWorkflow, event string, wo *models.WorkOrder, actor string) {
	start := time.Now()
	log := models.WorkOrderWorkflowLog{
		WorkflowID:  wf.ID,
		WorkOrderID: wo.ID,
		Event:       event,
		CreatedAt:   time.Now(),
	}

	var actions []WorkflowAction
	if err := json.Unmarshal([]byte(wf.ActionsJSON), &actions); err != nil {
		log.Status = "failed"
		log.ErrorMsg = fmt.Sprintf("解析动作配置失败: %v", err)
		database.DB.Create(&log)
		return
	}

	ctx := &WorkflowContext{
		WorkOrder: wo,
		Event:     event,
		Actor:     actor,
		Variables: make(map[string]interface{}),
		Logs:      make([]string, 0),
	}

	executed := 0
	var lastErr error
	for i, action := range actions {
		if err := e.executeAction(ctx, &action); err != nil {
			lastErr = fmt.Errorf("动作 %d (%s) 失败: %w", i+1, action.Type, err)
			break
		}
		executed++
	}

	log.ActionsExecuted = executed
	log.DurationMs = time.Since(start).Milliseconds()
	if lastErr != nil {
		if executed == 0 {
			log.Status = "failed"
		} else {
			log.Status = "partial"
		}
		log.ErrorMsg = lastErr.Error()
	} else {
		log.Status = "success"
	}

	// 保存执行日志
	if len(ctx.Logs) > 0 {
		logsJSON, _ := json.Marshal(ctx.Logs)
		log.ExecutionLogs = string(logsJSON)
	}

	database.DB.Create(&log)
}

// executeAction 执行单个动作。
func (e *Engine) executeAction(ctx *WorkflowContext, action *WorkflowAction) error {
	switch action.Type {
	case "execute_js":
		return e.executeJS(ctx, action.Config)
	case "update_work_order":
		return e.updateWorkOrder(ctx, action.Config)
	case "create_work_order":
		return e.createWorkOrder(ctx, action.Config)
	case "query_work_orders":
		return e.queryWorkOrders(ctx, action.Config)
	case "call_endpoint":
		return e.callEndpoint(ctx, action.Config)
	case "call_connector":
		return e.callConnector(ctx, action.Config)
	case "call_data_interface":
		return e.callDataInterface(ctx, action.Config)
	default:
		return fmt.Errorf("未知的动作类型: %s", action.Type)
	}
}

// executeJS 执行 JavaScript 代码。
func (e *Engine) executeJS(ctx *WorkflowContext, cfg map[string]interface{}) error {
	code, ok := cfg["code"].(string)
	if !ok {
		return fmt.Errorf("缺少 code")
	}

	vm := goja.New()
	// 注入上下文
	vm.Set("workOrder", ctx.WorkOrder)
	vm.Set("event", ctx.Event)
	vm.Set("actor", ctx.Actor)
	vm.Set("variables", ctx.Variables)

	// 创建 ctx 对象（包含上下文变量）
	ctxObj := vm.NewObject()
	for k, v := range ctx.Variables {
		ctxObj.Set(k, v)
	}
	vm.Set("ctx", ctxObj)

	// 提供工具函数
	vm.Set("log", func(msg string) {
		ctx.Logs = append(ctx.Logs, msg)
		fmt.Printf("[Workflow JS] %s\n", msg)
	})
	vm.Set("setVariable", func(key string, val interface{}) {
		ctx.Variables[key] = val
		// 同步更新到 ctx 对象
		ctxObj.Set(key, val)
	})
	vm.Set("getVariable", func(key string) interface{} {
		return ctx.Variables[key]
	})

	// 提供 console 对象
	consoleObj := vm.NewObject()
	consoleObj.Set("log", func(args ...interface{}) {
		msg := fmt.Sprint(args...)
		ctx.Logs = append(ctx.Logs, msg)
		fmt.Printf("[Workflow JS] %s\n", msg)
	})
	consoleObj.Set("info", func(args ...interface{}) {
		msg := fmt.Sprint(args...)
		ctx.Logs = append(ctx.Logs, "[INFO] "+msg)
		fmt.Printf("[Workflow JS INFO] %s\n", msg)
	})
	consoleObj.Set("warn", func(args ...interface{}) {
		msg := fmt.Sprint(args...)
		ctx.Logs = append(ctx.Logs, "[WARN] "+msg)
		fmt.Printf("[Workflow JS WARN] %s\n", msg)
	})
	consoleObj.Set("error", func(args ...interface{}) {
		msg := fmt.Sprint(args...)
		ctx.Logs = append(ctx.Logs, "[ERROR] "+msg)
		fmt.Printf("[Workflow JS ERROR] %s\n", msg)
	})
	vm.Set("console", consoleObj)

	// 执行
	_, err := vm.RunString(code)
	return err
}

// updateWorkOrder 更新工单（当前工单或指定 ID）。
func (e *Engine) updateWorkOrder(ctx *WorkflowContext, cfg map[string]interface{}) error {
	woID := ctx.WorkOrder.ID
	if id, ok := cfg["work_order_id"].(float64); ok && id > 0 {
		woID = uint(id)
	}

	updates := cfg["updates"].(map[string]interface{})
	if updates == nil {
		return fmt.Errorf("缺少 updates")
	}
	updates = expandPlaceholders(updates, ctx)

	// 使用事务 + FOR UPDATE 锁
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var wo models.WorkOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&wo, woID).Error; err != nil {
			return err
		}
		return tx.Model(&wo).Updates(updates).Error
	})
}

// createWorkOrder 创建新工单。
func (e *Engine) createWorkOrder(ctx *WorkflowContext, cfg map[string]interface{}) error {
	fields := cfg["fields"].(map[string]interface{})
	if fields == nil {
		return fmt.Errorf("缺少 fields")
	}
	fields = expandPlaceholders(fields, ctx)

	wo := models.WorkOrder{
		Code:        genWorkOrderCode(),
		Title:       getString(fields, "title", "自动创建"),
		Description: getString(fields, "description", ""),
		TypeCode:    getString(fields, "type_code", ""),
		DeviceID:    getUint(fields, "device_id", 0),
		Status:      getString(fields, "status", "open"),
		Priority:    getString(fields, "priority", "normal"),
		Visibility:  getString(fields, "visibility", "private"),
		DataJSON:    getString(fields, "data_json", ""),
		OtherCodes:  getString(fields, "other_codes", ""),
		CreatedBy:   0, // 系统创建
	}
	if err := database.DB.Create(&wo).Error; err != nil {
		return err
	}
	ctx.Variables["created_work_order_id"] = wo.ID
	return nil
}

// queryWorkOrders 查询工单（用于条件判断或数据填充）。
func (e *Engine) queryWorkOrders(ctx *WorkflowContext, cfg map[string]interface{}) error {
	conditions := cfg["conditions"].(map[string]interface{})
	if conditions == nil {
		conditions = make(map[string]interface{})
	}
	conditions = expandPlaceholders(conditions, ctx)

	limit := 10
	if l, ok := cfg["limit"].(float64); ok {
		limit = int(l)
	}

	q := database.DB.Model(&models.WorkOrder{})
	for k, v := range conditions {
		q = q.Where(k+" = ?", v)
	}
	var rows []models.WorkOrder
	if err := q.Limit(limit).Find(&rows).Error; err != nil {
		return err
	}
	ctx.Variables["queried_work_orders"] = rows
	return nil
}

// expandPlaceholders 递归展开占位符 {{field}}。
func expandPlaceholders(data map[string]interface{}, ctx *WorkflowContext) map[string]interface{} {
	result := make(map[string]interface{}, len(data))
	for k, v := range data {
		result[k] = expandValue(v, ctx)
	}
	return result
}

func expandValue(v interface{}, ctx *WorkflowContext) interface{} {
	switch val := v.(type) {
	case string:
		return expandString(val, ctx)
	case map[string]interface{}:
		return expandPlaceholders(val, ctx)
	case []interface{}:
		arr := make([]interface{}, len(val))
		for i, item := range val {
			arr[i] = expandValue(item, ctx)
		}
		return arr
	default:
		return v
	}
}

func expandString(s string, ctx *WorkflowContext) string {
	// 简单替换 {{field}}
	s = strings.ReplaceAll(s, "{{code}}", ctx.WorkOrder.Code)
	s = strings.ReplaceAll(s, "{{title}}", ctx.WorkOrder.Title)
	s = strings.ReplaceAll(s, "{{description}}", ctx.WorkOrder.Description)
	s = strings.ReplaceAll(s, "{{status}}", ctx.WorkOrder.Status)
	s = strings.ReplaceAll(s, "{{priority}}", ctx.WorkOrder.Priority)
	s = strings.ReplaceAll(s, "{{type_code}}", ctx.WorkOrder.TypeCode)
	s = strings.ReplaceAll(s, "{{other_codes}}", ctx.WorkOrder.OtherCodes)
	s = strings.ReplaceAll(s, "{{device_id}}", fmt.Sprintf("%d", ctx.WorkOrder.DeviceID))
	s = strings.ReplaceAll(s, "{{event}}", ctx.Event)
	s = strings.ReplaceAll(s, "{{actor}}", ctx.Actor)
	return s
}

func getString(m map[string]interface{}, key, def string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return def
}

func getUint(m map[string]interface{}, key string, def uint) uint {
	if v, ok := m[key].(float64); ok {
		return uint(v)
	}
	return def
}

func genWorkOrderCode() string {
	// 复用工单编码生成逻辑
	return fmt.Sprintf("WO-%s-%d", time.Now().Format("20060102"), time.Now().UnixNano()%10000)
}

// callEndpoint 调用第三方接口。
func (e *Engine) callEndpoint(ctx *WorkflowContext, cfg map[string]interface{}) error {
	endpointID, ok := cfg["endpoint_id"].(float64)
	if !ok {
		return fmt.Errorf("缺少 endpoint_id")
	}

	params, _ := cfg["params"].(map[string]interface{})
	if params == nil {
		params = make(map[string]interface{})
	}

	// 展开占位符
	params = expandPlaceholders(params, ctx)

	// 加载 endpoint
	var ep models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&ep, uint(endpointID)).Error; err != nil {
		return fmt.Errorf("endpoint not found: %w", err)
	}

	if !ep.Enabled || ep.App == nil || !ep.App.Enabled {
		return fmt.Errorf("endpoint or app disabled")
	}

	// 构造变量映射，转换为 {{key}} 格式
	sampleVars := make(map[string]string, len(params))
	for k, v := range params {
		switch val := v.(type) {
		case string:
			sampleVars["{{"+k+"}}"] = val
		default:
			b, _ := json.Marshal(val)
			sampleVars["{{"+k+"}}"] = string(b)
		}
	}

	// 调用 endpoint
	trace, _, _, _, _, err := outbound.DebugHTTPEndpoint(database.DB, ep.App, ep, sampleVars, ep.TimeoutMS, nil)

	if err != nil {
		return fmt.Errorf("endpoint call failed: %w", err)
	}

	// 保存结果到上下文
	if saveKey, ok := cfg["save_to_context"].(string); ok && saveKey != "" {
		result := map[string]interface{}{
			"status": trace.Response.Status,
			"body":   trace.Response.Body,
		}
		ctx.Variables[saveKey] = result
	}

	return nil
}

// callConnector 调用连接器接口。
func (e *Engine) callConnector(ctx *WorkflowContext, cfg map[string]interface{}) error {
	_, ok := cfg["connector_code"].(string)
	if !ok {
		return fmt.Errorf("缺少 connector_code")
	}

	// 展开占位符（未来使用）
	// params, _ := cfg["params"].(map[string]interface{})
	// if params == nil {
	// 	params = make(map[string]interface{})
	// }
	// params = expandPlaceholders(params, ctx)

	// 暂时不支持，因为需要 api 包的 executeConnectorInterface 函数
	// 用户可以使用 webhook 配置或 execute_js 调用
	return fmt.Errorf("call_connector 暂不支持，请使用工单 webhook 配置或 execute_js 调用")
}

// callDataInterface 调用数据接口。
func (e *Engine) callDataInterface(ctx *WorkflowContext, cfg map[string]interface{}) error {
	_, ok := cfg["interface_id"].(float64)
	if !ok {
		return fmt.Errorf("缺少 interface_id")
	}

	// 展开占位符（未来使用）
	// params, _ := cfg["params"].(map[string]interface{})
	// if params == nil {
	// 	params = make(map[string]interface{})
	// }
	// params = expandPlaceholders(params, ctx)

	// 暂时不支持，因为需要 api 包的相关函数
	// 用户可以使用 webhook 配置或 execute_js 调用
	return fmt.Errorf("call_data_interface 暂不支持，请使用工单 webhook 配置或 execute_js 调用")
}
