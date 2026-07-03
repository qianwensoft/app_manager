package workflow

// StepExecutor 步骤执行器接口
type StepExecutor interface {
	// Execute 执行步骤
	Execute(step *Step, ctx *Context) (*StepResult, error)

	// Validate 验证步骤配置
	Validate(step *Step) error
}
