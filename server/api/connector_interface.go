package api

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ── 连接器接口模式 API ────────────────────────────────────────────────────

// ListConnectorInterfaces 列出所有接口模式的连接器
func ListConnectorInterfaces(c *gin.Context) {
	var connectors []models.OutboundConnector
	query := database.DB.Where("interface_mode = ? AND enabled = ?", true, true)

	if code := c.Query("code"); code != "" {
		query = query.Where("interface_code = ?", code)
	}

	query.Find(&connectors)
	c.JSON(http.StatusOK, gin.H{"data": connectors})
}

// GetConnectorInterface 获取单个连接器接口详情
func GetConnectorInterface(c *gin.Context) {
	code := c.Param("code")
	var connector models.OutboundConnector
	if err := database.DB.Where("interface_code = ? AND interface_mode = ?", code, true).First(&connector).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector interface not found"})
		return
	}
	c.JSON(http.StatusOK, connector)
}

// CallConnectorInterface 调用连接器接口
// POST /api/connectors/call
type callConnectorReq struct {
	ConnectorCode string                 `json:"connector_code" binding:"required"`
	Params        map[string]interface{} `json:"params"`
	DeviceID      uint                   `json:"device_id"` // 可选，某些连接器可能需要设备上下文
}

type callConnectorResp struct {
	Success   bool                   `json:"success"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Error     string                 `json:"error,omitempty"`
	Duration  int64                  `json:"duration_ms"`
	StepCount int                    `json:"step_count"`
}

func CallConnectorInterface(c *gin.Context) {
	var req callConnectorReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 查找连接器
	var connector models.OutboundConnector
	if err := database.DB.Where("interface_code = ? AND interface_mode = ? AND enabled = ?",
		req.ConnectorCode, true, true).First(&connector).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector interface not found or disabled"})
		return
	}

	// 执行连接器
	start := time.Now()
	result, err := executeConnectorInterface(&connector, req.Params, req.DeviceID, c.GetUint("user_id"))
	duration := time.Since(start).Milliseconds()

	if err != nil {
		c.JSON(http.StatusOK, callConnectorResp{
			Success:  false,
			Error:    err.Error(),
			Duration: duration,
		})
		return
	}

	c.JSON(http.StatusOK, callConnectorResp{
		Success:   true,
		Data:      result.Data,
		Duration:  duration,
		StepCount: result.StepCount,
	})
}

// CallConnectorInterfaceByCode 通用调用入口（支持 GET、POST、PUT、DELETE 等多种 HTTP 方法）
// GET/POST/PUT/DELETE /api/outbound/connector-interfaces/:code/invoke
func CallConnectorInterfaceByCode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connector_code is required"})
		return
	}

	// 查找连接器
	var connector models.OutboundConnector
	if err := database.DB.Where("interface_code = ? AND interface_mode = ? AND enabled = ?",
		code, true, true).First(&connector).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "connector interface not found or disabled"})
		return
	}

	// 合并参数：query string + body + path params
	params := make(map[string]interface{})

	// 1. 从 URL query string 获取参数
	for k, v := range c.Request.URL.Query() {
		if len(v) == 1 {
			params[k] = v[0]
		} else {
			params[k] = v
		}
	}

	// 2. 从 body 获取参数（如果是 JSON）
	if c.Request.Method == "POST" || c.Request.Method == "PUT" || c.Request.Method == "PATCH" {
		var bodyParams map[string]interface{}
		if err := c.ShouldBindJSON(&bodyParams); err == nil {
			// JSON body 参数覆盖同名 query 参数
			for k, v := range bodyParams {
				params[k] = v
			}
		}
	}

	// 3. 添加 HTTP 方法和路径信息到 context
	params["_http_method"] = c.Request.Method
	params["_http_path"] = c.Request.URL.Path
	params["_http_query"] = c.Request.URL.RawQuery

	// 4. 从 header 中提取 device_id（可选）
	deviceID := uint(0)
	if deviceIDStr := c.GetHeader("X-Device-ID"); deviceIDStr != "" {
		fmt.Sscanf(deviceIDStr, "%d", &deviceID)
	}

	// 执行连接器
	start := time.Now()
	result, err := executeConnectorInterface(&connector, params, deviceID, c.GetUint("user_id"))
	duration := time.Since(start).Milliseconds()

	if err != nil {
		c.JSON(http.StatusOK, callConnectorResp{
			Success:  false,
			Error:    err.Error(),
			Duration: duration,
		})
		return
	}

	c.JSON(http.StatusOK, callConnectorResp{
		Success:   true,
		Data:      result.Data,
		Duration:  duration,
		StepCount: result.StepCount,
	})
}

// ConnectorExecutionResult 连接器执行结果
type ConnectorExecutionResult struct {
	Data      map[string]interface{}
	StepCount int
	Logs      []string
}

// executeConnectorInterface 执行连接器接口（核心逻辑）
func executeConnectorInterface(connector *models.OutboundConnector, params map[string]interface{}, deviceID uint, userID uint) (*ConnectorExecutionResult, error) {
	// 加载所有阶段和步骤
	var phases []models.OutboundConnectorPhase
	if err := database.DB.Where("connector_id = ?", connector.ID).Order("sort_order ASC").Find(&phases).Error; err != nil {
		return nil, fmt.Errorf("failed to load phases: %w", err)
	}

	if len(phases) == 0 {
		return nil, fmt.Errorf("no phases configured for this connector")
	}

	// 初始化执行上下文
	ctx := &connectorExecutionContext{
		connector:  connector,
		params:     params,
		deviceID:   deviceID,
		userID:     userID,
		vars:       make(map[string]interface{}),
		context:    make(map[string]interface{}),
		stringVars: make(map[string]string),
		stepCount:  0,
		logs:       []string{},
		phaseIndex: make(map[uint]int),
	}

	// 建立阶段索引
	for i, phase := range phases {
		ctx.phaseIndex[phase.ID] = i
	}

	// 将输入参数放入 context（以 context.* 形式供占位符使用）
	for k, v := range params {
		ctx.context[k] = v
		ctx.vars["context."+k] = v
		// 同时支持 {{param_name}} 和 {{context.param_name}}
		ctx.vars[k] = v
	}

	// 添加 HTTP 相关变量（如果有）
	if method, ok := params["_http_method"].(string); ok {
		ctx.vars["http.method"] = method
	}
	if path, ok := params["_http_path"].(string); ok {
		ctx.vars["http.path"] = path
	}
	if query, ok := params["_http_query"].(string); ok {
		ctx.vars["http.query"] = query
	}

	// 可选：添加设备和用户相关变量（仅当有值时）
	if deviceID > 0 {
		ctx.vars["deviceid"] = deviceID
		ctx.vars["device.id"] = deviceID
		ctx.context["deviceid"] = deviceID
	}
	if userID > 0 {
		ctx.vars["userid"] = userID
		ctx.vars["user.id"] = userID
		ctx.context["userid"] = userID
	}

	// 添加时间戳
	ctx.vars["timestamp"] = time.Now().Unix()
	ctx.vars["timestamp_ms"] = time.Now().UnixMilli()

	// 将 context 同步到 outbound 格式的 stringVars（{{context.k}}），供脚本/HTTP 步骤使用
	syncContextToStringVars(ctx)

	// 顺序执行阶段
	currentPhaseIdx := 0
	for currentPhaseIdx < len(phases) {
		phase := phases[currentPhaseIdx]

		// 加载阶段的所有步骤
		var steps []models.OutboundConnectorStep
		if err := database.DB.Where("phase_id = ?", phase.ID).Order("sort_order ASC").Find(&steps).Error; err != nil {
			return nil, fmt.Errorf("failed to load steps for phase %d: %w", phase.ID, err)
		}

		// 执行阶段
		nextPhaseID, err := executePhase(ctx, &phase, steps)
		if err != nil {
			return nil, fmt.Errorf("phase %d execution failed: %w", phase.ID, err)
		}

		// 处理跳转
		if nextPhaseID > 0 {
			// 跳转到指定阶段
			if idx, ok := ctx.phaseIndex[nextPhaseID]; ok {
				currentPhaseIdx = idx
				ctx.logs = append(ctx.logs, fmt.Sprintf("Jump to phase %d", nextPhaseID))
			} else {
				return nil, fmt.Errorf("invalid jump target: phase %d not found", nextPhaseID)
			}
		} else {
			// 继续下一阶段
			currentPhaseIdx++
		}
	}

	// 应用输出映射（如果配置了）
	outputData := applyConnectorOutputMappings(connector.OutputMappingsJSON, ctx.context, ctx.vars)

	// 全流程结束、输出映射之后：执行连接器全局 result 脚本整体改写返回值。
	if newOut, ran, rerr := outbound.RunConnectorResultScript(connector.CustomScriptJSON, outputData, connectorContextStringVars(ctx.context)); rerr != nil {
		return nil, fmt.Errorf("返回值脚本: %w", rerr)
	} else if ran {
		outputData = newOut
		ctx.logs = append(ctx.logs, "已执行连接器返回值脚本（result）改写最终输出")
	}

	// 返回结果
	return &ConnectorExecutionResult{
		Data:      outputData,
		StepCount: ctx.stepCount,
		Logs:      ctx.logs,
	}, nil
}

// connectorContextStringVars 把 context 业务数据转成 {{context.k}}=string 占位符表，供 result 脚本 ctx.getContext 使用。
func connectorContextStringVars(ctxMap map[string]interface{}) map[string]string {
	out := make(map[string]string)
	for k, v := range ctxMap {
		switch t := v.(type) {
		case string:
			out["{{context."+k+"}}"] = t
		case nil:
			out["{{context."+k+"}}"] = ""
		default:
			if b, err := json.Marshal(v); err == nil {
				out["{{context."+k+"}}"] = string(b)
			} else {
				out["{{context."+k+"}}"] = fmt.Sprint(v)
			}
		}
	}
	return out
}

// applyConnectorOutputMappings 按 output_mappings 配置，从 context / vars / 固定值构建最终输出。
// mappingsJSON 为空或解析失败/无映射时，直接返回完整 context（默认行为）。
// 调试器与真实接口调用共用，避免两份逻辑漂移。
func applyConnectorOutputMappings(mappingsJSON string, ctxMap map[string]interface{}, vars map[string]interface{}) map[string]interface{} {
	if strings.TrimSpace(mappingsJSON) == "" {
		return ctxMap
	}
	var mappings []map[string]interface{}
	if err := json.Unmarshal([]byte(mappingsJSON), &mappings); err != nil || len(mappings) == 0 {
		return ctxMap
	}
	outputData := make(map[string]interface{})
	for _, mapping := range mappings {
		outputKey, _ := mapping["output_key"].(string)
		source, _ := mapping["source"].(string)
		value, _ := mapping["value"].(string)

		if outputKey == "" {
			continue
		}

		var outputValue interface{}
		switch source {
		case "context":
			// 从 context 中获取值
			if value != "" {
				if v, ok := ctxMap[value]; ok {
					outputValue = v
				} else if v, ok := vars["context."+value]; ok {
					outputValue = v
				}
			}
		case "var":
			// 从 vars 中获取值（支持 {{...}} 格式）
			cleanValue := strings.Trim(value, "{} ")
			if v, ok := vars[cleanValue]; ok {
				outputValue = v
			}
		case "fixed":
			// 固定值
			outputValue = value
		}

		// 支持点路径（如 a.b.c）
		if strings.Contains(outputKey, ".") {
			setNestedValue(outputData, outputKey, outputValue)
		} else {
			outputData[outputKey] = outputValue
		}
	}
	return outputData
}

// setNestedValue 设置嵌套对象的值（支持点路径）
func setNestedValue(obj map[string]interface{}, path string, value interface{}) {
	parts := strings.Split(path, ".")
	current := obj

	for i := 0; i < len(parts)-1; i++ {
		key := parts[i]
		if _, ok := current[key]; !ok {
			current[key] = make(map[string]interface{})
		}
		if next, ok := current[key].(map[string]interface{}); ok {
			current = next
		} else {
			// 类型不匹配，无法继续
			return
		}
	}

	current[parts[len(parts)-1]] = value
}

type connectorExecutionContext struct {
	connector  *models.OutboundConnector
	params     map[string]interface{}
	deviceID   uint
	userID     uint
	vars       map[string]interface{} // 运行时变量（扁平化的占位符键值对）
	context    map[string]interface{} // context 命名空间（业务数据）
	stringVars map[string]string      // outbound 包使用的 {{k}} 格式占位符表，跨步骤持久
	stepCount  int
	logs       []string
	phaseIndex map[uint]int // phase_id -> index
}

// executePhase 执行单个阶段，返回下一个要跳转的阶段 ID（0 表示继续）
func executePhase(ctx *connectorExecutionContext, phase *models.OutboundConnectorPhase, steps []models.OutboundConnectorStep) (uint, error) {
	// 应用阶段级参数
	if phase.ParamsJSON != "" {
		var phaseParams map[string]interface{}
		if err := json.Unmarshal([]byte(phase.ParamsJSON), &phaseParams); err == nil {
			for k, v := range phaseParams {
				ctx.vars[k] = v
			}
		}
	}

	// 根据 RunMode 执行步骤（空值默认 sequential）
	runMode := strings.TrimSpace(phase.RunMode)
	if runMode == "" {
		runMode = "sequential"
	}
	switch runMode {
	case "sequential":
		for _, step := range steps {
			nextPhaseID, err := executeStep(ctx, &step)
			if err != nil {
				return 0, err
			}
			if nextPhaseID > 0 {
				return nextPhaseID, nil
			}
		}
	case "parallel":
		for _, step := range steps {
			_, _ = executeStep(ctx, &step)
		}
	case "failover":
		for _, step := range steps {
			nextPhaseID, err := executeStep(ctx, &step)
			if err == nil {
				if nextPhaseID > 0 {
					return nextPhaseID, nil
				}
				break
			}
		}
	default:
		return 0, fmt.Errorf("unknown run mode: %s", phase.RunMode)
	}

	return 0, nil
}

// executeStep 执行单个步骤，返回下一个要跳转的阶段 ID（0 表示继续）
func executeStep(ctx *connectorExecutionContext, step *models.OutboundConnectorStep) (uint, error) {
	ctx.stepCount++

	// 延迟执行前
	if step.DelayBeforeMS > 0 {
		time.Sleep(time.Duration(step.DelayBeforeMS) * time.Millisecond)
	}

	var nextPhaseID uint
	var err error

	switch step.StepType {
	case "condition":
		nextPhaseID, err = executeConditionStep(ctx, step)
	case "call_connector":
		err = executeCallConnectorStep(ctx, step)
	case "http":
		err = executeInterfaceHTTPStep(ctx, step)
	case "app_script":
		err = executeInterfaceAppScriptStep(ctx, step)
	case "connector_script":
		err = executeInterfaceConnectorScriptStep(ctx, step)
	default:
		ctx.logs = append(ctx.logs, fmt.Sprintf("Unknown step type: %s", step.StepType))
	}

	// 延迟执行后
	if step.DelayAfterMS > 0 {
		time.Sleep(time.Duration(step.DelayAfterMS) * time.Millisecond)
	}

	return nextPhaseID, err
}

// executeConditionStep 执行条件步骤
func executeConditionStep(ctx *connectorExecutionContext, step *models.OutboundConnectorStep) (uint, error) {
	if step.ConditionExpr == "" {
		return 0, fmt.Errorf("condition expression is empty")
	}

	// TODO: 实现完整的 JavaScript 表达式求值
	// 这里简化实现：检查变量是否存在且为 true
	result := evalSimpleCondition(step.ConditionExpr, ctx.vars)

	ctx.logs = append(ctx.logs, fmt.Sprintf("Condition %d evaluated to %v", step.ID, result))

	if result {
		if step.TrueBranchPhaseID > 0 {
			return step.TrueBranchPhaseID, nil
		}
	} else {
		if step.FalseBranchPhaseID > 0 {
			return step.FalseBranchPhaseID, nil
		}
	}

	return 0, nil
}

// evalSimpleCondition 简单的条件求值（简化版）
func evalSimpleCondition(expr string, vars map[string]interface{}) bool {
	// TODO: 使用 JavaScript 引擎求值
	// 当前简化实现：检查变量名
	if val, ok := vars[expr]; ok {
		if b, ok := val.(bool); ok {
			return b
		}
	}
	return false
}

// executeCallConnectorStep 执行调用连接器步骤
func executeCallConnectorStep(ctx *connectorExecutionContext, step *models.OutboundConnectorStep) error {
	if step.CallConnectorCode == "" {
		return fmt.Errorf("call_connector_code is empty")
	}

	// 查找目标连接器
	var targetConnector models.OutboundConnector
	if err := database.DB.Where("interface_code = ? AND interface_mode = ? AND enabled = ?",
		step.CallConnectorCode, true, true).First(&targetConnector).Error; err != nil {
		return fmt.Errorf("target connector %s not found: %w", step.CallConnectorCode, err)
	}

	// 准备调用参数
	callParams := make(map[string]interface{})
	if step.CallParamsJSON != "" {
		var paramMapping map[string]interface{}
		if err := json.Unmarshal([]byte(step.CallParamsJSON), &paramMapping); err == nil {
			// 替换占位符
			for k, v := range paramMapping {
				if strVal, ok := v.(string); ok {
					// 简单占位符替换
					if val, exists := ctx.vars[strVal]; exists {
						callParams[k] = val
					} else {
						callParams[k] = strVal
					}
				} else {
					callParams[k] = v
				}
			}
		}
	}

	// 递归调用
	ctx.logs = append(ctx.logs, fmt.Sprintf("Calling connector %s with params: %v", step.CallConnectorCode, callParams))
	result, err := executeConnectorInterface(&targetConnector, callParams, ctx.deviceID, ctx.userID)
	if err != nil {
		return fmt.Errorf("failed to call connector %s: %w", step.CallConnectorCode, err)
	}

	// 将结果合并到当前上下文
	for k, v := range result.Data {
		ctx.vars[k] = v
	}

	ctx.logs = append(ctx.logs, fmt.Sprintf("Connector %s returned %d vars", step.CallConnectorCode, len(result.Data)))
	return nil
}

// syncContextToStringVars 把 ctx.context 里的值同步成 {{context.k}} 格式写入 ctx.stringVars，
// 供 outbound 包的执行函数（脚本/HTTP）使用。
func syncContextToStringVars(ctx *connectorExecutionContext) {
	for k, v := range ctx.context {
		switch t := v.(type) {
		case string:
			ctx.stringVars["{{context."+k+"}}"] = t
		case nil:
			ctx.stringVars["{{context."+k+"}}"] = ""
		default:
			if b, err := json.Marshal(v); err == nil {
				ctx.stringVars["{{context."+k+"}}"] = string(b)
			} else {
				ctx.stringVars["{{context."+k+"}}"] = fmt.Sprint(t)
			}
		}
	}
}

// syncStringVarsBackToContext 把 outbound 执行后 stringVars 里 {{context.k}} 的变化合并回 ctx.context 和 ctx.vars。
func syncStringVarsBackToContext(ctx *connectorExecutionContext) {
	for k, v := range ctx.stringVars {
		if strings.HasPrefix(k, "{{context.") && strings.HasSuffix(k, "}}") {
			field := k[len("{{context.") : len(k)-2]
			ctx.context[field] = v
			ctx.vars["context."+field] = v
			ctx.vars[field] = v
		}
	}
}

// executeInterfaceHTTPStep 在接口模式下执行 http 步骤，复用 outbound.ExecuteHTTPWebhook。
func executeInterfaceHTTPStep(ctx *connectorExecutionContext, step *models.OutboundConnectorStep) error {
	if step.EndpointID == 0 {
		return fmt.Errorf("http step %d: endpoint_id 未配置", step.ID)
	}
	var ep models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&ep, step.EndpointID).Error; err != nil {
		return fmt.Errorf("http step %d: 接口不存在", step.ID)
	}
	if !ep.Enabled || ep.App == nil || !ep.App.Enabled {
		return fmt.Errorf("http step %d: 接口或应用已禁用", step.ID)
	}

	syncContextToStringVars(ctx)
	meta := outbound.StepExecutionMeta{StepType: "http", StepID: step.ID}
	d := outbound.ExecuteHTTPWebhook(
		database.DB, *ctx.connector, ep, ep.App,
		models.DeviceEvent{}, nil, nil,
		ctx.stringVars, meta, true, *step, nil,
	)
	syncStringVarsBackToContext(ctx)

	if d.Status != "success" {
		return fmt.Errorf("http step %d failed: %s", step.ID, d.Error)
	}
	return nil
}

// executeInterfaceAppScriptStep 在接口模式下执行 app_script 步骤，复用 outbound.ExecuteAppScriptStep。
func executeInterfaceAppScriptStep(ctx *connectorExecutionContext, step *models.OutboundConnectorStep) error {
	syncContextToStringVars(ctx)
	meta := outbound.StepExecutionMeta{StepType: "app_script", StepID: step.ID}
	d := outbound.ExecuteAppScriptStep(
		database.DB, *ctx.connector, *step,
		models.DeviceEvent{}, nil, nil,
		ctx.stringVars, meta,
	)
	syncStringVarsBackToContext(ctx)

	if d.Status != "success" {
		return fmt.Errorf("app_script step %d failed: %s", step.ID, d.Error)
	}
	return nil
}

// executeInterfaceConnectorScriptStep 在接口模式下执行 connector_script 步骤，复用 outbound.ExecuteConnectorScriptStep。
func executeInterfaceConnectorScriptStep(ctx *connectorExecutionContext, step *models.OutboundConnectorStep) error {
	syncContextToStringVars(ctx)
	meta := outbound.StepExecutionMeta{StepType: "connector_script", StepID: step.ID}
	d := outbound.ExecuteConnectorScriptStep(
		database.DB, *ctx.connector, *step,
		models.DeviceEvent{}, nil, nil,
		ctx.stringVars, meta,
	)
	syncStringVarsBackToContext(ctx)

	if d.Status != "success" {
		return fmt.Errorf("connector_script step %d failed: %s", step.ID, d.Error)
	}
	return nil
}
