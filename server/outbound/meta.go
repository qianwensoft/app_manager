package outbound

// StepExecutionMeta 写入 outbound_deliveries 时关联阶段与步骤。
type StepExecutionMeta struct {
	PhaseID  uint
	StepID   uint
	StepType string
}
