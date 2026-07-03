package workflow

import (
	"fmt"
	"time"

	"github.com/dop251/goja"
)

// ScriptStepExecutor executes script steps
type ScriptStepExecutor struct{}

// NewScriptStepExecutor creates a new script step executor
func NewScriptStepExecutor() *ScriptStepExecutor {
	return &ScriptStepExecutor{}
}

// Execute executes a script step
func (e *ScriptStepExecutor) Execute(step *Step, ctx *Context) (*StepResult, error) {
	startTime := time.Now()

	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	// Validate engine
	engine := step.Engine
	if engine == "" {
		engine = "javascript"
	}

	if engine != "javascript" && engine != "js" {
		result.Success = false
		result.Error = fmt.Sprintf("unsupported script engine: %s", engine)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	// Execute JavaScript
	scriptResult, err := e.executeJavaScript(step.Code, ctx)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("script execution failed: %v", err)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}

	result.Success = true
	result.Output["result"] = scriptResult

	// Store result in context
	if scriptResult != nil {
		// If result is a map, merge into variables
		if resultMap, ok := scriptResult.(map[string]interface{}); ok {
			for key, val := range resultMap {
				ctx.SetVariable(key, val)
			}
		} else {
			// Otherwise store as single variable
			ctx.SetVariable("script_result", scriptResult)
		}
	}

	result.ElapsedMS = time.Since(startTime).Milliseconds()
	return result, nil
}

// Validate validates script step configuration
func (e *ScriptStepExecutor) Validate(step *Step) error {
	if step.Code == "" {
		return fmt.Errorf("code is required")
	}

	engine := step.Engine
	if engine == "" {
		engine = "javascript"
	}

	if engine != "javascript" && engine != "js" {
		return fmt.Errorf("unsupported script engine: %s (only javascript is supported)", engine)
	}

	return nil
}

// executeJavaScript executes JavaScript code with context
func (e *ScriptStepExecutor) executeJavaScript(code string, ctx *Context) (interface{}, error) {
	vm := goja.New()

	// Inject context into VM
	vm.Set("request", ctx.Request)
	vm.Set("variables", ctx.Variables)
	vm.Set("vars", ctx.Variables)
	vm.Set("step_outputs", ctx.StepOutputs)
	vm.Set("env", ctx.Env)

	// Create a mutable context object
	ctxObj := vm.NewObject()
	for k, v := range ctx.Variables {
		ctxObj.Set(k, v)
	}
	vm.Set("ctx", ctxObj)

	// Provide utility functions
	vm.Set("setVariable", func(key string, val interface{}) {
		ctx.SetVariable(key, val)
		ctxObj.Set(key, val)
	})

	vm.Set("getVariable", func(key string) interface{} {
		return ctx.Variables[key]
	})

	vm.Set("log", func(args ...interface{}) {
		fmt.Printf("[Script] %v\n", args)
	})

	// String utilities
	vm.Set("toUpperCase", func(str string) string {
		return fmt.Sprintf("%s", str)
	})

	vm.Set("toLowerCase", func(str string) string {
		return fmt.Sprintf("%s", str)
	})

	// Math utilities
	vm.Set("round", func(num float64) int {
		return int(num + 0.5)
	})

	// Array utilities
	vm.Set("sum", func(arr []interface{}) float64 {
		total := 0.0
		for _, v := range arr {
			if num, ok := v.(float64); ok {
				total += num
			} else if num, ok := v.(int); ok {
				total += float64(num)
			}
		}
		return total
	})

	vm.Set("max", func(arr []interface{}) float64 {
		if len(arr) == 0 {
			return 0
		}
		max := 0.0
		first := true
		for _, v := range arr {
			var num float64
			if n, ok := v.(float64); ok {
				num = n
			} else if n, ok := v.(int); ok {
				num = float64(n)
			} else {
				continue
			}
			if first || num > max {
				max = num
				first = false
			}
		}
		return max
	})

	vm.Set("min", func(arr []interface{}) float64 {
		if len(arr) == 0 {
			return 0
		}
		min := 0.0
		first := true
		for _, v := range arr {
			var num float64
			if n, ok := v.(float64); ok {
				num = n
			} else if n, ok := v.(int); ok {
				num = float64(n)
			} else {
				continue
			}
			if first || num < min {
				min = num
				first = false
			}
		}
		return min
	})

	// Execute the script
	value, err := vm.RunString(code)
	if err != nil {
		return nil, err
	}

	// Sync context variables back from ctxObj
	if ctxObj != nil {
		for _, key := range ctxObj.Keys() {
			val := ctxObj.Get(key)
			if val != nil {
				ctx.Variables[key] = val.Export()
			}
		}
	}

	if value != nil {
		return value.Export(), nil
	}

	return nil, nil
}
