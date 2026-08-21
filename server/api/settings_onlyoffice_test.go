package api

import (
	"app-manager/config"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

// withConfig 在测试前后加载/恢复一份隔离的临时配置，避免污染全局 config.C。
func withConfig(t *testing.T, cfg *config.Config) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := config.Write(path, cfg); err != nil {
		t.Fatalf("write temp config: %v", err)
	}
	if err := config.Load(path); err != nil {
		t.Fatalf("load temp config: %v", err)
	}
	t.Cleanup(func() {
		// 重置全局 config 并清理临时目录。
		config.C = &config.Config{}
	})
	return path
}

// newTestRouter 返回一个带 admin AuthMiddleware mock 路由（Gin 不需要真实 JWT，
// 因为我们直接调用 handler，admin 中间件已在 router.go 中绑定；这里跳过中间件）。
func newTestRouter() *gin.Engine {
	r := gin.New()
	return r
}

func boolPtr(b bool) *bool    { return &b }
func intPtr(i int) *int       { return &i }
func strPtr(s string) *string { return &s }

// TestGetOnlyOfficeSettingsDefault 验证默认状态返回。
func TestGetOnlyOfficeSettingsDefault(t *testing.T) {
	withConfig(t, &config.Config{})
	r := newTestRouter()
	r.GET("/api/settings/onlyoffice", GetOnlyOfficeSettings)

	req := httptest.NewRequest(http.MethodGet, "/api/settings/onlyoffice", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200; body=%s", w.Code, w.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if jwt, _ := resp["jwt_secret_set"].(bool); jwt {
		t.Error("默认 jwt_secret_set 应为 false")
	}
	if enabled, _ := resp["enabled"].(bool); enabled {
		t.Error("默认 enabled 应为 false")
	}
	if lang, _ := resp["lang"].(string); lang != "zh-CN" {
		t.Errorf("默认 lang=%q, want zh-CN", lang)
	}
	if mode, _ := resp["default_mode"].(string); mode != "edit" {
		t.Errorf("默认 default_mode=%q, want edit", mode)
	}
	if dl, _ := resp["download_timeout_sec"].(float64); dl != 60 {
		t.Errorf("默认 download_timeout_sec=%v, want 60", dl)
	}
	if ttl, _ := resp["file_token_ttl_sec"].(float64); ttl != 86400 {
		t.Errorf("默认 file_token_ttl_sec=%v, want 86400", ttl)
	}
}

// TestUpdateOnlyOfficeSettings 验证更新流程：URL 校验、模式校验、数值上限、持久化。
func TestUpdateOnlyOfficeSettings(t *testing.T) {
	path := withConfig(t, &config.Config{})
	r := newTestRouter()
	r.GET("/api/settings/onlyoffice", GetOnlyOfficeSettings)
	r.PUT("/api/settings/onlyoffice", UpdateOnlyOfficeSettings)

	// 1) 非法 default_mode 应返回 400。
	body, _ := json.Marshal(map[string]any{"default_mode": "bogus"})
	req := httptest.NewRequest(http.MethodPut, "/api/settings/onlyoffice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("非法 default_mode 应返回 400, got %d", w.Code)
	}

	// 2) 非法 URL 应返回 400。
	body, _ = json.Marshal(map[string]any{"internal_url": "ftp://x"})
	req = httptest.NewRequest(http.MethodPut, "/api/settings/onlyoffice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("非法 URL 应返回 400, got %d", w.Code)
	}

	// 3) 数值越界应返回 400。
	body, _ = json.Marshal(map[string]any{"download_timeout_sec": -1})
	req = httptest.NewRequest(http.MethodPut, "/api/settings/onlyoffice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("download_timeout_sec=-1 应返回 400, got %d", w.Code)
	}

	body, _ = json.Marshal(map[string]any{"file_token_ttl_sec": 99999999})
	req = httptest.NewRequest(http.MethodPut, "/api/settings/onlyoffice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("file_token_ttl_sec 越界应返回 400, got %d", w.Code)
	}

	// 4) 合法请求：开启 + 写入完整配置。
	body, _ = json.Marshal(map[string]any{
		"enabled":              true,
		"internal_url":         "http://127.0.0.1:9000",
		"public_url":           "https://docs.example.com",
		"jwt_secret":           "shhh",
		"lang":                 "en-US",
		"default_mode":         "view",
		"autosave":             false,
		"forcesave":            true,
		"allow_print":          false,
		"allow_comment":        true,
		"custom_logo_url":      "https://example.com",
		"custom_logo_image":    "https://example.com/logo.png",
		"download_timeout_sec": 120,
		"file_token_ttl_sec":   7200,
	})
	req = httptest.NewRequest(http.MethodPut, "/api/settings/onlyoffice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("合法请求应返回 200, got %d; body=%s", w.Code, w.Body.String())
	}

	// 内存配置应已更新。
	if !config.C.OnlyOffice.Enabled {
		t.Error("Enabled 未生效")
	}
	if config.C.OnlyOffice.InternalURL != "http://127.0.0.1:9000" {
		t.Errorf("InternalURL=%q", config.C.OnlyOffice.InternalURL)
	}
	if config.C.OnlyOffice.JWTSecret != "shhh" {
		t.Errorf("JWTSecret=%q", config.C.OnlyOffice.JWTSecret)
	}
	if config.C.OnlyOffice.DefaultMode != "view" {
		t.Errorf("DefaultMode=%q", config.C.OnlyOffice.DefaultMode)
	}
	if config.C.OnlyOffice.Autosave {
		t.Error("Autosave 应被关闭")
	}
	if config.C.OnlyOffice.AllowPrint {
		t.Error("AllowPrint 应被关闭")
	}
	if config.C.OnlyOffice.DownloadTimeoutSec != 120 {
		t.Errorf("DownloadTimeoutSec=%d", config.C.OnlyOffice.DownloadTimeoutSec)
	}
	if config.C.OnlyOffice.FileTokenTTLSec != 7200 {
		t.Errorf("FileTokenTTLSec=%d", config.C.OnlyOffice.FileTokenTTLSec)
	}

	// 配置应已落盘：重新 Load 应得到同样的值。
	if err := config.Load(path); err != nil {
		t.Fatalf("reload config: %v", err)
	}
	if !config.C.OnlyOffice.Enabled || config.C.OnlyOffice.JWTSecret != "shhh" {
		t.Errorf("持久化失败: enabled=%v jwt=%q", config.C.OnlyOffice.Enabled, config.C.OnlyOffice.JWTSecret)
	}

	// 5) GET 验证：应返回 jwt_secret_set=true，且不回传明文密钥。
	req = httptest.NewRequest(http.MethodGet, "/api/settings/onlyoffice", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d", w.Code)
	}
	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if set, _ := resp["jwt_secret_set"].(bool); !set {
		t.Error("jwt_secret_set 应为 true")
	}
	if _, leaked := resp["jwt_secret"]; leaked {
		t.Error("GET 响应不应回传 jwt_secret 明文")
	}
}

// TestUpdateOnlyOfficeSettingsJWTSecretPreservation 验证 jwt_secret 留空时
// 不会清空已有密钥。
func TestUpdateOnlyOfficeSettingsJWTSecretPreservation(t *testing.T) {
	withConfig(t, &config.Config{
		OnlyOffice: config.OnlyOfficeConfig{JWTSecret: "keep-me"},
	})
	r := newTestRouter()
	r.PUT("/api/settings/onlyoffice", UpdateOnlyOfficeSettings)

	// 不传 jwt_secret（指针为 nil）→ 保留原值。
	body, _ := json.Marshal(map[string]any{"enabled": true})
	req := httptest.NewRequest(http.MethodPut, "/api/settings/onlyoffice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d, body=%s", w.Code, w.Body.String())
	}
	if config.C.OnlyOffice.JWTSecret != "keep-me" {
		t.Errorf("JWTSecret 应保留原值, got %q", config.C.OnlyOffice.JWTSecret)
	}

	// 传空字符串 → 显式清空。
	body, _ = json.Marshal(map[string]any{"jwt_secret": ""})
	req = httptest.NewRequest(http.MethodPut, "/api/settings/onlyoffice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d, body=%s", w.Code, w.Body.String())
	}
	if config.C.OnlyOffice.JWTSecret != "" {
		t.Errorf("显式空串应清空 JWT, got %q", config.C.OnlyOffice.JWTSecret)
	}
}

// TestMain 确保测试不依赖 workdir。
func TestMain(m *testing.M) {
	// 切到 server/ 目录，避免相对路径问题。
	_ = os.Chdir(".")
	os.Exit(m.Run())
}
