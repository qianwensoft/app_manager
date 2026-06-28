package workflow

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/dop251/goja"
)

// evaluateCondition 评估条件表达式。
// 支持模板变量和 JavaScript 表达式。
// 示例：
//   - {{ctx.count}} > 0
//   - {{workOrder.status}} == "pending"
//   - {{ctx.enabled}} == true && {{workOrder.priority}} == "high"
func (e *Engine) evaluateCondition(ctx *WorkflowContext, condition string) (bool, error) {
	if strings.TrimSpace(condition) == "" {
		return true, nil
	}

	// 展开模板变量
	expanded := expandStringWithContext(condition, ctx)

	// 使用 goja 执行 JavaScript 表达式
	vm := goja.New()

	// 设置上下文
	vm.Set("workOrder", ctx.WorkOrder)
	vm.Set("ctx", ctx.Variables)
	vm.Set("actions", ctx.ActionResults)

	// 执行表达式
	val, err := vm.RunString(expanded)
	if err != nil {
		return false, fmt.Errorf("条件表达式执行失败: %w (表达式: %s)", err, expanded)
	}

	// 转换为布尔值
	result, ok := val.Export().(bool)
	if !ok {
		// 尝试转换其他类型
		switch v := val.Export().(type) {
		case int64:
			result = v != 0
		case float64:
			result = v != 0
		case string:
			result = v != "" && v != "false" && v != "0"
		case nil:
			result = false
		default:
			return false, fmt.Errorf("条件表达式返回值不是布尔类型: %T (表达式: %s)", val.Export(), expanded)
		}
	}

	return result, nil
}

// expandStringWithContext 展开字符串中的模板变量。
func expandStringWithContext(s string, ctx *WorkflowContext) string {
	// 替换 {{workOrder.field}}
	if ctx.WorkOrder != nil {
		s = strings.ReplaceAll(s, "{{workOrder.id}}", strconv.FormatUint(uint64(ctx.WorkOrder.ID), 10))
		s = strings.ReplaceAll(s, "{{workOrder.code}}", ctx.WorkOrder.Code)
		s = strings.ReplaceAll(s, "{{workOrder.title}}", ctx.WorkOrder.Title)
		s = strings.ReplaceAll(s, "{{workOrder.description}}", ctx.WorkOrder.Description)
		s = strings.ReplaceAll(s, "{{workOrder.status}}", ctx.WorkOrder.Status)
		s = strings.ReplaceAll(s, "{{workOrder.priority}}", ctx.WorkOrder.Priority)
		s = strings.ReplaceAll(s, "{{workOrder.type_code}}", ctx.WorkOrder.TypeCode)
		s = strings.ReplaceAll(s, "{{workOrder.device_id}}", strconv.FormatUint(uint64(ctx.WorkOrder.DeviceID), 10))
		if ctx.WorkOrder.AssignedTo != nil {
			s = strings.ReplaceAll(s, "{{workOrder.assigned_to}}", strconv.FormatUint(uint64(*ctx.WorkOrder.AssignedTo), 10))
		}
		s = strings.ReplaceAll(s, "{{workOrder.other_codes}}", ctx.WorkOrder.OtherCodes)
		s = strings.ReplaceAll(s, "{{workOrder.business_no}}", ctx.WorkOrder.BusinessNo)
		s = strings.ReplaceAll(s, "{{workOrder.external_ref}}", ctx.WorkOrder.ExternalRef)
		s = strings.ReplaceAll(s, "{{workOrder.visibility}}", ctx.WorkOrder.Visibility)
	}

	// 替换 {{ctx.variable}}
	for key, val := range ctx.Variables {
		placeholder := "{{ctx." + key + "}}"
		var replacement string
		switch v := val.(type) {
		case string:
			replacement = v
		case int, int64, uint, uint64, float64:
			replacement = fmt.Sprintf("%v", v)
		case bool:
			replacement = strconv.FormatBool(v)
		default:
			// 复杂类型转为 JSON 字符串
			replacement = fmt.Sprintf("%v", v)
		}
		s = strings.ReplaceAll(s, placeholder, replacement)
	}

	// 替换 {{actions[i].result}}
	for i, action := range ctx.ActionResults {
		placeholder := fmt.Sprintf("{{actions[%d].result}}", i)
		if action.Result != nil {
			var replacement string
			switch v := action.Result.(type) {
			case string:
				replacement = v
			default:
				replacement = fmt.Sprintf("%v", v)
			}
			s = strings.ReplaceAll(s, placeholder, replacement)
		}
	}

	return s
}
