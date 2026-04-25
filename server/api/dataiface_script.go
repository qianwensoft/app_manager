package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dop251/goja"
)

const (
	maxDataIfaceScriptBytes  = 32 * 1024
	defaultDataIfaceScriptMS = 800
	maxDataIfaceScriptMS     = 5000
)

func clampDataIfaceScriptMS(ms int) int {
	if ms <= 0 {
		return defaultDataIfaceScriptMS
	}
	if ms > maxDataIfaceScriptMS {
		return maxDataIfaceScriptMS
	}
	return ms
}

// RunDataIfaceBeforeScript 执行接口「前置」脚本：可读写 params（map）。
// 须定义 function main(ctx){}；ctx.params 为入参对象。
func RunDataIfaceBeforeScript(code string, params map[string]interface{}, timeoutMS int) (logs []string, err error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, nil
	}
	if len(code) > maxDataIfaceScriptBytes {
		return nil, fmt.Errorf("before_script 超过 %d 字节", maxDataIfaceScriptBytes)
	}
	if params == nil {
		params = map[string]interface{}{}
	}
	vm := goja.New()
	ms := clampDataIfaceScriptMS(timeoutMS)
	if ms > 0 {
		time.AfterFunc(time.Duration(ms)*time.Millisecond, func() { vm.Interrupt("timeout") })
	}
	logs = []string{}
	console := vm.NewObject()
	logFn := func(level string) func(goja.FunctionCall) goja.Value {
		return func(c goja.FunctionCall) goja.Value {
			var parts []string
			for _, a := range c.Arguments {
				parts = append(parts, a.String())
			}
			line := strings.Join(parts, " ")
			if len(line) > 4000 {
				line = line[:4000] + "...(truncated)"
			}
			logs = append(logs, level+": "+line)
			return goja.Undefined()
		}
	}
	_ = console.Set("log", logFn("log"))
	_ = console.Set("info", logFn("info"))
	_ = console.Set("warn", logFn("warn"))
	_ = console.Set("error", logFn("error"))
	_ = vm.Set("console", console)

	ctx := vm.NewObject()
	_ = ctx.Set("params", params)
	_ = vm.Set("ctx", ctx)

	wrapped := "(function() {\n" + code + "\n" +
		"if (typeof main !== 'function') { throw new Error('before_script: 需定义 function main(ctx)'); }\n" +
		"main(ctx);\n})()\n"
	if _, err = vm.RunString(wrapped); err != nil {
		if ex, ok := err.(*goja.Exception); ok {
			return logs, errors.New(strings.TrimSpace(ex.String()))
		}
		return logs, err
	}
	return logs, nil
}

// RunDataIfaceAfterScript 执行接口「后置」脚本：可变换返回行。
// 须定义 function main(ctx){}；ctx.rows 为行数组；可 return 新数组覆盖返回。
func RunDataIfaceAfterScript(code string, rows []map[string]interface{}, timeoutMS int) (out []map[string]interface{}, logs []string, err error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return rows, nil, nil
	}
	if len(code) > maxDataIfaceScriptBytes {
		return nil, nil, fmt.Errorf("after_script 超过 %d 字节", maxDataIfaceScriptBytes)
	}
	vm := goja.New()
	ms := clampDataIfaceScriptMS(timeoutMS)
	if ms > 0 {
		time.AfterFunc(time.Duration(ms)*time.Millisecond, func() { vm.Interrupt("timeout") })
	}
	logs = []string{}
	console := vm.NewObject()
	logFn := func(level string) func(goja.FunctionCall) goja.Value {
		return func(c goja.FunctionCall) goja.Value {
			var parts []string
			for _, a := range c.Arguments {
				parts = append(parts, a.String())
			}
			line := strings.Join(parts, " ")
			if len(line) > 4000 {
				line = line[:4000] + "...(truncated)"
			}
			logs = append(logs, level+": "+line)
			return goja.Undefined()
		}
	}
	_ = console.Set("log", logFn("log"))
	_ = console.Set("info", logFn("info"))
	_ = console.Set("warn", logFn("warn"))
	_ = console.Set("error", logFn("error"))
	_ = vm.Set("console", console)

	ctx := vm.NewObject()
	_ = ctx.Set("rows", rows)
	_ = vm.Set("ctx", ctx)

	wrapped := "(function() {\n" + code + "\n" +
		"if (typeof main !== 'function') { throw new Error('after_script: 需定义 function main(ctx)'); }\n" +
		"return main(ctx);\n})()\n"
	v, err := vm.RunString(wrapped)
	if err != nil {
		if ex, ok := err.(*goja.Exception); ok {
			return nil, logs, errors.New(strings.TrimSpace(ex.String()))
		}
		return nil, logs, err
	}
	if goja.IsUndefined(v) || goja.IsNull(v) {
		return rows, logs, nil
	}
	exp := v.Export()
	switch t := exp.(type) {
	case []interface{}:
		out := make([]map[string]interface{}, 0, len(t))
		for _, it := range t {
			if m, ok := it.(map[string]interface{}); ok {
				out = append(out, m)
			}
		}
		return out, logs, nil
	case []map[string]interface{}:
		return t, logs, nil
	default:
		// 尝试 JSON 往返
		b, e2 := json.Marshal(exp)
		if e2 != nil {
			return nil, logs, fmt.Errorf("after_script 返回值须为对象数组")
		}
		var arr []map[string]interface{}
		if err := json.Unmarshal(b, &arr); err != nil {
			return nil, logs, fmt.Errorf("after_script 返回值须为对象数组: %w", err)
		}
		return arr, logs, nil
	}
}
