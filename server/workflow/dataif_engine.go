package workflow

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"

	"gorm.io/gorm"
)

// DataIfEngine is the data interface workflow execution engine
type DataIfEngine struct {
	db *gorm.DB
	// InterfaceExecutor is a callback to execute data interfaces (set by api package to avoid circular dependency)
	InterfaceExecutor func(code string, params map[string]interface{}) (map[string]interface{}, error)
	// AsyncExecutor for async step execution
	asyncExecutor *AsyncExecutor
}

// NewDataIfEngine creates a new data interface workflow engine
func NewDataIfEngine(db *gorm.DB) *DataIfEngine {
	return &DataIfEngine{
		db:            db,
		asyncExecutor: GetAsyncExecutor(),
	}
}

// Execute executes a workflow
func (e *DataIfEngine) Execute(iface *models.DataInterface, params map[string]interface{}) (*WorkflowResult, error) {
	startTime := time.Now()

	// Parse workflow definition
	workflow, err := e.parseWorkflow(iface.WorkflowJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to parse workflow: %w", err)
	}

	// Parse datasources configuration
	datasources, err := e.parseDatasources(iface.DatasourcesJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to parse datasources: %w", err)
	}

	// Create execution context
	requestID := generateRequestID()
	ctx := NewContext(
		requestID,
		iface.Code,
		iface.ID,
		params,
	)

	// Load datasources into context
	for alias, dsConfig := range datasources {
		var ds models.DataSource
		if err := e.db.First(&ds, dsConfig.DataSourceID).Error; err != nil {
			return nil, fmt.Errorf("datasource %s not found: %w", alias, err)
		}
		ctx.Datasources[alias] = &ds
	}

	// Initialize transaction manager
	txMgr := NewTransactionManager()
	defer txMgr.RollbackAll() // Ensure cleanup on panic or early return

	// Start transactions for transaction groups
	if workflow.Transactions != nil {
		for groupID, txConfig := range workflow.Transactions {
			ds, ok := ctx.Datasources[txConfig.Datasource]
			if !ok {
				return nil, fmt.Errorf("datasource %s not found for transaction group %s", txConfig.Datasource, groupID)
			}
			if err := txMgr.Begin(groupID, ds, txConfig.Isolation); err != nil {
				return nil, fmt.Errorf("failed to start transaction group %s: %w", groupID, err)
			}
		}
	}

	// Execute workflow
	result := &WorkflowResult{
		RequestID:  requestID,
		TotalSteps: len(workflow.Steps),
		StepLogs:   make([]StepResult, 0),
	}

	for i := range workflow.Steps {
		step := &workflow.Steps[i]

		// Check if step should be executed asynchronously
		if step.Async {
			// Execute step asynchronously (fire and forget)
			asyncTask := e.asyncExecutor.ExecuteAsync(
				requestID,
				step.ID,
				func() (*StepResult, error) {
					return e.executeStepWithRetry(step, ctx, workflow, txMgr)
				},
			)

			// Create a placeholder result for async step
			asyncResult := &StepResult{
				StepID:    step.ID,
				Type:      step.Type,
				Label:     step.Label,
				StartTime: asyncTask.StartTime,
				Success:   true,
				Output: map[string]interface{}{
					"async":       true,
					"task_status": asyncTask.Status,
					"request_id":  requestID,
				},
			}
			result.StepLogs = append(result.StepLogs, *asyncResult)
			result.CompletedSteps++
			continue
		}

		// Execute step synchronously with retry support
		stepResult, err := e.executeStepWithRetry(step, ctx, workflow, txMgr)
		result.StepLogs = append(result.StepLogs, *stepResult)
		result.CompletedSteps++

		if err != nil {
			result.Status = "failed"
			result.FailedStepID = step.ID
			result.ErrorMessage = err.Error()
			result.ElapsedMS = time.Since(startTime).Milliseconds()

			// Rollback all transactions on failure
			txMgr.RollbackAll()

			// Try compensation
			if workflow.ErrorHandling != nil && workflow.ErrorHandling.Strategy == "compensate" {
				compStartTime := time.Now()
				if compErr := e.compensate(workflow, result, ctx); compErr != nil {
					result.ErrorMessage += fmt.Sprintf("; compensation failed: %v", compErr)
				} else {
					result.Compensated = true
					result.Status = "compensated"
				}
				result.CompensationMS = time.Since(compStartTime).Milliseconds()
			}

			return result, err
		}
	}

	// Commit all transactions on success
	if err := txMgr.CommitAll(); err != nil {
		result.Status = "failed"
		result.ErrorMessage = fmt.Sprintf("transaction commit failed: %v", err)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}

	result.Status = "success"
	result.ElapsedMS = time.Since(startTime).Milliseconds()
	result.FinalOutput = ctx.Variables

	return result, nil
}

func (e *DataIfEngine) executeStepWithRetry(step *Step, ctx *Context, workflow *Workflow, txMgr *TransactionManager) (*StepResult, error) {
	// Wrap execute function for retry
	executeFunc := func() (*StepResult, error) {
		return e.executeStep(step, ctx, workflow, txMgr)
	}

	// Use retry executor if retry is configured
	return ExecuteWithRetry(step, executeFunc)
}

func (e *DataIfEngine) executeStep(step *Step, ctx *Context, workflow *Workflow, txMgr *TransactionManager) (*StepResult, error) {
	switch step.Type {
	case "sql":
		return e.executeSQLStep(step, ctx, workflow, txMgr)
	case "condition":
		return e.executeConditionStep(step, ctx, workflow, txMgr)
	case "http":
		return e.executeHTTPStep(step, ctx)
	case "script":
		return e.executeScriptStep(step, ctx)
	case "interface":
		return e.executeInterfaceStep(step, ctx)
	case "delay":
		return e.executeDelayStep(step, ctx)
	case "loop":
		return e.executeLoopStep(step, ctx, workflow, txMgr)
	default:
		return nil, fmt.Errorf("unsupported step type: %s", step.Type)
	}
}

func (e *DataIfEngine) executeSQLStep(step *Step, ctx *Context, workflow *Workflow, txMgr *TransactionManager) (*StepResult, error) {
	// Check if this step is part of a transaction group
	var tx *sql.Tx
	if step.TransactionGroup != "" {
		tx = txMgr.GetTransaction(step.TransactionGroup)
		if tx == nil {
			return nil, fmt.Errorf("transaction group %s not found", step.TransactionGroup)
		}
	}

	executor := NewSQLStepExecutor(tx)

	if err := executor.Validate(step); err != nil {
		return nil, fmt.Errorf("step validation failed: %w", err)
	}

	result, err := executor.Execute(step, ctx)
	if err != nil {
		return result, err
	}

	// Store step output in context
	if result.Success {
		ctx.SetStepOutput(step.ID, result.Output)
	}

	return result, nil
}

func (e *DataIfEngine) executeConditionStep(step *Step, ctx *Context, workflow *Workflow, txMgr *TransactionManager) (*StepResult, error) {
	startTime := time.Now()

	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Success:   true,
		Output:    make(map[string]interface{}),
	}

	// Evaluate condition expression
	conditionResult := e.evaluateCondition(step.Expression, ctx)

	// Determine which branch to take
	var branchSteps []string
	if conditionResult {
		branchSteps = step.Then
		result.BranchTaken = "then"
	} else {
		branchSteps = step.Else
		result.BranchTaken = "else"
	}

	// Execute branch steps
	for _, stepID := range branchSteps {
		branchStep := e.findStepByID(workflow, stepID)
		if branchStep == nil {
			return nil, fmt.Errorf("branch step %s not found", stepID)
		}

		_, err := e.executeStep(branchStep, ctx, workflow, txMgr)
		if err != nil {
			return result, err
		}
	}

	result.ElapsedMS = time.Since(startTime).Milliseconds()
	return result, nil
}

func (e *DataIfEngine) evaluateCondition(expression string, ctx *Context) bool {
	result, err := EvaluateCondition(expression, ctx)
	if err != nil {
		// Log error and return false
		fmt.Printf("Condition evaluation error: %v\n", err)
		return false
	}
	return result
}

func (e *DataIfEngine) findStepByID(workflow *Workflow, stepID string) *Step {
	for i := range workflow.Steps {
		if workflow.Steps[i].ID == stepID {
			return &workflow.Steps[i]
		}
	}
	return nil
}

func (e *DataIfEngine) compensate(workflow *Workflow, result *WorkflowResult, ctx *Context) error {
	if workflow.ErrorHandling == nil {
		return nil
	}

	// Execute compensation steps in reverse order
	for i := len(workflow.ErrorHandling.CompensationSteps) - 1; i >= 0; i-- {
		compStep := &workflow.ErrorHandling.CompensationSteps[i]

		// Only compensate for completed steps
		shouldCompensate := false
		for _, stepLog := range result.StepLogs {
			if stepLog.StepID == compStep.ForStep && stepLog.Success {
				shouldCompensate = true
				break
			}
		}

		if !shouldCompensate {
			continue
		}

		if compStep.Type == "sql" {
			if err := e.compensateSQL(compStep, ctx); err != nil {
				return err
			}
		}
	}

	return nil
}

func (e *DataIfEngine) compensateSQL(compStep *CompensationStep, ctx *Context) error {
	datasource, ok := ctx.Datasources[compStep.Datasource]
	if !ok {
		return fmt.Errorf("datasource %s not found", compStep.Datasource)
	}

	db, err := dbdriver.OpenDataSource(datasource)
	if err != nil {
		return err
	}
	defer db.Close()

	// Replace parameters in compensation SQL
	executor := NewSQLStepExecutor(nil)
	sql, args, err := executor.replaceNamedParams(datasource.Type, compStep.SQL, ctx)
	if err != nil {
		return err
	}

	_, err = db.Exec(sql, args...)
	return err
}

func (e *DataIfEngine) executeHTTPStep(step *Step, ctx *Context) (*StepResult, error) {
	executor := NewHTTPStepExecutor(30 * time.Second)

	if err := executor.Validate(step); err != nil {
		return nil, fmt.Errorf("step validation failed: %w", err)
	}

	result, err := executor.Execute(step, ctx)
	if err != nil {
		return result, err
	}

	// Store step output in context
	if result.Success {
		ctx.SetStepOutput(step.ID, result.Output)
	}

	return result, nil
}

func (e *DataIfEngine) executeScriptStep(step *Step, ctx *Context) (*StepResult, error) {
	executor := NewScriptStepExecutor()

	if err := executor.Validate(step); err != nil {
		return nil, fmt.Errorf("step validation failed: %w", err)
	}

	result, err := executor.Execute(step, ctx)
	if err != nil {
		return result, err
	}

	// Store step output in context
	if result.Success {
		ctx.SetStepOutput(step.ID, result.Output)
	}

	return result, nil
}

func (e *DataIfEngine) executeInterfaceStep(step *Step, ctx *Context) (*StepResult, error) {
	executor := NewInterfaceStepExecutor(e.InterfaceExecutor)

	if err := executor.Validate(step); err != nil {
		return nil, fmt.Errorf("step validation failed: %w", err)
	}

	result, err := executor.Execute(step, ctx)
	if err != nil {
		return result, err
	}

	// Store step output in context
	if result.Success {
		ctx.SetStepOutput(step.ID, result.Output)
	}

	return result, nil
}

func (e *DataIfEngine) executeDelayStep(step *Step, ctx *Context) (*StepResult, error) {
	executor := NewDelayStepExecutor()

	if err := executor.Validate(step); err != nil {
		return nil, fmt.Errorf("step validation failed: %w", err)
	}

	result, err := executor.Execute(step, ctx)
	if err != nil {
		return result, err
	}

	// Store step output in context
	if result.Success {
		ctx.SetStepOutput(step.ID, result.Output)
	}

	return result, nil
}

func (e *DataIfEngine) executeLoopStep(step *Step, ctx *Context, workflow *Workflow, txMgr *TransactionManager) (*StepResult, error) {
	// Create a wrapper function that loop executor can call
	executeStepFunc := func(bodyStep *Step, loopCtx *Context) (*StepResult, error) {
		return e.executeStep(bodyStep, loopCtx, workflow, txMgr)
	}

	executor := NewLoopStepExecutor(executeStepFunc)

	if err := executor.Validate(step); err != nil {
		return nil, fmt.Errorf("step validation failed: %w", err)
	}

	result, err := executor.Execute(step, ctx, workflow)
	if err != nil {
		return result, err
	}

	// Store step output in context
	if result.Success {
		ctx.SetStepOutput(step.ID, result.Output)
	}

	return result, nil
}

func (e *DataIfEngine) parseWorkflow(workflowJSON string) (*Workflow, error) {
	if workflowJSON == "" {
		return nil, fmt.Errorf("workflow_json is empty")
	}

	var workflow Workflow
	if err := json.Unmarshal([]byte(workflowJSON), &workflow); err != nil {
		return nil, err
	}

	return &workflow, nil
}

func (e *DataIfEngine) parseDatasources(datasourcesJSON string) (map[string]*DatasourceConfig, error) {
	if datasourcesJSON == "" {
		return nil, fmt.Errorf("datasources_json is empty")
	}

	var config struct {
		Datasources []DatasourceConfig `json:"datasources"`
	}

	if err := json.Unmarshal([]byte(datasourcesJSON), &config); err != nil {
		return nil, err
	}

	result := make(map[string]*DatasourceConfig)
	for i := range config.Datasources {
		ds := &config.Datasources[i]
		result[ds.Alias] = ds
	}

	return result, nil
}

// DatasourceConfig datasource configuration
type DatasourceConfig struct {
	Alias        string `json:"alias"`
	DataSourceID uint   `json:"data_source_id"`
	Description  string `json:"description,omitempty"`
}

func generateRequestID() string {
	return fmt.Sprintf("req_%d", time.Now().UnixNano())
}

// DefaultDataIfEngine is the default data interface workflow engine instance
var DefaultDataIfEngine = NewDataIfEngine(database.DB)
