package outbound

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

type authCfg struct {
	HeaderName  string `json:"header_name"`
	HeaderValue string `json:"header_value"`
	CookieValue string `json:"cookie_value"`
}

func joinBasePath(base, path string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	path = strings.TrimLeft(strings.TrimSpace(path), "/")
	if base == "" {
		return ""
	}
	if path == "" {
		return base
	}
	return base + "/" + path
}

func mergeParsedHeaders(base, overlay http.Header) http.Header {
	out := http.Header{}
	for k, vals := range base {
		cp := make([]string, len(vals))
		copy(cp, vals)
		out[k] = cp
	}
	for k, vals := range overlay {
		cp := make([]string, len(vals))
		copy(cp, vals)
		out[k] = cp
	}
	return out
}

func headerFlatStringMap(h http.Header) map[string]string {
	if h == nil {
		return map[string]string{}
	}
	m := make(map[string]string)
	for k, vals := range h {
		if len(vals) == 0 {
			continue
		}
		m[k] = strings.Join(vals, ", ")
	}
	return m
}

func parseHeaderMapJSON(raw string, vars map[string]string) (http.Header, error) {
	raw = strings.TrimSpace(raw)
	h := make(http.Header)
	if raw == "" || raw == "{}" {
		return h, nil
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return nil, err
	}
	for k, v := range m {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		// 直接写入 map 保留配置的原始大小写，不经 http.Header.Set 的规范化
		h[k] = []string{expandTemplate(v, vars)}
	}
	return h, nil
}

func applyAppAuth(db *gorm.DB, req *http.Request, app *models.OutboundApp, vars map[string]string) error {
	switch strings.TrimSpace(app.AuthType) {
	case "", "none":
		return nil
	case "static_header":
		var ac authCfg
		if err := json.Unmarshal([]byte(app.AuthConfigJSON), &ac); err != nil {
			return fmt.Errorf("auth_config_json: %w", err)
		}
		ac.HeaderName = strings.TrimSpace(ac.HeaderName)
		if ac.HeaderName == "" {
			return nil
		}
		req.Header[ac.HeaderName] = []string{expandTemplate(ac.HeaderValue, vars)}
		return nil
	case "static_cookie":
		var ac authCfg
		if err := json.Unmarshal([]byte(app.AuthConfigJSON), &ac); err != nil {
			return fmt.Errorf("auth_config_json: %w", err)
		}
		cv := expandTemplate(strings.TrimSpace(ac.CookieValue), vars)
		if cv == "" {
			return nil
		}
		// 追加到已有 Cookie header，避免覆盖
		if existing := req.Header.Get("Cookie"); existing != "" {
			req.Header.Set("Cookie", existing+"; "+cv)
		} else {
			req.Header.Set("Cookie", cv)
		}
		return nil
	case "dynamic_bearer":
		if db != nil {
			if err := EnsureOutboundAppToken(db, app); err != nil {
				return fmt.Errorf("token: %w", err)
			}
		}
		p, err := parseTokenProvider(app.TokenProviderJSON)
		if err != nil {
			return fmt.Errorf("token_provider: %w", err)
		}
		cache, err := parseTokenCache(app.TokenCacheJSON)
		if err != nil {
			return fmt.Errorf("token_cache: %w", err)
		}
		if strings.TrimSpace(cache.AccessToken) == "" {
			return fmt.Errorf("no access_token in cache; run token fetch or check paths")
		}
		if p.TokenIn == "json_body" {
			return injectTokenIntoJSONBody(req, p, cache, vars)
		}
		tpl := expandTemplate(p.AuthHeaderTemplate, vars)
		tpl = expandTokenTemplate(tpl, cache.AccessToken, cache.RefreshToken)
		req.Header[p.AuthHeaderName] = []string{tpl}
		return nil
	default:
		return fmt.Errorf("unsupported auth_type %q", app.AuthType)
	}
}

// injectTokenIntoJSONBody 在请求发出前把 token 注入到请求 JSON body 的指定字段（json_body 模式）。
// 读取并替换 req.Body：解析为对象 → 设置 p.TokenBodyKey 字段 → 重新序列化 → 重置 Body/ContentLength/GetBody。
func injectTokenIntoJSONBody(req *http.Request, p TokenProvider, cache TokenCache, vars map[string]string) error {
	var raw []byte
	if req.Body != nil {
		b, err := io.ReadAll(req.Body)
		if err != nil {
			return fmt.Errorf("token json_body: read request body: %w", err)
		}
		_ = req.Body.Close()
		raw = b
	}
	m := map[string]interface{}{}
	if t := strings.TrimSpace(string(raw)); t != "" && t != "null" {
		if err := json.Unmarshal(raw, &m); err != nil {
			return fmt.Errorf("token json_body: request body is not valid JSON")
		}
	}

	tokenVal := expandTemplate(p.TokenBodyValueTemplate, vars)
	tokenVal = expandTokenTemplate(tokenVal, cache.AccessToken, cache.RefreshToken)
	m[p.TokenBodyKey] = tokenVal

	out, err := json.Marshal(m)
	if err != nil {
		return fmt.Errorf("token json_body: marshal: %w", err)
	}
	req.Body = io.NopCloser(bytes.NewReader(out))
	req.ContentLength = int64(len(out))
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(out)), nil
	}
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	return nil
}

func defaultJSONBody(rec models.DeviceEvent) string {
	created := rec.CreatedAt
	if created.IsZero() {
		created = time.Now()
	}
	m := map[string]interface{}{
		"device_id":       rec.DeviceID,
		"event_type":      rec.EventType,
		"event_data":      rec.EventData,
		"created_at":      created.UTC().Format(time.RFC3339Nano),
		"device_event_id": rec.ID,
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// HTTPExecOpts 控制 ExecuteHTTPWebhook 的持久化；nil 表示默认写入 outbound_deliveries。
type HTTPExecOpts struct {
	SkipPersistDelivery bool
}

func persistOutboundDelivery(db *gorm.DB, d *models.OutboundDelivery, opts *HTTPExecOpts) {
	if db == nil {
		return
	}
	if opts != nil && opts.SkipPersistDelivery {
		return
	}
	_ = db.Create(d).Error
}

// ExecuteHTTPWebhook 执行一次 HTTP 出站并写入 outbound_deliveries。
// vars 为模板变量表（可与 RunPhasedConnector 共用）；nil 时内部使用 TemplateVars。
// mergeHTTPResponseIntoVars 为 true 且 HTTP 2xx 时，将响应体/状态码写入 vars（{{http.last.*}} 等），供后续步骤使用；并行多步勿开启，避免并发写 map。
// connectorStep 为阶段步骤表行（含 ConfigJSON）；旧版无阶段出站可传零值。
// execOpts 为 nil 时写入投递表；SkipPersistDelivery 为 true 时不写入（阶段预览真实请求等）。
func ExecuteHTTPWebhook(db *gorm.DB, connector models.OutboundConnector, endpoint models.OutboundEndpoint, app *models.OutboundApp,
	rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition, vars map[string]string, meta StepExecutionMeta, mergeHTTPResponseIntoVars bool,
	connectorStep models.OutboundConnectorStep, execOpts *HTTPExecOpts,
) models.OutboundDelivery {
	st := strings.TrimSpace(meta.StepType)
	if st == "" {
		st = "http"
	}
	d := models.OutboundDelivery{
		DeviceEventID: rec.ID,
		ConnectorID:   connector.ID,
		PhaseID:       meta.PhaseID,
		StepID:        meta.StepID,
		StepType:      st,
		EndpointID:    endpoint.ID,
		Status:        "failed",
		Attempts:      0,
	}

	if app == nil || strings.TrimSpace(app.BaseURL) == "" {
		d.Error = "应用或 Base URL 为空"
		d.DetailJSON = HTTPSetupDetail("app", d.Error)
		persistOutboundDelivery(db, &d, execOpts)
		return d
	}

	if vars == nil {
		vars = TemplateVars(rec, dev, def)
	}
	MergeAppParamsIntoVars(vars, app)
	workVars := vars
	if !mergeHTTPResponseIntoVars {
		workVars = ShallowCloneStringMap(vars)
	}

	rawURL := joinBasePath(app.BaseURL, endpoint.Path)
	urlStr := expandTemplate(rawURL, workVars)
	d.RequestURL = urlStr
	if urlStr == "" {
		d.Error = "拼接请求 URL 失败"
		d.DetailJSON = HTTPSetupDetail("url", d.Error)
		persistOutboundDelivery(db, &d, execOpts)
		return d
	}
	if blocked, reason := BlockedSelfOpenAPIURL(urlStr); blocked {
		d.Error = reason
		d.DetailJSON = HTTPSetupDetail("loopback_guard", reason)
		persistOutboundDelivery(db, &d, execOpts)
		return d
	}

	method := strings.ToUpper(strings.TrimSpace(endpoint.Method))
	if method == "" {
		method = "POST"
	}

	timeout := endpoint.TimeoutMS
	if timeout <= 0 {
		timeout = connector.DefaultTimeoutMS
	}
	if timeout <= 0 {
		timeout = 15000
	}
	retryMax := endpoint.RetryMax
	if retryMax < 0 {
		retryMax = 0
	}
	if retryMax == 0 && connector.DefaultRetryMax > 0 {
		retryMax = connector.DefaultRetryMax
	}

	bodyTpl := strings.TrimSpace(endpoint.BodyTemplate)
	if bodyTpl == "" {
		bodyTpl = defaultJSONBody(rec)
	}
	if err := RunAppExtensionScript(AppScriptHookBeforeRequest, app, workVars, &ScriptEnv{BodyTemplate: &bodyTpl}); err != nil {
		d.Error = "extension_script before_request: " + err.Error()
		d.DetailJSON = HTTPSetupDetail("extension_script", d.Error)
		persistOutboundDelivery(db, &d, execOpts)
		return d
	}
	bodyStr := expandTemplate(bodyTpl, workVars)

	commonHdr, err := parseHeaderMapJSON(app.CommonHeadersJSON, workVars)
	if err != nil {
		d.Error = "common_headers_json: " + err.Error()
		d.DetailJSON = HTTPSetupDetail("common_headers_json", d.Error)
		persistOutboundDelivery(db, &d, execOpts)
		return d
	}
	epHdr, err := parseHeaderMapJSON(endpoint.HeadersJSON, workVars)
	if err != nil {
		d.Error = "headers_json: " + err.Error()
		d.DetailJSON = HTTPSetupDetail("headers_json", d.Error)
		persistOutboundDelivery(db, &d, execOpts)
		return d
	}
	hdr := mergeParsedHeaders(commonHdr, epHdr)

	client := &http.Client{Timeout: time.Duration(timeout) * time.Millisecond}

	var lastErr string
	var lastCode int
	var lastDetail string
	startAll := time.Now()
	for attempt := 0; attempt <= retryMax; attempt++ {
		d.Attempts = attempt + 1
		req, err := http.NewRequest(method, urlStr, bytes.NewReader([]byte(bodyStr)))
		if err != nil {
			lastErr = err.Error()
			lastDetail = marshalHTTPAttemptDetail(method, urlStr, nil, bodyStr, 0, nil, lastErr)
			break
		}
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
		idem := fmt.Sprintf("de-%d-c-%d-e-%d", rec.ID, connector.ID, endpoint.ID)
		if meta.StepID > 0 {
			idem = fmt.Sprintf("de-%d-c-%d-s-%d-e-%d", rec.ID, connector.ID, meta.StepID, endpoint.ID)
		}
		req.Header.Set("X-Idempotency-Key", idem)
		for k, vals := range hdr {
			cp := make([]string, len(vals))
			copy(cp, vals)
			req.Header[k] = cp
		}
		if err := applyAppAuth(db, req, app, workVars); err != nil {
			lastErr = err.Error()
			lastDetail = marshalHTTPAttemptDetail(method, urlStr, req.Header, bodyStr, 0, nil, lastErr)
			break
		}

		t0 := time.Now()
		resp, err := client.Do(req)
		dt := time.Since(t0).Milliseconds()
		d.DurationMS = dt

		if err != nil {
			lastErr = err.Error()
			lastDetail = marshalHTTPAttemptDetail(method, urlStr, req.Header, bodyStr, 0, nil, lastErr)
			if attempt < retryMax && shouldRetryNet(err) {
				time.Sleep(backoff(attempt))
				continue
			}
			break
		}
		bodyBytes, rerr := readResponseBodyLimited(resp.Body, maxHTTPDetailBody)
		if rerr != nil {
			lastErr = rerr.Error()
		}
		lastCode = resp.StatusCode
		d.HTTPStatus = resp.StatusCode
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			if lastErr == "" {
				lastErr = resp.Status
			}
		}
		lastDetail = marshalHTTPAttemptDetail(method, urlStr, req.Header, bodyStr, resp.StatusCode, bodyBytes, lastErr)
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			d.Status = "success"
			d.Error = ""
			d.DurationMS = time.Since(startAll).Milliseconds()
			d.DetailJSON = lastDetail
			if err := mergeHTTPResponseIntoVarsAndRunAfterResponse(workVars, app, connectorStep, meta.StepID, resp.StatusCode, bodyBytes, nil, false, mergeHTTPResponseIntoVars, endpoint.AfterScriptsJSON, ParseAfterScriptOrder(endpoint.AfterScriptOrderJSON)); err != nil {
				d.Status = "failed"
				d.Error = "extension_script after_response: " + err.Error()
				d.DurationMS = time.Since(startAll).Milliseconds()
				persistOutboundDelivery(db, &d, execOpts)
				return d
			}
			persistOutboundDelivery(db, &d, execOpts)
			return d
		}
		if attempt < retryMax && resp.StatusCode >= 500 {
			time.Sleep(backoff(attempt))
			continue
		}
		break
	}

	d.Status = "failed"
	d.HTTPStatus = lastCode
	d.Error = truncateErr(lastErr, 2000)
	d.DurationMS = time.Since(startAll).Milliseconds()
	d.DetailJSON = lastDetail
	persistOutboundDelivery(db, &d, execOpts)
	return d
}

func backoff(attempt int) time.Duration {
	d := time.Duration(100*(1<<attempt)) * time.Millisecond
	if d > 3*time.Second {
		d = 3 * time.Second
	}
	return d
}

func shouldRetryNet(err error) bool {
	// 简化：网络类错误可重试
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "timeout") || strings.Contains(s, "connection refused") ||
		strings.Contains(s, "EOF") || strings.Contains(s, "reset")
}

func truncateErr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
