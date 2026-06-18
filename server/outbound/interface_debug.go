package outbound

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

// InterfaceDebugStepTrace 接口模式全流程调试：单步执行后的 context 快照与摘要。
type InterfaceDebugStepTrace struct {
	PhaseIndex   int      `json:"phase_index"` // 0-based
	StepIndex    int      `json:"step_index"`  // 1-based（沿用 PhaseStepPreviewResult）
	StepType     string   `json:"step_type"`
	EndpointID   uint     `json:"endpoint_id,omitempty"`
	Status       string   `json:"status"`
	Summary      string   `json:"summary"`
	LiveHTTP     bool     `json:"live_http,omitempty"`
	ContextAfter []kvPair `json:"context_after"` // 该步执行后全部 {{context.*}}
	AddedKeys    []string `json:"added_keys"`    // 相对上一步新增/变化的 context 键
	ResponseBody string   `json:"response_body,omitempty"`
}

// InterfaceDebugResult 全流程调试结果。Output 由 API 层应用 output_mappings 后填入。
type InterfaceDebugResult struct {
	Steps          []InterfaceDebugStepTrace `json:"steps"`
	PhaseCount     int                       `json:"phase_count"`
	StepCount      int                       `json:"step_count"`
	InitialContext []kvPair                  `json:"initial_context"` // 入参 seed 后、执行前
	FinalContext   []kvPair                  `json:"final_context"`
	Output         map[string]interface{}    `json:"output"`
	Note           string                    `json:"note"`
}

// seedInterfaceDebugContext 以 Demo 占位符为底，叠加接口入参（{{k}} 与 {{context.k}} 双写）、
// 入参 Schema 默认值，以及 HTTP/系统变量，构成接口模式执行前的初始 vars。
func seedInterfaceDebugContext(connector *models.OutboundConnector, params map[string]interface{}) (map[string]string, models.DeviceEvent) {
	vars, rec := PhasePreviewBaseline(nil)

	// 入参 Schema 默认值兜底（实际入参优先，故后写实际值）。
	if connector != nil && strings.TrimSpace(connector.InputParamsJSON) != "" {
		SeedContextFromSchema(vars, connector.InputParamsJSON)
	}

	// 实际入参：同时支持 {{param}} 与 {{context.param}}（与 executeConnectorInterface 双写一致）。
	for k, v := range params {
		key := strings.TrimSpace(k)
		if key == "" || strings.HasPrefix(key, "_http_") {
			continue
		}
		sv := fmt.Sprint(v)
		vars["{{"+key+"}}"] = sv
		vars["{{context."+key+"}}"] = sv
	}

	// HTTP 信息（若入参里带了 _http_*）。
	if m, ok := params["_http_method"].(string); ok && m != "" {
		vars["{{http.method}}"] = m
	} else if _, exists := vars["{{http.method}}"]; !exists {
		vars["{{http.method}}"] = "POST"
	}
	if p, ok := params["_http_path"].(string); ok && p != "" {
		vars["{{http.path}}"] = p
	}
	if q, ok := params["_http_query"].(string); ok && q != "" {
		vars["{{http.query}}"] = q
	}

	// 系统变量。
	now := time.Now()
	vars["{{timestamp}}"] = fmt.Sprint(now.Unix())
	vars["{{timestamp_ms}}"] = fmt.Sprint(now.UnixMilli())

	return vars, rec
}

func contextKeyStringMap(m map[string]string) map[string]string {
	out := make(map[string]string)
	if m == nil {
		return out
	}
	for k, v := range m {
		if strings.HasPrefix(k, "{{context.") {
			out[k] = v
		}
	}
	return out
}

// RunInterfaceDebug 以接口入参 seed context，按阶段顺序端到端执行连接器各步，
// 逐步采集 {{context.*}} 快照与新增键。executeLiveHTTP 为 true 时，已选 endpoint 的
// HTTP 步发起真实请求（不写 outbound_deliveries）；否则用固定模拟 2xx JSON。
// 返回结果中的 Output 留空，由调用方按 output_mappings 填充；同时返回执行结束后的全量 vars。
func RunInterfaceDebug(db *gorm.DB, connector *models.OutboundConnector, phases []PhasePreviewWire, params map[string]interface{}, executeLiveHTTP bool) (*InterfaceDebugResult, map[string]string, error) {
	if len(phases) == 0 {
		return nil, nil, fmt.Errorf("phases 不能为空")
	}
	conn := previewEffectiveConnector(connector)

	vars, rec := seedInterfaceDebugContext(connector, params)

	res := &InterfaceDebugResult{
		PhaseCount:     len(phases),
		InitialContext: contextKeyPairs(vars),
		Steps:          []InterfaceDebugStepTrace{},
	}

	// 逐步快照：用上一份 context 键集做 diff，得出每步新增/变化的键。
	prevCtx := contextKeyStringMap(vars)
	for pi := range phases {
		phaseIdx := pi
		onStep := func(stepIdx int, r PhaseStepPreviewResult) {
			afterPairs := contextKeyPairs(vars)
			var added []string
			for _, p := range afterPairs {
				if old, ok := prevCtx[p.Key]; !ok || old != p.Value {
					added = append(added, p.Key)
				}
			}
			sort.Strings(added)
			res.Steps = append(res.Steps, InterfaceDebugStepTrace{
				PhaseIndex:   phaseIdx,
				StepIndex:    r.StepIndex,
				StepType:     r.StepType,
				EndpointID:   r.EndpointID,
				Status:       r.Status,
				Summary:      r.Summary,
				LiveHTTP:     r.LiveHTTP,
				ContextAfter: afterPairs,
				AddedKeys:    added,
				ResponseBody: r.SimulatedResponseBody,
			})
			res.StepCount++
			prevCtx = contextKeyStringMap(vars)
		}
		if err := runOnePreviewPhase(db, conn, executeLiveHTTP, vars, rec, phases[pi], pi, nil, onStep); err != nil {
			return nil, nil, err
		}
	}

	res.FinalContext = contextKeyPairs(vars)
	res.Note = "调试执行与「阶段测试」共用预览引擎：已选接口的 HTTP 步在开启真实请求时发起真实 HTTP（不写投递日志），否则使用固定模拟 2xx JSON；数据接口/应用脚本等步骤在预览引擎中为近似处理。context 以接口入参 seed（{{param}} 与 {{context.param}} 双写）。"
	if executeLiveHTTP {
		res.Note = "已开启真实 HTTP：已选接口的 HTTP 步将请求外网（不写投递日志）。" + res.Note
	}
	return res, vars, nil
}
