package workflow

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"time"

	"app-manager/database"
	"app-manager/datastack"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/dop251/goja"
)

// LowCodeEngine 低代码平台工作流执行引擎
type LowCodeEngine struct {
	mu                sync.RWMutex
	runningExecutions map[uint]*ExecutionContext
}

var LowCodeEngineInstance = &LowCodeEngine{
	runningExecutions: make(map[uint]*ExecutionContext),
}

// WorkflowDefinitionSchema 工作流定义结构
type WorkflowDefinitionSchema struct {
	ID    string               `json:"id"`
	Name  string               `json:"name"`
	Nodes []WorkflowNodeSchema `json:"nodes"`
	Edges []WorkflowEdgeSchema `json:"edges"`
}

type WorkflowNodeSchema struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Position map[string]float64     `json:"position"`
	Data     map[string]interface{} `json:"data"`
}

type WorkflowEdgeSchema struct {
	ID           string `json:"id"`
	Source       string `json:"source"`
	Target       string `json:"target"`
	SourceHandle string `json:"sourceHandle,omitempty"`
	TargetHandle string `json:"targetHandle,omitempty"`
}

// ExecutionContext 工作流执行上下文
type ExecutionContext struct {
	ExecutionID uint
	WorkflowID  uint
	Definition  *WorkflowDefinitionSchema

	// 执行状态
	Status      string // pending | running | completed | failed | timeout
	StartedAt   time.Time
	CompletedAt *time.Time

	// 数据
	Input        map[string]interface{}
	Variables    map[string]interface{} // 变量存储
	NodeResults  map[string]interface{} // 节点执行结果
	NodeStatuses map[string]string      // 节点状态: pending | running | completed | failed | skipped

	// 控制
	Ctx           context.Context
	Cancel        context.CancelFunc
	Logs          []ExecutionLog
	CurrentNodeID string

	Mu sync.RWMutex
}

// ExecutionLog 执行日志
type ExecutionLog struct {
	Timestamp time.Time              `json:"timestamp"`
	Level     string                 `json:"level"` // info | warn | error
	NodeID    string                 `json:"node_id,omitempty"`
	Message   string                 `json:"message"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

// NodeExecutionResult 节点执行结果
type NodeExecutionResult struct {
	Success   bool
	Output    interface{}
	Error     string
	NextNodes []string // 下一个要执行的节点ID
}

// ExecuteWorkflow 执行工作流
func (e *LowCodeEngine) ExecuteWorkflow(
	executionID uint,
	workflow *models.WorkflowDefinition,
	input map[string]interface{},
) error {
	// 解析工作流定义
	var definition WorkflowDefinitionSchema
	if err := json.Unmarshal([]byte(workflow.SchemaJSON), &definition); err != nil {
		return fmt.Errorf("failed to parse workflow schema: %w", err)
	}

	// 创建执行上下文
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(workflow.Timeout)*time.Second)

	execCtx := &ExecutionContext{
		ExecutionID:  executionID,
		WorkflowID:   workflow.ID,
		Definition:   &definition,
		Status:       "running",
		StartedAt:    time.Now(),
		Input:        input,
		Variables:    make(map[string]interface{}),
		NodeResults:  make(map[string]interface{}),
		NodeStatuses: make(map[string]string),
		Ctx:          ctx,
		Cancel:       cancel,
		Logs:         make([]ExecutionLog, 0),
	}

	// 初始化变量
	execCtx.Variables["input"] = input
	execCtx.Variables["workflowId"] = workflow.ID
	execCtx.Variables["executionId"] = executionID

	// 注册到运行中列表
	e.mu.Lock()
	e.runningExecutions[executionID] = execCtx
	e.mu.Unlock()

	// 更新执行状态为 running
	now := time.Now()
	database.DB.Model(&models.WorkflowExecution{}).
		Where("id = ?", executionID).
		Updates(map[string]interface{}{
			"status":     "running",
			"started_at": now,
		})

	// 异步执行
	go e.executeWorkflowAsync(execCtx)

	return nil
}

// executeWorkflowAsync 异步执行工作流
func (e *LowCodeEngine) executeWorkflowAsync(execCtx *ExecutionContext) {
	defer func() {
		execCtx.Cancel()
		e.mu.Lock()
		delete(e.runningExecutions, execCtx.ExecutionID)
		e.mu.Unlock()
	}()

	// 查找 start 节点
	var startNode *WorkflowNodeSchema
	for i := range execCtx.Definition.Nodes {
		node := &execCtx.Definition.Nodes[i]
		if node.Type == "start" {
			startNode = node
			break
		}
	}

	if startNode == nil {
		e.finishExecution(execCtx, "failed", "No start node found", nil)
		return
	}

	execCtx.addLog("info", "", "Workflow execution started", nil)

	// 从 start 节点开始执行
	success := e.executeNode(execCtx, startNode)

	// 完成执行
	if success {
		e.finishExecution(execCtx, "completed", "", execCtx.NodeResults)
	} else {
		e.finishExecution(execCtx, "failed", "Workflow execution failed", execCtx.NodeResults)
	}
}

// executeNode 执行单个节点
func (e *LowCodeEngine) executeNode(execCtx *ExecutionContext, node *WorkflowNodeSchema) bool {
	// 检查上下文是否已取消
	select {
	case <-execCtx.Ctx.Done():
		e.finishExecution(execCtx, "timeout", "Execution timeout", nil)
		return false
	default:
	}

	execCtx.Mu.Lock()
	execCtx.CurrentNodeID = node.ID
	execCtx.NodeStatuses[node.ID] = "running"
	execCtx.Mu.Unlock()

	execCtx.addLog("info", node.ID, fmt.Sprintf("Node %s (%s) started", node.ID, node.Type), nil)

	// 广播节点开始
	WSHubInstance.BroadcastNodeUpdate(execCtx.ExecutionID, node.ID, "running", nil)

	// 执行节点
	result, err := e.executeNodeByType(execCtx, node)

	execCtx.Mu.Lock()
	if err != nil {
		execCtx.NodeStatuses[node.ID] = "failed"
		execCtx.addLog("error", node.ID, fmt.Sprintf("Node failed: %v", err), nil)
		execCtx.Mu.Unlock()

		// 广播节点失败
		WSHubInstance.BroadcastNodeUpdate(execCtx.ExecutionID, node.ID, "failed", map[string]interface{}{
			"error": err.Error(),
		})

		return false
	}

	execCtx.NodeStatuses[node.ID] = "completed"
	execCtx.NodeResults[node.ID] = result.Output
	execCtx.addLog("info", node.ID, "Node completed", map[string]interface{}{"output": result.Output})
	execCtx.Mu.Unlock()

	// 广播节点完成
	WSHubInstance.BroadcastNodeUpdate(execCtx.ExecutionID, node.ID, "completed", result.Output)

	// 如果是 end 节点，停止执行
	if node.Type == "end" {
		return true
	}

	// 获取下一个节点
	nextNodes := result.NextNodes
	if len(nextNodes) == 0 {
		nextNodes = e.getNextNodes(execCtx, node.ID)
	}

	// 执行下一个节点
	for _, nextNodeID := range nextNodes {
		nextNode := e.findNode(execCtx.Definition, nextNodeID)
		if nextNode == nil {
			execCtx.addLog("warn", node.ID, fmt.Sprintf("Next node %s not found", nextNodeID), nil)
			continue
		}

		if !e.executeNode(execCtx, nextNode) {
			return false
		}
	}

	return true
}

// executeNodeByType 根据节点类型执行
func (e *LowCodeEngine) executeNodeByType(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
) (*NodeExecutionResult, error) {
	config, _ := node.Data["config"].(map[string]interface{})
	if config == nil {
		config = make(map[string]interface{})
	}

	// 先尝试内置节点类型
	switch node.Type {
	case "start":
		return e.executeStart(execCtx, node, config)
	case "end":
		return e.executeEnd(execCtx, node, config)
	case "formSubmit":
		return e.executeFormSubmit(execCtx, node, config)
	case "dataInterface":
		return e.executeDataInterface(execCtx, node, config)
	case "outboundConnector":
		return e.executeOutboundConnector(execCtx, node, config)
	case "condition":
		return e.executeCondition(execCtx, node, config)
	case "loop":
		return e.executeLoop(execCtx, node, config)
	case "validation":
		return e.executeValidation(execCtx, node, config)
	case "navigation":
		return e.executeNavigation(execCtx, node, config)
	case "http":
		return e.executeHTTP(execCtx, node, config)
	case "code":
		return e.executeCode(execCtx, node, config)
	case "delay":
		return e.executeDelay(execCtx, node, config)
	}

	// 尝试从注册表获取自定义节点
	if executor, ok := GetNodeExecutor(node.Type); ok {
		output, err := executor.Execute(execCtx.Ctx, config, execCtx.Variables)
		if err != nil {
			return nil, err
		}
		return &NodeExecutionResult{
			Success: true,
			Output:  output,
		}, nil
	}

	return nil, fmt.Errorf("unknown node type: %s", node.Type)
}

// 节点执行器实现

func (e *LowCodeEngine) executeStart(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	return &NodeExecutionResult{
		Success: true,
		Output:  execCtx.Input,
	}, nil
}

func (e *LowCodeEngine) executeEnd(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	return &NodeExecutionResult{
		Success: true,
		Output:  execCtx.Variables,
	}, nil
}

func (e *LowCodeEngine) executeFormSubmit(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	// 表单提交逻辑
	// TODO: 实现表单提交到数据接口
	return &NodeExecutionResult{
		Success: true,
		Output:  map[string]interface{}{"submitted": true},
	}, nil
}

func (e *LowCodeEngine) executeDataInterface(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	// 获取接口标识（支持 interfaceId 或 interfaceCode）
	var iface models.DataInterface

	if interfaceID, ok := config["interfaceId"].(float64); ok && interfaceID > 0 {
		// 通过 ID 查询
		if err := database.DB.Where("enabled = ?", true).First(&iface, uint(interfaceID)).Error; err != nil {
			return nil, fmt.Errorf("data interface %d not found", uint(interfaceID))
		}
	} else if interfaceCode, ok := config["interfaceCode"].(string); ok && interfaceCode != "" {
		// 通过 code/slug 查询
		if err := database.DB.Where("enabled = ? AND code = ?", true, interfaceCode).First(&iface).Error; err != nil {
			if err2 := database.DB.Where("enabled = ? AND slug = ?", true, interfaceCode).First(&iface).Error; err2 != nil {
				return nil, fmt.Errorf("data interface %q not found", interfaceCode)
			}
		}
	} else {
		return nil, fmt.Errorf("interfaceId or interfaceCode is required")
	}

	// 构造参数（从 config.params + execCtx.Variables 合并）
	params := make(map[string]interface{})
	if configParams, ok := config["params"].(map[string]interface{}); ok {
		for k, v := range configParams {
			// 支持变量引用
			if strVal, ok := v.(string); ok {
				params[k] = e.resolveVariables(execCtx, strVal)
			} else {
				params[k] = v
			}
		}
	}

	execCtx.addLog("info", node.ID, fmt.Sprintf("Calling data interface: %s (id=%d, kind=%s)", iface.Code, iface.ID, iface.Kind), params)

	// 根据接口类型执行
	var result interface{}
	var err error

	switch iface.Kind {
	case "query", "queryOne":
		// 查询接口
		result, err = e.executeQueryInterface(&iface, params)
	case "transaction":
		// 事务接口（写入操作）
		result, err = e.executeTransactionInterface(&iface, params)
	default:
		return nil, fmt.Errorf("unsupported interface kind: %s", iface.Kind)
	}

	if err != nil {
		return nil, fmt.Errorf("data interface execution failed: %w", err)
	}

	// 保存结果到变量
	if outputVar, ok := config["outputVariable"].(string); ok && outputVar != "" {
		execCtx.Variables[outputVar] = result
	}

	execCtx.addLog("info", node.ID, "Data interface executed successfully", nil)

	return &NodeExecutionResult{
		Success: true,
		Output:  result,
	}, nil
}

// executeQueryInterface 执行查询接口
func (e *LowCodeEngine) executeQueryInterface(iface *models.DataInterface, params map[string]interface{}) (interface{}, error) {
	// 加载 Dataset 和 DataSource
	var ds models.Dataset
	if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
		return nil, fmt.Errorf("dataset %d not found", iface.DatasetID)
	}

	if ds.DataSourceID == nil {
		return nil, fmt.Errorf("dataset %d has no data source", ds.ID)
	}

	var dsSrc models.DataSource
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		return nil, fmt.Errorf("data source not found")
	}

	// 使用 datastack 包的函数执行查询
	// 注意：这里需要导入 datastack 包
	rows, err := executeDatastackQuery(&dsSrc, &ds, iface, params)
	if err != nil {
		return nil, err
	}

	// queryOne 返回单个对象，query 返回数组
	if iface.Kind == "queryOne" {
		if len(rows) > 0 {
			return rows[0], nil
		}
		return nil, nil
	}

	return rows, nil
}

// executeTransactionInterface 执行事务接口（写入操作）
func (e *LowCodeEngine) executeTransactionInterface(iface *models.DataInterface, params map[string]interface{}) (interface{}, error) {
	// 加载 Dataset 和 DataSource
	var ds models.Dataset
	if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
		return nil, fmt.Errorf("dataset %d not found", iface.DatasetID)
	}

	if ds.DataSourceID == nil {
		return nil, fmt.Errorf("dataset %d has no data source", ds.ID)
	}

	var dsSrc models.DataSource
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		return nil, fmt.Errorf("data source not found")
	}

	// 执行事务操作
	affected, err := executeDatastackTransaction(&dsSrc, &ds, iface, params)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"affected": affected,
		"success":  true,
	}, nil
}

func (e *LowCodeEngine) executeOutboundConnector(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	// 获取 endpoint ID
	endpointID, ok := config["endpointId"].(float64)
	if !ok {
		return nil, fmt.Errorf("endpointId is required")
	}

	// 加载 endpoint 和 app
	var ep models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&ep, uint(endpointID)).Error; err != nil {
		return nil, fmt.Errorf("endpoint not found: %w", err)
	}

	if !ep.Enabled || ep.App == nil || !ep.App.Enabled {
		return nil, fmt.Errorf("endpoint or app is disabled")
	}

	// 构造变量映射（转换为 {{key}} 格式）
	params := make(map[string]interface{})
	if configParams, ok := config["params"].(map[string]interface{}); ok {
		for k, v := range configParams {
			// 支持变量引用
			if strVal, ok := v.(string); ok {
				params[k] = e.resolveVariables(execCtx, strVal)
			} else {
				params[k] = v
			}
		}
	}

	// 转换为 outbound 需要的格式
	sampleVars := make(map[string]string)
	for k, v := range params {
		switch val := v.(type) {
		case string:
			sampleVars["{{"+k+"}}"] = val
		default:
			b, _ := json.Marshal(val)
			sampleVars["{{"+k+"}}"] = string(b)
		}
	}

	execCtx.addLog("info", node.ID, fmt.Sprintf("Calling outbound endpoint: %s (id=%d)", ep.Name, ep.ID), params)

	// 调用 outbound 的调试执行函数
	trace, _, _, _, _, err := outbound.DebugHTTPEndpoint(database.DB, ep.App, ep, sampleVars, ep.TimeoutMS, nil)
	if err != nil {
		return nil, fmt.Errorf("outbound request failed: %w", err)
	}

	// 构造结果
	result := map[string]interface{}{
		"status":     trace.Response.Status,
		"statusCode": trace.Response.Status, // 兼容
		"body":       trace.Response.Body,
		"headers":    trace.Response.Headers,
	}

	// 保存到变量
	if outputVar, ok := config["outputVariable"].(string); ok && outputVar != "" {
		execCtx.Variables[outputVar] = result
	}

	execCtx.addLog("info", node.ID, fmt.Sprintf("Outbound response: %d", trace.Response.Status), nil)

	// 检查是否成功
	if trace.Response.Status >= 400 {
		return nil, fmt.Errorf("outbound error: %d", trace.Response.Status)
	}

	return &NodeExecutionResult{
		Success: true,
		Output:  result,
	}, nil
}

func (e *LowCodeEngine) executeCondition(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	expression, _ := config["expression"].(string)
	if expression == "" {
		return nil, fmt.Errorf("condition expression is empty")
	}

	// 解析变量
	expression = e.resolveVariables(execCtx, expression)

	// 评估表达式
	result, err := e.evaluateExpression(execCtx, expression)
	if err != nil {
		return nil, fmt.Errorf("failed to evaluate condition: %w", err)
	}

	// 确定下一个节点（true 或 false 分支）
	var nextNodes []string
	if result {
		// 找到 sourceHandle 为 "true" 的边
		nextNodes = e.getNextNodesByHandle(execCtx, node.ID, "true")
	} else {
		// 找到 sourceHandle 为 "false" 的边
		nextNodes = e.getNextNodesByHandle(execCtx, node.ID, "false")
	}

	return &NodeExecutionResult{
		Success:   true,
		Output:    result,
		NextNodes: nextNodes,
	}, nil
}

func (e *LowCodeEngine) executeLoop(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	arrayVar, _ := config["array"].(string)
	itemVar, _ := config["itemVariable"].(string)

	if itemVar == "" {
		itemVar = "item"
	}

	// 获取数组
	array := e.getVariable(execCtx, arrayVar)
	arraySlice, ok := array.([]interface{})
	if !ok {
		// 尝试从 JSON 字符串解析
		if arrayStr, ok := array.(string); ok {
			if err := json.Unmarshal([]byte(arrayStr), &arraySlice); err != nil {
				return nil, fmt.Errorf("loop array is not valid: %w", err)
			}
		} else {
			return nil, fmt.Errorf("loop array is not an array")
		}
	}

	results := make([]interface{}, 0, len(arraySlice))

	// 保存原始变量值，循环结束后恢复
	originalItemVar := execCtx.Variables[itemVar]
	originalIndexVar := execCtx.Variables["index"]
	defer func() {
		if originalItemVar != nil {
			execCtx.Variables[itemVar] = originalItemVar
		} else {
			delete(execCtx.Variables, itemVar)
		}
		if originalIndexVar != nil {
			execCtx.Variables["index"] = originalIndexVar
		} else {
			delete(execCtx.Variables, "index")
		}
	}()

	// 找到循环体的起始节点（通过 sourceHandle === "loop"）
	loopBodyNodes := e.getNextNodesByHandle(execCtx, node.ID, "loop")
	if len(loopBodyNodes) == 0 {
		// 如果没有指定 loop handle，使用默认的下一个节点
		loopBodyNodes = e.getNextNodes(execCtx, node.ID)
	}

	// 循环执行
	for i, item := range arraySlice {
		execCtx.Variables[itemVar] = item
		execCtx.Variables["index"] = i

		execCtx.addLog("info", node.ID, fmt.Sprintf("Loop iteration %d/%d", i+1, len(arraySlice)), map[string]interface{}{itemVar: item})

		// 执行循环体节点
		if len(loopBodyNodes) > 0 {
			for _, loopBodyNodeID := range loopBodyNodes {
				loopBodyNode := e.findNode(execCtx.Definition, loopBodyNodeID)
				if loopBodyNode == nil {
					continue
				}

				// 递归执行循环体
				success := e.executeNode(execCtx, loopBodyNode)
				if !success {
					return nil, fmt.Errorf("loop body execution failed at iteration %d", i)
				}

				// 收集结果（如果循环体节点有输出）
				if result, ok := execCtx.NodeResults[loopBodyNodeID]; ok {
					results = append(results, result)
				}
			}
		} else {
			// 没有循环体，只是迭代
			results = append(results, item)
		}
	}

	execCtx.addLog("info", node.ID, fmt.Sprintf("Loop completed: %d iterations", len(arraySlice)), nil)

	return &NodeExecutionResult{
		Success: true,
		Output:  results,
	}, nil
}

func (e *LowCodeEngine) executeValidation(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	rules, _ := config["rules"].([]interface{})

	errors := make([]string, 0)
	for _, rule := range rules {
		ruleMap, _ := rule.(map[string]interface{})
		field, _ := ruleMap["field"].(string)
		ruleType, _ := ruleMap["type"].(string)

		value := e.getVariable(execCtx, field)

		// 简单验证
		if ruleType == "required" && value == nil {
			errors = append(errors, fmt.Sprintf("%s is required", field))
		}
	}

	if len(errors) > 0 {
		return nil, fmt.Errorf("validation failed: %v", errors)
	}

	return &NodeExecutionResult{
		Success: true,
		Output:  map[string]interface{}{"valid": true},
	}, nil
}

func (e *LowCodeEngine) executeNavigation(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	target, _ := config["target"].(string)
	target = e.resolveVariables(execCtx, target)

	execCtx.addLog("info", node.ID, fmt.Sprintf("Navigate to: %s", target), nil)

	return &NodeExecutionResult{
		Success: true,
		Output:  map[string]interface{}{"navigated": true, "target": target},
	}, nil
}

func (e *LowCodeEngine) executeHTTP(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	url, _ := config["url"].(string)
	method, _ := config["method"].(string)
	if method == "" {
		method = "GET"
	}

	// 变量替换
	url = e.resolveVariables(execCtx, url)

	// 构建请求
	var reqBody io.Reader
	if bodyData, ok := config["body"]; ok && bodyData != nil {
		switch body := bodyData.(type) {
		case string:
			resolvedBody := e.resolveVariables(execCtx, body)
			reqBody = strings.NewReader(resolvedBody)
		case map[string]interface{}:
			jsonData, err := json.Marshal(body)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal body: %w", err)
			}
			reqBody = bytes.NewReader(jsonData)
		}
	}

	// 超时设置
	timeout := 30 * time.Second
	if timeoutMs, ok := config["timeout"].(float64); ok && timeoutMs > 0 {
		timeout = time.Duration(timeoutMs) * time.Millisecond
	}

	// 创建请求
	req, err := http.NewRequestWithContext(execCtx.Ctx, method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// 设置 headers
	if headers, ok := config["headers"].(map[string]interface{}); ok {
		for key, val := range headers {
			if strVal, ok := val.(string); ok {
				req.Header.Set(key, e.resolveVariables(execCtx, strVal))
			}
		}
	}

	// 默认 Content-Type
	if req.Header.Get("Content-Type") == "" && reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	execCtx.addLog("info", node.ID, fmt.Sprintf("HTTP %s: %s", method, url), nil)

	// 发送请求
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// 尝试解析为 JSON
	var respData interface{}
	if err := json.Unmarshal(respBody, &respData); err != nil {
		// 不是 JSON，返回字符串
		respData = string(respBody)
	}

	output := map[string]interface{}{
		"status":  resp.StatusCode,
		"headers": resp.Header,
		"data":    respData,
		"body":    string(respBody),
	}

	// 保存到变量
	if outputVar, ok := config["outputVariable"].(string); ok && outputVar != "" {
		execCtx.Variables[outputVar] = output
	}

	execCtx.addLog("info", node.ID, fmt.Sprintf("HTTP response: %d", resp.StatusCode), nil)

	// 检查状态码
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP error: %d %s", resp.StatusCode, resp.Status)
	}

	return &NodeExecutionResult{
		Success: true,
		Output:  output,
	}, nil
}

func (e *LowCodeEngine) executeCode(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	code, _ := config["code"].(string)
	if code == "" {
		return nil, fmt.Errorf("code is empty")
	}

	// 使用 goja 执行 JavaScript
	vm := goja.New()

	// 注入上下文
	vm.Set("variables", execCtx.Variables)
	vm.Set("input", execCtx.Input)
	vm.Set("nodeResults", execCtx.NodeResults)

	// 提供日志函数
	vm.Set("log", func(msg string) {
		execCtx.addLog("info", node.ID, "[Code] "+msg, nil)
	})

	// 执行代码
	val, err := vm.RunString(code)
	if err != nil {
		return nil, fmt.Errorf("code execution failed: %w", err)
	}

	return &NodeExecutionResult{
		Success: true,
		Output:  val.Export(),
	}, nil
}

func (e *LowCodeEngine) executeDelay(
	execCtx *ExecutionContext,
	node *WorkflowNodeSchema,
	config map[string]interface{},
) (*NodeExecutionResult, error) {
	duration, _ := config["duration"].(float64)
	if duration <= 0 {
		duration = 1000 // 默认 1 秒
	}

	execCtx.addLog("info", node.ID, fmt.Sprintf("Delaying for %d ms", int(duration)), nil)

	select {
	case <-time.After(time.Duration(duration) * time.Millisecond):
		return &NodeExecutionResult{
			Success: true,
			Output:  map[string]interface{}{"delayed": duration},
		}, nil
	case <-execCtx.Ctx.Done():
		return nil, fmt.Errorf("delay cancelled")
	}
}

// 辅助函数

func (e *LowCodeEngine) finishExecution(
	execCtx *ExecutionContext,
	status string,
	errorMsg string,
	output interface{},
) {
	now := time.Now()
	execCtx.CompletedAt = &now
	execCtx.Status = status

	// 序列化输出和日志
	outputJSON := "{}"
	if output != nil {
		if b, err := json.Marshal(output); err == nil {
			outputJSON = string(b)
		}
	}

	stateJSON := "{}"
	state := map[string]interface{}{
		"nodeStatuses": execCtx.NodeStatuses,
		"logs":         execCtx.Logs,
	}
	if b, err := json.Marshal(state); err == nil {
		stateJSON = string(b)
	}

	// 更新数据库
	database.DB.Model(&models.WorkflowExecution{}).
		Where("id = ?", execCtx.ExecutionID).
		Updates(map[string]interface{}{
			"status":        status,
			"completed_at":  now,
			"output_json":   outputJSON,
			"error_message": errorMsg,
			"state_json":    stateJSON,
		})

	execCtx.addLog("info", "", fmt.Sprintf("Workflow execution %s", status), nil)

	// 广播完成状态
	WSHubInstance.BroadcastCompleted(execCtx.ExecutionID, status, output)

	// 清理 WebSocket 连接
	go func() {
		time.Sleep(5 * time.Second)
		WSHubInstance.CleanupConnections(execCtx.ExecutionID)
	}()
}

func (e *LowCodeEngine) addLog(execCtx *ExecutionContext, level, nodeID, message string, data map[string]interface{}) {
	execCtx.Mu.Lock()
	defer execCtx.Mu.Unlock()

	execCtx.Logs = append(execCtx.Logs, ExecutionLog{
		Timestamp: time.Now(),
		Level:     level,
		NodeID:    nodeID,
		Message:   message,
		Data:      data,
	})
}

func (execCtx *ExecutionContext) addLog(level, nodeID, message string, data map[string]interface{}) {
	log := ExecutionLog{
		Timestamp: time.Now(),
		Level:     level,
		NodeID:    nodeID,
		Message:   message,
		Data:      data,
	}

	execCtx.Mu.Lock()
	execCtx.Logs = append(execCtx.Logs, log)
	execCtx.Mu.Unlock()

	// 广播日志
	WSHubInstance.BroadcastLog(execCtx.ExecutionID, log)
}

func (e *LowCodeEngine) getNextNodes(execCtx *ExecutionContext, nodeID string) []string {
	nextNodes := make([]string, 0)
	for _, edge := range execCtx.Definition.Edges {
		if edge.Source == nodeID {
			nextNodes = append(nextNodes, edge.Target)
		}
	}
	return nextNodes
}

func (e *LowCodeEngine) getNextNodesByHandle(execCtx *ExecutionContext, nodeID, handle string) []string {
	nextNodes := make([]string, 0)
	for _, edge := range execCtx.Definition.Edges {
		if edge.Source == nodeID && edge.SourceHandle == handle {
			nextNodes = append(nextNodes, edge.Target)
		}
	}
	return nextNodes
}

func (e *LowCodeEngine) findNode(definition *WorkflowDefinitionSchema, nodeID string) *WorkflowNodeSchema {
	for i := range definition.Nodes {
		if definition.Nodes[i].ID == nodeID {
			return &definition.Nodes[i]
		}
	}
	return nil
}

func (e *LowCodeEngine) resolveVariables(execCtx *ExecutionContext, value string) string {
	// 支持嵌套对象访问 {{user.profile.age}}
	// 使用正则表达式匹配所有 {{...}} 模式
	re := regexp.MustCompile(`\{\{([^}]+)\}\}`)

	return re.ReplaceAllStringFunc(value, func(match string) string {
		// 提取变量名（去掉 {{ 和 }}）
		varPath := match[2 : len(match)-2]
		varPath = strings.TrimSpace(varPath)

		// 处理嵌套路径 (e.g., "user.profile.age")
		parts := strings.Split(varPath, ".")

		// 从 Variables 中获取根对象
		var current interface{} = execCtx.Variables[parts[0]]
		if current == nil {
			return match // 变量不存在，保持原样
		}

		// 遍历嵌套路径
		for i := 1; i < len(parts); i++ {
			switch v := current.(type) {
			case map[string]interface{}:
				current = v[parts[i]]
			case map[interface{}]interface{}:
				current = v[parts[i]]
			default:
				// 尝试使用反射访问字段
				current = getFieldByName(current, parts[i])
			}

			if current == nil {
				return match // 路径不存在，保持原样
			}
		}

		// 转换为字符串
		return fmt.Sprintf("%v", current)
	})
}

// getFieldByName 使用反射获取字段值
func getFieldByName(obj interface{}, fieldName string) interface{} {
	v := reflect.ValueOf(obj)

	// 如果是指针，获取其指向的值
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}

	// 只处理结构体
	if v.Kind() != reflect.Struct {
		return nil
	}

	// 查找字段（支持大小写不敏感）
	field := v.FieldByNameFunc(func(name string) bool {
		return strings.EqualFold(name, fieldName)
	})

	if !field.IsValid() {
		return nil
	}

	return field.Interface()
}

func (e *LowCodeEngine) getVariable(execCtx *ExecutionContext, varName string) interface{} {
	return execCtx.Variables[varName]
}

func (e *LowCodeEngine) evaluateExpression(execCtx *ExecutionContext, expression string) (bool, error) {
	vm := goja.New()

	// 注入变量
	for key, val := range execCtx.Variables {
		vm.Set(key, val)
	}
	vm.Set("variables", execCtx.Variables)

	val, err := vm.RunString(expression)
	if err != nil {
		return false, err
	}

	result, ok := val.Export().(bool)
	if !ok {
		return false, fmt.Errorf("expression did not return boolean")
	}

	return result, nil
}

// CancelExecution 取消执行
func (e *LowCodeEngine) CancelExecution(executionID uint) error {
	e.mu.RLock()
	execCtx, exists := e.runningExecutions[executionID]
	e.mu.RUnlock()

	if !exists {
		return fmt.Errorf("execution not found")
	}

	execCtx.Cancel()
	e.finishExecution(execCtx, "cancelled", "Execution cancelled by user", nil)

	return nil
}

// GetExecutionStatus 获取执行状态
func (e *LowCodeEngine) GetExecutionStatus(executionID uint) (*ExecutionContext, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	execCtx, exists := e.runningExecutions[executionID]
	if !exists {
		return nil, fmt.Errorf("execution not found")
	}

	return execCtx, nil
}

// executeDatastackQuery 执行数据栈查询
func executeDatastackQuery(dsSrc *models.DataSource, ds *models.Dataset, iface *models.DataInterface, params map[string]interface{}) ([]map[string]interface{}, error) {
	// 使用接口的 code 或 slug
	code := iface.Code
	if code == "" {
		code = iface.Slug
	}
	if code == "" {
		return nil, fmt.Errorf("interface has no code or slug")
	}

	// 调用 datastack 的查询函数
	return datastack.InvokeDataInterfaceByCode(code, params)
}

// executeDatastackTransaction 执行数据栈事务（写入操作）
func executeDatastackTransaction(dsSrc *models.DataSource, ds *models.Dataset, iface *models.DataInterface, params map[string]interface{}) (int64, error) {
	// TODO: 实现事务接口调用
	// 需要根据 iface.Definition 中的 SQL 模板执行写入操作
	return 0, fmt.Errorf("datastack transaction not fully implemented yet")
}
