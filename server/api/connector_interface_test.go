package api

import (
	"encoding/json"
	"testing"
)

func TestConnectorInterfaceContextMapping(t *testing.T) {
	// 测试参数映射到 context
	params := map[string]interface{}{
		"employee_id": "12345",
		"name":        "张三",
		"status":      "active",
	}

	ctx := &connectorExecutionContext{
		vars:    make(map[string]interface{}),
		context: make(map[string]interface{}),
	}

	// 模拟参数映射逻辑
	for k, v := range params {
		ctx.context[k] = v
		ctx.vars["context."+k] = v
		ctx.vars[k] = v
	}

	// 验证可以通过多种方式访问
	if ctx.vars["employee_id"] != "12345" {
		t.Errorf("Expected employee_id to be 12345, got %v", ctx.vars["employee_id"])
	}
	if ctx.vars["context.employee_id"] != "12345" {
		t.Errorf("Expected context.employee_id to be 12345, got %v", ctx.vars["context.employee_id"])
	}
	if ctx.context["employee_id"] != "12345" {
		t.Errorf("Expected context map employee_id to be 12345, got %v", ctx.context["employee_id"])
	}

	t.Logf("Context vars: %+v", ctx.vars)
	t.Logf("Context map: %+v", ctx.context)
}

func TestHTTPParamsExtraction(t *testing.T) {
	// 模拟从 HTTP 请求中提取参数
	queryParams := map[string][]string{
		"id":     {"123"},
		"status": {"active"},
		"tags":   {"tag1", "tag2"},
	}

	bodyParams := map[string]interface{}{
		"name":        "测试",
		"description": "这是描述",
		"status":      "pending", // 会覆盖 query 中的 status
	}

	// 合并参数
	params := make(map[string]interface{})

	// 1. Query params
	for k, v := range queryParams {
		if len(v) == 1 {
			params[k] = v[0]
		} else {
			params[k] = v
		}
	}

	// 2. Body params (覆盖同名 query)
	for k, v := range bodyParams {
		params[k] = v
	}

	// 验证合并结果
	if params["id"] != "123" {
		t.Errorf("Expected id to be 123, got %v", params["id"])
	}
	if params["status"] != "pending" {
		t.Errorf("Expected status to be pending (from body), got %v", params["status"])
	}
	if params["name"] != "测试" {
		t.Errorf("Expected name to be 测试, got %v", params["name"])
	}

	tags, ok := params["tags"].([]string)
	if !ok || len(tags) != 2 {
		t.Errorf("Expected tags to be [tag1, tag2], got %v", params["tags"])
	}

	jsonBytes, _ := json.MarshalIndent(params, "", "  ")
	t.Logf("Merged params:\n%s", string(jsonBytes))
}

func TestContextPlaceholderUsage(t *testing.T) {
	// 模拟在步骤中使用占位符的场景
	params := map[string]interface{}{
		"employee_id":   "E001",
		"employee_name": "李四",
		"department":    "IT",
	}

	ctx := &connectorExecutionContext{
		vars:    make(map[string]interface{}),
		context: make(map[string]interface{}),
	}

	// 映射参数
	for k, v := range params {
		ctx.context[k] = v
		ctx.vars["context."+k] = v
		ctx.vars[k] = v
	}

	// 添加 HTTP 相关变量
	ctx.vars["http.method"] = "GET"
	ctx.vars["http.path"] = "/api/connector-interfaces/check_employee/invoke"
	ctx.vars["http.query"] = "employee_id=E001"

	// 模拟模板字符串
	templates := []string{
		"{{employee_id}}",
		"{{context.employee_name}}",
		"{{department}}",
		"{{http.method}}",
	}

	// 简单的占位符替换（实际会用模板引擎）
	for _, tpl := range templates {
		key := tpl[2 : len(tpl)-2] // 去掉 {{ 和 }}
		if val, ok := ctx.vars[key]; ok {
			t.Logf("Template: %s -> %v", tpl, val)
		} else {
			t.Errorf("Template: %s -> NOT FOUND", tpl)
		}
	}
}
