package workflow

import (
	"fmt"
	"time"
)

// DelayStepExecutor executes delay steps
type DelayStepExecutor struct{}

// NewDelayStepExecutor creates a new delay step executor
func NewDelayStepExecutor() *DelayStepExecutor {
	return &DelayStepExecutor{}
}

// Execute executes a delay step
func (e *DelayStepExecutor) Execute(step *Step, ctx *Context) (*StepResult, error) {
	startTime := time.Now()

	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	// Get delay configuration
	delayConfig, ok := step.DelayConfig.(map[string]interface{})
	if !ok {
		result.Success = false
		result.Error = "invalid delay_config"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	// Parse duration
	var duration time.Duration
	if ms, ok := delayConfig["milliseconds"].(float64); ok {
		duration = time.Duration(ms) * time.Millisecond
	} else if sec, ok := delayConfig["seconds"].(float64); ok {
		duration = time.Duration(sec) * time.Second
	} else if min, ok := delayConfig["minutes"].(float64); ok {
		duration = time.Duration(min) * time.Minute
	} else {
		result.Success = false
		result.Error = "delay duration not specified (use milliseconds, seconds, or minutes)"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	// Enforce maximum delay (10 minutes)
	maxDelay := 10 * time.Minute
	if duration > maxDelay {
		duration = maxDelay
	}

	// Execute delay
	time.Sleep(duration)

	result.Success = true
	result.Output["delayed_ms"] = duration.Milliseconds()
	result.ElapsedMS = time.Since(startTime).Milliseconds()

	return result, nil
}

// Validate validates delay step configuration
func (e *DelayStepExecutor) Validate(step *Step) error {
	if step.DelayConfig == nil {
		return fmt.Errorf("delay_config is required")
	}

	delayConfig, ok := step.DelayConfig.(map[string]interface{})
	if !ok {
		return fmt.Errorf("delay_config must be an object")
	}

	// Check if at least one duration field is present
	hasMs := delayConfig["milliseconds"] != nil
	hasSec := delayConfig["seconds"] != nil
	hasMin := delayConfig["minutes"] != nil

	if !hasMs && !hasSec && !hasMin {
		return fmt.Errorf("delay_config must specify milliseconds, seconds, or minutes")
	}

	return nil
}

// LoopStepExecutor executes loop steps
type LoopStepExecutor struct {
	executeStep func(*Step, *Context) (*StepResult, error)
}

// NewLoopStepExecutor creates a new loop step executor
func NewLoopStepExecutor(executeStepFunc func(*Step, *Context) (*StepResult, error)) *LoopStepExecutor {
	return &LoopStepExecutor{
		executeStep: executeStepFunc,
	}
}

// Execute executes a loop step
func (e *LoopStepExecutor) Execute(step *Step, ctx *Context, workflow *Workflow) (*StepResult, error) {
	startTime := time.Now()

	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	// Get loop configuration
	loopConfig, ok := step.LoopConfig.(map[string]interface{})
	if !ok {
		result.Success = false
		result.Error = "invalid loop_config"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	loopType := getStringFromMap(loopConfig, "type", "count")

	switch loopType {
	case "count":
		return e.executeCountLoop(step, loopConfig, ctx, workflow, startTime)
	case "foreach":
		return e.executeForeachLoop(step, loopConfig, ctx, workflow, startTime)
	case "while":
		return e.executeWhileLoop(step, loopConfig, ctx, workflow, startTime)
	default:
		result.Success = false
		result.Error = fmt.Sprintf("unsupported loop type: %s", loopType)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}
}

// executeCountLoop executes a count-based loop (for i = 0; i < count; i++)
func (e *LoopStepExecutor) executeCountLoop(step *Step, config map[string]interface{}, ctx *Context, workflow *Workflow, startTime time.Time) (*StepResult, error) {
	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	count := int(getFloat64FromMap(config, "count", 0))
	if count <= 0 || count > 1000 {
		result.Success = false
		result.Error = "count must be between 1 and 1000"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	iteratorVar := getStringFromMap(config, "iterator", "i")
	iterations := make([]map[string]interface{}, 0)

	for i := 0; i < count; i++ {
		// Set iterator variable
		ctx.SetVariable(iteratorVar, i)

		// Execute loop body steps
		iterResult, err := e.executeLoopBody(step, ctx, workflow)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("loop iteration %d failed: %v", i, err)
			result.Output["completed_iterations"] = i
			result.ElapsedMS = time.Since(startTime).Milliseconds()
			return result, err
		}

		iterations = append(iterations, iterResult)
	}

	result.Success = true
	result.Output["iterations"] = iterations
	result.Output["total_count"] = count
	result.ElapsedMS = time.Since(startTime).Milliseconds()

	return result, nil
}

// executeForeachLoop executes a foreach loop (for item in array)
func (e *LoopStepExecutor) executeForeachLoop(step *Step, config map[string]interface{}, ctx *Context, workflow *Workflow, startTime time.Time) (*StepResult, error) {
	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	// Get array from config or context
	var items []interface{}
	if arrayPath, ok := config["items"].(string); ok {
		// Resolve from context (e.g., "variables.user_ids")
		items = e.resolveArrayPath(arrayPath, ctx)
	} else if arr, ok := config["items"].([]interface{}); ok {
		items = arr
	}

	if len(items) == 0 {
		result.Success = true
		result.Output["iterations"] = []map[string]interface{}{}
		result.Output["total_count"] = 0
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, nil
	}

	if len(items) > 1000 {
		result.Success = false
		result.Error = "foreach items cannot exceed 1000"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	itemVar := getStringFromMap(config, "item", "item")
	indexVar := getStringFromMap(config, "index", "index")
	iterations := make([]map[string]interface{}, 0)

	for i, item := range items {
		// Set loop variables
		ctx.SetVariable(itemVar, item)
		ctx.SetVariable(indexVar, i)

		// Execute loop body steps
		iterResult, err := e.executeLoopBody(step, ctx, workflow)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("loop iteration %d failed: %v", i, err)
			result.Output["completed_iterations"] = i
			result.ElapsedMS = time.Since(startTime).Milliseconds()
			return result, err
		}

		iterations = append(iterations, iterResult)
	}

	result.Success = true
	result.Output["iterations"] = iterations
	result.Output["total_count"] = len(items)
	result.ElapsedMS = time.Since(startTime).Milliseconds()

	return result, nil
}

// executeWhileLoop executes a while loop (while condition is true)
func (e *LoopStepExecutor) executeWhileLoop(step *Step, config map[string]interface{}, ctx *Context, workflow *Workflow, startTime time.Time) (*StepResult, error) {
	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	condition := getStringFromMap(config, "condition", "")
	if condition == "" {
		result.Success = false
		result.Error = "while loop requires a condition"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	maxIterations := int(getFloat64FromMap(config, "max_iterations", 100))
	if maxIterations > 1000 {
		maxIterations = 1000
	}

	iterations := make([]map[string]interface{}, 0)
	evaluator := NewConditionEvaluator()

	for i := 0; i < maxIterations; i++ {
		// Evaluate condition
		conditionMet, err := evaluator.Evaluate(condition, ctx)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("condition evaluation failed at iteration %d: %v", i, err)
			result.Output["completed_iterations"] = i
			result.ElapsedMS = time.Since(startTime).Milliseconds()
			return result, err
		}

		if !conditionMet {
			break
		}

		// Execute loop body steps
		iterResult, err := e.executeLoopBody(step, ctx, workflow)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("loop iteration %d failed: %v", i, err)
			result.Output["completed_iterations"] = i
			result.ElapsedMS = time.Since(startTime).Milliseconds()
			return result, err
		}

		iterations = append(iterations, iterResult)
	}

	result.Success = true
	result.Output["iterations"] = iterations
	result.Output["total_count"] = len(iterations)
	result.ElapsedMS = time.Since(startTime).Milliseconds()

	return result, nil
}

// executeLoopBody executes the steps in the loop body
func (e *LoopStepExecutor) executeLoopBody(step *Step, ctx *Context, workflow *Workflow) (map[string]interface{}, error) {
	loopConfig, _ := step.LoopConfig.(map[string]interface{})
	bodySteps, _ := loopConfig["body"].([]interface{})

	iterOutput := make(map[string]interface{})

	for _, bodyStepID := range bodySteps {
		stepID, ok := bodyStepID.(string)
		if !ok {
			continue
		}

		// Find step in workflow
		var bodyStep *Step
		for i := range workflow.Steps {
			if workflow.Steps[i].ID == stepID {
				bodyStep = &workflow.Steps[i]
				break
			}
		}

		if bodyStep == nil {
			return nil, fmt.Errorf("loop body step %s not found", stepID)
		}

		// Execute body step (delegate to workflow engine)
		// This requires the executeStep callback
		if e.executeStep == nil {
			return nil, fmt.Errorf("loop executor not properly initialized")
		}

		stepResult, err := e.executeStep(bodyStep, ctx)
		if err != nil {
			return nil, err
		}

		// Collect output from this iteration
		for k, v := range stepResult.Output {
			iterOutput[k] = v
		}
	}

	return iterOutput, nil
}

// resolveArrayPath resolves an array from context path
func (e *LoopStepExecutor) resolveArrayPath(path string, ctx *Context) []interface{} {
	// Simple implementation: check common prefixes
	if len(path) > 10 && path[:10] == "variables." {
		key := path[10:]
		if val, ok := ctx.Variables[key]; ok {
			if arr, ok := val.([]interface{}); ok {
				return arr
			}
		}
	}
	if len(path) > 5 && path[:5] == "vars." {
		key := path[5:]
		if val, ok := ctx.Variables[key]; ok {
			if arr, ok := val.([]interface{}); ok {
				return arr
			}
		}
	}
	return []interface{}{}
}

// Validate validates loop step configuration
func (e *LoopStepExecutor) Validate(step *Step) error {
	if step.LoopConfig == nil {
		return fmt.Errorf("loop_config is required")
	}

	loopConfig, ok := step.LoopConfig.(map[string]interface{})
	if !ok {
		return fmt.Errorf("loop_config must be an object")
	}

	loopType := getStringFromMap(loopConfig, "type", "count")
	switch loopType {
	case "count":
		if loopConfig["count"] == nil {
			return fmt.Errorf("count loop requires 'count' field")
		}
	case "foreach":
		if loopConfig["items"] == nil {
			return fmt.Errorf("foreach loop requires 'items' field")
		}
	case "while":
		if loopConfig["condition"] == nil {
			return fmt.Errorf("while loop requires 'condition' field")
		}
	default:
		return fmt.Errorf("unsupported loop type: %s", loopType)
	}

	if loopConfig["body"] == nil {
		return fmt.Errorf("loop requires 'body' field with step IDs")
	}

	return nil
}

// getFloat64FromMap gets a float64 value from map with default
func getFloat64FromMap(m map[string]interface{}, key string, def float64) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	if v, ok := m[key].(int); ok {
		return float64(v)
	}
	return def
}
