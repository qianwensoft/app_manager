package outbound

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

type authCfg struct {
	HeaderName  string `json:"header_name"`
	HeaderValue string `json:"header_value"`
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
		h.Set(k, expandTemplate(v, vars))
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
		req.Header.Set(ac.HeaderName, expandTemplate(ac.HeaderValue, vars))
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
		tpl := expandTemplate(p.AuthHeaderTemplate, vars)
		tpl = expandTokenTemplate(tpl, cache.AccessToken, cache.RefreshToken)
		req.Header.Set(p.AuthHeaderName, tpl)
		return nil
	default:
		return fmt.Errorf("unsupported auth_type %q", app.AuthType)
	}
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

// ExecuteHTTPWebhook 执行一次 HTTP 出站并写入 outbound_deliveries。
// vars 为模板变量表（可与 RunPhasedConnector 共用）；nil 时内部使用 TemplateVars。
// mergeHTTPResponseIntoVars 为 true 且 HTTP 2xx 时，将响应体/状态码写入 vars（{{http.last.*}} 等），供后续步骤使用；并行多步勿开启，避免并发写 map。
func ExecuteHTTPWebhook(db *gorm.DB, connector models.OutboundConnector, endpoint models.OutboundEndpoint, app *models.OutboundApp,
	rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition, vars map[string]string, meta StepExecutionMeta, mergeHTTPResponseIntoVars bool,
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
		_ = db.Create(&d).Error
		return d
	}

	if vars == nil {
		vars = TemplateVars(rec, dev, def)
	}
	urlStr := joinBasePath(app.BaseURL, endpoint.Path)
	d.RequestURL = urlStr
	if urlStr == "" {
		d.Error = "拼接请求 URL 失败"
		d.DetailJSON = HTTPSetupDetail("url", d.Error)
		_ = db.Create(&d).Error
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

	bodyStr := strings.TrimSpace(endpoint.BodyTemplate)
	if bodyStr == "" {
		bodyStr = defaultJSONBody(rec)
	} else {
		bodyStr = expandTemplate(bodyStr, vars)
	}

	hdr, err := parseHeaderMapJSON(endpoint.HeadersJSON, vars)
	if err != nil {
		d.Error = "headers_json: " + err.Error()
		d.DetailJSON = HTTPSetupDetail("headers_json", d.Error)
		_ = db.Create(&d).Error
		return d
	}

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
			for _, v := range vals {
				req.Header.Add(k, v)
			}
		}
		if err := applyAppAuth(db, req, app, vars); err != nil {
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
			if mergeHTTPResponseIntoVars {
				MergeHTTPResponseContext(vars, meta.StepID, resp.StatusCode, bodyBytes)
			}
			_ = db.Create(&d).Error
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
	_ = db.Create(&d).Error
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
