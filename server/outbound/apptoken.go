package outbound

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"app-manager/models"

	"gorm.io/gorm"
)

// TokenProvider 描述获取/刷新 access_token 的 HTTP 调用与 JSON 路径。
type TokenProvider struct {
	Fetch struct {
		URL     string            `json:"url"`
		Method  string            `json:"method"`
		Headers map[string]string `json:"headers"`
		Body    json.RawMessage   `json:"body"`
	} `json:"fetch"`
	Refresh struct {
		URL     string            `json:"url"`
		Method  string            `json:"method"`
		Headers map[string]string `json:"headers"`
		Body    json.RawMessage   `json:"body"`
	} `json:"refresh"`
	Paths struct {
		AccessToken  string `json:"access_token"`
		ExpiresIn    string `json:"expires_in"`
		ExpiresAt    string `json:"expires_at"`
		RefreshToken string `json:"refresh_token"`
	} `json:"paths"`
	SkewSeconds int `json:"skew_seconds"` // 提前多少秒视为过期，默认 60

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
	return p, nil
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

func doTokenHTTP(client *http.Client, method, urlStr string, hdr map[string]string, body []byte, access, refresh string) ([]byte, int, error) {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = "POST"
	}
	urlStr = strings.TrimSpace(urlStr)
	if urlStr == "" {
		return nil, 0, fmt.Errorf("token url empty")
	}
	req, err := http.NewRequest(method, urlStr, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	for k, v := range hdr {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		req.Header.Set(k, expandTokenTemplate(v, access, refresh))
	}
	if len(body) > 0 && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return b, resp.StatusCode, nil
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
		if eip := strings.TrimSpace(p.Paths.ExpiresIn); eip != "" {
			if ev, ok := jsonPathGet(root, eip); ok {
				if sec, ok := numberFromJSON(ev); ok && sec > 0 {
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

// FetchAppToken 执行 fetch 配置并写入 app.TokenCacheJSON（同时 Save）。
func FetchAppToken(db *gorm.DB, app *models.OutboundApp) error {
	p, err := parseTokenProvider(app.TokenProviderJSON)
	if err != nil {
		return fmt.Errorf("token_provider: %w", err)
	}
	u := strings.TrimSpace(p.Fetch.URL)
	if u == "" {
		return fmt.Errorf("token_provider.fetch.url required")
	}
	method := p.Fetch.Method
	body := []byte(strings.TrimSpace(string(p.Fetch.Body)))
	if len(body) == 0 || string(body) == "null" {
		body = []byte("{}")
	}
	client := &http.Client{Timeout: 30 * time.Second}
	cache, _ := parseTokenCache(app.TokenCacheJSON)
	raw, code, err := doTokenHTTP(client, method, u, p.Fetch.Headers, body, cache.AccessToken, cache.RefreshToken)
	if err != nil {
		return err
	}
	if code < 200 || code >= 300 {
		return fmt.Errorf("token fetch http %d: %s", code, truncate(string(raw), 500))
	}
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		return fmt.Errorf("token response json: %w", err)
	}
	if err := applyPaths(root, p, &cache); err != nil {
		return err
	}
	s, err := marshalTokenCache(cache)
	if err != nil {
		return err
	}
	app.TokenCacheJSON = s
	return db.Model(app).Updates(map[string]interface{}{"token_cache_json": s}).Error
}

// RefreshAppToken 若有 refresh 配置则调用，否则退回 FetchAppToken。
func RefreshAppToken(db *gorm.DB, app *models.OutboundApp) error {
	p, err := parseTokenProvider(app.TokenProviderJSON)
	if err != nil {
		return fmt.Errorf("token_provider: %w", err)
	}
	cache, _ := parseTokenCache(app.TokenCacheJSON)
	ru := strings.TrimSpace(p.Refresh.URL)
	if ru == "" || strings.TrimSpace(cache.RefreshToken) == "" {
		return FetchAppToken(db, app)
	}
	method := p.Refresh.Method
	body := []byte(strings.TrimSpace(string(p.Refresh.Body)))
	if len(body) == 0 || string(body) == "null" {
		body = []byte("{}")
	}
	bodyStr := expandTokenTemplate(string(body), cache.AccessToken, cache.RefreshToken)
	client := &http.Client{Timeout: 30 * time.Second}
	raw, code, err := doTokenHTTP(client, method, ru, p.Refresh.Headers, []byte(bodyStr), cache.AccessToken, cache.RefreshToken)
	if err != nil {
		return err
	}
	if code < 200 || code >= 300 {
		return fmt.Errorf("token refresh http %d: %s", code, truncate(string(raw), 500))
	}
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		return fmt.Errorf("token response json: %w", err)
	}
	if err := applyPaths(root, p, &cache); err != nil {
		return err
	}
	s, err := marshalTokenCache(cache)
	if err != nil {
		return err
	}
	app.TokenCacheJSON = s
	return db.Model(app).Updates(map[string]interface{}{"token_cache_json": s}).Error
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

func rfcOrEmpty(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano)
}
