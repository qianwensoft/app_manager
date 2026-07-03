package workflow

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"app-manager/dbdriver"
)

// SQLStepExecutor executes SQL steps
type SQLStepExecutor struct {
	tx *sql.Tx
}

// NewSQLStepExecutor creates a new SQL step executor
func NewSQLStepExecutor(tx *sql.Tx) *SQLStepExecutor {
	return &SQLStepExecutor{tx: tx}
}

// Execute executes a SQL step
func (e *SQLStepExecutor) Execute(step *Step, ctx *Context) (*StepResult, error) {
	startTime := time.Now()

	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	// Resolve datasource (supports dynamic routing)
	datasource, err := ResolveDatasource(step, ctx)
	if err != nil {
		result.Success = false
		result.Error = err.Error()
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}

	result.Datasource = step.Datasource
	result.SQL = step.SQL

	sqlStr, args, err := e.replaceNamedParams(datasource.Type, step.SQL, ctx)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("parameter replacement failed: %v", err)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}

	var sqlResult sql.Result
	var execErr error

	if e.tx != nil {
		sqlResult, execErr = e.tx.Exec(sqlStr, args...)
	} else {
		db, err := dbdriver.OpenDataSource(datasource)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("failed to open datasource: %v", err)
			result.ElapsedMS = time.Since(startTime).Milliseconds()
			return result, err
		}
		defer db.Close()

		sqlResult, execErr = db.Exec(sqlStr, args...)
	}

	if execErr != nil {
		result.Success = false
		result.Error = fmt.Sprintf("SQL execution failed: %v", execErr)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, execErr
	}

	affectedRows, _ := sqlResult.RowsAffected()
	lastInsertID, _ := sqlResult.LastInsertId()

	result.AffectedRows = affectedRows
	result.LastInsertID = lastInsertID
	result.Success = true
	result.ElapsedMS = time.Since(startTime).Milliseconds()

	if step.ExpectAffectedRows != nil && affectedRows != int64(*step.ExpectAffectedRows) {
		result.Success = false
		result.Error = fmt.Sprintf("expected %d affected rows, got %d", *step.ExpectAffectedRows, affectedRows)
		return result, fmt.Errorf(result.Error)
	}

	if step.Output != nil {
		e.processOutput(step.Output, result, ctx)
	}

	return result, nil
}

// Validate validates SQL step configuration
func (e *SQLStepExecutor) Validate(step *Step) error {
	if step.Datasource == "" {
		return fmt.Errorf("datasource is required")
	}
	if step.SQL == "" {
		return fmt.Errorf("sql is required")
	}
	return nil
}

func (e *SQLStepExecutor) replaceNamedParams(dbType, sqlStr string, ctx *Context) (string, []interface{}, error) {
	params := extractNamedParams(sqlStr)
	args := make([]interface{}, 0, len(params))
	replacedSQL := sqlStr

	for _, paramName := range params {
		value, err := e.resolveParamValue(paramName, ctx)
		if err != nil {
			return "", nil, err
		}

		args = append(args, value)

		placeholder := "?"
		if dbType == "postgres" || dbType == "postgresql" {
			placeholder = fmt.Sprintf("$%d", len(args))
		}

		replacedSQL = strings.Replace(replacedSQL, ":"+paramName, placeholder, 1)
	}

	return replacedSQL, args, nil
}

func extractNamedParams(sqlStr string) []string {
	var params []string
	inParam := false
	paramStart := 0

	for i, c := range sqlStr {
		if c == ':' && (i == 0 || sqlStr[i-1] != ':') {
			inParam = true
			paramStart = i + 1
		} else if inParam && !isParamChar(c) {
			if i > paramStart {
				params = append(params, sqlStr[paramStart:i])
			}
			inParam = false
		}
	}

	if inParam && paramStart < len(sqlStr) {
		params = append(params, sqlStr[paramStart:])
	}

	return params
}

func isParamChar(c rune) bool {
	return (c >= 'a' && c <= 'z') ||
		(c >= 'A' && c <= 'Z') ||
		(c >= '0' && c <= '9') ||
		c == '_' || c == '.'
}

func (e *SQLStepExecutor) resolveParamValue(paramName string, ctx *Context) (interface{}, error) {
	parts := strings.Split(paramName, ".")

	if len(parts) == 1 {
		if val, ok := ctx.Request[paramName]; ok {
			return val, nil
		}
		if val, ok := ctx.Variables[paramName]; ok {
			return val, nil
		}
		return nil, fmt.Errorf("parameter %s not found", paramName)
	}

	scope := parts[0]
	path := parts[1:]

	var source map[string]interface{}
	switch scope {
	case "request":
		source = ctx.Request
	case "variables", "vars":
		source = ctx.Variables
	case "env":
		source = ctx.Env
	default:
		if output, ok := ctx.StepOutputs[scope]; ok {
			if outputMap, ok := output.(map[string]interface{}); ok {
				source = outputMap
			}
		}
	}

	if source == nil {
		return nil, fmt.Errorf("parameter scope %s not found", scope)
	}

	current := interface{}(source)
	for _, key := range path {
		if m, ok := current.(map[string]interface{}); ok {
			current = m[key]
		} else {
			return nil, fmt.Errorf("cannot resolve path %s", paramName)
		}
	}

	if current == nil {
		return nil, fmt.Errorf("parameter %s is nil", paramName)
	}

	return current, nil
}

func (e *SQLStepExecutor) processOutput(outputDef interface{}, result *StepResult, ctx *Context) {
	switch v := outputDef.(type) {
	case map[string]interface{}:
		for key, val := range v {
			if strVal, ok := val.(string); ok {
				if strings.HasPrefix(strVal, "{{") && strings.HasSuffix(strVal, "}}") {
					tmpl := strings.TrimSpace(strVal[2 : len(strVal)-2])
					switch tmpl {
					case "last_insert_id":
						result.Output[key] = result.LastInsertID
						ctx.SetVariable(key, result.LastInsertID)
					case "affected_rows":
						result.Output[key] = result.AffectedRows
						ctx.SetVariable(key, result.AffectedRows)
					}
				}
			}
		}
	case string:
		result.Output[v] = result.LastInsertID
		ctx.SetVariable(v, result.LastInsertID)
	}
}
