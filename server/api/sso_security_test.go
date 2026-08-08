package api

import (
	"app-manager/models"
	"strings"
	"testing"
	"time"
)

func TestIsRedirectAllowed(t *testing.T) {
	cases := []struct {
		name      string
		redirect  string
		allowlist []string
		want      bool
	}{
		{"精确匹配", "/devices", []string{"/devices"}, true},
		{"前缀通配", "/work-orders/123", []string{"/work-orders/*"}, true},
		{"不匹配", "/admin", []string{"/devices"}, false},
		{"protocol-relative", "//evil.com", []string{"/*"}, false},
		{"javascript 协议", "javascript:alert(1)", []string{"/*"}, false},
		{"data 协议", "data:text/html,<script>1</script>", []string{"/*"}, false},
		{"非 / 开头", "https://evil.com", []string{"/*"}, false},
		{"包含 query", "/work-orders/123?readonly=1", []string{"/work-orders/*"}, true},
		{"包含 fragment", "/devices#section", []string{"/devices"}, true},
		{"空路径", "", []string{"/*"}, false},
		{"前缀通配未命中", "/devices", []string{"/work-orders/*"}, false},
		{"根路径兜底", "/", []string{"/"}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := isRedirectAllowed(c.redirect, c.allowlist); got != c.want {
				t.Fatalf("isRedirectAllowed(%q, %v) = %v, want %v", c.redirect, c.allowlist, got, c.want)
			}
		})
	}
}

func TestVerifyRedirect_AllowlistOnly(t *testing.T) {
	p := &models.ThirdPartyProvider{
		ID:                    1,
		RedirectAllowEnabled:  true,
		RedirectAllowlistJSON: `["/devices", "/work-orders/*"]`,
	}
	if err := VerifyRedirect(p, "/devices", "", "", "https://app.example.com", time.Now()); err != nil {
		t.Fatalf("expected pass: %v", err)
	}
	if err := VerifyRedirect(p, "/admin", "", "", "https://app.example.com", time.Now()); err == nil {
		t.Fatalf("expected reject for /admin")
	}
}

func TestVerifyRedirect_HMACSignature(t *testing.T) {
	p := &models.ThirdPartyProvider{
		ID:                   7,
		RedirectAllowEnabled: true,
		RedirectAllowlistJSON: `["/*"]`,
		HMACSecret:           "test-secret-32-bytes-aaaaaaaaaaa",
		HMACClockSkewSec:     300,
	}
	baseURL := "https://app.example.com/"
	path := "/work-orders/123"
	exp := time.Now().Add(60 * time.Second).Unix()
	sig := signRedirect(p.HMACSecret, baseURL, path, exp, p.ID)

	if err := VerifyRedirect(p, path, sig, formatInt(exp), baseURL, time.Now()); err != nil {
		t.Fatalf("expected valid signature pass: %v", err)
	}

	// exp 已过期
	if err := VerifyRedirect(p, path, sig, formatInt(time.Now().Add(-1*time.Hour).Unix()), baseURL, time.Now()); err == nil {
		t.Fatalf("expected reject for expired signature")
	}

	// 篡改 path
	if err := VerifyRedirect(p, "/admin", sig, formatInt(exp), baseURL, time.Now()); err == nil {
		t.Fatalf("expected reject for tampered path")
	}

	// 篡改 provider id
	bad := signRedirect(p.HMACSecret, baseURL, path, exp, p.ID+1)
	if err := VerifyRedirect(p, path, bad, formatInt(exp), baseURL, time.Now()); err == nil {
		t.Fatalf("expected reject for wrong provider id in sig")
	}

	// secret 为空时拒绝签名链接
	p.HMACSecret = ""
	p.RedirectAllowlistJSON = `["/*"]`
	if err := VerifyRedirect(p, path, sig, formatInt(exp), baseURL, time.Now()); err == nil {
		t.Fatalf("expected reject when hmac_secret missing")
	}
}

func TestVerifyRedirect_BackwardCompat(t *testing.T) {
	p := &models.ThirdPartyProvider{
		ID:                   1,
		RedirectAllowEnabled: false, // 旧 Provider 不强制白名单
	}
	if err := VerifyRedirect(p, "/anywhere", "", "", "https://app.example.com", time.Now()); err != nil {
		t.Fatalf("expected pass when whitelist disabled: %v", err)
	}
}

// TestVerifyRedirect_EmptyRedirect_OK 验证 backward compatibility：
// 调用方不传 redirect_to 时直接放行（未要求跳转，无安全风险）。
// 这覆盖了老脚本/集成场景：直接 POST /api/auth/thirdparty/login 只拿 token，
// 不依赖白名单与签名校验。
func TestVerifyRedirect_EmptyRedirect_OK(t *testing.T) {
	p := &models.ThirdPartyProvider{
		ID:                   1,
		RedirectAllowEnabled: true,
		RedirectAllowlistJSON: `["/*"]`,
		HMACSecret:           "secret",
	}
	if err := VerifyRedirect(p, "", "", "", "https://app.example.com", time.Now()); err != nil {
		t.Fatalf("empty redirect should bypass: %v", err)
	}
	if err := VerifyRedirect(p, "   ", "", "", "https://app.example.com", time.Now()); err != nil {
		t.Fatalf("whitespace redirect should bypass: %v", err)
	}
}

func TestBuildSignedRedirect(t *testing.T) {
	p := &models.ThirdPartyProvider{
		ID:                    42,
		RedirectAllowEnabled:  true,
		RedirectAllowlistJSON: `["/work-orders/*"]`,
		HMACSecret:            "another-secret-aaaaaaaaaaaaaa",
	}
	callback, res, err := BuildSignedRedirect(p, "https://app.example.com", "/work-orders/123", 5*time.Minute)
	if err != nil {
		t.Fatalf("BuildSignedRedirect failed: %v", err)
	}
	if !strings.Contains(callback, "provider_id=42") || !strings.Contains(callback, "redirect_to=") {
		t.Fatalf("callback missing required params: %s", callback)
	}
	if res.KeyID != "provider:42" {
		t.Fatalf("expected keyID provider:42, got %s", res.KeyID)
	}
	if res.Sig == "" || res.Exp == 0 {
		t.Fatalf("empty sig or exp")
	}
	// 拒绝白名单外路径
	if _, _, err := BuildSignedRedirect(p, "https://app.example.com", "/admin", 5*time.Minute); err == nil {
		t.Fatalf("expected reject for /admin")
	}
}

func formatInt(v int64) string {
	const digits = "0123456789"
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	buf := make([]byte, 0, 20)
	for v > 0 {
		buf = append([]byte{digits[v%10]}, buf...)
		v /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}