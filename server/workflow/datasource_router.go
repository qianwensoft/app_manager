package workflow

import (
	"fmt"

	"app-manager/models"
)

// DatasourceRouter handles dynamic datasource routing
type DatasourceRouter struct{}

// NewDatasourceRouter creates a new datasource router
func NewDatasourceRouter() *DatasourceRouter {
	return &DatasourceRouter{}
}

// Route determines which datasource to use based on routing configuration
func (r *DatasourceRouter) Route(routing *DatasourceRouting, ctx *Context) (string, error) {
	if routing == nil {
		return "", fmt.Errorf("datasource routing configuration is nil")
	}

	switch routing.Type {
	case "static":
		// Static routing: use the default datasource
		if routing.Default == "" {
			return "", fmt.Errorf("default datasource not specified")
		}
		return routing.Default, nil

	case "rules":
		// Rule-based routing: evaluate conditions sequentially
		return r.routeByRules(routing.Rules, routing.Default, ctx)

	case "script":
		// Script-based routing: execute JavaScript to determine datasource
		return r.routeByScript(routing.Engine, routing.Code, routing.Default, ctx)

	default:
		return "", fmt.Errorf("unsupported routing type: %s", routing.Type)
	}
}

// routeByRules evaluates routing rules sequentially and returns the first match
func (r *DatasourceRouter) routeByRules(rules []RoutingRule, defaultDS string, ctx *Context) (string, error) {
	if len(rules) == 0 {
		if defaultDS == "" {
			return "", fmt.Errorf("no routing rules and no default datasource")
		}
		return defaultDS, nil
	}

	evaluator := NewConditionEvaluator()

	for _, rule := range rules {
		matched, err := evaluator.Evaluate(rule.Condition, ctx)
		if err != nil {
			// Log warning but continue to next rule
			fmt.Printf("Warning: rule condition evaluation failed: %v\n", err)
			continue
		}

		if matched {
			return rule.Datasource, nil
		}
	}

	// No rule matched, use default
	if defaultDS == "" {
		return "", fmt.Errorf("no routing rule matched and no default datasource")
	}
	return defaultDS, nil
}

// routeByScript executes a script to determine the datasource
func (r *DatasourceRouter) routeByScript(engine, code, defaultDS string, ctx *Context) (string, error) {
	if engine != "javascript" && engine != "js" {
		return "", fmt.Errorf("unsupported script engine: %s (only javascript is supported)", engine)
	}

	evaluator := NewConditionEvaluator()

	// Set up VM with context
	evaluator.vm.Set("request", ctx.Request)
	evaluator.vm.Set("variables", ctx.Variables)
	evaluator.vm.Set("vars", ctx.Variables)
	evaluator.vm.Set("step_outputs", ctx.StepOutputs)
	evaluator.vm.Set("env", ctx.Env)

	// Execute script
	result, err := evaluator.vm.RunString(code)
	if err != nil {
		return "", fmt.Errorf("datasource routing script execution failed: %w", err)
	}

	// Extract datasource alias from result
	datasource := result.String()
	if datasource == "" || datasource == "undefined" {
		if defaultDS == "" {
			return "", fmt.Errorf("script returned empty datasource and no default specified")
		}
		return defaultDS, nil
	}

	return datasource, nil
}

// ResolveDatasource resolves the datasource for a step based on routing configuration
func ResolveDatasource(step *Step, ctx *Context) (*models.DataSource, error) {
	var datasourceAlias string
	var err error

	if step.DatasourceRouting != nil {
		// Use dynamic routing
		router := NewDatasourceRouter()
		datasourceAlias, err = router.Route(step.DatasourceRouting, ctx)
		if err != nil {
			return nil, fmt.Errorf("datasource routing failed: %w", err)
		}
	} else {
		// Use static datasource from step definition
		datasourceAlias = step.Datasource
	}

	if datasourceAlias == "" {
		return nil, fmt.Errorf("datasource not specified")
	}

	// Lookup datasource in context
	ds, ok := ctx.Datasources[datasourceAlias]
	if !ok {
		return nil, fmt.Errorf("datasource %s not found in context", datasourceAlias)
	}

	return ds, nil
}
