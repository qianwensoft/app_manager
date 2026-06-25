package outbound

import (
	"testing"

	"app-manager/models"
)

// 构造一个接口模式连接器：入参 seed 进 context，HTTP 步（无 endpoint）走模拟 2xx，
// 验证逐步 context 快照、新增键采集与最终 vars 还原。
func TestRunInterfaceDebug_SeedsParamsAndTracksSteps(t *testing.T) {
	connector := &models.OutboundConnector{
		InterfaceMode: true,
		InterfaceCode: "check_emp",
	}
	phases := []PhasePreviewWire{
		{
			RunMode: "sequential",
			Steps: []models.OutboundConnectorStep{
				// 该 HTTP 步无 endpoint，预览引擎用固定模拟体并把响应写入 context。
				{StepType: "http", ConfigJSON: `{"context_merge_after":"http_response_json"}`},
			},
		},
		{
			RunMode: "sequential",
			Steps: []models.OutboundConnectorStep{
				{StepType: "message", ConfigJSON: `{"body":"hi {{context.employee_id}}"}`},
			},
		},
	}
	params := map[string]interface{}{"employee_id": "E001", "department": "IT"}

	res, finalVars, err := RunInterfaceDebug(nil, connector, phases, params, false)
	if err != nil {
		t.Fatal(err)
	}
	if res.PhaseCount != 2 {
		t.Fatalf("phase_count = %d, want 2", res.PhaseCount)
	}
	if res.StepCount != 2 || len(res.Steps) != 2 {
		t.Fatalf("step_count=%d steps=%d, want 2/2", res.StepCount, len(res.Steps))
	}

	// 入参应在初始 context 中。
	foundEmp := false
	for _, p := range res.InitialContext {
		if p.Key == "{{context.employee_id}}" && p.Value == "E001" {
			foundEmp = true
		}
	}
	if !foundEmp {
		t.Fatalf("initial_context missing seeded employee_id: %+v", res.InitialContext)
	}

	// 第一步（HTTP 模拟）应新增 {{context._phase_preview}} 之类键。
	if len(res.Steps[0].AddedKeys) == 0 {
		t.Fatalf("step 0 expected added context keys, got none; context_after=%+v", res.Steps[0].ContextAfter)
	}

	// finalVars 应仍含入参键，供输出映射还原。
	if finalVars["{{context.department}}"] != "IT" {
		t.Fatalf("finalVars missing department: %q", finalVars["{{context.department}}"])
	}
	if res.Steps[1].PhaseIndex != 1 {
		t.Fatalf("step 1 phase_index = %d, want 1", res.Steps[1].PhaseIndex)
	}
}
