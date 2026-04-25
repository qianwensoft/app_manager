package outbound

import (
	"bytes"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

// 调试抓包：响应体最多读取；写入 exchange 的正文展示上限（避免超大 JSON 拖垮浏览器）。
const (
	maxDebugHTTPReadBody      = 10 << 20 // 10 MiB 从对端读取
	maxDebugTraceRequestBody  = 2 << 20  // 2 MiB 请求体写入 trace
	maxDebugTraceResponseBody = 10 << 20 // 10 MiB 响应体写入 trace
)

// EndpointDebugBreakdown 通用 Header、接口 Header、合并后（鉴权前）的展开结果。
type EndpointDebugBreakdown struct {
	CommonHeaders   map[string]string `json:"common_headers"`
	EndpointHeaders map[string]string `json:"endpoint_headers"`
	BeforeAuth      map[string]string `json:"merged_before_auth"`
}

// TemplateContextKVList 从占位符表中筛出 {{context.*}} 键值对（已排序），供接口调试等展示。
func TemplateContextKVList(vars map[string]string) []map[string]string {
	if vars == nil {
		return nil
	}
	var keys []string
	for k := range vars {
		if strings.HasPrefix(k, "{{context.") {
			keys = append(keys, k)
		}
	}
	if len(keys) == 0 {
		return nil
	}
	sort.Strings(keys)
	out := make([]map[string]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, map[string]string{"key": k, "value": vars[k]})
	}
	return out
}

func debugClipBody(b []byte, max int) (s string, truncated bool) {
	if len(b) <= max {
		return string(b), false
	}
	return string(b[:max]) + "\n...[truncated]", true
}

// DefaultDebugTemplateVars 调试请求默认占位符；sampleVars 中非空键覆盖同名项。
func DefaultDebugTemplateVars(sampleVars map[string]string) map[string]string {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	out := map[string]string{
		"{{device_event.id}}":         "999001",
		"{{device_event.event_type}}": "debug.sample",
		"{{device_event.event_data}}": `{"demo":true,"nested":{"a":1},"tags":["x","y"]}`,
		"{{device_event.created_at}}": now,
		"{{device.id}}":               "123",
		"{{device.name}}":             "调试设备",
		"{{device.serial}}":           "DEBUG-SERIAL",
		"{{device.agent_alias}}":      "",
		"{{device.server_alias}}":     "",
		"{{definition.key}}":          "sample_event",
		"{{definition.name}}":         "示例事件定义",
		// 分页占位符示例（自动从响应 JSON 提取，此处给调试页列表一个参考值）
		"{{http.last.page.no}}":          "1",
		"{{http.last.page.size}}":        "20",
		"{{http.last.page.total}}":       "100",
		"{{http.last.page.total_pages}}": "5",
		"{{http.last.page.list_len}}":    "20",
		"{{http.last.page.has_more}}":    "true",
	}
	for k, v := range sampleVars {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		out[k] = v
	}
	recDemo := models.DeviceEvent{
		ID:        999001,
		DeviceID:  123,
		EventType: "debug.sample",
		EventData: `{"demo":true,"nested":{"a":1},"tags":["x","y"]}`,
	}
	if t, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(now)); err == nil {
		recDemo.CreatedAt = t
	} else if t2, err2 := time.Parse(time.RFC3339, strings.TrimSpace(now)); err2 == nil {
		recDemo.CreatedAt = t2
	} else {
		recDemo.CreatedAt = time.Now().UTC()
	}
	out["{{device_event}}"] = DeviceEventJSONPlaceholder(recDemo)
	return out
}

func syntheticDeviceEvent(vars map[string]string) models.DeviceEvent {
	parseUint := func(s string) uint {
		s = strings.TrimSpace(s)
		if s == "" {
			return 0
		}
		n, _ := strconv.ParseUint(s, 10, 64)
		return uint(n)
	}
	deid := parseUint(vars["{{device_event.id}}"])
	if deid == 0 {
		deid = 999001
	}
	devID := parseUint(vars["{{device.id}}"])
	if devID == 0 {
		devID = 123
	}
	et := vars["{{device_event.event_type}}"]
	if et == "" {
		et = "debug.sample"
	}
	ed := vars["{{device_event.event_data}}"]
	if ed == "" {
		ed = "{}"
	}
	var created time.Time
	if s := strings.TrimSpace(vars["{{device_event.created_at}}"]); s != "" {
		if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
			created = t
		} else if t2, err2 := time.Parse(time.RFC3339, s); err2 == nil {
			created = t2
		}
	}
	if created.IsZero() {
		created = time.Now()
	}
	return models.DeviceEvent{
		ID:        deid,
		DeviceID:  devID,
		EventType: et,
		EventData: ed,
		CreatedAt: created,
	}
}

// DebugHTTPEndpoint 执行一次出站 HTTP（不写 outbound_deliveries），返回 exchange、变量表、Header 分层与体积元数据。
// afterResponseScriptIndex 非 nil 时仅执行该下标的 after_response 脚本（须已启用）；nil 表示与线上一致执行全部。
func DebugHTTPEndpoint(db *gorm.DB, app *models.OutboundApp, ep models.OutboundEndpoint, sampleVars map[string]string, timeoutMS int, afterResponseScriptIndex *int) (
	trace *TokenExchangeTrace,
	vars map[string]string,
	breakdown *EndpointDebugBreakdown,
	meta map[string]interface{},
	err error,
) {
	trace = &TokenExchangeTrace{Phase: "http"}
	vars = DefaultDebugTemplateVars(sampleVars)
	meta = map[string]interface{}{}
	defer func() {
		if meta != nil && vars != nil {
			meta["context_after_response"] = TemplateContextKVList(vars)
		}
	}()
	breakdown = &EndpointDebugBreakdown{
		CommonHeaders:   map[string]string{},
		EndpointHeaders: map[string]string{},
		BeforeAuth:      map[string]string{},
	}

	MergeAppParamsIntoVars(vars, app)

	if app == nil || strings.TrimSpace(app.BaseURL) == "" {
		err = fmt.Errorf("应用或 Base URL 为空")
		return
	}
	rawURL := joinBasePath(app.BaseURL, ep.Path)
	urlStr := expandTemplate(rawURL, vars)
	if urlStr == "" {
		err = fmt.Errorf("拼接请求 URL 失败")
		return
	}

	method := strings.ToUpper(strings.TrimSpace(ep.Method))
	if method == "" {
		method = "POST"
	}

	bodyTpl := strings.TrimSpace(ep.BodyTemplate)
	if bodyTpl == "" {
		bodyTpl = defaultJSONBody(syntheticDeviceEvent(vars))
	}
	if serr := RunAppExtensionScript(AppScriptHookBeforeRequest, app, vars, &ScriptEnv{BodyTemplate: &bodyTpl}); serr != nil {
		err = fmt.Errorf("extension_script before_request: %w", serr)
		return
	}
	meta["extension_script_before_ran"] = true
	bodyStr := expandTemplate(bodyTpl, vars)
	meta["request_body_bytes"] = len(bodyStr)

	commonH, err := parseHeaderMapJSON(app.CommonHeadersJSON, vars)
	if err != nil {
		err = fmt.Errorf("common_headers_json: %w", err)
		return
	}
	epH, err := parseHeaderMapJSON(ep.HeadersJSON, vars)
	if err != nil {
		err = fmt.Errorf("headers_json: %w", err)
		return
	}
	mergedH := mergeParsedHeaders(commonH, epH)
	breakdown.CommonHeaders = headerFlatStringMap(commonH)
	breakdown.EndpointHeaders = headerFlatStringMap(epH)

	if timeoutMS <= 0 {
		timeoutMS = 15000
	}
	if timeoutMS > 120000 {
		timeoutMS = 120000
	}
	client := &http.Client{Timeout: time.Duration(timeoutMS) * time.Millisecond}

	trace.Request.Method = method
	trace.Request.URL = urlStr
	trace.Request.Body, trace.Request.BodyTruncated = debugClipBody([]byte(bodyStr), maxDebugTraceRequestBody)

	req, err := http.NewRequest(method, urlStr, bytes.NewReader([]byte(bodyStr)))
	if err != nil {
		return
	}
	//req.Header.Set("Content-Type", "application/json; charset=utf-8")
	//req.Header.Set("X-Idempotency-Key", fmt.Sprintf("debug-%d", time.Now().UnixNano()))
	req.Header["Content-Type"] = []string{"application/json; charset=utf-8"}
	req.Header["X-Idempotency-Key"] = []string{fmt.Sprintf("debug-%d", time.Now().UnixNano())}
	for k, vals := range mergedH {
		cp := make([]string, len(vals))
		copy(cp, vals)
		req.Header[k] = cp
	}
	breakdown.BeforeAuth = headerFlatStringMap(req.Header)

	if err = applyAppAuth(db, req, app, vars); err != nil {
		return
	}

	trace.Request.Headers = headerFlatStringMap(req.Header)
	trace.Request.Body, trace.Request.BodyTruncated = debugClipBody([]byte(bodyStr), maxDebugTraceRequestBody)

	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	b, rerr := readResponseBodyLimited(resp.Body, maxDebugHTTPReadBody)
	if rerr != nil {
		err = rerr
		return
	}
	meta["response_body_bytes"] = len(b)
	respTrunc := len(b) >= maxDebugHTTPReadBody
	meta["response_read_cap_bytes"] = maxDebugHTTPReadBody
	meta["response_body_truncated"] = respTrunc

	trace.Response.Status = resp.StatusCode
	trace.Response.Headers = headerFlatStringMap(resp.Header)
	trace.Response.Body, trace.Response.BodyTruncated = debugClipBody(b, maxDebugTraceResponseBody)
	if len(b) > maxDebugTraceResponseBody {
		meta["response_body_in_trace_truncated"] = true
	} else {
		meta["response_body_in_trace_truncated"] = false
	}
	// 与 ExecuteHTTPWebhook、连接器阶段预览共用 mergeHTTPResponseIntoVarsAndRunAfterResponse；接口调试在非 2xx 时仍跑 after_response。
	synth := models.OutboundConnectorStep{ConfigJSON: `{"context_merge_after":"http_response_json"}`}
	var runOpt *ExtensionScriptRunOptions
	if afterResponseScriptIndex != nil {
		if verr := ValidateAfterResponseScriptIndex(app, *afterResponseScriptIndex); verr != nil {
			err = verr
			return
		}
		meta["after_response_script_debug_index"] = *afterResponseScriptIndex
		runOpt = &ExtensionScriptRunOptions{AfterResponseOnlyIndex: afterResponseScriptIndex}
	} else {
		meta["after_response_script_debug_all"] = true
	}
	afterEnv := &ScriptEnv{RespStatus: resp.StatusCode, RespBody: clipScriptResponseBody(b)}
	// 先合并 HTTP 上下文再跑脚本（复用内部逻辑），但需拿到脚本修改后的 OutResp*。
	// 直接调用底层以便拿到 env 指针。
	is2xx := resp.StatusCode >= 200 && resp.StatusCode < 300
	if is2xx {
		MergeHTTPResponseContext(vars, 0, resp.StatusCode, b)
		MergeHTTPResponseBodyToContext(vars, synth, b)
		MergePaginationContext(vars, b)
	}
	if serr := RunAppExtensionScriptWithOptions(AppScriptHookAfterResponse, app, vars, afterEnv, runOpt); serr != nil {
		err = fmt.Errorf("extension_script after_response: %w", serr)
		return
	}
	applyScriptOutResp(vars, 0, afterEnv)
	// 将脚本改写后的状态码/响应体反映到 trace
	if afterEnv.OutRespStatus != nil {
		trace.Response.Status = *afterEnv.OutRespStatus
	}
	if afterEnv.OutRespBody != nil {
		trace.Response.Body = *afterEnv.OutRespBody
		trace.Response.BodyTruncated = false
	}
	meta["extension_script_after_ran"] = true
	meta["extension_script_after_http_status"] = resp.StatusCode
	return trace, vars, breakdown, meta, nil
}
