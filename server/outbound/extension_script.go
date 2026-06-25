package outbound

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"app-manager/models"

	"github.com/dop251/goja"
)

const (
	defaultExtensionScriptTimeoutMS = 800
	maxExtensionScriptTimeoutMS     = 5000
	maxExtensionScriptCodeBytes     = 128 * 1024
	maxScriptResponseBodyArg        = maxHTTPResponseContextBody
	maxExtensionScriptsPerPhase     = 20
)

// scriptHookEntry 单条扩展脚本（同一阶段内按顺序执行；标记 default 的条目排在最前）。
type scriptHookEntry struct {
	Name      string `json:"name"`
	Enabled   bool   `json:"enabled"`
	Default   bool   `json:"default"`
	Code      string `json:"code"`
	TimeoutMS int    `json:"timeout_ms"`
}

// extensionScriptsPlan 解析后的扩展脚本配置（含旧版单对象兼容）。
type extensionScriptsPlan struct {
	Before []scriptHookEntry
	After  []scriptHookEntry
}

// ScriptEnv 单次请求前后传给扩展脚本的上下文（before：改模板与 vars；after：读 HTTP 结果并改 vars）。
type ScriptEnv struct {
	BodyTemplate *string
	RespStatus   int
	RespBody     string
	// after_response 阶段脚本写入，调用方读回；非 nil 表示脚本主动修改了值。
	OutRespStatus *int    // 非 nil 表示脚本修改了响应状态码
	OutRespBody   *string // 非 nil 表示脚本修改了响应体
}

// AppScriptHook 连接器「应用脚本」步骤或扩展脚本阶段。
type AppScriptHook string

const (
	AppScriptHookBeforeRequest AppScriptHook = "before_request"
	AppScriptHookAfterResponse AppScriptHook = "after_response"
)

// NormalizeAppScriptHook 归一化连接器 config.hook；默认 before_request。
func NormalizeAppScriptHook(s string) AppScriptHook {
	switch strings.TrimSpace(strings.ToLower(s)) {
	case "after_response":
		return AppScriptHookAfterResponse
	default:
		return AppScriptHookBeforeRequest
	}
}

// ParseExtensionScriptsPlan 解析 outbound_apps.extension_scripts_json。
// 支持 version 2：before_request / after_response 为数组；兼容旧版二者为单对象。
func ParseExtensionScriptsPlan(raw string) extensionScriptsPlan {
	var p extensionScriptsPlan
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" {
		return p
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &root); err != nil {
		return p
	}
	if b, ok := root["before_request"]; ok {
		p.Before = decodeHookPhaseList(b)
	}
	if b, ok := root["after_response"]; ok {
		p.After = decodeHookPhaseList(b)
	}
	return p
}

func decodeHookPhaseList(raw json.RawMessage) []scriptHookEntry {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	if raw[0] == '[' {
		var list []scriptHookEntry
		if err := json.Unmarshal(raw, &list); err != nil {
			return nil
		}
		return normalizeHookList(list)
	}
	var one scriptHookEntry
	if err := json.Unmarshal(raw, &one); err != nil {
		return nil
	}
	return normalizeHookList([]scriptHookEntry{one})
}

func normalizeHookList(list []scriptHookEntry) []scriptHookEntry {
	if len(list) == 0 {
		return nil
	}
	if len(list) > maxExtensionScriptsPerPhase {
		list = list[:maxExtensionScriptsPerPhase]
	}
	return sortHooksDefaultFirst(list)
}

func sortHooksDefaultFirst(in []scriptHookEntry) []scriptHookEntry {
	if len(in) < 2 {
		return in
	}
	var def, rest []scriptHookEntry
	for _, e := range in {
		if e.Default {
			def = append(def, e)
		} else {
			rest = append(rest, e)
		}
	}
	return append(def, rest...)
}

func hookTimeoutMS(h *scriptHookEntry) int {
	if h == nil || !h.Enabled {
		return 0
	}
	ms := h.TimeoutMS
	if ms <= 0 {
		ms = defaultExtensionScriptTimeoutMS
	}
	if ms > maxExtensionScriptTimeoutMS {
		ms = maxExtensionScriptTimeoutMS
	}
	return ms
}

func clipScriptResponseBody(b []byte) string {
	s := string(b)
	if len(s) > maxScriptResponseBodyArg {
		return s[:maxScriptResponseBodyArg] + "...(truncated)"
	}
	return s
}

// ShallowCloneStringMap 浅拷贝占位符表；并行 HTTP 出站时避免脚本污染共享 vars。
func ShallowCloneStringMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// ExtensionScriptRunOptions 扩展脚本执行选项；零值表示与同阶段全部已启用脚本一致。
type ExtensionScriptRunOptions struct {
	// AfterResponseOnlyIndex 非 nil 时仅执行 after_response 阶段中下标为 *AfterResponseOnlyIndex 的一条（接口调试）；仅当 phase==AfterResponse 时生效。调用方须先校验下标与启用状态。
	AfterResponseOnlyIndex *int
}

// AfterScriptOrderEntry 执行序列中的一个步骤（方案 B）。
type AfterScriptOrderEntry struct {
	Scope string `json:"scope"` // "app" | "endpoint"
	Index int    `json:"index"` // 对应数组（default 优先排序后）的下标
}

// ScriptLog 脚本执行期间 console.* 产生的一条日志。
type ScriptLog struct {
	Scope string `json:"scope"` // "app" | "endpoint" | "inline"
	Index int    `json:"index"` // 在对应数组中的下标
	Name  string `json:"name"`  // 脚本名称
	Level string `json:"level"` // "log" | "info" | "warn" | "error" | "debug"
	Line  string `json:"line"`  // 日志内容
}

// ParseAfterScriptOrder 解析 AfterScriptOrderJSON；空或无效时返回 nil（退化旧行为）。
func ParseAfterScriptOrder(raw string) []AfterScriptOrderEntry {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" || raw == "[]" {
		return nil
	}
	var order []AfterScriptOrderEntry
	if err := json.Unmarshal([]byte(raw), &order); err != nil {
		return nil
	}
	return order
}

// RunAfterResponseOrdered 按 order 序列执行 after_response 脚本（方案 B 统一执行器）。
// order 为 nil/空时退化为旧行为：应用级全部 → 接口级全部。
// logs 非 nil 时收集每条脚本的 console.* 输出（调试模式）；生产路径传 nil。
func RunAfterResponseOrdered(
	order []AfterScriptOrderEntry,
	app *models.OutboundApp,
	endpointAfterScriptsJSON string,
	vars map[string]string,
	env *ScriptEnv,
	logs *[]ScriptLog,
) error {
	if len(order) == 0 {
		// 退化旧行为
		if err := RunAppExtensionScriptWithLogs(AppScriptHookAfterResponse, app, vars, env, nil, logs, "app"); err != nil {
			return err
		}
		return runEndpointAfterScriptsWithLogs(endpointAfterScriptsJSON, vars, env, nil, logs)
	}

	appPlan := ParseExtensionScriptsPlan("")
	if app != nil {
		appPlan = ParseExtensionScriptsPlan(app.ExtensionScriptsJSON)
	}
	epPlan := ParseExtensionScriptsPlan(endpointAfterScriptsJSON)

	for _, entry := range order {
		switch entry.Scope {
		case "app":
			if entry.Index < 0 || entry.Index >= len(appPlan.After) {
				continue
			}
			h := appPlan.After[entry.Index]
			if !h.Enabled {
				continue
			}
			if err := runOneExtensionHookWithLogs(&h, vars, env, "app", entry.Index, logs); err != nil {
				return err
			}
		case "endpoint":
			if entry.Index < 0 || entry.Index >= len(epPlan.After) {
				continue
			}
			h := epPlan.After[entry.Index]
			if !h.Enabled {
				continue
			}
			// 接口脚本看到当前 env 中最新的 OutResp* 状态
			epEnv := &ScriptEnv{
				RespStatus: env.RespStatus,
				RespBody:   env.RespBody,
			}
			if env.OutRespStatus != nil {
				epEnv.RespStatus = *env.OutRespStatus
			}
			if env.OutRespBody != nil {
				epEnv.RespBody = *env.OutRespBody
			}
			if err := runOneExtensionHookWithLogs(&h, vars, epEnv, "endpoint", entry.Index, logs); err != nil {
				return err
			}
			// 把接口脚本的改写并入主 env
			if epEnv.OutRespStatus != nil {
				env.OutRespStatus = epEnv.OutRespStatus
			}
			if epEnv.OutRespBody != nil {
				env.OutRespBody = epEnv.OutRespBody
			}
		}
	}
	return nil
}

// RunAppExtensionScriptWithLogs 与 RunAppExtensionScriptWithOptions 相同，但可额外收集日志。
func RunAppExtensionScriptWithLogs(phase AppScriptHook, app *models.OutboundApp, vars map[string]string, env *ScriptEnv, opt *ExtensionScriptRunOptions, logs *[]ScriptLog, scope string) error {
	if app == nil {
		return nil
	}
	plan := ParseExtensionScriptsPlan(app.ExtensionScriptsJSON)
	var list []scriptHookEntry
	switch phase {
	case AppScriptHookAfterResponse:
		list = plan.After
	default:
		list = plan.Before
	}
	for i := range list {
		if opt != nil && phase == AppScriptHookAfterResponse && opt.AfterResponseOnlyIndex != nil {
			if *opt.AfterResponseOnlyIndex != i {
				continue
			}
		}
		h := &list[i]
		if err := runOneExtensionHookWithLogs(h, vars, env, scope, i, logs); err != nil {
			return err
		}
	}
	return nil
}

func runEndpointAfterScriptsWithLogs(rawJSON string, vars map[string]string, appEnv *ScriptEnv, opt *ExtensionScriptRunOptions, logs *[]ScriptLog) error {
	if strings.TrimSpace(rawJSON) == "" {
		return nil
	}
	list := ParseExtensionScriptsPlan(rawJSON).After
	status := 0
	respBody := ""
	if appEnv != nil {
		status = appEnv.RespStatus
		respBody = appEnv.RespBody
		if appEnv.OutRespStatus != nil {
			status = *appEnv.OutRespStatus
		}
		if appEnv.OutRespBody != nil {
			respBody = *appEnv.OutRespBody
		}
	}
	env := &ScriptEnv{RespStatus: status, RespBody: respBody}
	for i := range list {
		if opt != nil && opt.AfterResponseOnlyIndex != nil && *opt.AfterResponseOnlyIndex != i {
			continue
		}
		if err := runOneExtensionHookWithLogs(&list[i], vars, env, "endpoint", i, logs); err != nil {
			return err
		}
	}
	if appEnv != nil {
		if env.OutRespStatus != nil {
			appEnv.OutRespStatus = env.OutRespStatus
		}
		if env.OutRespBody != nil {
			appEnv.OutRespBody = env.OutRespBody
		}
	}
	return nil
}

func runOneExtensionHookWithLogs(hook *scriptHookEntry, vars map[string]string, env *ScriptEnv, scope string, index int, logs *[]ScriptLog) error {
	if hook == nil || !hook.Enabled {
		return nil
	}
	return runScriptCode(hook.Code, hook.Name, hookTimeoutMS(hook), vars, env, scope, index, logs)
}

// RunAppExtensionScript 按顺序执行该阶段下所有已启用的扩展脚本（标记 default 的条目先于同阶段其它条目执行）。
func RunAppExtensionScript(phase AppScriptHook, app *models.OutboundApp, vars map[string]string, env *ScriptEnv) error {
	return RunAppExtensionScriptWithOptions(phase, app, vars, env, nil)
}

// RunAppExtensionScriptWithOptions 与 RunAppExtensionScript 相同，可限制 after_response 仅执行一条。
func RunAppExtensionScriptWithOptions(phase AppScriptHook, app *models.OutboundApp, vars map[string]string, env *ScriptEnv, opt *ExtensionScriptRunOptions) error {
	if app == nil {
		return nil
	}
	plan := ParseExtensionScriptsPlan(app.ExtensionScriptsJSON)
	var list []scriptHookEntry
	switch phase {
	case AppScriptHookAfterResponse:
		list = plan.After
	default:
		list = plan.Before
	}
	for i := range list {
		if opt != nil && phase == AppScriptHookAfterResponse && opt.AfterResponseOnlyIndex != nil {
			if *opt.AfterResponseOnlyIndex != i {
				continue
			}
		}
		h := &list[i]
		if err := runOneExtensionHook(h, vars, env); err != nil {
			return err
		}
	}
	return nil
}
func ValidateAfterResponseScriptIndex(app *models.OutboundApp, idx int) error {
	if app == nil {
		return errors.New("应用为空")
	}
	plan := ParseExtensionScriptsPlan(app.ExtensionScriptsJSON)
	if idx < 0 || idx >= len(plan.After) {
		return fmt.Errorf("after_response_script_index 越界")
	}
	if !plan.After[idx].Enabled {
		return fmt.Errorf("after_response 脚本 #%d 未启用", idx)
	}
	return nil
}

// RunAfterResponseScriptsJSON 执行任意来源（如接口级 after_scripts_json）的 after_response 脚本。
// rawJSON 形如 {"after_response":[scriptHookEntry...]}（也兼容 ParseExtensionScriptsPlan 支持的旧形态）；
// 按 default 优先、列表顺序执行已启用脚本，opt 可限制只跑某一下标。与应用级共用 runOneExtensionHook / ScriptEnv，
// 因此脚本能用同样的 ctx API（含 ctx.setResponseStatus / ctx.setResponseBody 改写整个返回）。
func RunAfterResponseScriptsJSON(rawJSON string, vars map[string]string, env *ScriptEnv, opt *ExtensionScriptRunOptions) error {
	if strings.TrimSpace(rawJSON) == "" {
		return nil
	}
	list := ParseExtensionScriptsPlan(rawJSON).After
	if env == nil {
		env = &ScriptEnv{}
	}
	for i := range list {
		if opt != nil && opt.AfterResponseOnlyIndex != nil && *opt.AfterResponseOnlyIndex != i {
			continue
		}
		if err := runOneExtensionHook(&list[i], vars, env); err != nil {
			return err
		}
	}
	return nil
}

// ValidateEndpointAfterScriptIndex 校验接口级 after_scripts_json 的 after_response 下标（接口调试单条执行用）。
func ValidateEndpointAfterScriptIndex(rawJSON string, idx int) error {
	plan := ParseExtensionScriptsPlan(rawJSON)
	if idx < 0 || idx >= len(plan.After) {
		return fmt.Errorf("after_response_script_index 越界")
	}
	if !plan.After[idx].Enabled {
		return fmt.Errorf("after_response 脚本 #%d 未启用", idx)
	}
	return nil
}

func runOneExtensionHook(hook *scriptHookEntry, vars map[string]string, env *ScriptEnv) error {
	if hook == nil || !hook.Enabled {
		return nil
	}
	return runScriptCode(hook.Code, hook.Name, hookTimeoutMS(hook), vars, env, "", 0, nil)
}

// RunInlineScript 执行一段内联 ES5 代码（须含 function main(ctx)），ctx API 与扩展脚本一致。
// 用于连接器内联脚本步骤、连接器全局返回值脚本等「不挂在某 app 上」的场景。
// timeoutMS<=0 时用默认超时；vars/env 语义与 runOneExtensionHook 相同。
func RunInlineScript(code, name string, timeoutMS int, vars map[string]string, env *ScriptEnv) error {
	if strings.TrimSpace(code) == "" {
		return nil
	}
	ms := timeoutMS
	if ms <= 0 {
		ms = defaultExtensionScriptTimeoutMS
	}
	if ms > maxExtensionScriptTimeoutMS {
		ms = maxExtensionScriptTimeoutMS
	}
	return runScriptCode(code, name, ms, vars, env, "", 0, nil)
}

// runScriptCode 装配 goja VM（console + ctx API + context 快照）并执行 code（function main(ctx)）。
// timeoutMS<=0 表示不设中断；vars 为占位符表（脚本可读写，含 {{context.*}}）；env 提供 body/响应读写。
// scope/index/logs 用于调试日志收集；生产路径传 "", 0, nil。
func runScriptCode(code, name string, timeoutMS int, vars map[string]string, env *ScriptEnv, scope string, index int, logs *[]ScriptLog) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil
	}
	if len(code) > maxExtensionScriptCodeBytes {
		return fmt.Errorf("脚本超过 %d 字节上限", maxExtensionScriptCodeBytes)
	}
	if vars == nil {
		return errors.New("内部错误: vars 为空")
	}
	if env == nil {
		env = &ScriptEnv{}
	}

	vm := goja.New()
	if timeoutMS > 0 {
		time.AfterFunc(time.Duration(timeoutMS)*time.Millisecond, func() {
			vm.Interrupt("timeout")
		})
	}

	scriptLabel := strings.TrimSpace(name)
	if scriptLabel == "" {
		scriptLabel = "extension"
	}
	console := vm.NewObject()
	logFn := func(level string) func(goja.FunctionCall) goja.Value {
		return func(c goja.FunctionCall) goja.Value {
			parts := make([]string, 0, len(c.Arguments))
			for _, a := range c.Arguments {
				parts = append(parts, a.String())
			}
			line := strings.Join(parts, " ")
			if len(line) > 4000 {
				line = line[:4000] + "...(truncated)"
			}
			log.Printf("outbound extension_script %s [%s]: %s", level, scriptLabel, line)
			if logs != nil {
				*logs = append(*logs, ScriptLog{
					Scope: scope,
					Index: index,
					Name:  scriptLabel,
					Level: level,
					Line:  line,
				})
			}
			return goja.Undefined()
		}
	}
	_ = console.Set("log", logFn("log"))
	_ = console.Set("info", logFn("info"))
	_ = console.Set("warn", logFn("warn"))
	_ = console.Set("error", logFn("error"))
	_ = console.Set("debug", logFn("debug"))
	_ = vm.Set("console", console)

	ctx := vm.NewObject()
	_ = ctx.Set("setVar", func(k, v string) {
		vars[strings.TrimSpace(k)] = v
	})
	_ = ctx.Set("getVar", func(k string) string {
		return vars[strings.TrimSpace(k)]
	})
	_ = ctx.Set("getBodyTemplate", func() string {
		if env.BodyTemplate == nil {
			return ""
		}
		return *env.BodyTemplate
	})
	_ = ctx.Set("setBodyTemplate", func(s string) {
		if env.BodyTemplate == nil {
			return
		}
		*env.BodyTemplate = s
	})
	_ = ctx.Set("getResponseStatus", func() int {
		return env.RespStatus
	})
	_ = ctx.Set("getResponseBody", func() string {
		return env.RespBody
	})
	_ = ctx.Set("setResponseStatus", func(code int) {
		if env.OutRespStatus == nil {
			v := code
			env.OutRespStatus = &v
		} else {
			*env.OutRespStatus = code
		}
	})
	_ = ctx.Set("setResponseBody", func(s string) {
		if env.OutRespBody == nil {
			v := s
			env.OutRespBody = &v
		} else {
			*env.OutRespBody = s
		}
	})
	_ = vm.Set("ctx", ctx)

	// ctx.context — snapshot of {{context.*}} vars; writes sync back after execution
	contextSnapshot := vm.NewObject()
	for k, v := range vars {
		if strings.HasPrefix(k, "{{context.") && strings.HasSuffix(k, "}}") {
			field := k[len("{{context.") : len(k)-2]
			_ = contextSnapshot.Set(field, v)
		}
	}
	_ = ctx.Set("context", contextSnapshot)

	// shorthand helpers (also backward-compatible)
	_ = ctx.Set("getContext", func(field string) string {
		return vars["{{context."+field+"}}"]
	})
	_ = ctx.Set("setContext", func(field, value string) {
		vars["{{context."+field+"}}"] = value
		_ = contextSnapshot.Set(field, value)
	})

	wrapped := "(function() {\n" + code + "\n" +
		"if (typeof main !== 'function') { throw new Error('extension script: 需定义 function main(ctx)'); }\n" +
		"main(ctx);\n})()\n"

	_, err := vm.RunString(wrapped)
	if err != nil {
		if ex, ok := err.(*goja.Exception); ok {
			return errors.New(strings.TrimSpace(ex.String()))
		}
		return err
	}

	// sync ctx.context object writes back into vars
	for _, k := range contextSnapshot.Keys() {
		v := contextSnapshot.Get(k)
		if v != nil && !goja.IsUndefined(v) && !goja.IsNull(v) {
			vars["{{context."+k+"}}"] = v.String()
		}
	}
	return nil
}
