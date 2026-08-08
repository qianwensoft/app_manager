package api

import (
	"app-manager/database"
	"app-manager/models"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// newTestDB 为每个测试创建独立的 SQLite 文件，避免 cache=shared 的全局污染。
func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	// t.TempDir() 在测试结束时自动清理；DSN 唯一即可互不污染。
	dir := t.TempDir()
	dsn := filepath.Join(dir, "test.db")
	db, err := gorm.Open(sqlite.Open(dsn+"?_busy_timeout=5000"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.ThirdPartyProvider{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	database.DB = db
	t.Cleanup(func() {
		sqlDB, _ := db.DB()
		sqlDB.Close()
	})
	return db
}

// TestThirdPartyList_BackwardCompat 验证 List 端点返回的 JSON 结构与旧客户端兼容。
// form-app 的 ThirdPartyProvider 接口只用 id/name/type/open_api_origin/enabled，
// 这些字段必须保留（且值正确）。
func TestThirdPartyList_BackwardCompat(t *testing.T) {
	db := newTestDB(t)

	p := models.ThirdPartyProvider{
		Name:          "测试 FreePass",
		Type:          "freepass",
		Description:   "升级前创建",
		OpenApiOrigin: "https://e.example.com",
		CorpID:        "corp1",
		AppKey:        "ak1",
		AppSecret:     "secret",
		Enabled:       true,
	}
	if err := db.Create(&p).Error; err != nil {
		t.Fatalf("create: %v", err)
	}

	var list []models.ThirdPartyProvider
	if err := db.Find(&list).Error; err != nil {
		t.Fatalf("find: %v", err)
	}
	type providerView struct {
		models.ThirdPartyProvider
		HMACConfigured           bool     `json:"hmac_configured"`
		HMACKeySource            string   `json:"hmac_key_source"`
		HMACClockSkewSec         int      `json:"hmac_clock_skew_sec"`
		EffectiveRedirectAllowed []string `json:"effective_redirect_allowlist"`
	}
	out := make([]providerView, 0)
	for _, pp := range list {
		out = append(out, providerView{
			ThirdPartyProvider:       pp,
			HMACConfigured:           strings.TrimSpace(pp.HMACSecret) != "",
			HMACKeySource:            hmacKeySource(&pp),
			HMACClockSkewSec:         hmacClockSkew(&pp),
			EffectiveRedirectAllowed: resolveRedirectAllowlist(&pp),
		})
	}
	b, _ := json.Marshal(out)
	var arr []map[string]interface{}
	if err := json.Unmarshal(b, &arr); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(arr) != 1 {
		t.Fatalf("expected 1, got %d", len(arr))
	}
	row := arr[0]

	if row["name"] != "测试 FreePass" {
		t.Fatalf("name: %v", row["name"])
	}
	if row["type"] != "freepass" {
		t.Fatalf("type: %v", row["type"])
	}
	if row["open_api_origin"] != "https://e.example.com" {
		t.Fatalf("open_api_origin: %v", row["open_api_origin"])
	}
	if row["enabled"] != true {
		t.Fatalf("enabled: %v", row["enabled"])
	}
	if row["redirect_allow_enabled"] != true {
		t.Fatalf("redirect_allow_enabled default should be true: %v", row["redirect_allow_enabled"])
	}
	if row["hmac_clock_skew_sec"] != float64(300) {
		t.Fatalf("hmac_clock_skew_sec default should be 300: %v", row["hmac_clock_skew_sec"])
	}
	if _, ok := row["hmac_secret"]; ok {
		t.Fatalf("hmac_secret must be hidden")
	}
	if _, ok := row["app_secret"]; ok {
		t.Fatalf("app_secret must be hidden")
	}
}

// TestThirdPartyGet_BackwardCompat 验证 Get 端点不破坏原有字段。
func TestThirdPartyGet_BackwardCompat(t *testing.T) {
	db := newTestDB(t)

	p := models.ThirdPartyProvider{
		Name:          "升级前 FreePass",
		Type:          "freepass",
		OpenApiOrigin: "https://e.example.com",
		AppKey:        "ak1",
		AppSecret:     "secret",
		Enabled:       true,
	}
	if err := db.Create(&p).Error; err != nil {
		t.Fatalf("create: %v", err)
	}

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("GET", "/api/thirdparty/1", nil)
	c.Params = gin.Params{gin.Param{Key: "id", Value: "1"}}
	GetThirdPartyProvider(c)

	if w.Code != 200 {
		t.Fatalf("status: %d", w.Code)
	}
	body := w.Body.String()
	var got map[string]interface{}
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, k := range []string{"id", "name", "type", "description", "open_api_origin", "corp_id", "app_key", "component_app_id", "callback_url", "outbound_app_id", "user_sync_enabled", "user_info_endpoint", "user_list_endpoint", "default_role", "redirect_allow_enabled", "hmac_clock_skew_sec", "hmac_configured", "hmac_key_source", "effective_redirect_allowlist", "enabled", "created_by", "created_at", "updated_at"} {
		if _, ok := got[k]; !ok {
			t.Fatalf("missing field: %s", k)
		}
	}
	if got["name"] != "升级前 FreePass" {
		t.Fatalf("name: %v", got["name"])
	}
	if got["type"] != "freepass" {
		t.Fatalf("type: %v", got["type"])
	}
	if _, ok := got["app_secret"]; ok {
		t.Fatalf("app_secret must be hidden in GET response")
	}
	if _, ok := got["hmac_secret"]; ok {
		t.Fatalf("hmac_secret must be hidden in GET response")
	}
}

// TestThirdPartyGet_NilConfigSafe 验证 config.C 为 nil 时 Get 不会 panic（保守兜底）。
func TestThirdPartyGet_NilConfigSafe(t *testing.T) {
	db := newTestDB(t)
	p := models.ThirdPartyProvider{
		Name:          "no config",
		Type:          "wechat",
		OpenApiOrigin: "https://e.example.com",
		AppKey:        "ak1",
		AppSecret:     "secret",
		Enabled:       true,
	}
	if err := db.Create(&p).Error; err != nil {
		t.Fatalf("create: %v", err)
	}

	// 故意在测试期间让 config.C 维持 nil（newTestDB 不动它），模拟启动早期被调用。
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("GET", "/api/thirdparty/1", nil)
	c.Params = gin.Params{gin.Param{Key: "id", Value: "1"}}
	// 关键：GetThirdPartyProvider 内部对 config.C.SSO.HMACSecret 有访问，nil-safe 必须 OK
	GetThirdPartyProvider(c)
	if w.Code != 200 {
		t.Fatalf("status: %d body: %s", w.Code, w.Body.String())
	}
}

// TestThirdPartyCreate_BackwardCompat 验证旧客户端（不带 SSO 字段）创建 Provider 不会被拒。
func TestThirdPartyCreate_BackwardCompat(t *testing.T) {
	db := newTestDB(t)

	body := `{
		"name": "old Client",
		"type": "freepass",
		"description": "no sso fields",
		"open_api_origin": "https://e.example.com",
		"app_key": "ak1",
		"app_secret": "secret",
		"callback_url": "https://e.example.com/cb",
		"default_role": "viewer"
	}`
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("POST", "/api/thirdparty", bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", uint(1))
	c.Params = gin.Params{}
	CreateThirdPartyProvider(c)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var created models.ThirdPartyProvider
	if err := db.First(&created).Error; err != nil {
		t.Fatalf("find: %v", err)
	}
	if created.Name != "old Client" {
		t.Fatalf("name: %s", created.Name)
	}
	if !created.RedirectAllowEnabled {
		t.Fatalf("redirect_allow_enabled default should be true")
	}
	if created.HMACClockSkewSec != 300 {
		t.Fatalf("hmac_clock_skew_sec default should be 300")
	}
}

// TestThirdPartyUpdate_BackwardCompat 验证旧客户端（不带 SSO 字段）更新 Provider 不会清空已有字段。
func TestThirdPartyUpdate_BackwardCompat(t *testing.T) {
	db := newTestDB(t)

	p := models.ThirdPartyProvider{
		Name:                  "with sso fields",
		Type:                  "freepass",
		RedirectAllowEnabled:  true,
		RedirectAllowlistJSON: `["/devices"]`,
		HMACSecret:            "existing-secret",
		HMACClockSkewSec:      600,
		Enabled:               true,
	}
	if err := db.Create(&p).Error; err != nil {
		t.Fatalf("create: %v", err)
	}

	body := `{"name": "old client renamed", "description": "updated"}`
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("PUT", "/api/thirdparty/1", bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", uint(1))
	c.Params = gin.Params{gin.Param{Key: "id", Value: "1"}}

	UpdateThirdPartyProvider(c)
	if w.Code != 200 {
		t.Fatalf("status: %d: %s", w.Code, w.Body.String())
	}

	var got models.ThirdPartyProvider
	db.First(&got, 1)
	if got.Name != "old client renamed" {
		t.Fatalf("name should be updated: %s", got.Name)
	}
	if got.RedirectAllowlistJSON != `["/devices"]` {
		t.Fatalf("redirect_allowlist_json should be preserved: %s", got.RedirectAllowlistJSON)
	}
	if got.HMACSecret != "existing-secret" {
		t.Fatalf("hmac_secret should be preserved: %s", got.HMACSecret)
	}
	if got.HMACClockSkewSec != 600 {
		t.Fatalf("hmac_clock_skew_sec should be preserved: %d", got.HMACClockSkewSec)
	}
	if !got.RedirectAllowEnabled {
		t.Fatalf("redirect_allow_enabled should be preserved")
	}
}
