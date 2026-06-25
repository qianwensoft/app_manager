package outbound

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

// TokenProvider 描述获取/刷新 access_token 的 HTTP 调用与 JSON 路径。
type TokenProvider struct {
	// Code 可选的预请求步骤：先调用此接口获取 code，响应 JSON 的一级字段以
	// {{code_resp.<key>}} 形式注入到后续 Fetch/Refresh 的 URL/Headers/Body 中。
	Code struct {
		Enabled  bool              `json:"enabled"`
		URL      string            `json:"url"`
		Method   string            `json:"method"`
		Headers  map[string]string `json:"headers"`
		Body     json.RawMessage   `json:"body"`
		BodyType string            `json:"body_type"` // "json" | "form" | "formdata"; default "json"
	} `json:"code"`
	Fetch struct {
		URL      string            `json:"url"`
		Method   string            `json:"method"`
		Headers  map[string]string `json:"headers"`
		Body     json.RawMessage   `json:"body"`
		BodyType string            `json:"body_type"`
	} `json:"fetch"`
	Refresh struct {
		URL      string            `json:"url"`
		Method   string            `json:"method"`
		Headers  map[string]string `json:"headers"`
		Body     json.RawMessage   `json:"body"`
		BodyType string            `json:"body_type"`
	} `json:"refresh"`
	Paths struct {
		AccessToken   string          `json:"access_token"`
		ExpiresIn     json.RawMessage `json:"expires_in"`
		ExpiresInMode string          `json:"expires_in_mode"` // "path" | "fixed" | "expr"; default "path"
		ExpiresAt     string          `json:"expires_at"`
		RefreshToken  string          `json:"refresh_token"`
	} `json:"paths"`
	SkewSeconds int `json:"skew_seconds"` // 提前多少秒视为过期，默认 60

	// TokenIn 控制业务接口调用时 token 的注入位置：
	//   "header"（默认）：写入 AuthHeaderName 头，值为 AuthHeaderTemplate。
	//   "json_body"：在请求发出前把 TokenBodyValueTemplate 注入到请求 JSON body 的 TokenBodyKey 字段。
	TokenIn                string `json:"token_in"`
	TokenBodyKey           string `json:"token_body_key"`            // json_body 模式字段名，默认 access_token
	TokenBodyValueTemplate string `json:"token_body_value_template"` // json_body 模式值模板，默认 {{access_token}}

	AuthHeaderName     string `json:"auth_header_name"`     // 默认 Authorization
	AuthHeaderTemplate string `json:"auth_header_template"` // 默认 Bearer {{access_token}}
}

// TokenCache 服务端缓存（不入库明文到 API 响应）。
type TokenCache struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
}

func parseTokenProvider(raw string) (TokenProvider, error) {
	raw = strings.TrimSpace(raw)
	var p TokenProvider
	if raw == "" || raw == "{}" {
		return p, nil
	}
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return p, err
	}
	if p.SkewSeconds <= 0 {
		p.SkewSeconds = 60
	}
	if strings.TrimSpace(p.AuthHeaderName) == "" {
		p.AuthHeaderName = "Authorization"
	}
	if strings.TrimSpace(p.AuthHeaderTemplate) == "" {
		p.AuthHeaderTemplate = "Bearer {{access_token}}"
	}
	if strings.TrimSpace(p.TokenIn) == "" {
		p.TokenIn = "header"
	}
	if p.TokenIn == "json_body" {
		if strings.TrimSpace(p.TokenBodyKey) == "" {
			p.TokenBodyKey = "access_token"
		}
		if strings.TrimSpace(p.TokenBodyValueTemplate) == "" {
			p.TokenBodyValueTemplate = "{{access_token}}"
		}
	}
	return p, nil
}

// reSimplePlaceholder 匹配 body 值模板里的简单占位符 {{name}}（不含函数调用形式 {{$fn(...)}}）。
var reSimplePlaceholder = regexp.MustCompile(`\{\{([^${}][^{}]*)\}\}`)

// AutoInjectedBodyParamNames 返回「业务接口调用时由服务端自动注入到 JSON body、因此不应作为
// 调用方入参暴露」的字段/占位符名集合。当前仅 dynamic_bearer + token_in=json_body 场景：
// 服务端会在请求发出前把 token 写入 TokenBodyKey 字段，并解析 TokenBodyValueTemplate 中的占位符，
// 这些都由服务端托管，调用方无需也不应填写。app 为 nil 或非该场景时返回空集合。
func AutoInjectedBodyParamNames(app *models.OutboundApp) map[string]bool {
	out := map[string]bool{}
	if app == nil || strings.TrimSpace(app.AuthType) != "dynamic_bearer" {
		return out
	}
	p, err := parseTokenProvider(app.TokenProviderJSON)
	if err != nil || p.TokenIn != "json_body" {
		return out
	}
	if k := strings.TrimSpace(p.TokenBodyKey); k != "" {
		out[k] = true
	}
	// 值模板里的占位符（如 {{access_token}}）由服务端解析，不应暴露给调用方。
	for _, m := range reSimplePlaceholder.FindAllStringSubmatch(p.TokenBodyValueTemplate, -1) {
		if name := strings.TrimSpace(m[1]); name != "" {
			out[name] = true
		}
	}
	return out
}

func parseTokenCache(raw string) (TokenCache, error) {
	raw = strings.TrimSpace(raw)
	var c TokenCache
	if raw == "" || raw == "{}" {
		return c, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return c, err
	}
	if s, ok := m["access_token"].(string); ok {
		c.AccessToken = s
	}
	if s, ok := m["refresh_token"].(string); ok {
		c.RefreshToken = s
	}
	switch v := m["expires_at"].(type) {
	case string:
		if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
			c.ExpiresAt = t
		} else if t2, err2 := time.Parse(time.RFC3339, v); err2 == nil {
			c.ExpiresAt = t2
		}
	case float64:
		sec := int64(v)
		if sec > 1e12 {
			c.ExpiresAt = time.Unix(0, sec*int64(time.Millisecond))
		} else if sec > 1e9 {
			c.ExpiresAt = time.Unix(sec, 0)
		}
	}
	return c, nil
}

func marshalTokenCache(c TokenCache) (string, error) {
	m := map[string]interface{}{
		"access_token":  c.AccessToken,
		"refresh_token": c.RefreshToken,
	}
	if !c.ExpiresAt.IsZero() {
		m["expires_at"] = c.ExpiresAt.UTC().Format(time.RFC3339Nano)
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// jsonPathGet 支持 "a.b.0.c" 形式路径。
func jsonPathGet(root interface{}, path string) (interface{}, bool) {
	path = strings.TrimSpace(path)
	if path == "" || root == nil {
		return nil, false
	}
	cur := root
	for _, seg := range strings.Split(path, ".") {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		if idx, err := strconv.Atoi(seg); err == nil {
			arr, ok := cur.([]interface{})
			if !ok || idx < 0 || idx >= len(arr) {
				return nil, false
			}
			cur = arr[idx]
			continue
		}
		m, ok := cur.(map[string]interface{})
		if !ok {
			return nil, false
		}
		v, ok := m[seg]
		if !ok {
			return nil, false
		}
		cur = v
	}
	return cur, true
}

func stringFromJSON(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatInt(int64(t), 10)
	case json.Number:
		return t.String()
	case bool:
		if t {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func numberFromJSON(v interface{}) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func expandTokenTemplate(s string, access, refresh string) string {
	s = strings.ReplaceAll(s, "{{access_token}}", access)
	s = strings.ReplaceAll(s, "{{refresh_token}}", refresh)
	return s
}

const maxTokenTraceBytes = 100 * 1024

// TokenFetchResult 包含一次 fetch/refresh 操作的所有 HTTP 往返 trace（供管理端调试）。
type TokenFetchResult struct {
	CodeTrace  *TokenExchangeTrace `json:"code_exchange,omitempty"`  // Code 预请求（可选）
	TokenTrace *TokenExchangeTrace `json:"token_exchange,omitempty"` // fetch 或 refresh
	// CodeContext 是 code 步骤响应 JSON 的一级字段（key→value），供前端展示注入了哪些变量。
	CodeContext map[string]string `json:"code_context,omitempty"`
}

// TokenExchangeTrace 与第三方 Token 接口的单次 HTTP 往返（管理端调试用）。
type TokenExchangeTrace struct {
	Phase   string `json:"phase"`
	Request struct {
		Method        string            `json:"method"`
		URL           string            `json:"url"`
		Headers       map[string]string `json:"headers"`
		Body          string            `json:"body"`
		BodyTruncated bool              `json:"body_truncated,omitempty"`
	} `json:"request"`
	Response struct {
		Status        int               `json:"status"`
		Headers       map[string]string `json:"headers"`
		Body          string            `json:"body"`
		BodyTruncated bool              `json:"body_truncated,omitempty"`
	} `json:"response"`
}

func traceBodyString(b []byte) (s string, truncated bool) {
	if len(b) <= maxTokenTraceBytes {
		return string(b), false
	}
	return string(b[:maxTokenTraceBytes]) + "\n...[truncated]", true
}

// encodeBody converts a JSON object body into the target content type.
// Returns (encodedBody, contentType).
// bodyType: "json" (default) | "form" (application/x-www-form-urlencoded) | "formdata" (multipart/form-data)
func encodeBody(rawJSON []byte, bodyType string) ([]byte, string, error) {
	bt := strings.TrimSpace(bodyType)
	if bt == "" || bt == "json" {
		ct := ""
		if len(rawJSON) > 0 {
			ct = "application/json; charset=utf-8"
		}
		return rawJSON, ct, nil
	}
	// Parse JSON object into flat string map
	var m map[string]interface{}
	if err := json.Unmarshal(rawJSON, &m); err != nil {
		return rawJSON, "", fmt.Errorf("body is not a JSON object: %w", err)
	}
	if bt == "form" {
		vals := url.Values{}
		for k, v := range m {
			vals.Set(k, stringFromJSON(v))
		}
		return []byte(vals.Encode()), "application/x-www-form-urlencoded", nil
	}
	if bt == "formdata" {
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		for k, v := range m {
			if err := w.WriteField(k, stringFromJSON(v)); err != nil {
				return nil, "", err
			}
		}
		w.Close()
		return buf.Bytes(), w.FormDataContentType(), nil
	}
	return rawJSON, "application/json; charset=utf-8", nil
}

func doTokenHTTP(client *http.Client, method, urlStr string, hdr map[string]string, body []byte, contentType string, access, refresh string, recordTrace bool) ([]byte, int, *TokenExchangeTrace, error) {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = "POST"
	}
	urlStr = strings.TrimSpace(urlStr)

	var trace *TokenExchangeTrace
	if recordTrace {
		trace = &TokenExchangeTrace{}
		trace.Request.Method = method
		trace.Request.URL = urlStr
		trace.Request.Headers = make(map[string]string)
		for k, v := range hdr {
			k = strings.TrimSpace(k)
			if k == "" {
				continue
			}
			trace.Request.Headers[k] = expandTokenTemplate(v, access, refresh)
		}
		trace.Request.Body, trace.Request.BodyTruncated = traceBodyString(body)
	}

	if urlStr == "" {
		return nil, 0, trace, fmt.Errorf("token url empty")
	}
	req, err := http.NewRequest(method, urlStr, bytes.NewReader(body))
	if err != nil {
		return nil, 0, trace, err
	}
	for k, v := range hdr {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		req.Header.Set(k, expandTokenTemplate(v, access, refresh))
	}
	if len(body) > 0 && req.Header.Get("Content-Type") == "" && contentType != "" {
		req.Header.Set("Content-Type", contentType)
	} else if len(body) > 0 && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, trace, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if trace != nil {
		trace.Response.Status = resp.StatusCode
		trace.Response.Headers = make(map[string]string)
		for k, vals := range resp.Header {
			if len(vals) == 0 {
				continue
			}
			trace.Response.Headers[k] = strings.Join(vals, ", ")
		}
		trace.Response.Body, trace.Response.BodyTruncated = traceBodyString(b)
	}
	return b, resp.StatusCode, trace, nil
}

func applyPaths(root map[string]interface{}, p TokenProvider, cache *TokenCache) error {
	pathAT := strings.TrimSpace(p.Paths.AccessToken)
	if pathAT == "" {
		pathAT = "access_token"
	}
	v, ok := jsonPathGet(root, pathAT)
	if !ok {
		return fmt.Errorf("path %q not found in token response", pathAT)
	}
	at := stringFromJSON(v)
	if at == "" {
		return fmt.Errorf("access_token empty at path %q", pathAT)
	}
	cache.AccessToken = at

	if ep := strings.TrimSpace(p.Paths.ExpiresAt); ep != "" {
		if ev, ok := jsonPathGet(root, ep); ok {
			s := stringFromJSON(ev)
			if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
				cache.ExpiresAt = t
			} else if t2, err2 := time.Parse(time.RFC3339, s); err2 == nil {
				cache.ExpiresAt = t2
			}
		}
	}
	if cache.ExpiresAt.IsZero() {
		mode := strings.TrimSpace(p.Paths.ExpiresInMode)
		if mode == "" {
			mode = "path"
		}
		switch mode {
		case "fixed":
			// ExpiresIn raw value is a number (seconds)
			if len(p.Paths.ExpiresIn) > 0 {
				var sec float64
				if err := json.Unmarshal(p.Paths.ExpiresIn, &sec); err == nil && sec > 0 {
					cache.ExpiresAt = time.Now().Add(time.Duration(sec) * time.Second)
				} else {
					// maybe stored as string "3600"
					var s string
					if err2 := json.Unmarshal(p.Paths.ExpiresIn, &s); err2 == nil {
						if f, err3 := strconv.ParseFloat(strings.TrimSpace(s), 64); err3 == nil && f > 0 {
							cache.ExpiresAt = time.Now().Add(time.Duration(f) * time.Second)
						}
					}
				}
			}
		case "expr":
			// Expression: "<jsonpath>/<divisor>" e.g. "data.expires_in/1000"
			// Evaluates root[jsonpath] / divisor to get seconds.
			if eip := expiresInPath(p.Paths.ExpiresIn); eip != "" {
				sec := evalExpiresInExpr(root, eip)
				log.Printf("[token] expr=%q sec=%.2f", eip, sec)
				if sec > 0 {
					cache.ExpiresAt = time.Now().Add(time.Duration(sec) * time.Second)
					log.Printf("[token] expires_at=%s", cache.ExpiresAt.Format(time.RFC3339))
				}
			}
		default: // "path"
			if eip := expiresInPath(p.Paths.ExpiresIn); eip != "" {
				if ev, ok := jsonPathGet(root, eip); ok {
					if sec, ok := numberFromJSON(ev); ok && sec > 0 {
						cache.ExpiresAt = time.Now().Add(time.Duration(sec) * time.Second)
					}
				}
			} else if len(p.Paths.ExpiresIn) > 0 {
				// ExpiresIn is not a JSON string path (e.g. it is a number because the
				// user configured a fixed value and later switched the mode label without
				// clearing the field). Treat it as a fixed number of seconds so that the
				// expiry is still applied rather than silently dropped.
				var sec float64
				if err := json.Unmarshal(p.Paths.ExpiresIn, &sec); err == nil && sec > 0 {
					cache.ExpiresAt = time.Now().Add(time.Duration(sec) * time.Second)
				}
			}
		}
	}
	if rtp := strings.TrimSpace(p.Paths.RefreshToken); rtp != "" {
		if rv, ok := jsonPathGet(root, rtp); ok {
			cache.RefreshToken = stringFromJSON(rv)
		}
	}
	return nil
}

// execCodeStep 执行可选的 Code 预请求步骤，返回响应 JSON 一级字段的 {{code_resp.<key>}} 变量表。
// 若 Code 未启用或 URL 为空则返回空 map（不报错）。
func execCodeStep(p TokenProvider, appVars map[string]string, cache TokenCache, client *http.Client, recordTrace bool) (map[string]string, map[string]string, *TokenExchangeTrace, error) {
	codeVars := map[string]string{}
	codeCtx := map[string]string{}
	if !p.Code.Enabled || strings.TrimSpace(p.Code.URL) == "" {
		return codeVars, codeCtx, nil, nil
	}
	cu := expandTemplate(strings.TrimSpace(p.Code.URL), appVars)
	cbody := []byte(strings.TrimSpace(string(p.Code.Body)))
	if len(cbody) == 0 || string(cbody) == "null" {
		cbody = []byte("{}")
	}
	cbody = []byte(expandTemplate(string(cbody), appVars))
	chdr := expandHeaderMapVars(p.Code.Headers, appVars)
	method := p.Code.Method
	if method == "" {
		method = "POST"
	}
	cbody, cct, encErr := encodeBody(cbody, p.Code.BodyType)
	if encErr != nil {
		return codeVars, codeCtx, nil, fmt.Errorf("code step body encode: %w", encErr)
	}
	raw, status, trace, err := doTokenHTTP(client, method, cu, chdr, cbody, cct, cache.AccessToken, cache.RefreshToken, recordTrace)
	if trace != nil {
		trace.Phase = "code"
	}
	if err != nil {
		return codeVars, codeCtx, trace, fmt.Errorf("code step: %w", err)
	}
	if status < 200 || status >= 300 {
		return codeVars, codeCtx, trace, fmt.Errorf("code step http %d: %s", status, truncate(string(raw), 500))
	}
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err == nil {
		for k, v := range root {
			sv := stringFromJSON(v)
			codeVars["{{code_resp."+k+"}}"] = sv
			codeCtx[k] = sv
		}
	}
	return codeVars, codeCtx, trace, nil
}

// mergeVars merges extra into base (extra wins on conflict), returns new map.
func mergeVars(base, extra map[string]string) map[string]string {
	out := make(map[string]string, len(base)+len(extra))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

// ExecCodeStepWithTrace 单独执行 Code 预请求步骤，返回 trace 和 code_context（供管理 API 调试）。
func ExecCodeStepWithTrace(app *models.OutboundApp) (*TokenFetchResult, error) {
	p, err := parseTokenProvider(app.TokenProviderJSON)
	if err != nil {
		return nil, fmt.Errorf("token_provider: %w", err)
	}
	if !p.Code.Enabled || strings.TrimSpace(p.Code.URL) == "" {
		return nil, fmt.Errorf("code step not enabled or url empty")
	}
	client := &http.Client{Timeout: 30 * time.Second}
	cache, _ := parseTokenCache(app.TokenCacheJSON)
	appVars := buildAppParamVars(app)
	_, codeCtx, codeTrace, err := execCodeStep(p, appVars, cache, client, true)
	result := &TokenFetchResult{CodeTrace: codeTrace}
	if len(codeCtx) > 0 {
		result.CodeContext = codeCtx
	}
	return result, err
}

func fetchAppToken(db *gorm.DB, app *models.OutboundApp, recordTrace bool) (*TokenFetchResult, error) {
	p, err := parseTokenProvider(app.TokenProviderJSON)
	if err != nil {
		return nil, fmt.Errorf("token_provider: %w", err)
	}
	u := strings.TrimSpace(p.Fetch.URL)
	if u == "" {
		return nil, fmt.Errorf("token_provider.fetch.url required")
	}
	client := &http.Client{Timeout: 30 * time.Second}
	cache, _ := parseTokenCache(app.TokenCacheJSON)
	appVars := buildAppParamVars(app)

	// Code pre-step
	codeVars, codeCtx, codeTrace, err := execCodeStep(p, appVars, cache, client, recordTrace)
	if err != nil {
		return &TokenFetchResult{CodeTrace: codeTrace}, err
	}
	allVars := mergeVars(appVars, codeVars)

	method := p.Fetch.Method
	body := []byte(strings.TrimSpace(string(p.Fetch.Body)))
	if len(body) == 0 || string(body) == "null" {
		body = []byte("{}")
	}
	u = expandTemplate(u, allVars)
	body = []byte(expandTemplate(string(body), allVars))
	hdr := expandHeaderMapVars(p.Fetch.Headers, allVars)
	body, fct, encErr := encodeBody(body, p.Fetch.BodyType)
	if encErr != nil {
		return &TokenFetchResult{CodeTrace: codeTrace}, fmt.Errorf("fetch body encode: %w", encErr)
	}
	raw, code, tokenTrace, err := doTokenHTTP(client, method, u, hdr, body, fct, cache.AccessToken, cache.RefreshToken, recordTrace)
	if tokenTrace != nil {
		tokenTrace.Phase = "fetch"
	}
	result := &TokenFetchResult{CodeTrace: codeTrace, TokenTrace: tokenTrace}
	if len(codeCtx) > 0 {
		result.CodeContext = codeCtx
	}
	if err != nil {
		return result, err
	}
	if code < 200 || code >= 300 {
		return result, fmt.Errorf("token fetch http %d: %s", code, truncate(string(raw), 500))
	}
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		return result, fmt.Errorf("token response json: %w", err)
	}
	if err := applyPaths(root, p, &cache); err != nil {
		return result, err
	}
	s, err := marshalTokenCache(cache)
	if err != nil {
		return result, err
	}
	app.TokenCacheJSON = s
	if err := db.Model(app).Updates(map[string]interface{}{"token_cache_json": s}).Error; err != nil {
		return result, err
	}
	return result, nil
}

// FetchAppToken 执行 fetch 配置并写入 app.TokenCacheJSON（同时 Save）。
func FetchAppToken(db *gorm.DB, app *models.OutboundApp) error {
	_, err := fetchAppToken(db, app, false)
	return err
}

// FetchAppTokenWithTrace 同 FetchAppToken，并返回与第三方接口的 HTTP 往返详情（供管理 API 展示）。
func FetchAppTokenWithTrace(db *gorm.DB, app *models.OutboundApp) (*TokenFetchResult, error) {
	return fetchAppToken(db, app, true)
}

func refreshAppToken(db *gorm.DB, app *models.OutboundApp, recordTrace bool) (*TokenFetchResult, error) {
	p, err := parseTokenProvider(app.TokenProviderJSON)
	if err != nil {
		return nil, fmt.Errorf("token_provider: %w", err)
	}
	cache, _ := parseTokenCache(app.TokenCacheJSON)
	ru := strings.TrimSpace(p.Refresh.URL)
	if ru == "" || strings.TrimSpace(cache.RefreshToken) == "" {
		return fetchAppToken(db, app, recordTrace)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	appVars := buildAppParamVars(app)

	// Code pre-step (also runs before refresh when configured)
	codeVars, codeCtx, codeTrace, err := execCodeStep(p, appVars, cache, client, recordTrace)
	if err != nil {
		return &TokenFetchResult{CodeTrace: codeTrace}, err
	}
	allVars := mergeVars(appVars, codeVars)

	method := p.Refresh.Method
	body := []byte(strings.TrimSpace(string(p.Refresh.Body)))
	if len(body) == 0 || string(body) == "null" {
		body = []byte("{}")
	}
	bodyStr := expandTokenTemplate(string(body), cache.AccessToken, cache.RefreshToken)
	ru = expandTemplate(ru, allVars)
	bodyStr = expandTemplate(bodyStr, allVars)
	hdr := expandHeaderMapVars(p.Refresh.Headers, allVars)
	rbody, rct, encErr := encodeBody([]byte(bodyStr), p.Refresh.BodyType)
	if encErr != nil {
		return &TokenFetchResult{CodeTrace: codeTrace}, fmt.Errorf("refresh body encode: %w", encErr)
	}
	raw, code, tokenTrace, err := doTokenHTTP(client, method, ru, hdr, rbody, rct, cache.AccessToken, cache.RefreshToken, recordTrace)
	if tokenTrace != nil {
		tokenTrace.Phase = "refresh"
	}
	result := &TokenFetchResult{CodeTrace: codeTrace, TokenTrace: tokenTrace}
	if len(codeCtx) > 0 {
		result.CodeContext = codeCtx
	}
	if err != nil {
		return result, err
	}
	if code < 200 || code >= 300 {
		return result, fmt.Errorf("token refresh http %d: %s", code, truncate(string(raw), 500))
	}
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		return result, fmt.Errorf("token response json: %w", err)
	}
	if err := applyPaths(root, p, &cache); err != nil {
		return result, err
	}
	s, err := marshalTokenCache(cache)
	if err != nil {
		return result, err
	}
	app.TokenCacheJSON = s
	if err := db.Model(app).Updates(map[string]interface{}{"token_cache_json": s}).Error; err != nil {
		return result, err
	}
	return result, nil
}

// RefreshAppToken 若有 refresh 配置则调用，否则退回 FetchAppToken。
func RefreshAppToken(db *gorm.DB, app *models.OutboundApp) error {
	_, err := refreshAppToken(db, app, false)
	return err
}

// RefreshAppTokenWithTrace 同 RefreshAppToken，并返回 HTTP 往返详情。
func RefreshAppTokenWithTrace(db *gorm.DB, app *models.OutboundApp) (*TokenFetchResult, error) {
	return refreshAppToken(db, app, true)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// EnsureOutboundAppToken 在出站 HTTP 前调用：若将过期则 refresh 或 fetch。
func EnsureOutboundAppToken(db *gorm.DB, app *models.OutboundApp) error {
	if app == nil || strings.TrimSpace(app.AuthType) != "dynamic_bearer" {
		return nil
	}
	p, err := parseTokenProvider(app.TokenProviderJSON)
	if err != nil {
		return err
	}
	cache, err := parseTokenCache(app.TokenCacheJSON)
	if err != nil {
		return err
	}
	// 无过期时间时视为长期有效，避免每次出站都重新 fetch
	if strings.TrimSpace(cache.AccessToken) != "" && cache.ExpiresAt.IsZero() {
		return nil
	}
	skew := time.Duration(p.SkewSeconds) * time.Second
	if strings.TrimSpace(cache.AccessToken) != "" && !cache.ExpiresAt.IsZero() && time.Now().Add(skew).Before(cache.ExpiresAt) {
		return nil
	}
	if strings.TrimSpace(cache.RefreshToken) != "" && strings.TrimSpace(p.Refresh.URL) != "" {
		if err := RefreshAppToken(db, app); err != nil {
			return FetchAppToken(db, app)
		}
		return nil
	}
	return FetchAppToken(db, app)
}

// TokenStatusForAPI 返回给前端的脱敏状态（不含完整 token）。
func TokenStatusForAPI(app *models.OutboundApp) (map[string]interface{}, error) {
	cache, err := parseTokenCache(app.TokenCacheJSON)
	if err != nil {
		return nil, err
	}
	preview := ""
	if cache.AccessToken != "" {
		r := []rune(cache.AccessToken)
		if len(r) > 10 {
			preview = string(r[:6]) + "…" + string(r[len(r)-4:])
		} else {
			preview = "****"
		}
	}
	var nextSec int64
	if !cache.ExpiresAt.IsZero() {
		nextSec = int64(time.Until(cache.ExpiresAt).Seconds())
		if nextSec < 0 {
			nextSec = 0
		}
	}
	return map[string]interface{}{
		"has_token":            cache.AccessToken != "",
		"has_refresh_token":    cache.RefreshToken != "",
		"expires_at":           rfcOrEmpty(cache.ExpiresAt),
		"access_token_preview": preview,
		"seconds_until_expiry": nextSec,
	}, nil
}

// expiresInPath 从 json.RawMessage 中提取 expires_in 路径字符串。
// 兼容两种配置写法：字符串 "expires_in" 或数字（此时直接当秒数路径忽略，返回空）。
func expiresInPath(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	// 尝试解析为字符串（正常配置：JSON path 如 "expires_in"）
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	// 数字：用户误把秒数直接填进了 path 字段，忽略
	return ""
}

// evalExpiresInExpr 解析并计算 expr 模式表达式，返回秒数。
// 支持格式：
//   - "data.expires_in/1000"  — 路径值除以除数（如毫秒转秒）
//   - "data.expires_in*0.001" — 路径值乘以因子
//   - "data.expires_in+3600"  — 路径值加偏移
//   - "data.expires_in-60"    — 路径值减偏移
//   - "data.expires_in"       — 纯路径，等同 path 模式
func evalExpiresInExpr(root map[string]interface{}, expr string) float64 {
	// 从右向左找运算符（路径段用点分隔，运算符在最后）
	op := byte(0)
	opIdx := -1
	for i := len(expr) - 1; i > 0; i-- {
		c := expr[i]
		if c == '/' || c == '*' || c == '+' || c == '-' {
			op = c
			opIdx = i
			break
		}
	}

	jsonPath := strings.TrimSpace(expr)
	operand := 0.0
	if opIdx > 0 {
		jsonPath = strings.TrimSpace(expr[:opIdx])
		if f, err := strconv.ParseFloat(strings.TrimSpace(expr[opIdx+1:]), 64); err == nil {
			operand = f
		}
	}

	v, ok := jsonPathGet(root, jsonPath)
	if !ok {
		return 0
	}
	val, ok := numberFromJSON(v)
	if !ok {
		return 0
	}

	switch op {
	case '/':
		if operand == 0 {
			return 0
		}
		return val / operand
	case '*':
		return val * operand
	case '+':
		return val + operand
	case '-':
		return val - operand
	default:
		return val
	}
}

func rfcOrEmpty(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano)
}

// buildAppParamVars 从 app.AppParamsJSON 构建 {{app.<key>}} → value 的替换表。
func buildAppParamVars(app *models.OutboundApp) map[string]string {
	vars := map[string]string{}
	MergeAppParamsIntoVars(vars, app)
	return vars
}

// expandHeaderMapVars 对 headers map 的值做 {{app.*}} 占位符替换，返回新 map（不修改原始）。
func expandHeaderMapVars(hdr map[string]string, vars map[string]string) map[string]string {
	if len(vars) == 0 {
		return hdr
	}
	out := make(map[string]string, len(hdr))
	for k, v := range hdr {
		out[k] = expandTemplate(v, vars)
	}
	return out
}

// sensitiveAppParamValues 已迁移至 masking.go collectSensitiveParamValues，此处保留转发以兼容内部调用。
func sensitiveAppParamValues(appParamsJSON string) []string {
	// 构造临时 app 对象仅用于提取参数
	return collectSensitiveParamValues(&models.OutboundApp{AppParamsJSON: appParamsJSON})
}

// MaskTrace 将 TokenExchangeTrace 中 request body/headers 里的敏感参数值替换为 "****"，
// 同时默认脱敏 response 中的 access_token / refresh_token 值，返回脱敏后的副本（不修改原始 trace）。
func MaskTrace(tr *TokenExchangeTrace, app *models.OutboundApp) *TokenExchangeTrace {
	if tr == nil || app == nil {
		return tr
	}
	masker := NewSensitiveMasker(app)
	masker.AddTokenValues(tr.Response.Body)
	return masker.MaskTrace(tr)
}

// MaskFetchResult 对 TokenFetchResult 中所有 trace 做脱敏，返回副本。
func MaskFetchResult(r *TokenFetchResult, app *models.OutboundApp) *TokenFetchResult {
	if r == nil || app == nil {
		return r
	}
	masker := NewSensitiveMasker(app)
	// Add token values from token trace response for masking
	if r.TokenTrace != nil {
		masker.AddTokenValues(r.TokenTrace.Response.Body)
	}
	cp := &TokenFetchResult{
		CodeTrace:   masker.MaskTrace(r.CodeTrace),
		TokenTrace:  masker.MaskTrace(r.TokenTrace),
		CodeContext: r.CodeContext,
	}
	return cp
}

// tokenValuesFromBody 从 JSON body 中提取 access_token / refresh_token 的实际值（向后兼容保留）。
func tokenValuesFromBody(body string) []string {
	return tokenValuesFromJSON(body)
}

// maskSecrets 将 s 中出现的每个 secret 替换为 "****"（向后兼容保留）。
func maskSecrets(s string, secrets []string) string {
	m := &SensitiveMasker{secrets: secrets}
	return m.MaskString(s)
}
