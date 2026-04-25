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

// ValidateAfterResponseScriptIndex 校验 after_response 数组下标（接口调试专用）。
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

func runOneExtensionHook(hook *scriptHookEntry, vars map[string]string, env *ScriptEnv) error {
	if hook == nil || !hook.Enabled {
		return nil
	}
	code := strings.TrimSpace(hook.Code)
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
	ms := hookTimeoutMS(hook)
	if ms > 0 {
		time.AfterFunc(time.Duration(ms)*time.Millisecond, func() {
			vm.Interrupt("timeout")
		})
	}

	scriptLabel := strings.TrimSpace(hook.Name)
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
			field := k[len("{{context."):len(k)-2]
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
