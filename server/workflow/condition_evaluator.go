package workflow

import (
	"fmt"

	"github.com/dop251/goja"
)

// ConditionEvaluator evaluates condition expressions
type ConditionEvaluator struct {
	vm *goja.Runtime
}

// NewConditionEvaluator creates a new condition evaluator
func NewConditionEvaluator() *ConditionEvaluator {
	return &ConditionEvaluator{
		vm: goja.New(),
	}
}

// Evaluate evaluates a condition expression against the context
func (e *ConditionEvaluator) Evaluate(expression string, ctx *Context) (bool, error) {
	if expression == "" {
		return true, nil
	}

	// Prepare VM with context
	e.vm.Set("request", ctx.Request)
	e.vm.Set("variables", ctx.Variables)
	e.vm.Set("vars", ctx.Variables)
	e.vm.Set("step_outputs", ctx.StepOutputs)
	e.vm.Set("env", ctx.Env)

	// Add helper functions
	e.vm.Set("has", func(obj map[string]interface{}, key string) bool {
		_, exists := obj[key]
		return exists
	})

	e.vm.Set("get", func(obj map[string]interface{}, key string, defaultValue interface{}) interface{} {
		if val, exists := obj[key]; exists {
			return val
		}
		return defaultValue
	})

	e.vm.Set("isEmpty", func(val interface{}) bool {
		if val == nil {
			return true
		}
		switch v := val.(type) {
		case string:
			return v == ""
		case []interface{}:
			return len(v) == 0
		case map[string]interface{}:
			return len(v) == 0
		}
		return false
	})

	// Execute expression
	result, err := e.vm.RunString(expression)
	if err != nil {
		return false, fmt.Errorf("expression evaluation failed: %w", err)
	}

	// Convert result to boolean
	boolResult := result.ToBoolean()
	return boolResult, nil
}

// EvaluateCondition evaluates condition expression for workflow steps
func EvaluateCondition(expression string, ctx *Context) (bool, error) {
	evaluator := NewConditionEvaluator()
	return evaluator.Evaluate(expression, ctx)
}
