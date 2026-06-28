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
	Type      string                 `json:"type"` // execute_js | update_work_order | create_work_order | query_work_orders
	Config    map[string]interface{} `json:"config"`
	Condition string                 `json:"condition,omitempty"` // 可选的执行条件表达式
}

// ActionResult 动作执行结果。
type ActionResult struct {
	Type   string      `json:"type"`
	Result interface{} `json:"result"`
	Error  string      `json:"error,omitempty"`
}

// ActionDetail 动作执行详细信息。
type ActionDetail struct {
	Index           int                    `json:"index"`
	Type            string                 `json:"type"`
	ConfigBefore    map[string]interface{} `json:"config_before"`         // 模板展开前的配置
	ConfigAfter     map[string]interface{} `json:"config_after"`          // 模板展开后的配置
	Condition       string                 `json:"condition,omitempty"`   // 执行条件表达式
	ConditionResult bool                   `json:"condition_result"`      // 条件评估结果
	Skipped         bool                   `json:"skipped"`               // 是否被跳过
	SkipReason      string                 `json:"skip_reason,omitempty"` // 跳过原因
	Result          interface{}            `json:"result"`
	Error           string                 `json:"error,omitempty"`
	DurationMs      int64                  `json:"duration_ms"`
	ContextBefore   map[string]interface{} `json:"context_before"` // 执行前的上下文变量
	ContextAfter    map[string]interface{} `json:"context_after"`  // 执行后的上下文变量
}

// WorkflowContext 工作流执行上下文。
type WorkflowContext struct {
	WorkOrder     *models.WorkOrder      `json:"work_order"`
	Event         string                 `json:"event"`
	Actor         string                 `json:"actor"`
	Variables     map[string]interface{} `json:"variables"`      // JS 执行时的共享变量
	ActionResults []ActionResult         `json:"action_results"` // 前序动作执行结果
	ActionDetails []ActionDetail         `json:"action_details"` // 动作执行详细信息
	Logs          []string               `json:"logs"`           // JS 执行日志
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
		WorkOrder:     wo,
		Event:         event,
		Actor:         actor,
		Variables:     make(map[string]interface{}),
		ActionResults: make([]ActionResult, 0),
		ActionDetails: make([]ActionDetail, 0),
		Logs:          make([]string, 0),
	}

	// 从第一个动作的 config 中提取上下文变量定义（如果有）
	if len(actions) > 0 {
		if contextDef, ok := actions[0].Config["context"].([]interface{}); ok {
			for _, item := range contextDef {
				if ctxMap, ok := item.(map[string]interface{}); ok {
					name := getString(ctxMap, "name", "")
					defaultValue := ctxMap["defaultValue"]
					if defaultValue == nil {
						defaultValue = ctxMap["default_value"]
					}
					if name != "" && defaultValue != nil {
						ctx.Variables[name] = defaultValue
					}
				}
			}
		}
	}

	executed := 0
	var lastErr error
	for i, action := range actions {
		actionStart := time.Now()
		result := ActionResult{Type: action.Type}

		// 记录执行前的上下文快照
		contextBefore := make(map[string]interface{})
		for k, v := range ctx.Variables {
			contextBefore[k] = v
		}

		// 深拷贝配置用于记录（展开前）
		configBeforeJSON, _ := json.Marshal(action.Config)
		var configBefore map[string]interface{}
		json.Unmarshal(configBeforeJSON, &configBefore)

		detail := ActionDetail{
			Index:         i,
			Type:          action.Type,
			ConfigBefore:  configBefore,
			ContextBefore: contextBefore,
			Condition:     action.Condition,
		}

		// 评估执行条件
		if action.Condition != "" {
			conditionMet, err := e.evaluateCondition(ctx, action.Condition)
			detail.ConditionResult = conditionMet
			if err != nil {
				result.Error = fmt.Sprintf("条件评估失败: %v", err)
				detail.Error = result.Error
				detail.Skipped = true
				detail.SkipReason = result.Error
				lastErr = fmt.Errorf("动作 %d (%s) 条件评估失败: %w", i+1, action.Type, err)
				detail.DurationMs = time.Since(actionStart).Milliseconds()

				// 记录执行后的上下文（无变化）
				contextAfter := make(map[string]interface{})
				for k, v := range ctx.Variables {
					contextAfter[k] = v
				}
				detail.ContextAfter = contextAfter

				ctx.ActionResults = append(ctx.ActionResults, result)
				ctx.ActionDetails = append(ctx.ActionDetails, detail)
				break
			}

			if !conditionMet {
				// 条件不满足，跳过此动作
				detail.Skipped = true
				detail.SkipReason = "条件不满足"
				detail.DurationMs = time.Since(actionStart).Milliseconds()

				// 记录执行后的上下文（无变化）
				contextAfter := make(map[string]interface{})
				for k, v := range ctx.Variables {
					contextAfter[k] = v
				}
				detail.ContextAfter = contextAfter

				result.Result = "skipped"
				ctx.ActionResults = append(ctx.ActionResults, result)
				ctx.ActionDetails = append(ctx.ActionDetails, detail)
				executed++ // 跳过也算作已处理
				continue
			}
		}

		if err := e.executeAction(ctx, &action, &result, &detail); err != nil {
			result.Error = err.Error()
			detail.Error = err.Error()
			lastErr = fmt.Errorf("动作 %d (%s) 失败: %w", i+1, action.Type, err)
			detail.DurationMs = time.Since(actionStart).Milliseconds()

			// 记录执行后的上下文
			contextAfter := make(map[string]interface{})
			for k, v := range ctx.Variables {
				contextAfter[k] = v
			}
			detail.ContextAfter = contextAfter

			ctx.ActionResults = append(ctx.ActionResults, result)
			ctx.ActionDetails = append(ctx.ActionDetails, detail)
			break
		}

		detail.Result = result.Result
		detail.DurationMs = time.Since(actionStart).Milliseconds()

		// 记录执行后的上下文
		contextAfter := make(map[string]interface{})
		for k, v := range ctx.Variables {
			contextAfter[k] = v
		}
		detail.ContextAfter = contextAfter

		ctx.ActionResults = append(ctx.ActionResults, result)
		ctx.ActionDetails = append(ctx.ActionDetails, detail)
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

	// 保存动作详细信息
	if len(ctx.ActionDetails) > 0 {
		detailsJSON, _ := json.Marshal(ctx.ActionDetails)
		log.ActionDetails = string(detailsJSON)
	}

	// 保存最终上下文快照
	if len(ctx.Variables) > 0 {
		contextJSON, _ := json.Marshal(ctx.Variables)
		log.ContextSnapshot = string(contextJSON)
	}

	database.DB.Create(&log)
}

// executeAction 执行单个动作。
func (e *Engine) executeAction(ctx *WorkflowContext, action *WorkflowAction, result *ActionResult, detail *ActionDetail) error {
	// 记录展开后的配置
	configAfterJSON, _ := json.Marshal(action.Config)
	var configAfter map[string]interface{}
	json.Unmarshal(configAfterJSON, &configAfter)
	detail.ConfigAfter = configAfter

	switch action.Type {
	case "execute_js":
		return e.executeJS(ctx, action.Config, result)
	case "update_work_order":
		return e.updateWorkOrder(ctx, action.Config, result)
	case "create_work_order":
		return e.createWorkOrder(ctx, action.Config, result)
	case "query_work_orders":
		return e.queryWorkOrders(ctx, action.Config, result)
	case "call_endpoint":
		return e.callEndpoint(ctx, action.Config, result)
	case "call_connector":
		return e.callConnector(ctx, action.Config, result)
	case "call_data_interface":
		return e.callDataInterface(ctx, action.Config, result)
	default:
		return fmt.Errorf("未知的动作类型: %s", action.Type)
	}
}

// executeJS 执行 JavaScript 代码。
func (e *Engine) executeJS(ctx *WorkflowContext, cfg map[string]interface{}, result *ActionResult) error {
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

	// 注入前序动作结果
	vm.Set("actions", ctx.ActionResults)

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

	// 字符串操作工具函数
	vm.Set("appendString", func(str1, str2 string, separator string) string {
		if separator == "" {
			separator = ","
		}
		if str1 == "" {
			return str2
		}
		if str2 == "" {
			return str1
		}
		return str1 + separator + str2
	})

	vm.Set("splitString", func(str, separator string) []string {
		if separator == "" {
			separator = ","
		}
		return strings.Split(str, separator)
	})

	vm.Set("joinString", func(arr []string, separator string) string {
		if separator == "" {
			separator = ","
		}
		return strings.Join(arr, separator)
	})

	// 工单操作工具函数
	vm.Set("updateWorkOrder", func(woID uint, updates map[string]interface{}) error {
		return database.DB.Model(&models.WorkOrder{}).Where("id = ?", woID).Updates(updates).Error
	})

	vm.Set("queryWorkOrders", func(conditions map[string]interface{}, limit int) ([]models.WorkOrder, error) {
		if limit <= 0 || limit > 100 {
			limit = 10
		}
		q := database.DB.Model(&models.WorkOrder{})
		for k, v := range conditions {
			q = q.Where(k+" = ?", v)
		}
		var rows []models.WorkOrder
		err := q.Limit(limit).Find(&rows).Error
		return rows, err
	})

	// 标签操作工具函数
	vm.Set("addWorkOrderTag", func(woID uint, tagCode string) error {
		var tag models.WorkOrderTag
		if err := database.DB.Where("code = ?", tagCode).First(&tag).Error; err != nil {
			return fmt.Errorf("标签不存在: %s", tagCode)
		}
		link := models.WorkOrderTagLink{
			WorkOrderID: woID,
			TagCode:     tagCode,
			TagName:     tag.Name,
		}
		return database.DB.Where("work_order_id = ? AND tag_code = ?", woID, tagCode).
			FirstOrCreate(&link).Error
	})

	vm.Set("removeWorkOrderTag", func(woID uint, tagCode string) error {
		return database.DB.Where("work_order_id = ? AND tag_code = ?", woID, tagCode).
			Delete(&models.WorkOrderTagLink{}).Error
	})

	vm.Set("getWorkOrderTags", func(woID uint) ([]string, error) {
		var links []models.WorkOrderTagLink
		if err := database.DB.Where("work_order_id = ?", woID).Find(&links).Error; err != nil {
			return nil, err
		}
		codes := make([]string, len(links))
		for i, link := range links {
			codes[i] = link.TagCode
		}
		return codes, nil
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
	val, err := vm.RunString(code)

	// 执行完成后，同步 ctxObj 的所有属性回 ctx.Variables
	// 这样用户在 JS 中直接修改 ctx.xxx 也能生效
	if ctxObj != nil {
		for _, key := range ctxObj.Keys() {
			val := ctxObj.Get(key)
			if val != nil {
				ctx.Variables[key] = val.Export()
			}
		}
	}

	if err == nil && val != nil {
		result.Result = val.Export()
	}
	return err
}

// updateWorkOrder 更新工单（当前工单或指定 ID），支持 append/replace 模式。
func (e *Engine) updateWorkOrder(ctx *WorkflowContext, cfg map[string]interface{}, result *ActionResult) error {
	woID := ctx.WorkOrder.ID
	if id, ok := cfg["work_order_id"].(float64); ok && id > 0 {
		woID = uint(id)
	} else if idStr, ok := cfg["work_order_id"].(string); ok {
		// 支持模板变量
		idStr = expandString(idStr, ctx)
		if parsedID, err := parseUint(idStr); err == nil {
			woID = parsedID
		}
	}

	updatesRaw := cfg["updates"]
	if updatesRaw == nil {
		return fmt.Errorf("缺少 updates")
	}

	// 支持新格式：updates 可以是数组，每项包含 field, value, mode
	var fieldUpdates []map[string]interface{}
	if arr, ok := updatesRaw.([]interface{}); ok {
		for _, item := range arr {
			if m, ok := item.(map[string]interface{}); ok {
				fieldUpdates = append(fieldUpdates, m)
			}
		}
	} else if m, ok := updatesRaw.(map[string]interface{}); ok {
		// 向后兼容：旧格式 {"field": "value"}
		for k, v := range m {
			fieldUpdates = append(fieldUpdates, map[string]interface{}{
				"field": k,
				"value": v,
				"mode":  "replace",
			})
		}
	}

	if len(fieldUpdates) == 0 {
		return fmt.Errorf("updates 为空")
	}

	// 使用事务 + FOR UPDATE 锁
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var wo models.WorkOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&wo, woID).Error; err != nil {
			return err
		}

		updates := make(map[string]interface{})
		for _, fu := range fieldUpdates {
			field := getString(fu, "field", "")
			if field == "" {
				continue
			}
			value := fu["value"]
			mode := getString(fu, "mode", "replace")

			// 展开占位符
			valueStr := fmt.Sprintf("%v", value)
			valueStr = expandStringWithContext(valueStr, ctx)

			// 根据 mode 处理
			if mode == "append" {
				// 追加模式：用于 other_codes 等字段
				oldValue := getFieldValue(&wo, field)
				separator := getString(fu, "separator", ",")
				if oldValue == "" {
					updates[field] = valueStr
				} else if valueStr != "" {
					updates[field] = oldValue + separator + valueStr
				}
			} else {
				// 替换模式
				updates[field] = valueStr
			}
		}

		if len(updates) == 0 {
			return nil
		}

		if err := tx.Model(&wo).Updates(updates).Error; err != nil {
			return err
		}

		result.Result = map[string]interface{}{
			"work_order_id": woID,
			"updated":       updates,
		}
		return nil
	})
}

// getFieldValue 获取工单字段值。
func getFieldValue(wo *models.WorkOrder, field string) string {
	switch field {
	case "title":
		return wo.Title
	case "description":
		return wo.Description
	case "status":
		return wo.Status
	case "priority":
		return wo.Priority
	case "visibility":
		return wo.Visibility
	case "business_no":
		return wo.BusinessNo
	case "external_ref":
		return wo.ExternalRef
	case "other_codes":
		return wo.OtherCodes
	case "device_name_snap":
		return wo.DeviceName
	case "device_alias_server":
		return wo.DeviceAliasServer
	case "device_alias_agent":
		return wo.DeviceAliasAgent
	case "device_group":
		return wo.DeviceGroup
	case "data_json":
		return wo.DataJSON
	default:
		return ""
	}
}

// createWorkOrder 创建新工单。
func (e *Engine) createWorkOrder(ctx *WorkflowContext, cfg map[string]interface{}, result *ActionResult) error {
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
		BusinessNo:  getString(fields, "business_no", ""),
		CreatedBy:   0, // 系统创建
	}
	if err := database.DB.Create(&wo).Error; err != nil {
		return err
	}
	ctx.Variables["created_work_order_id"] = wo.ID
	result.Result = map[string]interface{}{
		"work_order_id": wo.ID,
		"code":          wo.Code,
	}

	// 保存到上下文变量（如果指定）
	if saveKey, ok := cfg["save_to_context"].(string); ok && saveKey != "" {
		ctx.Variables[saveKey] = wo.ID
	}

	return nil
}

// queryWorkOrders 查询工单（用于条件判断或数据填充）。
func (e *Engine) queryWorkOrders(ctx *WorkflowContext, cfg map[string]interface{}, result *ActionResult) error {
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
	result.Result = rows
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
		return expandStringWithContext(val, ctx)
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
	return expandStringWithContext(s, ctx)
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

func parseUint(s string) (uint, error) {
	var u uint
	_, err := fmt.Sscanf(s, "%d", &u)
	return u, err
}

func genWorkOrderCode() string {
	// 复用工单编码生成逻辑
	return fmt.Sprintf("WO-%s-%d", time.Now().Format("20060102"), time.Now().UnixNano()%10000)
}

// callEndpoint 调用第三方接口。
func (e *Engine) callEndpoint(ctx *WorkflowContext, cfg map[string]interface{}, result *ActionResult) error {
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
	resultData := map[string]interface{}{
		"status": trace.Response.Status,
		"body":   trace.Response.Body,
	}
	result.Result = resultData

	if saveKey, ok := cfg["save_to_context"].(string); ok && saveKey != "" {
		ctx.Variables[saveKey] = resultData
	}

	return nil
}

// callConnector 调用连接器接口。
func (e *Engine) callConnector(ctx *WorkflowContext, cfg map[string]interface{}, result *ActionResult) error {
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
func (e *Engine) callDataInterface(ctx *WorkflowContext, cfg map[string]interface{}, result *ActionResult) error {
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
