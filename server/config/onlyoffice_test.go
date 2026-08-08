package config

import (
	"os"
	"testing"
	"time"
)

// TestOnlyOfficeDefaults 验证 OnlyOffice 配置的默认值与默认值助手函数。
func TestOnlyOfficeDefaults(t *testing.T) {
	// 空配置时 IsEnabled 应为 false（缺一不可：enabled 与 URL）。
	if (OnlyOfficeConfig{}).IsEnabled() {
		t.Fatal("empty OnlyOfficeConfig should be disabled")
	}
	// Lang/DefaultMode 默认值。
	if got := (OnlyOfficeConfig{}).LangOrDefault(); got != "zh-CN" {
		t.Errorf("LangOrDefault()=%q, want zh-CN", got)
	}
	if got := (OnlyOfficeConfig{}).DefaultModeOrDefault(); got != "edit" {
		t.Errorf("DefaultModeOrDefault()=%q, want edit", got)
	}
	// 非法 DefaultMode 应回退为 edit。
	if got := (OnlyOfficeConfig{DefaultMode: "weird"}).DefaultModeOrDefault(); got != "edit" {
		t.Errorf("DefaultModeOrDefault() with bad input=%q, want edit", got)
	}
	// 显式 view 应保留。
	if got := (OnlyOfficeConfig{DefaultMode: "view"}).DefaultModeOrDefault(); got != "view" {
		t.Errorf("DefaultModeOrDefault() with view=%q, want view", got)
	}
	// DownloadTimeout 默认 60s。
	if got := (OnlyOfficeConfig{}).DownloadTimeout(); got != 60*time.Second {
		t.Errorf("DownloadTimeout()=%v, want 60s", got)
	}
	// 显式覆盖。
	if got := (OnlyOfficeConfig{DownloadTimeoutSec: 15}).DownloadTimeout(); got != 15*time.Second {
		t.Errorf("DownloadTimeout(15)=%v, want 15s", got)
	}
	// FileTokenTTL 默认 24h。
	if got := (OnlyOfficeConfig{}).FileTokenTTL(); got != 24*time.Hour {
		t.Errorf("FileTokenTTL()=%v, want 24h", got)
	}
	if got := (OnlyOfficeConfig{FileTokenTTLSec: 3600}).FileTokenTTL(); got != time.Hour {
		t.Errorf("FileTokenTTL(3600)=%v, want 1h", got)
	}
}

// TestIsEnabled 验证启用判定三要素。
func TestOnlyOfficeIsEnabled(t *testing.T) {
	cases := []struct {
		name string
		c    OnlyOfficeConfig
		want bool
	}{
		{"all-empty", OnlyOfficeConfig{}, false},
		{"only-enabled", OnlyOfficeConfig{Enabled: true}, false},
		{"enabled-and-internal", OnlyOfficeConfig{Enabled: true, InternalURL: "http://x"}, false},
		{"enabled-and-public", OnlyOfficeConfig{Enabled: true, PublicURL: "http://x"}, false},
		{"all-three", OnlyOfficeConfig{Enabled: true, InternalURL: "http://x", PublicURL: "http://y"}, true},
	}
	for _, tc := range cases {
		if got := tc.c.IsEnabled(); got != tc.want {
			t.Errorf("%s: IsEnabled()=%v, want %v", tc.name, got, tc.want)
		}
	}
}

// TestOnlyOfficeEnvOverrides 验证环境变量覆盖各 OnlyOffice 配置项。
func TestOnlyOfficeEnvOverrides(t *testing.T) {
	// 先写一个最小 YAML，确保 Load 成功。
	t.Setenv("ONLYOFFICE_ENABLED", "")
	t.Setenv("ONLYOFFICE_INTERNAL_URL", "")
	t.Setenv("ONLYOFFICE_PUBLIC_URL", "")
	t.Setenv("ONLYOFFICE_JWT_SECRET", "")
	t.Setenv("ONLYOFFICE_LANG", "")
	t.Setenv("ONLYOFFICE_DEFAULT_MODE", "")
	t.Setenv("ONLYOFFICE_AUTOSAVE", "")
	t.Setenv("ONLYOFFICE_FORCESAVE", "")
	t.Setenv("ONLYOFFICE_ALLOW_PRINT", "")
	t.Setenv("ONLYOFFICE_ALLOW_COMMENT", "")
	t.Setenv("ONLYOFFICE_CUSTOM_LOGO_URL", "")
	t.Setenv("ONLYOFFICE_CUSTOM_LOGO_IMAGE", "")
	t.Setenv("ONLYOFFICE_DOWNLOAD_TIMEOUT_SEC", "")
	t.Setenv("ONLYOFFICE_FILE_TOKEN_TTL_SEC", "")

	path := writeTempConfig(t, `
onlyoffice:
  enabled: false
  internal_url: ""
  public_url: ""
  jwt_secret: ""
  lang: en
  default_mode: edit
  autosave: false
  forcesave: false
  allow_print: false
  allow_comment: false
  download_timeout_sec: 30
  file_token_ttl_sec: 3600
`)
	if err := Load(path); err != nil {
		t.Fatalf("Load: %v", err)
	}

	// 基础连接。
	t.Setenv("ONLYOFFICE_ENABLED", "true")
	t.Setenv("ONLYOFFICE_INTERNAL_URL", "http://127.0.0.1:9000")
	t.Setenv("ONLYOFFICE_PUBLIC_URL", "https://docs.example.com")
	t.Setenv("ONLYOFFICE_JWT_SECRET", "s3cr3t")
	if err := Load(path); err != nil {
		t.Fatalf("Load: %v", err)
	}
	oc := C.OnlyOffice
	if !oc.Enabled {
		t.Error("ONLYOFFICE_ENABLED=true 未生效")
	}
	if oc.InternalURL != "http://127.0.0.1:9000" {
		t.Errorf("InternalURL=%q", oc.InternalURL)
	}
	if oc.PublicURL != "https://docs.example.com" {
		t.Errorf("PublicURL=%q", oc.PublicURL)
	}
	if oc.JWTSecret != "s3cr3t" {
		t.Errorf("JWTSecret=%q", oc.JWTSecret)
	}

	// 编辑器行为。
	t.Setenv("ONLYOFFICE_LANG", "en-US")
	t.Setenv("ONLYOFFICE_DEFAULT_MODE", "view")
	t.Setenv("ONLYOFFICE_AUTOSAVE", "true")
	t.Setenv("ONLYOFFICE_FORCESAVE", "false")
	t.Setenv("ONLYOFFICE_ALLOW_PRINT", "false")
	t.Setenv("ONLYOFFICE_ALLOW_COMMENT", "true")
	t.Setenv("ONLYOFFICE_CUSTOM_LOGO_URL", "https://example.com")
	t.Setenv("ONLYOFFICE_CUSTOM_LOGO_IMAGE", "https://example.com/logo.png")
	t.Setenv("ONLYOFFICE_DOWNLOAD_TIMEOUT_SEC", "120")
	t.Setenv("ONLYOFFICE_FILE_TOKEN_TTL_SEC", "7200")
	if err := Load(path); err != nil {
		t.Fatalf("Load: %v", err)
	}
	oc = C.OnlyOffice
	if oc.Lang != "en-US" {
		t.Errorf("Lang=%q", oc.Lang)
	}
	if oc.DefaultMode != "view" {
		t.Errorf("DefaultMode=%q", oc.DefaultMode)
	}
	if !oc.Autosave {
		t.Error("Autosave 未被打开")
	}
	if oc.Forcesave {
		t.Error("Forcesave 未被关闭")
	}
	if oc.AllowPrint {
		t.Error("AllowPrint 未被关闭")
	}
	if !oc.AllowComment {
		t.Error("AllowComment 未被打开")
	}
	if oc.CustomLogoURL != "https://example.com" {
		t.Errorf("CustomLogoURL=%q", oc.CustomLogoURL)
	}
	if oc.CustomLogoImage != "https://example.com/logo.png" {
		t.Errorf("CustomLogoImage=%q", oc.CustomLogoImage)
	}
	if oc.DownloadTimeoutSec != 120 {
		t.Errorf("DownloadTimeoutSec=%d", oc.DownloadTimeoutSec)
	}
	if oc.FileTokenTTLSec != 7200 {
		t.Errorf("FileTokenTTLSec=%d", oc.FileTokenTTLSec)
	}

	// 非法数值（负数/非数字）应被忽略，保持 YAML 值不变。
	t.Setenv("ONLYOFFICE_DOWNLOAD_TIMEOUT_SEC", "not-a-number")
	if err := Load(path); err != nil {
		t.Fatalf("Load: %v", err)
	}
	// Load 会重新解析 YAML 后再应用 env；env 非法 → YAML 值（30）生效。
	if C.OnlyOffice.DownloadTimeoutSec != 30 {
		t.Errorf("非法字符串未被忽略, DownloadTimeoutSec=%d", C.OnlyOffice.DownloadTimeoutSec)
	}

	// OnlyOffice_ENABLED=true 且配置齐备时 IsEnabled 应为 true。
	if !C.OnlyOffice.IsEnabled() {
		t.Error("env 覆盖后 IsEnabled 应为 true")
	}
}

// writeTempConfig 写一个临时 YAML 文件用于 Load，返回文件路径。
func writeTempConfig(t *testing.T, content string) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "config-*.yaml")
	if err != nil {
		t.Fatalf("CreateTemp: %v", err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatalf("WriteString: %v", err)
	}
	f.Close()
	return f.Name()
}
