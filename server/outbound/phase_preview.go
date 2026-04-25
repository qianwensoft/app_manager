package outbound

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"app-manager/models"

	"gorm.io/gorm"
)

// PhaseContextPreviewOptions 阶段 context 预览可选行为。
type PhaseContextPreviewOptions struct {
	// ExecuteLiveHTTP 为 true 且 HTTP 步已选 endpoint_id 时，对该步发起真实 HTTP（不写 outbound_deliveries）；未选接口的步骤仍为模拟 JSON。
	ExecuteLiveHTTP bool
	// Connector 可选；用于真实请求时的默认超时/重试；nil 则使用内置默认。
	Connector *models.OutboundConnector
}

func previewEffectiveConnector(c *models.OutboundConnector) models.OutboundConnector {
	if c == nil {
		return models.OutboundConnector{DefaultTimeoutMS: 15000, DefaultRetryMax: 0}
	}
	out := *c
	if out.DefaultTimeoutMS <= 0 {
		out.DefaultTimeoutMS = 15000
	}
	return out
}

// PhasePreviewBaseline 与连接器编辑「模板展开」一致的 Demo 占位符起点 + 合成设备事件（与 PostOutboundTemplateExpand 对齐后再 MergeStepEventDataToContext 由各步自行处理）。
func PhasePreviewBaseline(overrides map[string]string) (vars map[string]string, rec models.DeviceEvent) {
	vars = DefaultDebugTemplateVars(overrides)
	MergeHTTPResponseContext(vars, 42, 200, []byte(`{"ok":true,"message":"上一步 HTTP 响应示例（步骤表 id=42，多步时由引擎注入）"}`))
	rec = syntheticDeviceEvent(vars)
	return vars, rec
}

func cloneStringStringMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func previewStepTableID(phaseIdx, stepIdx int) uint {
	return uint(910000 + phaseIdx*1000 + stepIdx)
}

func fakeHTTPPreviewBody(phaseIdx, stepIdx int, endpointID uint) []byte {
	s := fmt.Sprintf(`{"_phase_preview":true,"preview_phase":%d,"preview_step_index":%d,"endpoint_id":%d}`, phaseIdx, stepIdx, endpointID)
	return []byte(s)
}

func runDryHTTPMerges(db *gorm.DB, vars map[string]string, st models.OutboundConnectorStep, phaseIdx, stepIdx int) error {
	if NormalizeOutboundStepType(st.StepType) != "http" {
		return nil
	}
	body := fakeHTTPPreviewBody(phaseIdx, stepIdx, st.EndpointID)
	sid := previewStepTableID(phaseIdx, stepIdx)
	if app, ok := tryLoadOutboundAppForEndpoint(db, st.EndpointID); ok {
		// 与 ExecuteHTTPWebhook、接口调试共用：先按步配置合并 2xx 响应与 context，再跑 after_response
		return mergeHTTPResponseIntoVarsAndRunAfterResponse(vars, app, st, sid, 200, body, nil, false, true)
	}
	MergeHTTPResponseContext(vars, sid, 200, body)
	MergeHTTPResponseBodyToContext(vars, st, body)
	return nil
}

// PhaseStepPreviewResult 本阶段内单步预览摘要（非真实投递）。
type PhaseStepPreviewResult struct {
	StepIndex             int    `json:"step_index"`
	StepType              string `json:"step_type"`
	EndpointID            uint   `json:"endpoint_id,omitempty"`
	ContextMergeBefore    string `json:"context_merge_before,omitempty"`
	ContextMergeAfterHTTP string `json:"context_merge_after,omitempty"`
	SimulatedResponseBody string `json:"simulated_response_body,omitempty"`
	PreviewStepTableID    uint   `json:"preview_step_table_id,omitempty"`
	Summary               string `json:"summary"`
	Status                string `json:"status"`
	LiveHTTP              bool   `json:"live_http,omitempty"`
}

func buildStepPreviewResult(st models.OutboundConnectorStep, phaseIdx, stepIdx int) PhaseStepPreviewResult {
	typ := NormalizeOutboundStepType(st.StepType)
	before := ContextMergeBefore(st.ConfigJSON)
	afterH := ContextMergeAfterHTTP(st.ConfigJSON)
	sid := previewStepTableID(phaseIdx, stepIdx)
	res := PhaseStepPreviewResult{
		StepIndex:             stepIdx + 1,
		StepType:              typ,
		EndpointID:            st.EndpointID,
		ContextMergeBefore:    before,
		ContextMergeAfterHTTP: afterH,
		Status:                "simulated_ok",
	}
	var parts []string
	switch typ {
	case "http":
		res.PreviewStepTableID = sid
		bodyStr := string(fakeHTTPPreviewBody(phaseIdx, stepIdx, st.EndpointID))
		if len(bodyStr) > 240 {
			res.SimulatedResponseBody = bodyStr[:240] + "…"
		} else {
			res.SimulatedResponseBody = bodyStr
		}
		if before == ContextMergeEventDataJSON {
			parts = append(parts, "执行前：已将 device_event.event_data 展平合并到 {{context.*}}（若 event_data 为合法 JSON）")
		} else {
			parts = append(parts, "执行前：未合并 event_data 到 context")
		}
		parts = append(parts, fmt.Sprintf("模拟 HTTP 200（预览用步骤表 id=%d），已更新 {{http.last.*}} / {{http.step.%d.*}}", sid, sid))
		if afterH == ContextMergeHTTPResponseJSON {
			parts = append(parts, "执行后：已将模拟响应 JSON 展平写入 {{context.*}}")
		} else {
			parts = append(parts, "执行后：未将响应 body 写入 context（与表单「执行后」一致）")
		}
	case "app_script":
		if before == ContextMergeEventDataJSON {
			parts = append(parts, "执行前：event_data→context 已按配置处理")
		}
		parts = append(parts, "预览不执行设备端脚本；无 HTTP 响应可写入 context")
	case "view_url", "message", "broadcast_intent":
		if before == ContextMergeEventDataJSON {
			parts = append(parts, "执行前：event_data→context 已按配置处理")
		} else {
			parts = append(parts, "执行前：未合并 event_data 到 context")
		}
		parts = append(parts, "本类型无 HTTP 2xx JSON；不产生执行后 context 注入")
	default:
		parts = append(parts, "已按配置合并执行前占位符；无额外 HTTP 模拟")
	}
	res.Summary = strings.Join(parts, "。")
	return res
}

func runLiveHTTPStep(db *gorm.DB, connector models.OutboundConnector, vars map[string]string, rec models.DeviceEvent, st models.OutboundConnectorStep, phaseIdx, stepIdx int) (PhaseStepPreviewResult, error) {
	MergeStepEventDataToContext(vars, st, rec)
	MergeStepTemplateParamsFromConfigJSON(vars, st.ConfigJSON)
	res := buildStepPreviewResult(st, phaseIdx, stepIdx)
	res.LiveHTTP = true
	var ep models.OutboundEndpoint
	if err := db.Preload("App").First(&ep, st.EndpointID).Error; err != nil {
		res.Status = "failed"
		res.Summary = fmt.Sprintf("真实 HTTP：未找到接口 #%d。", st.EndpointID)
		return res, fmt.Errorf("真实 HTTP：接口不存在: %w", err)
	}
	if ep.App == nil || !ep.Enabled || !ep.App.Enabled {
		res.Status = "failed"
		res.Summary = "真实 HTTP：接口或应用未启用。"
		return res, fmt.Errorf("真实 HTTP：接口或应用未启用")
	}
	sid := previewStepTableID(phaseIdx, stepIdx)
	meta := StepExecutionMeta{PhaseID: 0, StepID: sid, StepType: "http"}
	d := ExecuteHTTPWebhook(db, connector, ep, ep.App, rec, nil, nil, vars, meta, true, st, &HTTPExecOpts{SkipPersistDelivery: true})
	res.Status = d.Status
	const maxLen = 900
	detail := d.DetailJSON
	if len(detail) > maxLen {
		res.SimulatedResponseBody = detail[:maxLen] + "…"
	} else {
		res.SimulatedResponseBody = detail
	}
	parts := []string{fmt.Sprintf("真实 HTTP：%s", d.Status)}
	if d.RequestURL != "" {
		parts = append(parts, "URL："+d.RequestURL)
	}
	if d.HTTPStatus > 0 {
		parts = append(parts, fmt.Sprintf("HTTP %d", d.HTTPStatus))
	}
	if d.DurationMS > 0 {
		parts = append(parts, fmt.Sprintf("耗时 %dms", d.DurationMS))
	}
	if d.Error != "" {
		parts = append(parts, "错误："+truncateErr(d.Error, 400))
	} else {
		parts = append(parts, "已合并响应到变量表（含 before_request 与 2xx 后 after_response，与真实出站一致）。")
	}
	res.Summary = strings.Join(parts, "。")
	return res, nil
}

func runDryStep(db *gorm.DB, connector models.OutboundConnector, runLiveHTTP bool, vars map[string]string, rec models.DeviceEvent, st models.OutboundConnectorStep, phaseIdx, stepIdx int) (PhaseStepPreviewResult, error) {
	if runLiveHTTP && db != nil && NormalizeOutboundStepType(st.StepType) == "http" && st.EndpointID > 0 {
		return runLiveHTTPStep(db, connector, vars, rec, st, phaseIdx, stepIdx)
	}
	MergeStepEventDataToContext(vars, st, rec)
	MergeStepTemplateParamsFromConfigJSON(vars, st.ConfigJSON)
	res := buildStepPreviewResult(st, phaseIdx, stepIdx)
	if err := runDryHTTPMerges(db, vars, st, phaseIdx, stepIdx); err != nil {
		return res, err
	}
	if NormalizeOutboundStepType(st.StepType) == "http" && db != nil && st.EndpointID > 0 {
		res.Summary += "。已按真实出站逻辑执行该接口所属应用的 after_response 扩展脚本（若已配置）。"
	}
	return res, nil
}

// PhasePreviewWire 阶段预览用的内存结构（由 ParsePhasePreviewWires 从 JSON 解析）。
type PhasePreviewWire struct {
	RunMode       string
	DefaultParams map[string]string
	Steps         []models.OutboundConnectorStep
}

// runOnePreviewPhase 在 vars 上模拟执行一个阶段；executeLiveHTTP 时已选 endpoint 的 HTTP 步发起真实请求（不写投递表）。
// stepResults 非 nil 时，向其中追加本阶段各步的 PhaseStepPreviewResult（仅用于当前测试阶段展示）。
func runOnePreviewPhase(db *gorm.DB, connector models.OutboundConnector, executeLiveHTTP bool, vars map[string]string, rec models.DeviceEvent, phase PhasePreviewWire, phaseIdx int, stepResults *[]PhaseStepPreviewResult) error {
	mode := strings.TrimSpace(phase.RunMode)
	if mode == "" {
		mode = "parallel"
	}
	MergeStringStringMapIntoVars(vars, phase.DefaultParams)

	collect := func(st models.OutboundConnectorStep, stepIdx int) error {
		r, err := runDryStep(db, connector, executeLiveHTTP, vars, rec, st, phaseIdx, stepIdx)
		if stepResults != nil {
			*stepResults = append(*stepResults, r)
		}
		return err
	}

	switch mode {
	case "parallel":
		// 预览：在共享 vars 上顺序模拟各步（真实 parallel 多步时各 goroutine 用克隆表，结束后再按步序合并 HTTP；此处为近似，便于看 context 累积）。
		for i, st := range phase.Steps {
			if err := collect(st, i); err != nil {
				return err
			}
		}
	case "sequential":
		for i, st := range phase.Steps {
			if err := collect(st, i); err != nil {
				return err
			}
		}
	case "failover":
		for i, st := range phase.Steps {
			if err := collect(st, i); err != nil {
				return err
			}
			if NormalizeOutboundStepType(st.StepType) == "http" {
				break
			}
		}
	default:
		for i, st := range phase.Steps {
			if err := collect(st, i); err != nil {
				return err
			}
		}
	}
	return nil
}

// PhaseContextPreviewResult 阶段测试：进入该阶段前 / 该阶段执行后的占位符表，以及仅 context.* 键便于查看「执行后写入 context」。
type PhaseContextPreviewResult struct {
	Before           map[string]string        `json:"execution_template_before_phase"`
	After            map[string]string        `json:"execution_template_after_phase"`
	ContextAfter     []kvPair                 `json:"context_after"`
	ContextBefore    []kvPair                 `json:"context_before"`
	ContextAddedKeys []string                 `json:"context_added_keys"`
	StepResults      []PhaseStepPreviewResult `json:"step_results"`
	Note             string                   `json:"note"`
}

type kvPair struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func contextKeyPairs(m map[string]string) []kvPair {
	if m == nil {
		return nil
	}
	var keys []string
	for k := range m {
		if strings.HasPrefix(k, "{{context.") {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	out := make([]kvPair, 0, len(keys))
	for _, k := range keys {
		out = append(out, kvPair{Key: k, Value: m[k]})
	}
	return out
}

func contextKeySet(m map[string]string) map[string]struct{} {
	s := make(map[string]struct{})
	if m == nil {
		return s
	}
	for k := range m {
		if strings.HasPrefix(k, "{{context.") {
			s[k] = struct{}{}
		}
	}
	return s
}

// RunPhaseContextPreview 使用 Demo 设备事件，依次模拟 phase_index 之前的各阶段，再模拟目标阶段。
// opts.ExecuteLiveHTTP 且 HTTP 步已选 endpoint_id 时发起真实 HTTP（不写 outbound_deliveries）；否则 HTTP 步用固定 JSON 模拟 2xx。
// db 非 nil 时，模拟路径下在合并响应后会执行 after_response；db 为 nil 时跳过脚本（仅单元测试等场景）。
func RunPhaseContextPreview(db *gorm.DB, phaseIndex int, phases []PhasePreviewWire, overrides map[string]string, opts *PhaseContextPreviewOptions) (*PhaseContextPreviewResult, error) {
	if phaseIndex < 0 {
		return nil, fmt.Errorf("phase_index 无效")
	}
	if len(phases) == 0 {
		return nil, fmt.Errorf("phases 不能为空")
	}
	if phaseIndex >= len(phases) {
		return nil, fmt.Errorf("phase_index 超出阶段数量")
	}
	conn := previewEffectiveConnector(nil)
	live := false
	if opts != nil {
		if opts.Connector != nil {
			conn = previewEffectiveConnector(opts.Connector)
		}
		live = opts.ExecuteLiveHTTP
	}
	vars, rec := PhasePreviewBaseline(overrides)
	for pi := 0; pi < phaseIndex; pi++ {
		if err := runOnePreviewPhase(db, conn, live, vars, rec, phases[pi], pi, nil); err != nil {
			return nil, err
		}
	}
	before := cloneStringStringMap(vars)
	var stepResults []PhaseStepPreviewResult
	if err := runOnePreviewPhase(db, conn, live, vars, rec, phases[phaseIndex], phaseIndex, &stepResults); err != nil {
		return nil, err
	}
	after := cloneStringStringMap(vars)

	beforeCtx := contextKeySet(before)
	afterPairs := contextKeyPairs(after)
	var added []string
	for _, p := range afterPairs {
		if _, ok := beforeCtx[p.Key]; !ok {
			added = append(added, p.Key)
		}
	}
	note := "HTTP 步骤：未选接口或关闭真实请求时，使用固定模拟 2xx JSON；若开启真实请求且已选 endpoint，则发起真实 HTTP（不写 outbound_deliveries），并与「接口调试」、真实出站共用 before_request / 合并 / after_response 逻辑。模拟路径下若可加载应用，合并模拟体后也会执行 after_response。阶段为 parallel 时预览在共享表上顺序处理各步；真实引擎多步并行使用分支克隆后再合并 HTTP。应用脚本/消息等步仅合并 event_data 与 template_params，不产生远程 JSON。"
	if live {
		note = "已开启真实 HTTP：凡已选择接口的 HTTP 步骤将请求外网（不写投递日志）；未选接口的步骤仍为模拟 JSON。" + note
	}
	return &PhaseContextPreviewResult{
		Before:           before,
		After:            after,
		ContextAfter:     afterPairs,
		ContextBefore:    contextKeyPairs(before),
		ContextAddedKeys: added,
		StepResults:      stepResults,
		Note:             note,
	}, nil
}

// ParsePhasePreviewWires 将 API JSON 阶段列表转为内部结构（与保存连接器时 phases 形状一致）。
func ParsePhasePreviewWires(raw []json.RawMessage) ([]PhasePreviewWire, error) {
	out := make([]PhasePreviewWire, 0, len(raw))
	for _, rb := range raw {
		var m map[string]interface{}
		if err := json.Unmarshal(rb, &m); err != nil {
			return nil, err
		}
		var w PhasePreviewWire
		if v, ok := m["run_mode"].(string); ok {
			w.RunMode = v
		}
		if dp, ok := m["default_params"].(map[string]interface{}); ok && dp != nil {
			w.DefaultParams = make(map[string]string, len(dp))
			for k, v := range dp {
				w.DefaultParams[strings.TrimSpace(k)] = strings.TrimSpace(fmt.Sprint(v))
			}
		}
		stepsRaw, ok := m["steps"].([]interface{})
		if !ok {
			out = append(out, w)
			continue
		}
		for _, s := range stepsRaw {
			sb, err := json.Marshal(s)
			if err != nil {
				return nil, err
			}
			st, err := parsePreviewStep(sb)
			if err != nil {
				return nil, err
			}
			w.Steps = append(w.Steps, st)
		}
		out = append(out, w)
	}
	return out, nil
}

func parsePreviewStep(raw []byte) (models.OutboundConnectorStep, error) {
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return models.OutboundConnectorStep{}, err
	}
	typ, _ := m["step_type"].(string)
	st := models.OutboundConnectorStep{StepType: strings.TrimSpace(typ)}
	if v, ok := m["endpoint_id"]; ok {
		st.EndpointID = jsonUintFlexible(v)
	}
	if cfg, ok := m["config"]; ok && cfg != nil {
		b, err := json.Marshal(cfg)
		if err != nil {
			return models.OutboundConnectorStep{}, err
		}
		st.ConfigJSON = string(b)
	} else {
		st.ConfigJSON = "{}"
	}
	return st, nil
}

func jsonUintFlexible(v interface{}) uint {
	switch t := v.(type) {
	case float64:
		if t < 0 {
			return 0
		}
		return uint(t)
	case json.Number:
		u64, err := strconv.ParseUint(t.String(), 10, 64)
		if err != nil {
			return 0
		}
		return uint(u64)
	case string:
		var u uint64
		_, _ = fmt.Sscan(t, &u)
		return uint(u)
	default:
		return 0
	}
}
