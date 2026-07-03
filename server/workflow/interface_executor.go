package workflow

import (
	"fmt"
	"time"
)

// InterfaceStepExecutor executes interface call steps
type InterfaceStepExecutor struct {
	// Callback function to execute data interface
	// This avoids circular dependency between workflow and api packages
	ExecuteInterface func(code string, params map[string]interface{}) (map[string]interface{}, error)
}

// NewInterfaceStepExecutor creates a new interface step executor
func NewInterfaceStepExecutor(executeFunc func(string, map[string]interface{}) (map[string]interface{}, error)) *InterfaceStepExecutor {
	return &InterfaceStepExecutor{
		ExecuteInterface: executeFunc,
	}
}

// Execute executes an interface call step
func (e *InterfaceStepExecutor) Execute(step *Step, ctx *Context) (*StepResult, error) {
	startTime := time.Now()

	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	if e.ExecuteInterface == nil {
		result.Success = false
		result.Error = "interface executor not configured"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	// Prepare parameters by expanding templates
	params := make(map[string]interface{})
	for key, val := range step.Params {
		params[key] = e.expandValue(val, ctx)
	}

	// Execute the interface
	interfaceResult, err := e.ExecuteInterface(step.InterfaceCode, params)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("interface execution failed: %v", err)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}

	result.Success = true
	result.Output = interfaceResult

	// Store result in context variables
	if step.Output != nil {
		e.processOutput(step.Output, interfaceResult, ctx)
	} else {
		// Default: store entire result under step ID
		ctx.SetVariable(step.ID+"_result", interfaceResult)
	}

	result.ElapsedMS = time.Since(startTime).Milliseconds()
	return result, nil
}

// Validate validates interface step configuration
func (e *InterfaceStepExecutor) Validate(step *Step) error {
	if step.InterfaceCode == "" {
		return fmt.Errorf("interface_code is required")
	}
	return nil
}

// expandValue recursively expands template variables in values
func (e *InterfaceStepExecutor) expandValue(val interface{}, ctx *Context) interface{} {
	switch v := val.(type) {
	case string:
		return e.expandTemplate(v, ctx)
	case map[string]interface{}:
		result := make(map[string]interface{})
		for key, mapVal := range v {
			result[key] = e.expandValue(mapVal, ctx)
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(v))
		for i, arrVal := range v {
			result[i] = e.expandValue(arrVal, ctx)
		}
		return result
	default:
		return v
	}
}

// expandTemplate replaces template placeholders in a string
func (e *InterfaceStepExecutor) expandTemplate(template string, ctx *Context) interface{} {
	// Check if entire string is a single placeholder
	if len(template) > 4 && template[:2] == "{{" && template[len(template)-2:] == "}}" {
		path := template[2 : len(template)-2]
		val := e.resolvePathValue(path, ctx)
		if val != nil {
			return val
		}
	}

	// Otherwise treat as string with embedded placeholders (future enhancement)
	return template
}

// resolvePathValue resolves a dot-notation path to a value
func (e *InterfaceStepExecutor) resolvePathValue(path string, ctx *Context) interface{} {
	// Simple implementation: check common prefixes
	if len(path) > 8 && path[:8] == "request." {
		key := path[8:]
		return ctx.Request[key]
	}
	if len(path) > 10 && path[:10] == "variables." {
		key := path[10:]
		return ctx.Variables[key]
	}
	if len(path) > 5 && path[:5] == "vars." {
		key := path[5:]
		return ctx.Variables[key]
	}
	if len(path) > 4 && path[:4] == "env." {
		key := path[4:]
		return ctx.Env[key]
	}

	// Check if it's a step output reference
	if val, ok := ctx.StepOutputs[path]; ok {
		return val
	}

	return nil
}

// processOutput processes the output mapping configuration
func (e *InterfaceStepExecutor) processOutput(outputDef interface{}, interfaceResult map[string]interface{}, ctx *Context) {
	switch v := outputDef.(type) {
	case map[string]interface{}:
		for targetVar, sourcePath := range v {
			if pathStr, ok := sourcePath.(string); ok {
				val := e.extractNestedValue(interfaceResult, pathStr)
				if val != nil {
					ctx.SetVariable(targetVar, val)
				}
			}
		}
	case string:
		// Simple form: store entire result under this variable name
		ctx.SetVariable(v, interfaceResult)
	}
}

// extractNestedValue extracts a value from nested map using dot notation
func (e *InterfaceStepExecutor) extractNestedValue(data map[string]interface{}, path string) interface{} {
	keys := splitPath(path)
	current := interface{}(data)

	for _, key := range keys {
		if m, ok := current.(map[string]interface{}); ok {
			current = m[key]
		} else {
			return nil
		}
	}

	return current
}

// splitPath splits a dot-notation path into keys
func splitPath(path string) []string {
	result := make([]string, 0)
	current := ""

	for _, ch := range path {
		if ch == '.' {
			if current != "" {
				result = append(result, current)
				current = ""
			}
		} else {
			current += string(ch)
		}
	}

	if current != "" {
		result = append(result, current)
	}

	return result
}
